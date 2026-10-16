from __future__ import annotations

import asyncio
import json
import sqlite3
from dataclasses import replace
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app import adif, db, sources
from app import main as api
from app.feed_stream import FeedStreamHub
from app.main import app


def test_radio_path_adapters_use_reported_and_estimated_locations(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "radio-test.sqlite3"))
    db.initialize()
    now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    calls = []

    def response(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.host == "retrieve.pskreporter.info":
            return httpx.Response(200, text='<receptionReports><receptionReport receiverCallsign="W1AW" receiverLocator="FN31pr" frequency="14074000" flowStartSeconds="1791500000"/></receptionReports>')
        if request.url.host == "vailrerbn.com":
            return httpx.Response(200, json={"spots": [
                {"id": 1, "callsign": "W1AW", "grid": "FN31pr", "spotter": "K1ABC", "spotter_grid": "FN42aa", "frequency": 14074, "mode": "FT8", "timestamp": now},
                {"id": 2, "callsign": "K2ABC", "grid": "FN20", "spotter": "N0CALL", "spotter_grid": None, "frequency": 7000, "mode": "CW", "timestamp": now},
            ]})
        return httpx.Response(200, json=[{"spotter": "K1ABC", "spotted": "W1AW", "frequency": 14074, "when": now,
            "dxcc_spotter": {"lng": -75, "lat": 42}, "dxcc_spotted": {"lng": -72, "lat": 41}}])

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as http:
            psk = await sources.psk_reporter_paths(http, "N0CALL", 45.64, -122.66)
            rbn = await sources.rbn_spots(http)
            dx = await sources.dx_cluster_spots(http)
        return psk, rbn, dx

    psk, rbn, dx = asyncio.run(run())
    assert psk["data"]["features"][0]["geometry"]["type"] == "LineString"
    assert psk["data"]["features"][0]["properties"]["precision"] == "reported Maidenhead grid"
    assert [feature["geometry"]["type"] for feature in rbn["data"]["features"]] == ["LineString", "Point"]
    assert dx["data"]["features"][0]["properties"]["precision"] == "DXCC entity centroid estimate"
    assert len(calls) == 3


def test_pota_spots_return_park_points_and_station_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "pota-test.sqlite3"))
    db.initialize()

    def response(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.pota.app"
        return httpx.Response(200, json=[
            {"spotId": 42, "activator": "K1ABC", "frequency": "14.0625", "mode": "CW", "reference": "US-1234", "name": "Test Park", "locationDesc": "US-OR", "spotTime": "2026-10-09T20:00:00", "latitude": 45.5, "longitude": -122.5, "grid6": "CN85"},
            {"spotId": 43, "activator": "K2ABC", "reference": "US-0000", "invalid": True, "latitude": 0, "longitude": 0},
        ])

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as http:
            return await sources.pota_spots(http, 45.64, -122.66)

    result = asyncio.run(run())
    features = result["data"]["features"]
    assert [feature["geometry"]["type"] for feature in features] == ["Point", "LineString"]
    assert features[0]["geometry"]["coordinates"] == [-122.5, 45.5]
    assert features[1]["geometry"]["coordinates"] == [[-122.66, 45.64], [-122.5, 45.5]]
    assert features[0]["properties"]["park"] == "Test Park"
    assert features[1]["properties"]["precision"] == "POTA park coordinate"


def test_nhc_storm_track_extracts_forecast_line_and_current_center(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "storm-test.sqlite3"))
    db.initialize()
    archive = BytesIO()
    with ZipFile(archive, "w") as kmz:
        kmz.writestr("storm.kml", '<kml><LineString><coordinates>-80,20,0 -79,21,0 -78,22,0</coordinates></LineString></kml>')

    def response(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("CurrentStorms.json"):
            return httpx.Response(200, json={"activeStorms": [{"id": "AL012026", "name": "Test", "longitudeNumeric": -80, "latitudeNumeric": 20,
                "forecastTrack": {"kmzFile": "https://www.nhc.noaa.gov/test.kmz"}}]})
        return httpx.Response(200, content=archive.getvalue())

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as http:
            return await sources.storm_tracks(http)

    result = asyncio.run(run())
    features = result["data"]["features"]
    assert [feature["geometry"]["type"] for feature in features] == ["LineString", "Point"]
    assert features[0]["geometry"]["coordinates"][-1] == [-78, 22]


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


@pytest.fixture
def public_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "public-test.sqlite3"))
    monkeypatch.setattr(api, "settings", replace(api.settings, deployment_mode="public"))
    monkeypatch.setenv("GEO_EDIT_TOKEN", "public-test-secret")
    with TestClient(app) as test_client:
        yield test_client


def test_public_runtime_declares_local_only_preferences_and_disabled_private_layers(public_client: TestClient):
    response = public_client.get("/api/v1/runtime")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "deploymentMode": "public",
        "sharedState": False,
        "writeEnabled": False,
        "disabledLayers": ["contacts", "pskreporter", "pota", "wsjtx"],
    }
    assert "public-test-secret" not in response.text
    catalog = public_client.get("/api/v1/layers")
    assert catalog.headers["cache-control"] == "public, max-age=30, s-maxage=30"
    assert not {"adif", "pskreporter", "pota", "wsjtx"}.intersection(layer["id"] for layer in catalog.json()["layers"])


def test_private_api_reads_are_explicitly_non_shared(client: TestClient):
    response = client.get("/api/v1/runtime")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"


def test_public_feed_responses_allow_shared_cache_while_runtime_stays_private(public_client: TestClient, monkeypatch: pytest.MonkeyPatch):
    async def feed(_http):
        return {"status": "current", "data": {"kp": 2}}

    monkeypatch.setattr(api.sources, "space_weather", feed)
    response = public_client.get("/api/v1/space-weather")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=30, s-maxage=30"
    assert "set-cookie" not in response.headers

    runtime_response = public_client.get("/api/v1/runtime")
    assert runtime_response.headers["cache-control"] == "no-store"


def test_public_runtime_blocks_shared_state_and_personal_feed_reads(public_client: TestClient):
    for path in (
        "/api/v1/layouts",
        "/api/v1/drawings",
        "/api/v1/settings",
        "/api/v1/adif/contacts",
        "/api/v1/psk-reporter?callsign=N0CALL&latitude=45&longitude=-122",
        "/api/v1/pota-spots?latitude=45&longitude=-122",
        "/api/v1/wsjtx/heard",
    ):
        response = public_client.get(path)
        assert response.status_code == 404, f"{path} should be unavailable in public mode"
        assert response.headers["cache-control"] == "no-store", f"{path} must not cache a private-state denial"


def test_public_runtime_rejects_all_shared_writes_even_with_edit_token(public_client: TestClient):
    requests = (
        ("post", "/api/v1/future-write", {}),
        ("post", "/api/v1/layouts", {"json": {"name": "Shared", "state": {}}}),
        ("put", "/api/v1/layouts/not-found", {"headers": {"If-Match": '"1"'}, "json": {"name": "Shared", "state": {}}}),
        ("delete", "/api/v1/layouts/not-found", {"headers": {"If-Match": '"1"'}}),
        ("put", "/api/v1/drawings", {"headers": {"If-Match": '"0"'}, "json": {"collection": {"type": "FeatureCollection", "features": []}}}),
        ("put", "/api/v1/settings", {"headers": {"If-Match": '"0"'}, "json": {"settings": {"displayScale": 1}}}),
        ("post", "/api/v1/adif/import", {"content": "<EOH><EOR>"}),
    )
    for method, path, options in requests:
        options.setdefault("headers", {})["X-Geo-Edit-Token"] = "public-test-secret"
        response = getattr(public_client, method)(path, **options)
        assert response.status_code == 403, f"{method.upper()} {path} should be blocked in public mode"
        assert response.headers["cache-control"] == "no-store"
        assert response.json()["detail"]["code"] == "public_read_only"


def test_public_runtime_does_not_start_the_local_wsjt_listener(public_client: TestClient):
    assert api.app.state.wsjtx_listener is None


@pytest.mark.asyncio
async def test_public_feed_stream_pushes_initial_feed_snapshot(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(api, "settings", replace(api.settings, deployment_mode="public"))

    async def fetch_feed(topic: str) -> dict:
        return {"source": topic, "status": "current", "data": {"features": []}}

    hub = FeedStreamHub(fetch_feed, min_refresh_seconds=0.01)
    await hub.start()
    monkeypatch.setattr(api.app.state, "feed_stream", hub, raising=False)
    request = Request({"type": "http", "app": api.app, "method": "GET", "scheme": "http", "path": "/api/v1/feed-stream", "raw_path": b"/api/v1/feed-stream", "query_string": b"topics=earthquakes", "headers": [], "client": ("test", 1), "server": ("test", 80), "root_path": ""})
    try:
        response = await api.public_feed_stream(request, "earthquakes")
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-accel-buffering"] == "no"
        chunk = await response.body_iterator.__anext__()
        assert chunk.startswith("event: feed")
        message = json.loads(chunk.splitlines()[1].removeprefix("data: "))
        assert message["type"] == "snapshot"
        assert message["topic"] == "earthquakes"
        assert message["feed"]["data"] == {"features": []}
    finally:
        await hub.close()


@pytest.mark.asyncio
async def test_public_feed_stream_rejects_private_topics(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(api, "settings", replace(api.settings, deployment_mode="public"))
    request = Request({"type": "http", "app": api.app, "method": "GET", "scheme": "http", "path": "/api/v1/feed-stream", "raw_path": b"/api/v1/feed-stream", "query_string": b"topics=contacts", "headers": [], "client": ("test", 1), "server": ("test", 80), "root_path": ""})
    with pytest.raises(api.HTTPException) as error:
        await api.public_feed_stream(request, "contacts")
    assert error.value.status_code == 422


def test_private_runtime_keeps_shared_state_apis_available(client: TestClient):
    response = client.get("/api/v1/runtime")
    assert response.json() == {"deploymentMode": "private", "sharedState": True, "writeEnabled": True, "disabledLayers": []}
    assert client.get("/api/v1/layouts").status_code == 200
    assert client.get("/api/v1/drawings").status_code == 200


def test_edit_token_protects_writes(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GEO_EDIT_TOKEN", "local-test-token")
    denied = client.post("/api/v1/layouts", json={"name": "No", "state": {}})
    assert denied.status_code == 401
    allowed = client.post(
        "/api/v1/layouts", headers={"X-Geo-Edit-Token": "local-test-token"},
        json={"name": "Yes", "state": {}},
    )
    assert allowed.status_code == 201


def test_local_source_push_publishes_latest_geojson_snapshot(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "local-source.sqlite3"))
    class FakeTransport:
        def get_extra_info(self, _name):
            return ("127.0.0.1", 0)

        def close(self):
            pass

    async def no_udp_listener(*_args, **_kwargs):
        return FakeTransport(), None

    monkeypatch.setattr(api.asyncio.BaseEventLoop, "create_datagram_endpoint", no_udp_listener)
    source_id = "custom-radio-sites"
    collection = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-122.33, 47.61]},
            "properties": {"name": "Seattle site", "category": "repeater"},
        }],
    }

    with TestClient(app) as client:
        pushed = client.post(f"/api/v1/local-sources/{source_id}/data", json=collection)
        assert pushed.status_code == 200
        assert pushed.json()["data"] == collection
        assert pushed.json()["source"] == f"local:{source_id}"
        assert pushed.json()["status"] == "current"

        latest = client.get(f"/api/v1/local-sources/{source_id}")
        assert latest.status_code == 200
        assert latest.json()["data"] == collection

        with db.connection() as conn:
            conn.execute("UPDATE local_source_data SET updated_at='2000-01-01T00:00:00Z' WHERE source_id=?", (source_id,))
        stale = client.get(f"/api/v1/local-sources/{source_id}")
        assert stale.json()["status"] == "stale"
        assert stale.json()["staleReason"]

        cleared = client.delete(f"/api/v1/local-sources/{source_id}/data")
        assert cleared.status_code == 204
        waiting = client.get(f"/api/v1/local-sources/{source_id}")
        assert waiting.json()["status"] == "waiting"


def test_local_source_push_uses_edit_auth_and_rejects_public_mode(public_client: TestClient):
    collection = {"type": "FeatureCollection", "features": []}
    response = public_client.post("/api/v1/local-sources/custom-demo/data", json=collection)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "public_read_only"


def test_local_source_push_requires_the_configured_edit_token(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "local-source-auth.sqlite3"))
    monkeypatch.setenv("GEO_EDIT_TOKEN", "local-source-test-token")

    class FakeTransport:
        def get_extra_info(self, _name):
            return ("127.0.0.1", 0)

        def close(self):
            pass

    async def no_udp_listener(*_args, **_kwargs):
        return FakeTransport(), None

    monkeypatch.setattr(api.asyncio.BaseEventLoop, "create_datagram_endpoint", no_udp_listener)
    payload = {"type": "FeatureCollection", "features": []}
    with TestClient(app) as client:
        denied = client.post("/api/v1/local-sources/token-test/data", json=payload)
        assert denied.status_code == 401
        allowed = client.post(
            "/api/v1/local-sources/token-test/data",
            headers={"X-Geo-Edit-Token": "local-source-test-token"},
            json=payload,
        )
        assert allowed.status_code == 200


def test_local_source_push_validates_ids_geometry_and_instance_limit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "local-source-limits.sqlite3"))

    class FakeTransport:
        def get_extra_info(self, _name):
            return ("127.0.0.1", 0)

        def close(self):
            pass

    async def no_udp_listener(*_args, **_kwargs):
        return FakeTransport(), None

    monkeypatch.setattr(api.asyncio.BaseEventLoop, "create_datagram_endpoint", no_udp_listener)
    payload = {"type": "FeatureCollection", "features": []}
    invalid_geometry = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [181, 0]}, "properties": {}}],
    }
    with TestClient(app) as client:
        assert client.get("/api/v1/local-sources/Uppercase").status_code == 422
        assert client.post("/api/v1/local-sources/valid-id/data", json=invalid_geometry).status_code == 422
        for index in range(8):
            assert client.post(f"/api/v1/local-sources/source-{index}/data", json=payload).status_code == 200
        limited = client.post("/api/v1/local-sources/source-overflow/data", json=payload)
        assert limited.status_code == 409
        assert limited.json()["detail"]["code"] == "local_source_limit"


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
    assert versions == [1, 2, 3, 4]


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
    alert = next(layer for layer in catalog if layer["id"] == "weather-alerts")
    assert alert["endpoint"] == "/api/v1/weather-alerts"
    clouds = next(layer for layer in catalog if layer["id"] == "clouds")
    assert "GOES ABI and Himawari AHI clean infrared" in clouds["source"]
    composite = next(layer for layer in catalog if layer["id"] == "eumetsat-clouds")
    assert "Geostationary Ring IR10.8" in composite["source"]
    assert {"hf-absorption", "precipitation"}.issubset({layer["id"] for layer in catalog})
    response = client.get("/api/v1/natural-events/not-a-category")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "unknown_event_category"


@pytest.mark.asyncio
async def test_nws_active_alerts_require_geojson_and_preserve_polygon_properties(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "nws-test.sqlite3"))
    db.initialize()
    payload = {"type": "FeatureCollection", "features": [{"type": "Feature", "id": "urn:alert:1",
        "properties": {"event": "Tornado Warning", "severity": "Extreme", "certainty": "Observed", "sent": "2026-10-09T16:00:00Z", "expires": "2026-10-09T17:00:00Z"},
        "geometry": {"type": "Polygon", "coordinates": [[[-97, 36], [-96, 36], [-96, 35], [-97, 36]]]}}]}
    requests: list[httpx.Request] = []
    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=payload)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await sources.nws_active_alerts(client)
    assert requests[0].url.host == "api.weather.gov"
    assert requests[0].headers["accept"] == "application/geo+json"
    assert requests[0].headers.get("user-agent")
    assert result["kind"] == "observation"
    assert result["dataTime"] == "2026-10-09T16:00:00Z"
    assert result["data"]["features"][0]["properties"]["severity"] == "Extreme"
    assert result["data"]["features"][0]["geometry"]["type"] == "Polygon"


def test_weather_alert_endpoint_wraps_feed(monkeypatch: pytest.MonkeyPatch, client: TestClient):
    async def fake_alerts(_client: httpx.AsyncClient):
        return {"source": "nws-active-alerts", "data": {"type": "FeatureCollection", "features": []}}
    monkeypatch.setattr(sources, "nws_active_alerts", fake_alerts)
    response = client.get("/api/v1/weather-alerts")
    assert response.status_code == 200
    assert response.json()["source"] == "nws-active-alerts"
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


@pytest.mark.asyncio
async def test_goes_tracks_combine_current_east_and_west_positions(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "goes-test.sqlite3"))
    db.initialize()

    async def fake_track(_client: httpx.AsyncClient, catalog_id: int):
        name = "GOES 19" if catalog_id == 60133 else "GOES 18"
        return {
            "dataTime": "2026-10-09T00:00:00Z",
            "validFrom": "2026-10-09T20:00:00Z",
            "data": {"type": "FeatureCollection", "features": [{
                "type": "Feature", "geometry": {"type": "Point", "coordinates": [-75.2 if catalog_id == 60133 else -137.0, 0]},
                "properties": {"role": "current-position", "name": name, "catalogId": catalog_id, "epoch": "2026-10-09T00:00:00Z"},
            }]},
        }

    monkeypatch.setattr(sources, "satellite_track", fake_track)
    async with httpx.AsyncClient() as client:
        result = await sources.goes_satellite_tracks(client)
    assert [feature["properties"]["platform"] for feature in result["data"]["features"]] == ["GOES-East", "GOES-West"]
    assert [feature["properties"]["imageProduct"] for feature in result["data"]["features"]] == ["GOES ABI GeoColor"] * 2
