from __future__ import annotations

import hmac
import json
import logging
import os
import sqlite3
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import adif, db, sources
from .config import settings
from .schemas import DrawingUpdate, LayoutCreate, LayoutUpdate, SettingsUpdate

logger = logging.getLogger("geo.api")
MAX_LAYOUT_BYTES = 1_000_000


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db.initialize()
    app.state.http = httpx.AsyncClient(
        timeout=httpx.Timeout(settings.request_timeout_seconds),
        headers={"User-Agent": settings.user_agent, "Accept": "application/json"},
        follow_redirects=False,
    )
    try:
        yield
    finally:
        await app.state.http.aclose()


app = FastAPI(
    title="Geo API",
    description="Self-hosted Geo dashboard persistence and normalized public data adapters.",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "If-Match", "X-Geo-Edit-Token"],
    expose_headers=["ETag"],
)


def _now() -> str:
    return db.iso()


def _json_size(value: Any, maximum: int = MAX_LAYOUT_BYTES) -> None:
    try:
        encoded = json.dumps(value, allow_nan=False, separators=(",", ":"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail={"code": "invalid_json", "message": "Payload must contain finite JSON values."}) from None
    if len(encoded.encode("utf-8")) > maximum:
        raise HTTPException(status_code=413, detail={"code": "payload_too_large", "message": "Payload exceeds the size limit."})


def _edit_access(x_geo_edit_token: str | None = Header(default=None)) -> None:
    required = os.getenv("GEO_EDIT_TOKEN")
    if required and (not x_geo_edit_token or not hmac.compare_digest(required, x_geo_edit_token)):
        raise HTTPException(status_code=401, detail={"code": "edit_auth_required", "message": "A valid edit token is required."})


def _revision_header(response: Response, revision: int) -> None:
    response.headers["ETag"] = f'"{revision}"'


def _expected_revision(value: str | None) -> int:
    if value is None:
        raise HTTPException(status_code=428, detail={"code": "revision_required", "message": "Send the current ETag in If-Match."})
    value = value.strip()
    value = value.removeprefix("W/")
    value = value.strip('"')
    try:
        revision = int(value)
    except ValueError:
        raise HTTPException(status_code=400, detail={"code": "invalid_revision", "message": "If-Match must contain a numeric ETag."}) from None
    if revision < 0:
        raise HTTPException(status_code=400, detail={"code": "invalid_revision", "message": "Revision must be non-negative."})
    return revision


def _layout(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"], "name": row["name"], "schemaVersion": row["schema_version"], "state": db.loads(row["state_json"]),
        "revision": row["revision"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }


def _revision_conflict() -> HTTPException:
    return HTTPException(status_code=412, detail={"code": "revision_conflict", "message": "The saved revision changed. Reload it before saving."})


@app.get("/healthz", tags=["system"])
def health() -> dict[str, Any]:
    try:
        with db.connection() as conn:
            conn.execute("SELECT 1").fetchone()
        storage = "ok"
    except sqlite3.Error:
        storage = "unavailable"
    return {"status": "ok" if storage == "ok" else "degraded", "storage": storage, "time": _now()}


@app.get("/api/v1/layers", tags=["catalog"])
def layers() -> dict[str, Any]:
    return {
        "layers": [
            {"id": "political-atlas", "name": "Political atlas", "kind": "base", "status": "available", "source": "Natural Earth"},
            {"id": "day-night", "name": "Day and night", "kind": "computed", "status": "available", "source": "Solar position calculation"},
            {"id": "maidenhead", "name": "Maidenhead grid", "kind": "computed", "status": "available", "source": "Amateur radio locator grid"},
            {"id": "earthquakes", "name": "Earthquakes", "kind": "vector", "status": "available", "source": "USGS GeoJSON", "endpoint": "/api/v1/earthquakes"},
            {"id": "wildfires", "name": "Wildfires", "kind": "vector", "status": "available", "source": "NASA EONET", "endpoint": "/api/v1/natural-events/wildfires"},
            {"id": "volcanoes", "name": "Volcanic activity", "kind": "vector", "status": "available", "source": "NASA EONET", "endpoint": "/api/v1/natural-events/volcanoes"},
            {"id": "floods", "name": "Floods", "kind": "vector", "status": "available", "source": "NASA EONET", "endpoint": "/api/v1/natural-events/floods"},
            {"id": "severe-storms", "name": "Severe storms", "kind": "vector", "status": "available", "source": "NASA EONET", "endpoint": "/api/v1/natural-events/severe-storms"},
            {"id": "weather-alerts", "name": "Active weather alerts", "kind": "vector", "status": "available", "source": "National Weather Service API", "endpoint": "/api/v1/weather-alerts"},
            {"id": "aurora", "name": "Aurora forecast", "kind": "vector", "status": "available", "source": "NOAA SWPC OVATION", "endpoint": "/api/v1/aurora"},
            {"id": "space-weather", "name": "Planetary K index", "kind": "widget-data", "status": "available", "source": "NOAA SWPC", "endpoint": "/api/v1/space-weather"},
            {"id": "satellites", "name": "Satellite tracks", "kind": "computed", "status": "available", "source": "CelesTrak TLE plus local SGP4", "endpoint": "/api/v1/satellites/{catalog_id}"},
            {"id": "adif", "name": "ADIF contacts", "kind": "user-data", "status": "available", "source": "User-provided ADIF import", "endpoint": "/api/v1/adif/import"},
            {"id": "imagery", "name": "Satellite imagery", "kind": "raster", "status": "available", "source": "NASA GIBS dated MODIS Terra"},
            {"id": "muf", "name": "Maximum usable frequency", "kind": "raster", "status": "available", "source": "NOAA SWPC WAM-IPE", "endpoint": "/api/v1/muf"},
            {"id": "satellite-weather", "name": "Satellite weather", "kind": "raster", "status": "available", "source": "NASA GIBS · GOES ABI GeoColor"},
            {"id": "clouds", "name": "Satellite clouds (white)", "kind": "raster", "status": "available", "source": "NASA GIBS GOES ABI and Himawari AHI clean infrared; approximate white cloud rendering; refreshed every 10 minutes"},
            {"id": "eumetsat-clouds", "name": "Global cloud composite", "kind": "raster", "status": "available", "source": "EUMETSAT Geostationary Ring IR10.8 μm multimission composite; refreshed about every 3 hours with gaps toward the poles"},
            {"id": "hf-absorption", "name": "HF radio absorption", "kind": "raster", "status": "available", "source": "NOAA SWPC D-RAP global absorption-frequency map; refreshed every minute"},
            {"id": "precipitation", "name": "Precipitation rate", "kind": "raster", "status": "available", "source": "NASA GPM IMERG 30-minute global precipitation-rate imagery"},
            {"id": "lightning", "name": "Lightning density", "kind": "raster", "status": "available", "source": "NOAA nowCOAST WMS"},
            {"id": "storms", "name": "Tropical storm tracks", "kind": "vector", "status": "available", "source": "NOAA National Hurricane Center", "endpoint": "/api/v1/storm-tracks"},
            {"id": "pskreporter", "name": "PSK Reporter paths", "kind": "vector", "status": "available", "source": "PSK Reporter", "endpoint": "/api/v1/psk-reporter"},
            {"id": "goes-track", "name": "GOES satellite positions", "kind": "vector", "status": "available", "source": "CelesTrak SGP4 · GOES-19 / GOES-18", "endpoint": "/api/v1/goes-satellites"},
            {"id": "rbn", "name": "Reverse Beacon Network", "kind": "vector", "status": "available", "source": "Vail ReRBN", "endpoint": "/api/v1/rbn-spots"},
            {"id": "dx-cluster", "name": "DX Cluster paths", "kind": "vector", "status": "available", "source": "DXClusterAPI", "endpoint": "/api/v1/dx-cluster-spots"},
            {"id": "pota", "name": "Parks on the Air spots", "kind": "vector", "status": "available", "source": "POTA active activator feed", "endpoint": "/api/v1/pota-spots"},
        ],
        "generatedAt": _now(),
    }


@app.get("/api/v1/earthquakes", tags=["data"])
async def earthquake_feed(
    request: Request,
    period: str = "day",
    min_magnitude: float = 0,
) -> dict[str, Any]:
    if period not in sources.USGS_FEEDS:
        raise HTTPException(status_code=422, detail={"code": "invalid_period", "message": "period must be hour, day, week, or month."})
    if not 0 <= min_magnitude <= 10:
        raise HTTPException(status_code=422, detail={"code": "invalid_magnitude", "message": "min_magnitude must be between 0 and 10."})
    try:
        return await sources.earthquakes(request.app.state.http, period, min_magnitude)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("USGS earthquake feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "Earthquake data is unavailable and no cached response exists."}) from None


@app.get("/api/v1/natural-events/{category}", tags=["data"])
async def natural_event_feed(request: Request, category: str) -> dict[str, Any]:
    if category not in sources.EONET_CATEGORIES:
        raise HTTPException(status_code=404, detail={"code": "unknown_event_category", "message": "This natural-event layer is not available."})
    try:
        return await sources.natural_events(request.app.state.http, category)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NASA EONET event feed unavailable: %s", category, exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "Natural-event data is unavailable and no cached response exists."}) from None


@app.get("/api/v1/weather-alerts", tags=["data"])
async def weather_alert_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.nws_active_alerts(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NWS active-alert feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "Active weather alerts are unavailable and no cached response exists."}) from None


@app.get("/api/v1/muf", tags=["data"])
async def muf_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.muf_forecast(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NOAA WAM-IPE MUF feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "MUF forecast data is unavailable and no cached response exists."}) from None


@app.get("/api/v1/psk-reporter", tags=["radio"])
async def psk_reporter_feed(
    request: Request,
    callsign: str = Query(min_length=3, max_length=16),
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
) -> dict[str, Any]:
    try:
        return await sources.psk_reporter_paths(request.app.state.http, callsign, latitude, longitude)
    except ValueError as error:
        raise HTTPException(status_code=422, detail={"code": "invalid_callsign", "message": str(error)}) from None
    except (httpx.HTTPError, TypeError, json.JSONDecodeError):
        logger.warning("PSK Reporter feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "PSK Reporter data is unavailable and no cached response exists."}) from None


@app.get("/api/v1/rbn-spots", tags=["radio"])
async def rbn_spot_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.rbn_spots(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("Reverse Beacon Network feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "Reverse Beacon Network data is unavailable and no cached response exists."}) from None


@app.get("/api/v1/dx-cluster-spots", tags=["radio"])
async def dx_cluster_spot_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.dx_cluster_spots(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("DX cluster feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "DX cluster data is unavailable and no cached response exists."}) from None


@app.get("/api/v1/pota-spots", tags=["radio"])
async def pota_spot_feed(
    request: Request,
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
) -> dict[str, Any]:
    try:
        return await sources.pota_spots(request.app.state.http, latitude, longitude)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("POTA active spot feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "POTA spot data is unavailable and no cached response exists."}) from None


@app.get("/api/v1/storm-tracks", tags=["data"])
async def storm_track_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.storm_tracks(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NHC storm-track feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "NHC storm-track data is unavailable and no cached response exists."}) from None


@app.get("/api/v1/aurora", tags=["data"])
async def aurora_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.aurora(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NOAA aurora feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "Aurora data is unavailable and no cached response exists."}) from None


@app.get("/api/v1/space-weather", tags=["data"])
async def space_weather_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.space_weather(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NOAA space-weather feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "Space-weather data is unavailable and no cached response exists."}) from None


@app.get("/api/v1/satellites/{catalog_id}", tags=["data"])
async def satellite_feed(request: Request, catalog_id: int) -> dict[str, Any]:
    if catalog_id not in settings.satellite_catalog_ids:
        raise HTTPException(status_code=404, detail={"code": "satellite_not_enabled", "message": "This catalog object is not enabled by the server administrator."})
    try:
        return await sources.satellite_track(request.app.state.http, catalog_id)
    except ValueError:
        raise HTTPException(status_code=422, detail={"code": "invalid_orbit", "message": "The requested catalog object has no usable current element set."}) from None
    except httpx.HTTPError:
        logger.warning("CelesTrak element feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "Satellite elements are unavailable and no cached response exists."}) from None


@app.get("/api/v1/goes-satellites", tags=["data"])
async def goes_satellites_feed(request: Request) -> dict[str, Any]:
    if any(catalog_id not in settings.satellite_catalog_ids for catalog_id in sources.GOES_CATALOG_IDS.values()):
        raise HTTPException(status_code=404, detail={"code": "satellite_not_enabled", "message": "GOES satellites are not enabled by the server administrator."})
    try:
        return await sources.goes_satellite_tracks(request.app.state.http)
    except (ValueError, httpx.HTTPError, TypeError):
        logger.warning("CelesTrak GOES element feed unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail={"code": "source_unavailable", "message": "GOES satellite positions are unavailable and no cached response exists."}) from None


@app.post("/api/v1/adif/import", status_code=201, tags=["radio"], dependencies=[Depends(_edit_access)])
async def import_adif(
    request: Request,
    filename: str | None = None,
    replace_existing: bool = False,
) -> dict[str, Any]:
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > 10_000_000:
            raise HTTPException(status_code=413, detail={"code": "file_too_large", "message": "ADIF import is limited to 10 MB."})
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail={"code": "invalid_encoding", "message": "ADIF import must be UTF-8 text."}) from None
    if "<EOR>" not in text.upper():
        raise HTTPException(status_code=422, detail={"code": "invalid_adif", "message": "No ADIF contact records were found."})
    contacts = adif.parse_adif(text)
    if not contacts:
        raise HTTPException(status_code=422, detail={"code": "no_valid_contacts", "message": "No contacts with a call sign and valid QSO date were found."})
    if len(contacts) > 50_000:
        raise HTTPException(status_code=413, detail={"code": "too_many_contacts", "message": "An import is limited to 50,000 valid contacts."})
    import_id = str(uuid.uuid4())
    imported_at = _now()
    stored_filename = filename.replace("\\", "/").rsplit("/", 1)[-1][:255] if filename else None
    with db.connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if replace_existing:
            conn.execute("DELETE FROM adif_imports")
        conn.execute(
            "INSERT INTO adif_imports(id,filename,imported_at,record_count) VALUES(?,?,?,?)",
            (import_id, stored_filename, imported_at, len(contacts)),
        )
        conn.executemany(
            """INSERT INTO adif_contacts(
                import_id,callsign,contacted_at,band,mode,frequency_mhz,remote_grid,
                remote_lon,remote_lat,local_grid,local_lon,local_lat,record_json
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [(
                import_id, contact["callsign"], contact["contactedAt"], contact["band"], contact["mode"],
                contact["frequencyMhz"], contact["remoteGrid"],
                contact["remoteCoordinates"][0] if contact["remoteCoordinates"] else None,
                contact["remoteCoordinates"][1] if contact["remoteCoordinates"] else None,
                contact["localGrid"], contact["localCoordinates"][0] if contact["localCoordinates"] else None,
                contact["localCoordinates"][1] if contact["localCoordinates"] else None, db.dumps(contact),
            ) for contact in contacts],
        )
        conn.commit()
    record_count = text.upper().count("<EOR>")
    return {
        "importId": import_id,
        "filename": stored_filename,
        "importedAt": imported_at,
        "imported": len(contacts),
        "skipped": max(0, record_count - len(contacts)),
        "unresolvedLocations": sum(contact["remoteCoordinates"] is None for contact in contacts),
        "replacedExisting": replace_existing,
    }


@app.get("/api/v1/adif/contacts", tags=["radio"])
def list_adif_contacts(
    band: str | None = None,
    mode: str | None = None,
    after: str | None = None,
    before: str | None = None,
    offset: int = 0,
    limit: int = 500,
) -> dict[str, Any]:
    if offset < 0 or not 1 <= limit <= 1000:
        raise HTTPException(status_code=422, detail={"code": "invalid_pagination", "message": "offset must be non-negative and limit must be between 1 and 1000."})
    clauses: list[str] = []
    parameters: list[Any] = []
    if band:
        clauses.append("upper(band)=?")
        parameters.append(band.strip().upper())
    if mode:
        clauses.append("upper(mode)=?")
        parameters.append(mode.strip().upper())
    if after:
        clauses.append("contacted_at>=?")
        parameters.append(after)
    if before:
        clauses.append("contacted_at<=?")
        parameters.append(before)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with db.connection() as conn:
        total = conn.execute("SELECT COUNT(*) AS n FROM adif_contacts" + where, parameters).fetchone()["n"]
        rows = conn.execute(
            "SELECT * FROM adif_contacts" + where + " ORDER BY contacted_at DESC,id DESC LIMIT ? OFFSET ?",
            [*parameters, limit, offset],
        ).fetchall()
    contacts = [db.loads(row["record_json"]) for row in rows]
    features = []
    for row, contact in zip(rows, contacts, strict=True):
        coordinates = [row["remote_lon"], row["remote_lat"]] if row["remote_lon"] is not None else None
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": coordinates} if coordinates else None,
            "properties": {
                "id": row["id"], "callsign": row["callsign"], "contactedAt": row["contacted_at"],
                "band": row["band"], "mode": row["mode"], "frequencyMhz": row["frequency_mhz"],
                "remoteGrid": row["remote_grid"], "stationCallsign": contact["stationCallsign"],
                "localGrid": row["local_grid"],
                "localCoordinates": [row["local_lon"], row["local_lat"]] if row["local_lon"] is not None else None,
                "unresolvedLocation": coordinates is None,
            },
        })
    with db.connection() as conn:
        imports = conn.execute("SELECT id,filename,imported_at,record_count FROM adif_imports ORDER BY imported_at DESC").fetchall()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "unresolvedLocationsInResult": sum(feature["geometry"] is None for feature in features),
        "contacts": contacts,
        "featureCollection": {"type": "FeatureCollection", "features": features},
        "imports": [{"id": row["id"], "filename": row["filename"], "importedAt": row["imported_at"], "recordCount": row["record_count"]} for row in imports],
    }


@app.get("/api/v1/layouts", tags=["layouts"])
def list_layouts() -> dict[str, Any]:
    with db.connection() as conn:
        rows = conn.execute("SELECT * FROM layouts ORDER BY name COLLATE NOCASE, id").fetchall()
    return {"layouts": [_layout(row) for row in rows]}


@app.post("/api/v1/layouts", status_code=201, tags=["layouts"], dependencies=[Depends(_edit_access)])
def create_layout(payload: LayoutCreate, response: Response) -> dict[str, Any]:
    _json_size(payload.state)
    now = _now()
    layout_id = str(uuid.uuid4())
    with db.connection() as conn:
        conn.execute(
            "INSERT INTO layouts(id,name,state_json,revision,created_at,updated_at,schema_version) VALUES(?,?,?,?,?,?,?)",
            (layout_id, payload.name, db.dumps(payload.state), 1, now, now, payload.schema_version),
        )
        row = conn.execute("SELECT * FROM layouts WHERE id=?", (layout_id,)).fetchone()
    _revision_header(response, 1)
    return _layout(row)


@app.get("/api/v1/layouts/{layout_id}", tags=["layouts"])
def get_layout(layout_id: str, response: Response) -> dict[str, Any]:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM layouts WHERE id=?", (layout_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "layout_not_found", "message": "Layout does not exist."})
    _revision_header(response, row["revision"])
    return _layout(row)


@app.put("/api/v1/layouts/{layout_id}", tags=["layouts"], dependencies=[Depends(_edit_access)])
def update_layout(
    layout_id: str,
    payload: LayoutUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
) -> dict[str, Any]:
    _json_size(payload.state)
    expected = _expected_revision(if_match)
    now = _now()
    with db.connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        result = conn.execute(
            "UPDATE layouts SET name=?,state_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
            (payload.name, db.dumps(payload.state), now, layout_id, expected),
        )
        if result.rowcount != 1:
            exists = conn.execute("SELECT 1 FROM layouts WHERE id=?", (layout_id,)).fetchone()
            conn.rollback()
            if exists is None:
                raise HTTPException(status_code=404, detail={"code": "layout_not_found", "message": "Layout does not exist."})
            raise _revision_conflict()
        row = conn.execute("SELECT * FROM layouts WHERE id=?", (layout_id,)).fetchone()
        conn.commit()
    _revision_header(response, row["revision"])
    return _layout(row)


@app.delete("/api/v1/layouts/{layout_id}", status_code=204, tags=["layouts"], dependencies=[Depends(_edit_access)])
def delete_layout(layout_id: str, if_match: str | None = Header(default=None, alias="If-Match")) -> Response:
    expected = _expected_revision(if_match)
    with db.connection() as conn:
        result = conn.execute("DELETE FROM layouts WHERE id=? AND revision=?", (layout_id, expected))
        if result.rowcount != 1:
            exists = conn.execute("SELECT 1 FROM layouts WHERE id=?", (layout_id,)).fetchone()
            if exists is None:
                raise HTTPException(status_code=404, detail={"code": "layout_not_found", "message": "Layout does not exist."})
            raise _revision_conflict()
    return Response(status_code=204)


@app.get("/api/v1/drawings", tags=["drawings"])
def get_drawings(response: Response) -> dict[str, Any]:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM drawings WHERE singleton=1").fetchone()
    if row is None:
        payload = {"type": "FeatureCollection", "features": []}
        _revision_header(response, 0)
        return {"collection": payload, "revision": 0, "updatedAt": None}
    _revision_header(response, row["revision"])
    return {"collection": db.loads(row["collection_json"]), "revision": row["revision"], "updatedAt": row["updated_at"]}


@app.put("/api/v1/drawings", tags=["drawings"], dependencies=[Depends(_edit_access)])
def put_drawings(
    payload: DrawingUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
) -> dict[str, Any]:
    expected = _expected_revision(if_match)
    now = _now()
    collection = payload.collection.model_dump()
    with db.connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT revision FROM drawings WHERE singleton=1").fetchone()
        current = row["revision"] if row else 0
        if current != expected:
            conn.rollback()
            if row is None and expected != 0:
                raise _revision_conflict()
            raise _revision_conflict()
        revision = current + 1
        conn.execute(
            """INSERT INTO drawings(singleton,collection_json,revision,updated_at) VALUES(1,?,?,?)
               ON CONFLICT(singleton) DO UPDATE SET collection_json=excluded.collection_json,
               revision=excluded.revision,updated_at=excluded.updated_at""",
            (db.dumps(collection), revision, now),
        )
        conn.commit()
    _revision_header(response, revision)
    return {"collection": collection, "revision": revision, "updatedAt": now}


@app.get("/api/v1/settings", tags=["settings"])
def get_settings(response: Response) -> dict[str, Any]:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM settings WHERE singleton=1").fetchone()
    if row is None:
        _revision_header(response, 0)
        return {"settings": {}, "revision": 0, "updatedAt": None}
    _revision_header(response, row["revision"])
    return {"settings": db.loads(row["settings_json"]), "revision": row["revision"], "updatedAt": row["updated_at"]}


@app.put("/api/v1/settings", tags=["settings"], dependencies=[Depends(_edit_access)])
def put_settings(
    payload: SettingsUpdate,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
) -> dict[str, Any]:
    expected = _expected_revision(if_match)
    now = _now()
    with db.connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT revision FROM settings WHERE singleton=1").fetchone()
        current = row["revision"] if row else 0
        if current != expected:
            conn.rollback()
            raise _revision_conflict()
        revision = current + 1
        conn.execute(
            """INSERT INTO settings(singleton,settings_json,revision,updated_at) VALUES(1,?,?,?)
               ON CONFLICT(singleton) DO UPDATE SET settings_json=excluded.settings_json,
               revision=excluded.revision,updated_at=excluded.updated_at""",
            (db.dumps(payload.settings), revision, now),
        )
        conn.commit()
    _revision_header(response, revision)
    return {"settings": payload.settings, "revision": revision, "updatedAt": now}


@app.exception_handler(sqlite3.Error)
async def sqlite_error(_: Request, exc: sqlite3.Error) -> JSONResponse:
    logger.exception("SQLite request failed", exc_info=exc)
    return JSONResponse(status_code=503, content={"detail": {"code": "storage_unavailable", "message": "Persistent storage is temporarily unavailable."}})
