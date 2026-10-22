"""Sentinel agent.

Runs on the laptop you want to protect. On a loop it:

  1. Looks up its approximate location (IP geolocation).
  2. Checks in with the server, sending status/location.
  3. Reads back the device state from the server.
  4. If the device is marked **stolen** (and only then):
       - captures a webcam photo and/or screenshot and uploads them, and
       - shows the owner's lock message.

When not stolen it just checks in on a slow interval; when stolen it checks in
(and captures) more frequently so you get fresh location and evidence.

Run it once to test:   python sentinel_agent.py --once
Run it as a service:   see agent/install/README.md
"""

from __future__ import annotations

import argparse
import json
import platform
import socket
import sys
import time
from pathlib import Path
from typing import Any, Dict

import requests

import capture
import location
import lockmsg

DEFAULT_CONFIG = Path(__file__).with_name("config.json")

# Remember the last message we displayed so a running agent does not re-pop the
# same dialog on every stolen check-in.
_last_message_shown: str | None = None


def load_config(path: Path) -> Dict[str, Any]:
    if not path.exists():
        sys.exit(
            f"config not found at {path}. Copy config.example.json to config.json "
            "and fill in server_url + device_token."
        )
    cfg = json.loads(path.read_text())
    cfg.setdefault("checkin_interval_ok", 3600)
    cfg.setdefault("checkin_interval_stolen", 120)
    cfg.setdefault("capture_webcam", True)
    cfg.setdefault("capture_screenshot", True)
    cfg.setdefault("show_lock_message", True)
    cfg.setdefault("verify_tls", True)
    if not cfg.get("server_url") or not cfg.get("device_token"):
        sys.exit("config.json must set both server_url and device_token")
    cfg["server_url"] = cfg["server_url"].rstrip("/")
    return cfg


def _auth(cfg: Dict[str, Any]) -> Dict[str, str]:
    return {"Authorization": f"Bearer {cfg['device_token']}"}


def checkin(cfg: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "hostname": socket.gethostname(),
        "os": f"{platform.system()} {platform.release()}",
    }
    payload.update(location.lookup())
    resp = requests.post(
        f"{cfg['server_url']}/api/agent/checkin",
        headers=_auth(cfg),
        json=payload,
        timeout=30,
        verify=cfg["verify_tls"],
    )
    resp.raise_for_status()
    return resp.json()


def upload_evidence(cfg: Dict[str, Any], kind: str, data: bytes) -> bool:
    content_type = "image/jpeg" if kind == "webcam" else "image/png"
    resp = requests.post(
        f"{cfg['server_url']}/api/agent/evidence",
        params={"kind": kind},
        headers={**_auth(cfg), "Content-Type": content_type},
        data=data,
        timeout=60,
        verify=cfg["verify_tls"],
    )
    if resp.status_code == 201:
        return True
    # 409 => server says not stolen anymore; anything else is a genuine error.
    print(f"[Sentinel] evidence upload ({kind}) returned {resp.status_code}",
          file=sys.stderr)
    return False


def handle_stolen(cfg: Dict[str, Any], message: str | None) -> None:
    global _last_message_shown

    if cfg["capture_webcam"]:
        photo = capture.webcam_photo()
        if photo:
            upload_evidence(cfg, "webcam", photo)
        else:
            print("[Sentinel] webcam capture unavailable, skipped", file=sys.stderr)

    if cfg["capture_screenshot"]:
        shot = capture.screenshot()
        if shot:
            upload_evidence(cfg, "screenshot", shot)
        else:
            print("[Sentinel] screenshot unavailable, skipped", file=sys.stderr)

    if cfg["show_lock_message"] and message and message != _last_message_shown:
        if lockmsg.show(message):
            _last_message_shown = message


def tick(cfg: Dict[str, Any]) -> int:
    """One check-in cycle. Returns the number of seconds to sleep next."""
    global _last_message_shown
    try:
        state = checkin(cfg)
    except Exception as exc:
        print(f"[Sentinel] check-in failed: {exc!r}", file=sys.stderr)
        # Back off a little on failure but keep trying.
        return min(cfg["checkin_interval_ok"], 300)

    status = state.get("status", "ok")
    if status == "stolen":
        handle_stolen(cfg, state.get("message"))
        return cfg["checkin_interval_stolen"]

    # Reset so that if it is marked stolen again later the message shows again.
    _last_message_shown = None
    return cfg["checkin_interval_ok"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Sentinel anti-theft agent")
    parser.add_argument(
        "--config", type=Path, default=DEFAULT_CONFIG, help="path to config.json"
    )
    parser.add_argument(
        "--once", action="store_true", help="run a single check-in and exit"
    )
    args = parser.parse_args()

    cfg = load_config(args.config)

    if args.once:
        sleep_for = tick(cfg)
        print(f"[Sentinel] one check-in done; next interval would be {sleep_for}s")
        return

    print("[Sentinel] agent started")
    while True:
        sleep_for = tick(cfg)
        time.sleep(max(5, int(sleep_for)))


if __name__ == "__main__":
    main()
