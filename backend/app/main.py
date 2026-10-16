from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import re
import sqlite3
import uuid
import xml.etree.ElementTree as ET
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from redis.asyncio import Redis

from . import adif, atlas, db, environment, sources, transport, wsjtx
from .config import settings
from .desktop import mount_frontend, prop_router
from .feed_stream import PUBLIC_FEED_ROUTES, FeedStreamHub, parse_topics
from .schemas import DrawingUpdate, FeatureCollection, LayoutCreate, LayoutUpdate, SettingsUpdate

logger = logging.getLogger("geo.api")
MAX_LAYOUT_BYTES = 1_000_000
MAX_LOCAL_SOURCES = 8
LOCAL_SOURCE_STALE_SECONDS = 300
LOCAL_SOURCE_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")
PUBLIC_DISABLED_LAYERS = ("contacts", "pskreporter", "pota", "wsjtx")
CDN_CACHEABLE_PUBLIC_PATHS = {
    "/api/v1/layers",
    *(urlsplit(route).path for route in PUBLIC_FEED_ROUTES.values()),
}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db.initialize()
    app.state.wsjtx_heard = wsjtx.HeardStations()
    app.state.wsjtx_listener = None
    app.state.wsjtx_listener_error = False
    app.state.wsjtx_udp_address = None
    if settings.deployment_mode != "public":
        try:
            app.state.wsjtx_listener, _ = await asyncio.get_running_loop().create_datagram_endpoint(
                lambda: wsjtx.WSJTXProtocol(app.state.wsjtx_heard),
                local_addr=(settings.wsjtx_udp_host, settings.wsjtx_udp_port),
            )
            app.state.wsjtx_udp_address = app.state.wsjtx_listener.get_extra_info("sockname")[:2]
        except OSError:
            app.state.wsjtx_listener_error = True
            logger.warning("WSJT-X UDP listener could not bind its configured port", exc_info=True)
    app.state.http = httpx.AsyncClient(
        timeout=httpx.Timeout(settings.request_timeout_seconds),
        headers={"User-Agent": settings.user_agent, "Accept": "application/json"},
        follow_redirects=False,
    )
    app.state.feed_internal_http = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://geo-internal"
    )
    app.state.feed_redis = None
    app.state.feed_stream = None
    try:
        if settings.redis_url:
            app.state.feed_redis = Redis.from_url(settings.redis_url, decode_responses=True)
            await app.state.feed_redis.ping()

        async def fetch_public_feed(topic: str) -> dict[str, Any]:
            response = await app.state.feed_internal_http.get(PUBLIC_FEED_ROUTES[topic])
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise TypeError("Public feed endpoint returned a non-object response")
            return payload

        app.state.feed_stream = FeedStreamHub(fetch_public_feed, redis=app.state.feed_redis)
        await app.state.feed_stream.start()
        yield
    finally:
        if app.state.feed_stream:
            await app.state.feed_stream.close()
        if app.state.feed_redis:
            await app.state.feed_redis.aclose()
        await app.state.feed_internal_http.aclose()
        if app.state.wsjtx_listener:
            app.state.wsjtx_listener.close()
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


@app.middleware("http")
async def browser_cache_policy(request: Request, call_next):
    if settings.deployment_mode == "public" and request.method in {
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
    }:
        return JSONResponse(
            status_code=403,
            content={
                "detail": {
                    "code": "public_read_only",
                    "message": "Public mode does not allow server writes.",
                }
            },
            headers={"Cache-Control": "no-store"},
        )
    response = await call_next(request)
    if request.url.path.startswith("/api/v1/"):
        if request.method != "GET" or settings.deployment_mode != "public":
            response.headers["Cache-Control"] = "private, no-store"
        elif response.status_code >= 400 or request.url.path in {
            "/api/v1/runtime",
            "/api/v1/feed-stream",
        }:
            response.headers["Cache-Control"] = "no-store"
        elif request.url.path in CDN_CACHEABLE_PUBLIC_PATHS:
            response.headers["Cache-Control"] = "public, max-age=30, s-maxage=30"
        else:
            response.headers["Cache-Control"] = "private, max-age=30"
    return response


def _now() -> str:
    return db.iso()


def _local_source_id(value: str) -> str:
    if not LOCAL_SOURCE_ID.fullmatch(value):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_local_source_id", "message": "Source IDs must be lowercase letters, numbers, or hyphens (64 characters maximum)."},
        )
    return value


def _local_source_envelope(source_id: str, collection: dict[str, Any], updated_at: str | None) -> dict[str, Any]:
    now = datetime.now(UTC)
    updated = datetime.fromisoformat(updated_at) if updated_at else None
    stale = bool(updated and now - updated > timedelta(seconds=LOCAL_SOURCE_STALE_SECONDS))
    return {
        "source": f"local:{source_id}",
        "kind": "user",
        "fetchedAt": updated_at,
        "dataTime": None,
        "validFrom": None,
        "validTo": None,
        "expiresAt": db.iso((updated or now) + timedelta(seconds=LOCAL_SOURCE_STALE_SECONDS)),
        "status": "stale" if stale else "current" if updated else "waiting",
        "attribution": "Operator-provided local data",
        "documentationUrl": "",
        "coverage": "User-configured local source",
        "units": {},
        "staleReason": "No update received in the last five minutes." if stale else None,
        "data": collection,
    }


def _json_size(value: Any, maximum: int = MAX_LAYOUT_BYTES) -> None:
    try:
        encoded = json.dumps(value, allow_nan=False, separators=(",", ":"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_json", "message": "Payload must contain finite JSON values."},
        ) from None
    if len(encoded.encode("utf-8")) > maximum:
        raise HTTPException(
            status_code=413,
            detail={"code": "payload_too_large", "message": "Payload exceeds the size limit."},
        )


def _edit_access(x_geo_edit_token: str | None = Header(default=None)) -> None:
    if settings.deployment_mode == "public":
        raise HTTPException(
            status_code=403,
            detail={
                "code": "public_read_only",
                "message": "Public mode does not allow shared server writes.",
            },
        )
    required = os.getenv("GEO_EDIT_TOKEN")
    if required and (not x_geo_edit_token or not hmac.compare_digest(required, x_geo_edit_token)):
        raise HTTPException(
            status_code=401,
            detail={"code": "edit_auth_required", "message": "A valid edit token is required."},
        )


def _private_state_access() -> None:
    if settings.deployment_mode == "public":
        raise HTTPException(
            status_code=404,
            detail={
                "code": "feature_disabled_public",
                "message": "This user-specific feature is unavailable in public mode.",
            },
        )


def _revision_header(response: Response, revision: int) -> None:
    response.headers["ETag"] = f'"{revision}"'


def _expected_revision(value: str | None) -> int:
    if value is None:
        raise HTTPException(
            status_code=428,
            detail={"code": "revision_required", "message": "Send the current ETag in If-Match."},
        )
    value = value.strip()
    value = value.removeprefix("W/")
    value = value.strip('"')
    try:
        revision = int(value)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_revision", "message": "If-Match must contain a numeric ETag."},
        ) from None
    if revision < 0:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_revision", "message": "Revision must be non-negative."},
        )
    return revision


def _layout(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "schemaVersion": row["schema_version"],
        "state": db.loads(row["state_json"]),
        "revision": row["revision"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _revision_conflict() -> HTTPException:
    return HTTPException(
        status_code=412,
        detail={
            "code": "revision_conflict",
            "message": "The saved revision changed. Reload it before saving.",
        },
    )


@app.get("/healthz", tags=["system"])
def health() -> dict[str, Any]:
    try:
        with db.connection() as conn:
            conn.execute("SELECT 1").fetchone()
        storage = "ok"
    except sqlite3.Error:
        storage = "unavailable"
    return {"status": "ok" if storage == "ok" else "degraded", "storage": storage, "time": _now()}


@app.get("/api/v1/runtime", tags=["system"])
def runtime() -> dict[str, Any]:
    public = settings.deployment_mode == "public"
    return {
        "deploymentMode": settings.deployment_mode,
        "sharedState": not public,
        "writeEnabled": not public,
        "disabledLayers": (list(PUBLIC_DISABLED_LAYERS) if public else [])
        + ([] if settings.air_traffic_enabled else ["air-traffic"]),
    }


@app.get("/api/v1/layers", tags=["catalog"])
def layers() -> dict[str, Any]:
    catalog = [
        *[
            {
                "id": layer,
                "name": environment.ENVIRONMENT_CATALOG[layer][0],
                "kind": environment.ENVIRONMENT_CATALOG[layer][1],
                "status": "available",
                "source": environment.ENVIRONMENT_CATALOG[layer][2],
                "endpoint": f"/api/v1/environment/{layer}",
            }
            for layer in environment.ENVIRONMENT_LAYERS
        ],
        *[
            {
                "id": layer,
                "name": layer.title(),
                "kind": "reference",
                "status": "available",
                "source": "Peter Bird PB2002 · ODbL 1.0"
                if layer == "tectonic-plates"
                else "Natural Earth · global reference",
                "endpoint": f"/api/v1/atlas/{layer}",
            }
            for layer in atlas.REFERENCE_LAYERS
        ],
        {
            "id": "air-traffic",
            "name": "Air traffic",
            "kind": "observation",
            "status": "available" if settings.air_traffic_enabled else "disabled",
            "source": "ADSB.lol · regional observations · ODbL",
            "endpoint": "/api/v1/air-traffic",
        },
        {
            "id": "air-routes",
            "name": "Air routes · 2014",
            "kind": "reference",
            "status": "available",
            "source": "OpenFlights · June 2014",
            "endpoint": "/api/v1/air-routes",
        },
        {
            "id": "sea-routes",
            "name": "Sea routes",
            "kind": "reference",
            "status": "available",
            "source": "P. Benden / CIA · 2012 map, 2022 dataset",
            "endpoint": "/api/v1/sea-routes",
        },
        {
            "id": "political-atlas",
            "name": "Political atlas",
            "kind": "base",
            "status": "available",
            "source": "Natural Earth",
        },
        {
            "id": "day-night",
            "name": "Day and night",
            "kind": "computed",
            "status": "available",
            "source": "Solar position calculation",
        },
        {
            "id": "maidenhead",
            "name": "Maidenhead grid",
            "kind": "computed",
            "status": "available",
            "source": "Amateur radio locator grid",
        },
        {
            "id": "air-quality",
            "name": "Air quality · PM2.5",
            "kind": "forecast",
            "status": "available",
            "source": "Open-Meteo CAMS Global · 12° sampled overview · non-commercial free service",
            "endpoint": "/api/v1/air-quality",
        },
        {
            "id": "earthquakes",
            "name": "Earthquakes",
            "kind": "vector",
            "status": "available",
            "source": "USGS GeoJSON",
            "endpoint": "/api/v1/earthquakes",
        },
        {
            "id": "wildfires",
            "name": "Wildfires",
            "kind": "vector",
            "status": "available",
            "source": "NASA EONET",
            "endpoint": "/api/v1/natural-events/wildfires",
        },
        {
            "id": "volcanoes",
            "name": "Volcanic activity",
            "kind": "vector",
            "status": "available",
            "source": "NASA EONET",
            "endpoint": "/api/v1/natural-events/volcanoes",
        },
        {
            "id": "floods",
            "name": "Floods",
            "kind": "vector",
            "status": "available",
            "source": "NASA EONET",
            "endpoint": "/api/v1/natural-events/floods",
        },
        {
            "id": "severe-storms",
            "name": "Severe storms",
            "kind": "vector",
            "status": "available",
            "source": "NASA EONET",
            "endpoint": "/api/v1/natural-events/severe-storms",
        },
        {
            "id": "weather-alerts",
            "name": "Active weather alerts",
            "kind": "vector",
            "status": "available",
            "source": "National Weather Service API",
            "endpoint": "/api/v1/weather-alerts",
        },
        {
            "id": "aurora",
            "name": "Aurora forecast",
            "kind": "vector",
            "status": "available",
            "source": "NOAA SWPC OVATION",
            "endpoint": "/api/v1/aurora",
        },
        {
            "id": "space-weather",
            "name": "Planetary K index",
            "kind": "widget-data",
            "status": "available",
            "source": "NOAA SWPC",
            "endpoint": "/api/v1/space-weather",
        },
        {
            "id": "satellites",
            "name": "Satellite tracks",
            "kind": "computed",
            "status": "available",
            "source": "CelesTrak TLE plus local SGP4",
            "endpoint": "/api/v1/satellites/{catalog_id}",
        },
        {
            "id": "adif",
            "name": "ADIF contacts",
            "kind": "user-data",
            "status": "available",
            "source": "User-provided ADIF import",
            "endpoint": "/api/v1/adif/import",
        },
        {
            "id": "imagery",
            "name": "Satellite imagery",
            "kind": "raster",
            "status": "available",
            "source": "NASA GIBS dated MODIS Terra",
        },
        {
            "id": "muf",
            "name": "Maximum usable frequency",
            "kind": "raster",
            "status": "available",
            "source": "NOAA SWPC WAM-IPE",
            "endpoint": "/api/v1/muf",
        },
        {
            "id": "satellite-weather",
            "name": "Satellite weather",
            "kind": "raster",
            "status": "available",
            "source": "NASA GIBS · GOES ABI GeoColor",
        },
        {
            "id": "clouds",
            "name": "Satellite clouds (white)",
            "kind": "raster",
            "status": "available",
            "source": "NASA GIBS GOES ABI and Himawari AHI clean infrared; approximate white cloud rendering; refreshed every 10 minutes",
        },
        {
            "id": "eumetsat-clouds",
            "name": "Global cloud composite",
            "kind": "raster",
            "status": "available",
            "source": "EUMETSAT Geostationary Ring IR10.8 μm multimission composite; refreshed about every 3 hours with gaps toward the poles",
        },
        {
            "id": "hf-absorption",
            "name": "HF radio absorption",
            "kind": "raster",
            "status": "available",
            "source": "NOAA SWPC D-RAP global absorption-frequency map; refreshed every minute",
        },
        {
            "id": "precipitation",
            "name": "Precipitation rate",
            "kind": "raster",
            "status": "available",
            "source": "NASA GPM IMERG 30-minute global precipitation-rate imagery",
        },
        {
            "id": "lightning",
            "name": "Lightning density",
            "kind": "raster",
            "status": "available",
            "source": "NOAA nowCOAST WMS",
        },
        {
            "id": "storms",
            "name": "Tropical storm tracks",
            "kind": "vector",
            "status": "available",
            "source": "NOAA National Hurricane Center",
            "endpoint": "/api/v1/storm-tracks",
        },
        {
            "id": "pskreporter",
            "name": "PSK Reporter paths",
            "kind": "vector",
            "status": "available",
            "source": "PSK Reporter",
            "endpoint": "/api/v1/psk-reporter",
        },
        {
            "id": "wsjtx",
            "name": "WSJT-X heard stations",
            "kind": "local-observation",
            "status": "available",
            "source": "WSJT-X local UDP decoded messages",
            "endpoint": "/api/v1/wsjtx/heard",
        },
        {
            "id": "goes-track",
            "name": "GOES satellite positions",
            "kind": "vector",
            "status": "available",
            "source": "CelesTrak SGP4 · GOES-19 / GOES-18",
            "endpoint": "/api/v1/goes-satellites",
        },
        {
            "id": "rbn",
            "name": "Reverse Beacon Network",
            "kind": "vector",
            "status": "available",
            "source": "Vail ReRBN",
            "endpoint": "/api/v1/rbn-spots",
        },
        {
            "id": "dx-cluster",
            "name": "DX Cluster paths",
            "kind": "vector",
            "status": "available",
            "source": "DXClusterAPI",
            "endpoint": "/api/v1/dx-cluster-spots",
        },
        {
            "id": "wspr",
            "name": "WSPR propagation paths",
            "kind": "vector",
            "status": "available",
            "source": "WSPRnet spots via wspr.live · recent HF and 6 m reports",
            "endpoint": "/api/v1/wspr-spots",
        },
        {
            "id": "pota",
            "name": "Parks on the Air spots",
            "kind": "vector",
            "status": "available",
            "source": "POTA active activator feed",
            "endpoint": "/api/v1/pota-spots",
        },
    ]
    if settings.deployment_mode == "public":
        catalog = [
            layer for layer in catalog if layer["id"] not in {*PUBLIC_DISABLED_LAYERS, "adif"}
        ]
    return {"layers": catalog, "generatedAt": _now()}


@app.get("/api/v1/feed-stream", tags=["data"])
async def public_feed_stream(
    request: Request, topics: str = Query(min_length=1, max_length=1024)
) -> StreamingResponse:
    if settings.deployment_mode != "public":
        raise HTTPException(
            status_code=404,
            detail={
                "code": "feature_disabled_public",
                "message": "Live public feed stream is unavailable in private mode.",
            },
        )
    try:
        selected_topics = parse_topics(topics)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_feed_topics",
                "message": "One or more feed topics are unsupported.",
            },
        ) from None
    hub: FeedStreamHub = request.app.state.feed_stream

    async def events() -> AsyncIterator[str]:
        async with hub.subscribe(selected_topics) as queue:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=hub.heartbeat_seconds)
                    yield f"event: feed\ndata: {json.dumps(event, separators=(',', ':'), ensure_ascii=False)}\n\n"
                except TimeoutError:
                    yield ": keep-alive\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/v1/earthquakes", tags=["data"])
async def earthquake_feed(
    request: Request,
    period: str = "day",
    min_magnitude: float = 0,
) -> dict[str, Any]:
    if period not in sources.USGS_FEEDS:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_period",
                "message": "period must be hour, day, week, or month.",
            },
        )
    if not 0 <= min_magnitude <= 10:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_magnitude",
                "message": "min_magnitude must be between 0 and 10.",
            },
        )
    try:
        return await sources.earthquakes(request.app.state.http, period, min_magnitude)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("USGS earthquake feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "Earthquake data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/natural-events/{category}", tags=["data"])
async def natural_event_feed(request: Request, category: str) -> dict[str, Any]:
    if category not in sources.EONET_CATEGORIES:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "unknown_event_category",
                "message": "This natural-event layer is not available.",
            },
        )
    try:
        return await sources.natural_events(request.app.state.http, category)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NASA EONET event feed unavailable: %s", category, exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "Natural-event data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/weather-alerts", tags=["data"])
async def weather_alert_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.nws_active_alerts(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NWS active-alert feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "Active weather alerts are unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/environment/{layer}", tags=["data"])
async def environment_feed(request: Request, layer: str) -> dict[str, Any]:
    if layer not in environment.ENVIRONMENT_LAYERS:
        raise HTTPException(
            status_code=404,
            detail={"code": "unknown_layer", "message": "This environment layer is not available."},
        )
    try:
        return await environment.environment_layer(request.app.state.http, layer)
    except (httpx.HTTPError, TypeError, ValueError, OverflowError, ET.ParseError):
        logger.warning("Environmental source unavailable: %s", layer, exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "This source is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/atlas/vessel-density-global-image", tags=["data"])
def global_density_image() -> FileResponse:
    return FileResponse(
        atlas.DATA / "vessel-density-global.png",
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/api/v1/atlas/bathymetry-image", tags=["data"])
def bathymetry_image() -> FileResponse:
    return FileResponse(
        atlas.DATA / "bathymetry.png",
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/api/v1/atlas/{layer}", tags=["data"])
def atlas_reference(layer: str) -> dict[str, Any]:
    if layer not in atlas.REFERENCE_LAYERS:
        raise HTTPException(
            status_code=404,
            detail={"code": "unknown_layer", "message": "This atlas layer is not available."},
        )
    return atlas.reference_layer(layer)


@app.get("/api/v1/air-routes", tags=["data"])
def air_routes_feed() -> dict[str, Any]:
    return transport.reference_routes("air-routes")


@app.get("/api/v1/sea-routes", tags=["data"])
def sea_routes_feed() -> dict[str, Any]:
    return transport.reference_routes("sea-routes")


@app.get("/api/v1/air-traffic", tags=["data"])
async def air_traffic_feed(request: Request) -> dict[str, Any]:
    if not settings.air_traffic_enabled:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_disabled",
                "message": "Air traffic is disabled on this server. Configure the provider before enabling public use.",
            },
        )
    try:
        return await transport.air_traffic(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, OverflowError):
        logger.warning("ADSB.lol aircraft feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "Aircraft data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/air-quality", tags=["data"])
async def air_quality_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.air_quality(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("Open-Meteo CAMS air-quality feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "CAMS global air-quality data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/muf", tags=["data"])
async def muf_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.muf_forecast(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NOAA WAM-IPE MUF feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "MUF forecast data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/psk-reporter", tags=["radio"], dependencies=[Depends(_private_state_access)])
async def psk_reporter_feed(
    request: Request,
    callsign: str = Query(min_length=3, max_length=16),
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
) -> dict[str, Any]:
    try:
        return await sources.psk_reporter_paths(
            request.app.state.http, callsign, latitude, longitude
        )
    except ValueError as error:
        raise HTTPException(
            status_code=422, detail={"code": "invalid_callsign", "message": str(error)}
        ) from None
    except (httpx.HTTPError, TypeError, json.JSONDecodeError):
        logger.warning("PSK Reporter feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "PSK Reporter data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/wsjtx/heard", tags=["radio"], dependencies=[Depends(_private_state_access)])
def wsjtx_heard_feed(
    request: Request,
    station_call: str | None = Query(default=None, max_length=16),
) -> dict[str, Any]:
    own_call = station_call.strip().upper() if station_call else None
    if own_call and not wsjtx.is_callsign(own_call):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_callsign",
                "message": "station_call must be a valid amateur-radio callsign.",
            },
        )
    return request.app.state.wsjtx_heard.snapshot(
        station_call=own_call,
        listener_error=request.app.state.wsjtx_listener_error,
        udp_port=settings.wsjtx_udp_port,
    )


@app.get("/api/v1/local-sources/{source_id}", tags=["local sources"], dependencies=[Depends(_private_state_access)])
def get_local_source(source_id: str) -> dict[str, Any]:
    source_id = _local_source_id(source_id)
    with db.connection() as conn:
        row = conn.execute(
            "SELECT collection_json,updated_at FROM local_source_data WHERE source_id=?",
            (source_id,),
        ).fetchone()
    if row is None:
        return _local_source_envelope(source_id, {"type": "FeatureCollection", "features": []}, None)
    return _local_source_envelope(source_id, db.loads(row["collection_json"]), row["updated_at"])


@app.post("/api/v1/local-sources/{source_id}/data", tags=["local sources"], dependencies=[Depends(_edit_access)])
def push_local_source(source_id: str, collection: FeatureCollection) -> dict[str, Any]:
    source_id = _local_source_id(source_id)
    value = collection.model_dump()
    updated_at = _now()
    with db.connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        exists = conn.execute(
            "SELECT 1 FROM local_source_data WHERE source_id=?", (source_id,)
        ).fetchone()
        count = conn.execute("SELECT COUNT(*) AS n FROM local_source_data").fetchone()["n"]
        if exists is None and count >= MAX_LOCAL_SOURCES:
            conn.rollback()
            raise HTTPException(
                status_code=409,
                detail={"code": "local_source_limit", "message": "This instance already has eight local data sources."},
            )
        conn.execute(
            """INSERT INTO local_source_data(source_id,collection_json,updated_at) VALUES(?,?,?)
               ON CONFLICT(source_id) DO UPDATE SET collection_json=excluded.collection_json,
               updated_at=excluded.updated_at""",
            (source_id, db.dumps(value), updated_at),
        )
        conn.commit()
    return _local_source_envelope(source_id, value, updated_at)


@app.delete("/api/v1/local-sources/{source_id}/data", status_code=204, tags=["local sources"], dependencies=[Depends(_edit_access)])
def clear_local_source(source_id: str) -> Response:
    source_id = _local_source_id(source_id)
    with db.connection() as conn:
        conn.execute("DELETE FROM local_source_data WHERE source_id=?", (source_id,))
    return Response(status_code=204)


@app.get("/api/v1/rbn-spots", tags=["radio"])
async def rbn_spot_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.rbn_spots(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("Reverse Beacon Network feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "Reverse Beacon Network data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/dx-cluster-spots", tags=["radio"])
async def dx_cluster_spot_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.dx_cluster_spots(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("DX cluster feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "DX cluster data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/wspr-spots", tags=["radio"])
async def wspr_spot_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.wspr_spots(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("WSPR spot feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "WSPR spot data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/pota-spots", tags=["radio"], dependencies=[Depends(_private_state_access)])
async def pota_spot_feed(
    request: Request,
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
) -> dict[str, Any]:
    try:
        return await sources.pota_spots(request.app.state.http, latitude, longitude)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("POTA active spot feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "POTA spot data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/storm-tracks", tags=["data"])
async def storm_track_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.storm_tracks(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NHC storm-track feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "NHC storm-track data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/aurora", tags=["data"])
async def aurora_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.aurora(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NOAA aurora feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "Aurora data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/space-weather", tags=["data"])
async def space_weather_feed(request: Request) -> dict[str, Any]:
    try:
        return await sources.space_weather(request.app.state.http)
    except (httpx.HTTPError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("NOAA space-weather feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "Space-weather data is unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/satellites/{catalog_id}", tags=["data"])
async def satellite_feed(request: Request, catalog_id: int) -> dict[str, Any]:
    if catalog_id not in settings.satellite_catalog_ids:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "satellite_not_enabled",
                "message": "This catalog object is not enabled by the server administrator.",
            },
        )
    try:
        return await sources.satellite_track(request.app.state.http, catalog_id)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_orbit",
                "message": "The requested catalog object has no usable current element set.",
            },
        ) from None
    except httpx.HTTPError:
        logger.warning("CelesTrak element feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "Satellite elements are unavailable and no cached response exists.",
            },
        ) from None


@app.get("/api/v1/goes-satellites", tags=["data"])
async def goes_satellites_feed(request: Request) -> dict[str, Any]:
    if any(
        catalog_id not in settings.satellite_catalog_ids
        for catalog_id in sources.GOES_CATALOG_IDS.values()
    ):
        raise HTTPException(
            status_code=404,
            detail={
                "code": "satellite_not_enabled",
                "message": "GOES satellites are not enabled by the server administrator.",
            },
        )
    try:
        return await sources.goes_satellite_tracks(request.app.state.http)
    except (ValueError, httpx.HTTPError, TypeError):
        logger.warning("CelesTrak GOES element feed unavailable", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "source_unavailable",
                "message": "GOES satellite positions are unavailable and no cached response exists.",
            },
        ) from None


@app.post(
    "/api/v1/adif/import", status_code=201, tags=["radio"], dependencies=[Depends(_edit_access)]
)
async def import_adif(
    request: Request,
    filename: str | None = None,
    replace_existing: bool = False,
) -> dict[str, Any]:
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > 10_000_000:
            raise HTTPException(
                status_code=413,
                detail={"code": "file_too_large", "message": "ADIF import is limited to 10 MB."},
            )
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_encoding", "message": "ADIF import must be UTF-8 text."},
        ) from None
    if "<EOR>" not in text.upper():
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_adif", "message": "No ADIF contact records were found."},
        )
    contacts = adif.parse_adif(text)
    if not contacts:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "no_valid_contacts",
                "message": "No contacts with a call sign and valid QSO date were found.",
            },
        )
    if len(contacts) > 50_000:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "too_many_contacts",
                "message": "An import is limited to 50,000 valid contacts.",
            },
        )
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
            [
                (
                    import_id,
                    contact["callsign"],
                    contact["contactedAt"],
                    contact["band"],
                    contact["mode"],
                    contact["frequencyMhz"],
                    contact["remoteGrid"],
                    contact["remoteCoordinates"][0] if contact["remoteCoordinates"] else None,
                    contact["remoteCoordinates"][1] if contact["remoteCoordinates"] else None,
                    contact["localGrid"],
                    contact["localCoordinates"][0] if contact["localCoordinates"] else None,
                    contact["localCoordinates"][1] if contact["localCoordinates"] else None,
                    db.dumps(contact),
                )
                for contact in contacts
            ],
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


@app.get("/api/v1/adif/contacts", tags=["radio"], dependencies=[Depends(_private_state_access)])
def list_adif_contacts(
    band: str | None = None,
    mode: str | None = None,
    after: str | None = None,
    before: str | None = None,
    offset: int = 0,
    limit: int = 500,
) -> dict[str, Any]:
    if offset < 0 or not 1 <= limit <= 1000:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_pagination",
                "message": "offset must be non-negative and limit must be between 1 and 1000.",
            },
        )
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
        total = conn.execute(
            "SELECT COUNT(*) AS n FROM adif_contacts" + where, parameters
        ).fetchone()["n"]
        rows = conn.execute(
            "SELECT * FROM adif_contacts"
            + where
            + " ORDER BY contacted_at DESC,id DESC LIMIT ? OFFSET ?",
            [*parameters, limit, offset],
        ).fetchall()
    contacts = [db.loads(row["record_json"]) for row in rows]
    features = []
    for row, contact in zip(rows, contacts, strict=True):
        coordinates = (
            [row["remote_lon"], row["remote_lat"]] if row["remote_lon"] is not None else None
        )
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": coordinates} if coordinates else None,
                "properties": {
                    "id": row["id"],
                    "callsign": row["callsign"],
                    "contactedAt": row["contacted_at"],
                    "band": row["band"],
                    "mode": row["mode"],
                    "frequencyMhz": row["frequency_mhz"],
                    "remoteGrid": row["remote_grid"],
                    "stationCallsign": contact["stationCallsign"],
                    "localGrid": row["local_grid"],
                    "localCoordinates": [row["local_lon"], row["local_lat"]]
                    if row["local_lon"] is not None
                    else None,
                    "unresolvedLocation": coordinates is None,
                },
            }
        )
    with db.connection() as conn:
        imports = conn.execute(
            "SELECT id,filename,imported_at,record_count FROM adif_imports ORDER BY imported_at DESC"
        ).fetchall()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "unresolvedLocationsInResult": sum(feature["geometry"] is None for feature in features),
        "contacts": contacts,
        "featureCollection": {"type": "FeatureCollection", "features": features},
        "imports": [
            {
                "id": row["id"],
                "filename": row["filename"],
                "importedAt": row["imported_at"],
                "recordCount": row["record_count"],
            }
            for row in imports
        ],
    }


@app.get("/api/v1/layouts", tags=["layouts"], dependencies=[Depends(_private_state_access)])
def list_layouts() -> dict[str, Any]:
    with db.connection() as conn:
        rows = conn.execute("SELECT * FROM layouts ORDER BY name COLLATE NOCASE, id").fetchall()
    return {"layouts": [_layout(row) for row in rows]}


@app.post(
    "/api/v1/layouts", status_code=201, tags=["layouts"], dependencies=[Depends(_edit_access)]
)
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


@app.get(
    "/api/v1/layouts/{layout_id}", tags=["layouts"], dependencies=[Depends(_private_state_access)]
)
def get_layout(layout_id: str, response: Response) -> dict[str, Any]:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM layouts WHERE id=?", (layout_id,)).fetchone()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "layout_not_found", "message": "Layout does not exist."},
        )
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
                raise HTTPException(
                    status_code=404,
                    detail={"code": "layout_not_found", "message": "Layout does not exist."},
                )
            raise _revision_conflict()
        row = conn.execute("SELECT * FROM layouts WHERE id=?", (layout_id,)).fetchone()
        conn.commit()
    _revision_header(response, row["revision"])
    return _layout(row)


@app.delete(
    "/api/v1/layouts/{layout_id}",
    status_code=204,
    tags=["layouts"],
    dependencies=[Depends(_edit_access)],
)
def delete_layout(
    layout_id: str, if_match: str | None = Header(default=None, alias="If-Match")
) -> Response:
    expected = _expected_revision(if_match)
    with db.connection() as conn:
        result = conn.execute(
            "DELETE FROM layouts WHERE id=? AND revision=?", (layout_id, expected)
        )
        if result.rowcount != 1:
            exists = conn.execute("SELECT 1 FROM layouts WHERE id=?", (layout_id,)).fetchone()
            if exists is None:
                raise HTTPException(
                    status_code=404,
                    detail={"code": "layout_not_found", "message": "Layout does not exist."},
                )
            raise _revision_conflict()
    return Response(status_code=204)


@app.get("/api/v1/drawings", tags=["drawings"], dependencies=[Depends(_private_state_access)])
def get_drawings(response: Response) -> dict[str, Any]:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM drawings WHERE singleton=1").fetchone()
    if row is None:
        payload = {"type": "FeatureCollection", "features": []}
        _revision_header(response, 0)
        return {"collection": payload, "revision": 0, "updatedAt": None}
    _revision_header(response, row["revision"])
    return {
        "collection": db.loads(row["collection_json"]),
        "revision": row["revision"],
        "updatedAt": row["updated_at"],
    }


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


@app.get("/api/v1/settings", tags=["settings"], dependencies=[Depends(_private_state_access)])
def get_settings(response: Response) -> dict[str, Any]:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM settings WHERE singleton=1").fetchone()
    if row is None:
        _revision_header(response, 0)
        return {"settings": {}, "revision": 0, "updatedAt": None}
    _revision_header(response, row["revision"])
    return {
        "settings": db.loads(row["settings_json"]),
        "revision": row["revision"],
        "updatedAt": row["updated_at"],
    }


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
    return JSONResponse(
        status_code=503,
        content={
            "detail": {
                "code": "storage_unavailable",
                "message": "Persistent storage is temporarily unavailable.",
            }
        },
    )


app.include_router(prop_router)
if frontend_dist := os.getenv("GEO_FRONTEND_DIST"):
    mount_frontend(app, frontend_dist)
