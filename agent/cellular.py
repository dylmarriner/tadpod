"""Cellular-modem location via ModemManager (Linux).

If the laptop has a WWAN modem with a SIM (e.g. a built-in Fibocom/Quectel card
or a USB dongle), ModemManager can report location from onboard GNSS (real GPS
fix) and/or 3GPP cell-tower info. This module shells out to ``mmcli`` to read
that, and returns coordinates the agent prefers over coarse IP geolocation.

It no-ops cleanly (returns ``{}``) when there is no modem, no ModemManager, or
location is disabled, so it is safe to call on any machine.

To enable GNSS on the modem once:
    mmcli -m <N> --location-enable-gps-raw --location-enable-gps-nmea
(ModemManager keeps it on across reboots.)
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from typing import Any, Dict, List, Optional


def _run(args: List[str], timeout: float = 15.0) -> Optional[str]:
    try:
        proc = subprocess.run(
            args, capture_output=True, text=True, timeout=timeout, check=False
        )
        if proc.returncode != 0:
            return None
        return proc.stdout
    except Exception:
        return None


def _modem_indexes() -> List[str]:
    out = _run(["mmcli", "-L", "-J"])
    if not out:
        return []
    try:
        data = json.loads(out)
    except Exception:
        return []
    paths = data.get("modem-list") or []
    # Paths look like /org/freedesktop/ModemManager1/Modem/0 -> index "0".
    idx = []
    for p in paths:
        m = re.search(r"/(\d+)$", p)
        if m:
            idx.append(m.group(1))
    return idx


def _location_for(index: str) -> Dict[str, Any]:
    out = _run(["mmcli", "-m", index, "--location-get", "-J"])
    if not out:
        return {}
    try:
        data = json.loads(out)
    except Exception:
        return {}

    loc = (data.get("modem") or {}).get("location") or data.get("location") or {}
    result: Dict[str, Any] = {}

    # 1. Best: raw GNSS fix (actual GPS coordinates).
    gps = loc.get("gps") or {}
    lat, lon = gps.get("latitude"), gps.get("longitude")
    if lat not in (None, "--") and lon not in (None, "--"):
        try:
            result["latitude"] = float(lat)
            result["longitude"] = float(lon)
            result["accuracy"] = "gnss"
            return result
        except (TypeError, ValueError):
            pass

    # 2. Fallback: 3GPP cell-tower identity (MCC/MNC/LAC/CID). Not lat/long on
    #    its own, but recorded so you can resolve it against a cell-ID database.
    threegpp = loc.get("3gpp") or {}
    parts = [
        f"mcc={threegpp.get('mcc')}" if threegpp.get("mcc") else None,
        f"mnc={threegpp.get('mnc')}" if threegpp.get("mnc") else None,
        f"lac={threegpp.get('lac') or threegpp.get('tac')}"
        if (threegpp.get("lac") or threegpp.get("tac")) else None,
        f"cid={threegpp.get('cid')}" if threegpp.get("cid") else None,
    ]
    parts = [p for p in parts if p]
    if parts:
        result["accuracy"] = "cell-tower"
        result["extra"] = "cell:" + ",".join(parts)
    return result


def lookup() -> Dict[str, Any]:
    """Return {latitude, longitude, accuracy} from the modem, or {} if none."""
    if shutil.which("mmcli") is None:
        return {}
    for index in _modem_indexes():
        loc = _location_for(index)
        if loc:
            return loc
    return {}
