"""Bounded ADS-B observations and bundled, dated route reference products."""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from . import cache
from .config import settings

DATA = Path(__file__).parent / "data"
AIRCRAFT_LIMIT = 1000
MAX_POSITION_AGE_SECONDS = 60


def _number(value: Any) -> float | None:
    return (
        float(value)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        else None
    )


def reference_routes(layer: str) -> dict[str, Any]:
    data = json.loads((DATA / f"{layer}.geojson").read_text())
    air = layer == "air-routes"
    result = cache.envelope(
        source="openflights" if air else "benden-shipping-lanes",
        kind="reference",
        data=data,
        attribution="OpenFlights · ODbL 1.0 / Database Contents License"
        if air
        else "P. Benden / CIA · custom CC BY 4.0 (excluding Statista)",
        documentation_url="https://openflights.org/data"
        if air
        else "https://github.com/newzealandpaul/Shipping-Lanes",
        ttl_seconds=86400,
    )
    result.update(
        referenceVintage=data["referenceVintage"],
        coverage="Global · selected airline connections"
        if air
        else "Global · schematic shipping corridors",
    )
    return result


async def air_traffic(client: httpx.AsyncClient) -> dict[str, Any]:
    if not settings.air_traffic_enabled:
        raise ValueError("Air traffic is not enabled on this server")
    lat, lon, radius = (
        settings.air_traffic_latitude,
        settings.air_traffic_longitude,
        settings.air_traffic_radius_nm,
    )
    key = f"adsb-lol:{lat:g}:{lon:g}:{radius}:v1"

    async def fetch() -> dict[str, Any]:
        response = await client.get(f"https://api.adsb.lol/v2/point/{lat:g}/{lon:g}/{radius}")
        response.raise_for_status()
        payload = response.json()
        if (
            not isinstance(payload, dict)
            or not isinstance(payload.get("ac"), list)
            or payload.get("msg") != "No error"
        ):
            raise TypeError("ADSB.lol response is not a successful aircraft list")
        now = _number(payload.get("now"))
        if now is None or now <= 0:
            raise TypeError("ADSB.lol response has no observation time")
        data_time = datetime.fromtimestamp(now / 1000, UTC).isoformat().replace("+00:00", "Z")
        features, ids = [], set()
        # Prefer fresh positions when a dense region reaches the cap.
        aircraft = sorted(
            (a for a in payload["ac"] if isinstance(a, dict)),
            key=lambda a: (
                _number(a.get("seen_pos")) if _number(a.get("seen_pos")) is not None else math.inf
            ),
        )
        for item in aircraft:
            longitude, latitude, age = (
                _number(item.get("lon")),
                _number(item.get("lat")),
                _number(item.get("seen_pos")),
            )
            hex_id = str(item.get("hex") or "").lower()
            if (
                not hex_id
                or hex_id in ids
                or longitude is None
                or latitude is None
                or not -180 <= longitude <= 180
                or not -90 <= latitude <= 90
                or age is None
                or not 0 <= age <= MAX_POSITION_AGE_SECONDS
            ):
                continue
            if item.get("alt_baro") == "ground":
                continue
            ids.add(hex_id)
            observed = (
                datetime.fromtimestamp(now / 1000 - age, UTC)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z")
            )
            features.append(
                {
                    "type": "Feature",
                    "id": hex_id,
                    "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                    "properties": {
                        "icao": hex_id,
                        "callsign": str(item.get("flight") or "").strip() or hex_id.upper(),
                        "registration": item.get("r"),
                        "aircraftType": item.get("t"),
                        "positionSource": item.get("type"),
                        "altitudeFt": _number(item.get("alt_baro")),
                        "groundSpeedKt": _number(item.get("gs")),
                        "heading": _number(item.get("track")),
                        "observedAt": observed,
                        "positionAgeSeconds": age,
                    },
                }
            )
        total = len(features)
        result = cache.envelope(
            source="adsb-lol",
            kind="observation",
            data={
                "type": "FeatureCollection",
                "features": features[:AIRCRAFT_LIMIT],
                "locatedAircraft": total,
                "displayLimit": AIRCRAFT_LIMIT,
                "truncated": total > AIRCRAFT_LIMIT,
                "center": [lon, lat],
                "radiusNm": radius,
            },
            attribution="ADSB.lol · ODbL 1.0",
            documentation_url="https://www.adsb.lol/docs/open-data/api/",
            data_time=data_time,
            units={"altitude": "ft", "groundSpeed": "kt", "heading": "° true"},
            ttl_seconds=60,
        )
        if (datetime.now(UTC).timestamp() - now / 1000) > 120:
            result.update(
                status="stale", staleReason="Provider snapshot is more than two minutes old"
            )
        result["coverage"] = f"{radius} nm around {lat:g}°, {lon:g}° · receiver coverage varies"
        return result

    return await cache.get_or_fetch(key, fetch)
