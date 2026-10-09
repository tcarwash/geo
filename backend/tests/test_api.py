from __future__ import annotations

import sqlite3
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app import adif, db, sources
from app.main import app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "geo-test.sqlite3"))
    monkeypatch.delenv("GEO_EDIT_TOKEN", raising=False)
    with TestClient(app) as test_client:
        yield test_client


def test_layout_revision_prevents_lost_update(client: TestClient):
    created = client.post("/api/v1/layouts", json={"name": "Main", "state": {"zoom": 2}})
    assert created.status_code == 201
    layout_id = created.json()["id"]
    assert created.headers["etag"] == '"1"'

    updated = client.put(
        f"/api/v1/layouts/{layout_id}",
        headers={"If-Match": '"1"'},
        json={"name": "Main display", "state": {"zoom": 3}},
    )
    assert updated.status_code == 200
    assert updated.headers["etag"] == '"2"'
    conflict = client.put(
        f"/api/v1/layouts/{layout_id}",
        headers={"If-Match": '"1"'},
        json={"name": "Stale write", "state": {}},
    )
    assert conflict.status_code == 412
    assert client.get(f"/api/v1/layouts/{layout_id}").json()["name"] == "Main display"


def test_drawings_and_settings_first_write_use_revision_zero(client: TestClient):
    drawing = client.put(
        "/api/v1/drawings",
        headers={"If-Match": '"0"'},
        json={"collection": {"type": "FeatureCollection", "features": [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-122.33, 47.61]}, "properties": {"name": "home"}}
        ]}},
    )
    assert drawing.status_code == 200
    assert drawing.headers["etag"] == '"1"'
    assert client.get("/api/v1/drawings").json()["collection"]["features"][0]["properties"]["name"] == "home"

    settings_response = client.put(
        "/api/v1/settings", headers={"If-Match": '"0"'}, json={"settings": {"displayScale": 1.2}}
    )
    assert settings_response.status_code == 200
    assert settings_response.json()["settings"]["displayScale"] == 1.2


def test_geometry_and_secret_validation(client: TestClient):
    invalid_geometry = client.put(
        "/api/v1/drawings", headers={"If-Match": '"0"'},
        json={"collection": {"type": "FeatureCollection", "features": [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [181, 0]}, "properties": {}}
        ]}},
    )
    assert invalid_geometry.status_code == 422
    secret = client.put(
        "/api/v1/settings", headers={"If-Match": '"0"'}, json={"settings": {"api_key": "do-not-store"}}
    )
    assert secret.status_code == 422
    layout_secret = client.post(
        "/api/v1/layouts", json={"name": "Leaked", "state": {"provider": {"accessToken": "no"}}}
    )
    assert layout_secret.status_code == 422


def test_edit_token_protects_writes(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GEO_EDIT_TOKEN", "local-test-token")
    denied = client.post("/api/v1/layouts", json={"name": "No", "state": {}})
    assert denied.status_code == 401
    allowed = client.post(
        "/api/v1/layouts", headers={"X-Geo-Edit-Token": "local-test-token"},
        json={"name": "Yes", "state": {}},
    )
    assert allowed.status_code == 201


def test_adif_import_filters_contacts_and_marks_unknown_locations(client: TestClient):
    source = (
        "<ADIF_VER:3>3.1<STATION_CALLSIGN:6>N0CALL<EOH>"
        "<CALL:4>W1AW<QSO_DATE:8>20261009<TIME_ON:6>123456<BAND:3>20M<MODE:3>FT8"
        "<GRIDSQUARE:6>FN31pr<MY_GRIDSQUARE:6>CN87uq<EOR>"
        "<CALL:5>K1ABC<QSO_DATE:8>20261008<TIME_ON:4>0915<BAND:3>40M<MODE:2>CW<EOR>"
    )
    imported = client.post(
        "/api/v1/adif/import?filename=logs%2Fportable.adi",
        content=source,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert imported.status_code == 201, imported.text
    assert imported.json()["filename"] == "portable.adi"
    assert imported.json()["imported"] == 2
    assert imported.json()["unresolvedLocations"] == 1

    result = client.get("/api/v1/adif/contacts?band=20m&mode=ft8").json()
    assert result["total"] == 1
    feature = result["featureCollection"]["features"][0]
    assert feature["geometry"]["type"] == "Point"
    assert feature["properties"]["stationCallsign"] == "N0CALL"
    assert feature["properties"]["remoteGrid"] == "FN31PR"
    unresolved = client.get("/api/v1/adif/contacts?band=40m").json()
    assert unresolved["featureCollection"]["features"][0]["geometry"] is None


def test_maidenhead_center_and_invalid_locators():
    assert adif.parse_locator("FN31pr") == pytest.approx((-72.7083333333, 41.7291666667))
    assert adif.parse_locator("ZZ99") is None
    assert adif.parse_locator("FN3") is None


def test_database_migration_adds_layout_schema_version_and_keeps_saved_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    path = tmp_path / "old.sqlite3"
    conn = sqlite3.connect(path)
    conn.executescript(
        """CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
           INSERT INTO schema_migrations VALUES(1,'2026-01-01T00:00:00Z');
           CREATE TABLE layouts(id TEXT PRIMARY KEY,name TEXT NOT NULL,state_json TEXT NOT NULL,
             revision INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
           INSERT INTO layouts VALUES('legacy','Legacy','{"zoom":2}',4,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z');
           CREATE TABLE drawings(singleton INTEGER PRIMARY KEY,collection_json TEXT NOT NULL,
             revision INTEGER NOT NULL,updated_at TEXT NOT NULL);
           CREATE TABLE settings(singleton INTEGER PRIMARY KEY,settings_json TEXT NOT NULL,
             revision INTEGER NOT NULL,updated_at TEXT NOT NULL);
           CREATE TABLE provider_cache(cache_key TEXT PRIMARY KEY,envelope_json TEXT NOT NULL,
             fetched_at TEXT NOT NULL,expires_at TEXT NOT NULL);"""
    )
    conn.close()
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=path))
    db.initialize()
    with db.connection() as conn:
        row = conn.execute("SELECT id,state_json,revision,schema_version FROM layouts WHERE id='legacy'").fetchone()
        versions = [item[0] for item in conn.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()]
    assert row["id"] == "legacy"
    assert row["state_json"] == '{"zoom":2}'
    assert row["revision"] == 4
    assert row["schema_version"] == 1
    assert versions == [1, 2, 3]


@pytest.mark.asyncio
async def test_usgs_feed_normalization_and_stale_fallback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "source-test.sqlite3"))
    db.initialize()
    payload = {
        "type": "FeatureCollection",
        "metadata": {"generated": 1_798_000_000_000},
        "features": [
            {"type": "Feature", "properties": {"mag": 2.1}, "geometry": {"type": "Point", "coordinates": [1, 2, 3]}},
            {"type": "Feature", "properties": {"mag": 4.5}, "geometry": {"type": "Point", "coordinates": [3, 4, 5]}},
        ],
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    try:
        result = await sources.earthquakes(client, "day", 3)
        assert result["kind"] == "observation"
        assert len(result["data"]["features"]) == 1
        assert result["dataTime"].endswith("Z")

        with db.connection() as conn:
            conn.execute("UPDATE provider_cache SET expires_at='2000-01-01T00:00:00Z'")
        await client.aclose()
        offline = httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(503, request=request)
        ))
        try:
            stale = await sources.earthquakes(offline, "day", 3)
            assert stale["status"] == "stale"
            assert stale["data"]["features"][0]["properties"]["mag"] == 4.5
        finally:
            await offline.aclose()
    finally:
        if not client.is_closed:
            await client.aclose()


@pytest.mark.asyncio
async def test_aurora_is_exposed_as_forecast_geojson(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "aurora-test.sqlite3"))
    db.initialize()
    payload = {
        "Observation Time": "2026-10-09T16:00:00Z",
        "Forecast Time": "2026-10-09T16:30:00Z",
        "coordinates": [[-100, 60, 55], [181, 30, 50], [2, 3, 0]],
    }
    async with httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json=payload)
    )) as client:
        result = await sources.aurora(client)
    assert result["kind"] == "forecast"
    assert result["validFrom"] == payload["Forecast Time"]
    assert result["data"]["features"] == [{
        "type": "Feature", "geometry": {"type": "Point", "coordinates": [-100.0, 60.0]},
        "properties": {"probability": 55.0, "units": "%"},
    }]


@pytest.mark.asyncio
async def test_eonet_active_events_keep_point_and_perimeter_features_and_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "eonet-test.sqlite3"))
    db.initialize()
    payload = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "id": "fire-1", "properties": {"title": "Test fire", "date": "2026-10-09T12:00:00Z"}, "geometry": {"type": "Point", "coordinates": [-120, 40]}},
            {"type": "Feature", "id": "flood-1", "properties": {"title": "Test flood"}, "geometry": {"type": "Polygon", "coordinates": [[[-1, 1], [1, 1], [1, -1], [-1, 1]]]}},
            {"type": "Feature", "id": "unsupported", "properties": {}, "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}},
        ],
    }
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        first = await sources.natural_events(client, "wildfires")
        second = await sources.natural_events(client, "wildfires")
    assert requests[0].url.params["category"] == "wildfires"
    assert requests[0].url.params["status"] == "open"
    assert len(requests) == 1
    assert len(first["data"]["features"]) == 2
    assert first["dataTime"] == "2026-10-09T12:00:00Z"
    assert second["data"]["features"][1]["geometry"]["type"] == "Polygon"
    async with httpx.AsyncClient() as client:
        with pytest.raises(ValueError):
            await sources.natural_events(client, "unknown")


def test_eonet_endpoint_rejects_unknown_layer_and_lists_new_layers(client: TestClient):
    catalog = client.get("/api/v1/layers").json()["layers"]
    assert {"wildfires", "volcanoes", "floods", "severe-storms"}.issubset({layer["id"] for layer in catalog})
    response = client.get("/api/v1/natural-events/not-a-category")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "unknown_event_category"


@pytest.mark.asyncio
async def test_space_weather_parses_noaa_kp_field(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "kp-test.sqlite3"))
    db.initialize()
    payload = [
        {"time_tag": "2026-10-09T18:00:00", "kp_index": 3, "estimated_kp": 3.33, "kp": "3+"},
        {"time_tag": "2026-10-09T18:01:00", "kp_index": 4, "estimated_kp": 4.00, "kp": "4"},
    ]
    async with httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json=payload)
    )) as client:
        result = await sources.space_weather(client)
    assert result["kind"] == "observation"
    assert result["data"]["planetaryKIndex"][-1] == {"time": "2026-10-09T18:01:00Z", "kp": 4.0}


@pytest.mark.asyncio
async def test_celestrak_elements_are_propagated_locally(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "sat-test.sqlite3"))
    db.initialize()
    lines = (
        "ISS (ZARYA)\n"
        "1 25544U 98067A   26281.98258931  .00005946  00000+0  11685-3 0  9991\n"
        "2 25544  51.6313  96.9458 0006821 239.5445 120.4870 15.48782794589392\n"
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, text=lines)
    )) as client:
        result = await sources.satellite_track(client, 25544)
    assert result["kind"] == "model"
    assert result["dataTime"].startswith("2026-")
    position, track = result["data"]["features"]
    assert position["properties"]["role"] == "current-position"
    assert -180 <= position["geometry"]["coordinates"][0] <= 180
    assert -90 <= position["geometry"]["coordinates"][1] <= 90
    assert 300 <= position["properties"]["altitudeKm"] <= 500
    assert track["geometry"]["type"] == "MultiLineString"

    # An ID is validated before any provider request is made.
    with pytest.raises(ValueError):
        await sources.satellite_track(client, 0)
