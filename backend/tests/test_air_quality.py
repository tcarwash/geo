from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app import db, sources
from app.main import app


def _initialize_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "air-quality.sqlite3"))
    db.initialize()


@pytest.mark.asyncio
async def test_air_quality_batches_global_cams_samples_and_reuses_cache(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _initialize_db(tmp_path, monkeypatch)
    monkeypatch.setattr(sources, "_air_quality_coordinates", lambda: [(0.0, -90.0), (0.0, 90.0)])
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.url.host == "air-quality-api.open-meteo.com"
        assert request.url.path == "/v1/air-quality"
        assert request.url.params["domains"] == "cams_global"
        assert request.url.params["current"] == "pm2_5,pm10"
        assert request.url.params["cell_selection"] == "nearest"
        latitudes = request.url.params["latitude"].split(",")
        longitudes = request.url.params["longitude"].split(",")
        assert len(latitudes) == len(longitudes) == 2
        return httpx.Response(200, json=[
            {"current": {"time": "2026-10-10T12:00", "pm2_5": 8.2, "pm10": 14.7}},
            {"current": {"time": "2026-10-10T12:00", "pm2_5": 31.0, "pm10": 42.0}},
        ])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await sources.air_quality(client)
        cached = await sources.air_quality(client)

    assert len(requests) == 1
    assert result["kind"] == "forecast"
    assert result["source"] == "open-meteo-cams-global"
    assert result["dataTime"] == "2026-10-10T12:00:00Z"
    assert result["units"] == {"pm2_5": "μg/m³", "pm10": "μg/m³"}
    assert len(result["data"]["features"]) == 2
    assert result["data"]["features"][0]["properties"]["pm2_5"] == 8.2
    assert result["data"]["features"][1]["properties"]["pm10"] == 42.0
    assert result["data"]["gridSpacingDegrees"] == 12
    assert cached["fetchedAt"] == result["fetchedAt"]
    with db.connection() as connection:
        connection.execute("UPDATE provider_cache SET expires_at='2000-01-01T00:00:00Z'")
    async with httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: httpx.Response(503, request=request)
    )) as offline:
        stale = await sources.air_quality(offline)
    assert stale["status"] == "stale"
    assert stale["data"]["features"][0]["properties"]["pm2_5"] == 8.2


@pytest.mark.asyncio
async def test_air_quality_rejects_partial_multi_location_responses(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _initialize_db(tmp_path, monkeypatch)
    monkeypatch.setattr(sources, "_air_quality_coordinates", lambda: [(0.0, -90.0), (0.0, 90.0)])
    async with httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json=[{"current": {"time": "2026-10-10T12:00", "pm2_5": 1}}])
    )) as client:
        with pytest.raises(TypeError, match="location count"):
            await sources.air_quality(client)


def test_air_quality_endpoint_and_catalog_are_wired_without_exposing_secrets(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _initialize_db(tmp_path, monkeypatch)
    async def fake_air_quality(client: httpx.AsyncClient) -> dict:
        return {"source": "open-meteo-cams-global", "kind": "forecast", "data": {"type": "FeatureCollection", "features": []}}

    monkeypatch.setattr(sources, "air_quality", fake_air_quality)
    with TestClient(app) as client:
        catalog = client.get("/api/v1/layers").json()["layers"]
        response = client.get("/api/v1/air-quality")
    layer = next(item for item in catalog if item["id"] == "air-quality")
    assert layer["endpoint"] == "/api/v1/air-quality"
    assert response.status_code == 200
    assert response.json()["source"] == "open-meteo-cams-global"


def test_air_quality_global_grid_stays_inside_the_documented_request_budget() -> None:
    points = sources._air_quality_coordinates()
    assert len(points) == 450
    assert len(set(points)) == len(points)
    assert all(-85 <= latitude <= 85 and -180 <= longitude < 180 for latitude, longitude in points)


@pytest.mark.asyncio
async def test_air_quality_global_grid_is_split_into_bounded_multi_location_requests(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _initialize_db(tmp_path, monkeypatch)
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        latitudes = request.url.params["latitude"].split(",")
        longitudes = request.url.params["longitude"].split(",")
        assert len(latitudes) == len(longitudes)
        return httpx.Response(200, json=[
            {"current": {"time": "2026-10-10T12:00", "pm2_5": 1.0, "pm10": 2.0}}
            for _ in latitudes
        ])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await sources.air_quality(client)

    assert len(requests) == 5
    assert all(len(request.url.params["latitude"].split(",")) <= sources.AIR_QUALITY_BATCH_SIZE for request in requests)
    assert len(result["data"]["features"]) == 450
