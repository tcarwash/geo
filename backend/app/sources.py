from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sgp4.api import WGS72, Satrec, jday
from sgp4.propagation import gstime

from . import cache

USGS_FEEDS = {
    "hour": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    "day": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    "week": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
    "month": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson",
}
SWPC_AURORA = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json"
SWPC_KP = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"
CELESTRAK_TLE = "https://celestrak.org/NORAD/elements/gp.php"
EONET_EVENTS = "https://eonet.gsfc.nasa.gov/api/v3/events/geojson"
EONET_CATEGORIES = {
    "wildfires": "wildfires",
    "volcanoes": "volcanoes",
    "floods": "floods",
    "severe-storms": "severeStorms",
}


def _parse_epoch_ms(value: Any) -> str | None:
    try:
        return datetime.fromtimestamp(float(value) / 1000, UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def _parse_iso(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


async def _get_json(client: httpx.AsyncClient, url: str) -> Any:
    response = await client.get(url)
    response.raise_for_status()
    return response.json()


async def earthquakes(client: httpx.AsyncClient, period: str, min_magnitude: float) -> dict[str, Any]:
    url = USGS_FEEDS[period]
    key = f"usgs:{period}"

    async def fetch() -> dict[str, Any]:
        payload = await _get_json(client, url)
        if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
            raise TypeError("USGS response is not a GeoJSON FeatureCollection")
        features = payload.get("features")
        if not isinstance(features, list):
            raise TypeError("USGS response features are missing")
        data = payload
        generated = (payload.get("metadata") or {}).get("generated")
        data_time = _parse_epoch_ms(generated)
        return cache.envelope(
            source="usgs-earthquakes",
            kind="observation",
            data=data,
            attribution="Earthquake data provided by the U.S. Geological Survey (USGS).",
            documentation_url="https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
            data_time=data_time,
            ttl_seconds=60,
        )

    result = await cache.get_or_fetch(key, fetch)
    data = result["data"]
    features = data.get("features", [])
    filtered = [
        feature for feature in features
        if isinstance(feature, dict)
        and isinstance(feature.get("properties"), dict)
        and isinstance(feature["properties"].get("mag"), (int, float))
        and feature["properties"]["mag"] >= min_magnitude
    ]
    return {**result, "data": {**data, "features": filtered}}


async def natural_events(client: httpx.AsyncClient, category: str) -> dict[str, Any]:
    category_id = EONET_CATEGORIES.get(category)
    if category_id is None:
        raise ValueError("unsupported natural-event category")

    async def fetch() -> dict[str, Any]:
        response = await client.get(EONET_EVENTS, params={"category": category_id, "status": "open", "limit": 500})
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
            raise TypeError("NASA EONET response is not a GeoJSON FeatureCollection")
        raw_features = payload.get("features")
        if not isinstance(raw_features, list):
            raise TypeError("NASA EONET response features are missing")
        features = [
            feature for feature in raw_features
            if isinstance(feature, dict)
            and feature.get("type") == "Feature"
            and isinstance(feature.get("properties"), dict)
            and isinstance(feature.get("geometry"), dict)
            and feature["geometry"].get("type") in {"Point", "Polygon", "MultiPolygon"}
        ]
        data_time = max(
            (parsed for feature in features if (parsed := _parse_iso(feature["properties"].get("date")))),
            default=None,
        )
        data = {**payload, "features": features}
        return cache.envelope(
            source="nasa-eonet",
            kind="observation",
            data=data,
            attribution="NASA Earth Observatory Natural Event Tracker (EONET).",
            documentation_url="https://eonet.gsfc.nasa.gov/docs/v3",
            data_time=data_time,
            ttl_seconds=300,
        )

    return await cache.get_or_fetch(f"nasa:eonet:{category}", fetch)


async def aurora(client: httpx.AsyncClient) -> dict[str, Any]:
    async def fetch() -> dict[str, Any]:
        payload = await _get_json(client, SWPC_AURORA)
        if not isinstance(payload, dict) or not isinstance(payload.get("coordinates"), list):
            raise TypeError("NOAA OVATION response is missing coordinate data")
        coords = payload["coordinates"]
        features = []
        for row in coords:
            if not isinstance(row, list) or len(row) < 3:
                continue
            try:
                lon, lat, probability = float(row[0]), float(row[1]), float(row[2])
            except (TypeError, ValueError):
                continue
            if not (-180 <= lon <= 180 and -90 <= lat <= 90 and 0 <= probability <= 100):
                continue
            if probability <= 0:
                continue
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {"probability": probability, "units": "%"},
            })
        data = {
            "type": "FeatureCollection",
            "features": features,
            "properties": {
                "observationTime": payload.get("Observation Time"),
                "forecastTime": payload.get("Forecast Time"),
                "model": "NOAA OVATION Prime",
            },
        }
        return cache.envelope(
            source="noaa-swpc-ovation",
            kind="forecast",
            data=data,
            attribution="NOAA Space Weather Prediction Center (SWPC), OVATION Prime aurora forecast.",
            documentation_url="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
            data_time=_parse_iso(payload.get("Observation Time")),
            valid_from=_parse_iso(payload.get("Forecast Time")),
            units={"probability": "%"},
            ttl_seconds=300,
        )

    return await cache.get_or_fetch("noaa:ovation:latest", fetch)


async def space_weather(client: httpx.AsyncClient) -> dict[str, Any]:
    async def fetch() -> dict[str, Any]:
        payload = await _get_json(client, SWPC_KP)
        if not isinstance(payload, list) or not payload:
            raise TypeError("NOAA planetary K-index response is empty or invalid")
        rows = []
        for row in payload:
            if not isinstance(row, dict):
                continue
            timestamp = _parse_iso(row.get("time_tag"))
            try:
                kp = float(row.get("estimated_kp"))
            except (TypeError, ValueError):
                continue
            if timestamp is not None and 0 <= kp <= 9:
                rows.append({"time": timestamp, "kp": kp})
        if not rows:
            raise ValueError("NOAA planetary K-index response contained no valid readings")
        return cache.envelope(
            source="noaa-swpc-planetary-k-index",
            kind="observation",
            data={"planetaryKIndex": rows[-180:]},
            attribution="NOAA Space Weather Prediction Center (SWPC).",
            documentation_url="https://services.swpc.noaa.gov/json/",
            data_time=rows[-1]["time"],
            units={"kp": "Kp index"},
            ttl_seconds=60,
        )

    return await cache.get_or_fetch("noaa:planetary-k-index-1m", fetch)


def _tle_epoch(line1: str) -> str | None:
    try:
        year = int(line1[18:20])
        year += 2000 if year < 57 else 1900
        day = float(line1[20:32])
        value = datetime(year, 1, 1, tzinfo=UTC) + timedelta(days=day - 1)
        return value.isoformat(timespec="seconds").replace("+00:00", "Z")
    except (ValueError, OverflowError):
        return None


def _teme_to_geodetic(position: tuple[float, float, float], julian_date: float) -> tuple[float, float, float]:
    x, y, z = position
    theta = gstime(julian_date)
    cos_theta, sin_theta = math.cos(theta), math.sin(theta)
    x_ecef = x * cos_theta + y * sin_theta
    y_ecef = -x * sin_theta + y * cos_theta
    z_ecef = z
    longitude = math.atan2(y_ecef, x_ecef)
    p = math.hypot(x_ecef, y_ecef)
    latitude = math.atan2(z_ecef, p)
    # Iterate the WGS84 geodetic latitude and height from ECEF coordinates.
    semi_major = 6378.137
    eccentricity_squared = 6.69437999014e-3
    for _ in range(5):
        sin_lat = math.sin(latitude)
        prime_vertical = semi_major / math.sqrt(1 - eccentricity_squared * sin_lat * sin_lat)
        latitude = math.atan2(z_ecef + eccentricity_squared * prime_vertical * sin_lat, p)
    sin_lat = math.sin(latitude)
    prime_vertical = semi_major / math.sqrt(1 - eccentricity_squared * sin_lat * sin_lat)
    if abs(math.cos(latitude)) > 1e-8:
        altitude = p / math.cos(latitude) - prime_vertical
    else:
        altitude = abs(z_ecef) - prime_vertical * (1 - eccentricity_squared)
    return math.degrees(longitude), math.degrees(latitude), altitude


def _satellite_position(satellite: Satrec, when: datetime) -> tuple[float, float, float] | None:
    moment = when.astimezone(UTC)
    jd, fraction = jday(
        moment.year, moment.month, moment.day, moment.hour, moment.minute,
        moment.second + moment.microsecond / 1_000_000,
    )
    error, position, _ = satellite.sgp4(jd, fraction)
    if error:
        return None
    return _teme_to_geodetic(position, jd + fraction)


def _split_dateline(points: list[list[float]]) -> list[list[list[float]]]:
    segments: list[list[list[float]]] = []
    current: list[list[float]] = []
    for point in points:
        if current and abs(point[0] - current[-1][0]) > 180:
            if len(current) >= 2:
                segments.append(current)
            current = []
        current.append(point)
    if len(current) >= 2:
        segments.append(current)
    return segments


async def satellite_track(client: httpx.AsyncClient, catalog_id: int) -> dict[str, Any]:
    if not 1 <= catalog_id <= 999_999:
        raise ValueError("catalog ID is out of range")
    cache_key = f"celestrak:gp:tle:{catalog_id}"

    async def fetch_elements() -> dict[str, Any]:
        response = await client.get(CELESTRAK_TLE, params={"CATNR": catalog_id, "FORMAT": "TLE"})
        response.raise_for_status()
        lines = [line.strip() for line in response.text.splitlines() if line.strip()]
        line1 = next((line for line in lines if line.startswith("1 ")), None)
        line2 = next((line for line in lines if line.startswith("2 ")), None)
        name = lines[0] if lines and not lines[0].startswith(("1 ", "2 ")) else str(catalog_id)
        if not line1 or not line2 or line1[2:7].strip() != str(catalog_id):
            raise ValueError("CelesTrak returned an invalid element set")
        epoch = _tle_epoch(line1)
        # Parse now so malformed elements are rejected before entering the shared cache.
        Satrec.twoline2rv(line1, line2, WGS72)
        return cache.envelope(
            source="celestrak-gp",
            kind="model",
            data={"name": name, "catalogId": catalog_id, "line1": line1, "line2": line2, "epoch": epoch},
            attribution="Orbital elements from CelesTrak GP data; positions propagated locally with SGP4.",
            documentation_url="https://celestrak.org/NORAD/documentation/gp-data-formats.php",
            data_time=epoch,
            ttl_seconds=7200,
        )

    elements_envelope = await cache.get_or_fetch(cache_key, fetch_elements)
    elements = elements_envelope["data"]
    satellite = Satrec.twoline2rv(elements["line1"], elements["line2"], WGS72)
    now = datetime.now(UTC)
    current = _satellite_position(satellite, now)
    if current is None:
        raise ValueError("SGP4 could not propagate this element set to the current time")
    points = []
    for minute in range(-10, 91, 2):
        position = _satellite_position(satellite, now + timedelta(minutes=minute))
        if position is not None:
            points.append([position[0], position[1]])
    line_parts = _split_dateline(points)
    features = [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [current[0], current[1]]},
        "properties": {
            "role": "current-position", "name": elements["name"], "catalogId": catalog_id,
            "epoch": elements["epoch"], "altitudeKm": round(current[2], 2),
        },
    }]
    if line_parts:
        features.append({
            "type": "Feature",
            "geometry": {"type": "MultiLineString", "coordinates": line_parts},
            "properties": {"role": "ground-track", "name": elements["name"], "catalogId": catalog_id},
        })
    result = cache.envelope(
        source="celestrak-gp",
        kind="model",
        data={"type": "FeatureCollection", "features": features},
        attribution=elements_envelope["attribution"],
        documentation_url=elements_envelope["documentationUrl"],
        data_time=elements["epoch"],
        valid_from=now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        units={"altitudeKm": "km"},
        ttl_seconds=30,
        status=elements_envelope["status"],
    )
    result["staleReason"] = elements_envelope.get("staleReason")
    return result
