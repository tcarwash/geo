from dataclasses import replace
from datetime import UTC, datetime
from itertools import pairwise

import httpx
import pytest
from fastapi.testclient import TestClient

from app import db, transport
from app.main import app


def initialize(tmp_path, monkeypatch):
    monkeypatch.setattr(
        db, "settings", replace(db.settings, database_path=tmp_path / "transport.sqlite3")
    )
    db.initialize()


@pytest.mark.asyncio
async def test_aircraft_normalization_cache_and_stale_fallback(tmp_path, monkeypatch):
    initialize(tmp_path, monkeypatch)
    monkeypatch.setattr(
        transport, "settings", replace(transport.settings, air_traffic_enabled=True)
    )
    requests = []
    now = datetime.now(UTC).timestamp() * 1000
    good = {
        "hex": "abcdef",
        "flight": "TEST42  ",
        "lat": 45,
        "lon": -122,
        "alt_baro": 32000,
        "gs": 450.4,
        "track": 123.4,
        "seen_pos": 2,
    }
    invalid = [
        dict(good, hex="old", seen_pos=61),
        dict(good, hex="unknown", seen_pos=None),
        dict(good, hex="bad", lat=91),
        dict(good, hex="ground", alt_baro="ground"),
        dict(good, hex="bool", lat=True),
    ]

    def handler(request):
        requests.append(request)
        assert request.url.path == "/v2/point/45.64/-122.66/250"
        return httpx.Response(
            200, json={"msg": "No error", "now": now, "ac": [good, good, *invalid]}
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await transport.air_traffic(client)
        cached = await transport.air_traffic(client)
    assert len(requests) == 1
    assert len(result["data"]["features"]) == 1
    point = result["data"]["features"][0]
    assert point["id"] == "abcdef"
    assert point["properties"]["callsign"] == "TEST42"
    assert point["properties"]["altitudeFt"] == 32000
    assert point["geometry"]["coordinates"] == [-122, 45]
    assert result["data"]["center"] == [-122.66, 45.64]
    assert result["data"]["radiusNm"] == 250
    assert cached == result
    assert transport._number(float("nan")) is None
    with db.connection() as connection:
        connection.execute("UPDATE provider_cache SET expires_at='2000-01-01T00:00:00Z'")
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(429))
    ) as client:
        stale = await transport.air_traffic(client)
    assert stale["status"] == "stale"
    assert stale["data"] == result["data"]


@pytest.mark.asyncio
async def test_aircraft_empty_coverage_and_invalid_payloads(tmp_path, monkeypatch):
    initialize(tmp_path, monkeypatch)
    monkeypatch.setattr(
        transport, "settings", replace(transport.settings, air_traffic_enabled=True)
    )
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, json={"ac": [], "msg": "No error", "now": 1791756346000}
            )
        )
    ) as client:
        assert (await transport.air_traffic(client))["data"]["features"] == []
    with db.connection() as connection:
        connection.execute("DELETE FROM provider_cache")
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, json={"ac": [], "msg": "error", "now": 1791756346000}
            )
        )
    ) as client:
        with pytest.raises(TypeError):
            await transport.air_traffic(client)


@pytest.mark.asyncio
async def test_aircraft_cap_is_explicit_and_freshest_first(tmp_path, monkeypatch):
    initialize(tmp_path, monkeypatch)
    monkeypatch.setattr(
        transport, "settings", replace(transport.settings, air_traffic_enabled=True)
    )
    monkeypatch.setattr(transport, "AIRCRAFT_LIMIT", 2)
    aircraft = [
        {"hex": str(index), "lat": 0, "lon": 0, "seen_pos": age}
        for index, age in enumerate([15, 1, 3])
    ]
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, json={"ac": aircraft, "msg": "No error", "now": 1791756346000}
            )
        )
    ) as client:
        data = (await transport.air_traffic(client))["data"]
    assert data["truncated"] is True
    assert data["locatedAircraft"] == 3
    assert [point["id"] for point in data["features"]] == ["1", "2"]


def test_bundled_routes_have_vintages_licenses_and_no_dateline_chords():
    for name in ["air-routes", "sea-routes"]:
        result = transport.reference_routes(name)
        assert result["kind"] == "reference"
        assert result["dataTime"] is None
        assert result["referenceVintage"]
        assert result["attribution"]
        ids = []
        for feature in result["data"]["features"]:
            ids.append(feature["id"])
            for line in feature["geometry"]["coordinates"]:
                assert len(line) >= 2
                assert all(-180 <= lon <= 180 and -90 <= lat <= 90 for lon, lat in line)
                assert all(abs(a[0] - b[0]) <= 180 for a, b in pairwise(line))
        assert len(set(ids)) == len(ids)
    air = transport.reference_routes("air-routes")["data"]
    assert len(air["features"]) == air["displayLimit"] == 2000
    assert air["totalConnections"] > air["displayLimit"]
    assert all(
        feature["properties"]["referenceVintage"] == "June 2014" for feature in air["features"]
    )
    assert {
        f["properties"]["category"]
        for f in transport.reference_routes("sea-routes")["data"]["features"]
    } == {"Major", "Middle", "Minor"}
    assert (transport.DATA / "shipping-lanes-LICENSE.txt").exists()
    assert (transport.DATA / "openflights-LICENSE.txt").exists()


def test_disabled_aircraft_no_network_and_public_routes(tmp_path, monkeypatch):
    from app import main

    initialize(tmp_path, monkeypatch)
    monkeypatch.setattr(
        main,
        "settings",
        replace(main.settings, deployment_mode="public", air_traffic_enabled=False, redis_url=None),
    )
    with TestClient(app) as client:
        assert "air-traffic" in client.get("/api/v1/runtime").json()["disabledLayers"]
        catalog = client.get("/api/v1/layers").json()["layers"]
        assert (
            next(layer for layer in catalog if layer["id"] == "air-traffic")["status"] == "disabled"
        )

        class NoNetwork:
            async def get(self, *args, **kwargs):
                pytest.fail("Disabled aircraft layer must never fetch")

        original = app.state.http
        app.state.http = NoNetwork()
        try:
            response = client.get("/api/v1/air-traffic")
        finally:
            app.state.http = original
        assert response.status_code == 503
        assert response.headers["cache-control"] == "no-store"
        for name in ["air-routes", "sea-routes"]:
            response = client.get("/api/v1/" + name)
            assert response.status_code == 200
            assert response.json()["kind"] == "reference"
            assert "public" in response.headers["cache-control"]
