"""Sentinel control server.

A small self-hosted API that tracks the laptops you enrol, lets you mark one
stolen or recovered, receives check-ins (status + location) from the agent, and
stores recovery evidence (webcam photo + screenshot) uploaded while the device
is stolen.

Two kinds of caller:

* **You (admin)** — authenticate with the ``SENTINEL_ADMIN_TOKEN`` bearer token.
  Enrol devices, mark stolen/recovered, read location and evidence.
* **The agent** — authenticates with a per-device token issued at enrolment.
  Posts check-ins and, while stolen, uploads evidence.

Storage is SQLite + a local evidence directory, so a single file and folder hold
all state. This is intentionally simple; put it behind HTTPS (a reverse proxy)
before exposing it to the internet.
"""

from __future__ import annotations

import os
import secrets
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

DB_PATH = Path(os.environ.get("SENTINEL_DB", "sentinel.db"))
EVIDENCE_DIR = Path(os.environ.get("SENTINEL_EVIDENCE_DIR", "evidence"))
ADMIN_TOKEN = os.environ.get("SENTINEL_ADMIN_TOKEN")

EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# Upload guard: reject anything larger than this (bytes). Webcam JPEG +
# screenshot PNG are comfortably under a few MB.
MAX_EVIDENCE_BYTES = 10 * 1024 * 1024


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS devices (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL,
                token        TEXT NOT NULL UNIQUE,
                status       TEXT NOT NULL DEFAULT 'ok',   -- 'ok' | 'stolen'
                message      TEXT,                          -- lock-screen message
                created_at   REAL NOT NULL,
                last_seen_at REAL
            );

            CREATE TABLE IF NOT EXISTS checkins (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
                created_at REAL NOT NULL,
                status     TEXT NOT NULL,
                ip         TEXT,
                latitude   REAL,
                longitude  REAL,
                accuracy   TEXT,
                city       TEXT,
                region     TEXT,
                country    TEXT,
                hostname   TEXT,
                os         TEXT,
                extra      TEXT
            );

            CREATE TABLE IF NOT EXISTS evidence (
                id         TEXT PRIMARY KEY,
                device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
                created_at REAL NOT NULL,
                kind       TEXT NOT NULL,   -- 'webcam' | 'screenshot'
                path       TEXT NOT NULL,
                content_type TEXT NOT NULL
            );
            """
        )


app = FastAPI(title="Sentinel", version="1.0.0")


@app.on_event("startup")
def _startup() -> None:
    if not ADMIN_TOKEN:
        # Fail loud rather than run wide open.
        raise RuntimeError(
            "SENTINEL_ADMIN_TOKEN is not set. Refusing to start without an "
            "admin token."
        )
    init_db()


# --------------------------------------------------------------------------- #
# Auth helpers
# --------------------------------------------------------------------------- #
def _bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def require_admin(authorization: Optional[str] = Header(default=None)) -> None:
    token = _bearer(authorization)
    if not token or not secrets.compare_digest(token, ADMIN_TOKEN or ""):
        raise HTTPException(status_code=401, detail="admin authentication required")


def require_device(authorization: Optional[str] = Header(default=None)) -> sqlite3.Row:
    token = _bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="device authentication required")
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM devices WHERE token = ?", (token,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="unknown device token")
    return row


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class StolenRequest(BaseModel):
    message: Optional[str] = Field(default=None, max_length=500)


class CheckIn(BaseModel):
    ip: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    hostname: Optional[str] = None
    os: Optional[str] = None
    extra: Optional[str] = Field(default=None, max_length=2000)


# --------------------------------------------------------------------------- #
# Admin endpoints
# --------------------------------------------------------------------------- #
@app.post("/api/devices", dependencies=[Depends(require_admin)])
def enrol_device(body: DeviceCreate):
    device_id = uuid.uuid4().hex[:12]
    token = secrets.token_urlsafe(32)
    now = time.time()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO devices (id, name, token, status, created_at) "
            "VALUES (?, ?, ?, 'ok', ?)",
            (device_id, body.name, token, now),
        )
    # The token is shown exactly once; the agent stores it in its config.
    return {"id": device_id, "name": body.name, "device_token": token}


@app.get("/api/devices", dependencies=[Depends(require_admin)])
def list_devices():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, status, message, created_at, last_seen_at "
            "FROM devices ORDER BY created_at DESC"
        ).fetchall()
    return {"devices": [dict(r) for r in rows]}


@app.get("/api/devices/{device_id}", dependencies=[Depends(require_admin)])
def get_device(device_id: str):
    with get_db() as conn:
        device = conn.execute(
            "SELECT id, name, status, message, created_at, last_seen_at "
            "FROM devices WHERE id = ?",
            (device_id,),
        ).fetchone()
        if device is None:
            raise HTTPException(status_code=404, detail="device not found")
        checkins = conn.execute(
            "SELECT * FROM checkins WHERE device_id = ? "
            "ORDER BY created_at DESC LIMIT 25",
            (device_id,),
        ).fetchall()
        evidence = conn.execute(
            "SELECT id, kind, created_at, content_type FROM evidence "
            "WHERE device_id = ? ORDER BY created_at DESC LIMIT 50",
            (device_id,),
        ).fetchall()
    return {
        "device": dict(device),
        "checkins": [dict(r) for r in checkins],
        "evidence": [dict(r) for r in evidence],
    }


@app.post("/api/devices/{device_id}/stolen", dependencies=[Depends(require_admin)])
def mark_stolen(device_id: str, body: StolenRequest):
    with get_db() as conn:
        cur = conn.execute(
            "UPDATE devices SET status = 'stolen', message = ? WHERE id = ?",
            (body.message, device_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="device not found")
    return {"id": device_id, "status": "stolen", "message": body.message}


@app.post("/api/devices/{device_id}/recovered", dependencies=[Depends(require_admin)])
def mark_recovered(device_id: str):
    with get_db() as conn:
        cur = conn.execute(
            "UPDATE devices SET status = 'ok', message = NULL WHERE id = ?",
            (device_id,),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="device not found")
    return {"id": device_id, "status": "ok"}


@app.get(
    "/api/devices/{device_id}/evidence/{evidence_id}",
    dependencies=[Depends(require_admin)],
)
def get_evidence(device_id: str, evidence_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM evidence WHERE id = ? AND device_id = ?",
            (evidence_id, device_id),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="evidence not found")
    path = Path(row["path"])
    if not path.exists():
        raise HTTPException(status_code=410, detail="evidence file missing")
    return FileResponse(path, media_type=row["content_type"])


# --------------------------------------------------------------------------- #
# Agent endpoints (device-token auth)
# --------------------------------------------------------------------------- #
@app.post("/api/agent/checkin")
def agent_checkin(body: CheckIn, device: sqlite3.Row = Depends(require_device)):
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO checkins (device_id, created_at, status, ip, latitude,
                longitude, accuracy, city, region, country, hostname, os, extra)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                device["id"], now, device["status"], body.ip, body.latitude,
                body.longitude, body.accuracy, body.city, body.region,
                body.country, body.hostname, body.os, body.extra,
            ),
        )
        conn.execute(
            "UPDATE devices SET last_seen_at = ? WHERE id = ?",
            (now, device["id"]),
        )
        device = conn.execute(
            "SELECT status, message FROM devices WHERE id = ?", (device["id"],)
        ).fetchone()
    # The agent reads `status` to decide whether to capture evidence, and
    # `message` to show a lock screen.
    return {"status": device["status"], "message": device["message"]}


@app.post("/api/agent/evidence")
async def agent_evidence(
    request: Request, device: sqlite3.Row = Depends(require_device)
):
    # Only accept evidence while the device is actually marked stolen. This is
    # the server-side half of "capture only when genuinely lost".
    if device["status"] != "stolen":
        raise HTTPException(
            status_code=409, detail="device is not marked stolen; evidence rejected"
        )

    kind = request.query_params.get("kind", "")
    if kind not in ("webcam", "screenshot"):
        raise HTTPException(status_code=400, detail="kind must be webcam|screenshot")

    content_type = request.headers.get("content-type", "application/octet-stream")
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="empty body")
    if len(body) > MAX_EVIDENCE_BYTES:
        raise HTTPException(status_code=413, detail="evidence too large")

    ext = ".jpg" if kind == "webcam" else ".png"
    evidence_id = uuid.uuid4().hex
    device_dir = EVIDENCE_DIR / device["id"]
    device_dir.mkdir(parents=True, exist_ok=True)
    path = device_dir / f"{int(time.time())}-{kind}-{evidence_id}{ext}"
    path.write_bytes(body)

    with get_db() as conn:
        conn.execute(
            "INSERT INTO evidence (id, device_id, created_at, kind, path, content_type) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (evidence_id, device["id"], time.time(), kind, str(path), content_type),
        )
    return JSONResponse({"id": evidence_id, "kind": kind}, status_code=201)


@app.get("/healthz")
def healthz():
    return {"ok": True}
