"""Device location.

Tries sources best-first:

  1. **Cellular modem (GNSS / cell tower)** — if the laptop has a SIM in a WWAN
     modem, ``cellular.lookup()`` can return a real GPS fix. Preferred.
  2. **IP geolocation** — coarse, city-level, always available online. Used as a
     fallback and to fill in the public IP / city labels.

Both are best-effort; if everything fails the agent still reports its status.
"""

from __future__ import annotations

from typing import Any, Dict

import requests

import cellular

# ipapi.co returns JSON with city/region/country and lat/long. No key needed
# for low volume. Swap for any provider you prefer.
_PROVIDER = "https://ipapi.co/json/"


def lookup(timeout: float = 10.0) -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    # Prefer a hardware fix from the modem when there is one.
    try:
        modem = cellular.lookup()
    except Exception:
        modem = {}

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

    # Overlay the modem fix last so its GNSS/cell coordinates win over IP-city,
    # while keeping the IP/city labels for context.
    if modem:
        if "latitude" in modem and "longitude" in modem:
            out["latitude"] = modem["latitude"]
            out["longitude"] = modem["longitude"]
        if modem.get("accuracy"):
            out["accuracy"] = modem["accuracy"]
        if modem.get("extra"):
            out["extra"] = modem["extra"]
    return out
