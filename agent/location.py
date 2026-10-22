"""Approximate location via IP geolocation.

Deliberately coarse: it resolves the device's public IP to a city-level
location using a free IP-geolocation service. That is enough to recover a
stolen laptop (which city / neighbourhood it is checking in from) without
pulling in platform GPS stacks. If the lookup fails, the agent still reports
its status and public IP.
"""

from __future__ import annotations

from typing import Any, Dict

import requests

# ipapi.co returns JSON with city/region/country and lat/long. No key needed
# for low volume. Swap for any provider you prefer.
_PROVIDER = "https://ipapi.co/json/"


def lookup(timeout: float = 10.0) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    try:
        resp = requests.get(_PROVIDER, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        out["ip"] = data.get("ip")
        out["city"] = data.get("city")
        out["region"] = data.get("region")
        out["country"] = data.get("country_name") or data.get("country")
        lat, lon = data.get("latitude"), data.get("longitude")
        if lat is not None and lon is not None:
            out["latitude"] = float(lat)
            out["longitude"] = float(lon)
            out["accuracy"] = "ip-city"
    except Exception as exc:  # network down, rate limited, bad JSON — not fatal
        out["extra"] = f"location lookup failed: {exc!r}"
    return out
