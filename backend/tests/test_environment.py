import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from itertools import pairwise

import eccodes
import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import atlas, db, environment, main


def initialize(tmp_path, monkeypatch):
    monkeypatch.setattr(
        db, "settings", replace(db.settings, database_path=tmp_path / "environment.sqlite3")
    )
    db.initialize()


def grib(values=None):
    handle = eccodes.codes_grib_new_from_samples("regular_ll_sfc_grib2")
    try:
        keys = {
            "Ni": 4,
            "Nj": 3,
            "latitudeOfFirstGridPointInDegrees": 90,
            "longitudeOfFirstGridPointInDegrees": 0,
            "latitudeOfLastGridPointInDegrees": -90,
            "longitudeOfLastGridPointInDegrees": 270,
            "iDirectionIncrementInDegrees": 90,
            "jDirectionIncrementInDegrees": 90,
            "dataDate": 20261011,
            "dataTime": 1800,
            "step": 3,
        }
        for key, value in keys.items():
            eccodes.codes_set(handle, key, value)
        eccodes.codes_set_values(
            handle, np.array(values if values is not None else list(range(12)), dtype=float)
        )
        return eccodes.codes_get_message(handle)
    finally:
        eccodes.codes_release(handle)


def test_real_grib_decoder_preserves_scan_time_and_decimation():
    result = environment.decode_grib(grib())
    assert result["nx"] == 4 and result["ny"] == 3 and result["dy"] == -90
    assert result["values"] == list(range(12))
    assert result["issuedAt"] == "2026-10-11T18:00:00Z"
    assert result["validAt"] == "2026-10-11T21:00:00Z"
    assert environment.decode_grib(grib(), stride=2)["values"] == [0, 2, 8, 10]


@pytest.mark.asyncio
async def test_range_queries_share_bundle_and_keep_stale_last_good(tmp_path, monkeypatch):
    initialize(tmp_path, monkeypatch)
    messages = [grib([101000] * 12), grib([5] * 12), grib([2] * 12)]
    offsets = [0]
    for message in messages:
        offsets.append(offsets[-1] + len(message))
    tokens = [
        "PRMSL:mean sea level",
        "UGRD:10 m above ground",
        "VGRD:10 m above ground",
        "TMP:surface",
    ]
    index = "\n".join(
        f"{i + 1}:{offset}:d=2026101118:{token}:3 hour fcst:"
        for i, (offset, token) in enumerate(zip(offsets, tokens, strict=True))
    )
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path.endswith(".idx"):
            return httpx.Response(200, text=index)
        start, end = map(int, request.headers["range"].removeprefix("bytes=").split("-"))
        return httpx.Response(
            206,
            content=b"".join(messages)[start : end + 1],
            headers={"Content-Range": f"bytes {start}-{end}/{offsets[-1]}"},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        wind = await environment.environment_layer(client, "surface-wind")
        pressure = await environment.environment_layer(client, "pressure")
    assert len(requests) == 4 and set(wind["data"]["fields"]) == {"u", "v"}
    assert (
        pressure["units"] == {"pressure": "Pa"}
        and pressure["data"]["fields"]["pressure"] == [101000] * 12
    )
    assert wind["validFrom"] == pressure["validFrom"] == "2026-10-11T21:00:00Z"
    with db.connection() as conn:
        conn.execute("UPDATE provider_cache SET expires_at='2000-01-01T00:00:00Z'")
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(503))
    ) as client:
        stale = await environment.environment_layer(client, "surface-wind")
    assert stale["status"] == "stale" and stale["data"] == wind["data"]


@pytest.mark.asyncio
async def test_bounded_fetch_rejects_ignored_ranges_and_large_responses():
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b"GRIB"))
    ) as client:
        with pytest.raises(TypeError, match="exact byte range"):
            await environment.bounded_get(
                client, "https://example.org/grib", headers={"Range": "bytes=0-3"}
            )
        with pytest.raises(TypeError, match="supported size"):
            await environment.bounded_get(client, "https://example.org/grib", max_bytes=2)


@pytest.mark.asyncio
async def test_glotec_latest_safe_url_and_observation_support(tmp_path, monkeypatch):
    initialize(tmp_path, monkeypatch)
    now = datetime.now(UTC).replace(microsecond=0)
    old = now - timedelta(minutes=10)
    path = lambda time: (
        "/products/glotec/geojson_2d_urt/glotec_icao_"
        + time.strftime("%Y%m%dT%H%M%SZ")
        + ".geojson"
    )
    requests = []

    def handler(request):
        requests.append(str(request.url))
        if str(request.url) == environment.GLOTEC_INDEX:
            return httpx.Response(
                200,
                json=[
                    {"url": path(old), "time_tag": environment.iso(old)},
                    {"url": "https://example.org/untrusted.geojson", "time_tag": "9999"},
                    {"url": path(now), "time_tag": environment.iso(now)},
                ],
            )
        assert request.url.path == path(now)
        return httpx.Response(
            200,
            json={
                "features": [
                    {
                        "geometry": {"type": "Point", "coordinates": [0, 1.25]},
                        "properties": {"tec": 25.5, "anomaly": -2, "quality_flag": 0},
                    },
                    {
                        "geometry": {"type": "Point", "coordinates": [10, 1.25]},
                        "properties": {"tec": -1},
                    },
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await environment.glotec(client)
        await environment.glotec(client)
    assert len(requests) == 2 and result["dataTime"] == environment.iso(now)
    assert len(result["data"]["features"]) == 1
    cell = result["data"]["features"][0]
    assert cell["properties"]["qualityFlag"] == 0
    assert cell["geometry"]["coordinates"][0] == [
        [-2.5, 0.0],
        [2.5, 0.0],
        [2.5, 2.5],
        [-2.5, 2.5],
        [-2.5, 0.0],
    ]


@pytest.mark.asyncio
async def test_raster_products_use_provider_dates(tmp_path, monkeypatch):
    initialize(tmp_path, monkeypatch)
    xml = '<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:o="http://www.opengis.net/ows/1.1"><Contents><Layer><o:Identifier>VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance</o:Identifier><Dimension><o:Identifier>Time</o:Identifier><Default>2016-01-01</Default></Dimension></Layer><Layer><o:Identifier>GHRSST_L4_MUR_Sea_Surface_Temperature</o:Identifier><Dimension><o:Identifier>Time</o:Identifier><Default>2026-10-10</Default></Dimension></Layer></Contents></Capabilities>'
    density = '<WMS_Capabilities xmlns="http://www.opengis.net/wms"><Capability><Layer><Layer><Name>vesseldensity_allavg</Name><Dimension name="time" default="2024-01-01T00:00:00Z">2024-01-01T00:00:00Z</Dimension><Abstract>Historical AIS coverage</Abstract></Layer></Layer></Capability></WMS_Capabilities>'
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, text=density if request.url.host == "ows.emodnet-humanactivities.eu" else xml
            )
        )
    ) as client:
        lights = await environment.gibs_metadata(client, "night-lights")
        sst = await environment.gibs_metadata(client, "sea-temperature")
        ships = await environment.vessel_density(client)
    assert (
        lights["dataTime"] == "2016-01-01T00:00:00Z"
        and lights["referenceVintage"] == "Black Marble daily composite · 2016-01-01"
    )
    assert sst["kind"] == "analysis" and sst["data"]["tileSource"]["wmsTime"] == "2026-10-10"
    assert (
        ships["validTo"] == "2025-01-01T00:00:00Z"
        and ships["units"]["density"] == "vessel hours/km²/month"
    )


@pytest.mark.asyncio
async def test_ocean_analysis_masks_and_provider_age(tmp_path, monkeypatch):
    initialize(tmp_path, monkeypatch)
    rows = [
        ["2020-01-01T00:00:00Z", lat, lon, u, v]
        for lat, lon, u, v in [
            (2, 0, None, None),
            (2, 2, 0.2, 0.3),
            (0, 0, 0.4, 0.5),
            (0, 2, 0.6, 0.7),
        ]
    ]
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "table": {
                        "columnNames": ["time", "latitude", "longitude", "ugos", "vgos"],
                        "rows": rows,
                    }
                },
            )
        )
    ) as client:
        result = await environment.ocean_currents(client)
    assert result["status"] == "stale" and result["dataTime"] == "2020-01-01T00:00:00Z"
    assert result["data"]["fields"]["u"] == [None, 0.2, 0.4, 0.6]
    assert (
        result["data"]["dy"] == -2
        and result["data"]["dx"] == 2
        and result["units"] == {"u": "m/s", "v": "m/s"}
    )


@pytest.mark.asyncio
async def test_bundled_references_no_network_and_dateline_integrity():
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: pytest.fail("Bundled reference made a network request")
        )
    ) as client:
        cables = await environment.submarine_cables(client)
    assert cables["kind"] == "reference" and cables["data"]["snapshotDate"] == "2026-09-21"
    assert len(cables["data"]["features"]) == 657 and "ODbL" in cables["attribution"]
    for feature in cables["data"]["features"]:
        for line in feature["geometry"]["coordinates"]:
            assert all(abs(a[0] - b[0]) <= 180 for a, b in pairwise(line))
    for layer in atlas.REFERENCE_LAYERS:
        result = atlas.reference_layer(layer)
        assert (
            result["kind"] == "reference"
            and result["referenceVintage"]
            and "Global" in result["coverage"]
        )
        if layer != "bathymetry":
            assert result["data"]["features"]
    assert (atlas.DATA / "bathymetry.png").read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    manifest = json.loads((atlas.DATA / "manifest.json").read_text())
    assert (
        manifest["airports"]["features"] == 893
        and manifest["ports"]["features"] == 1081
        and len(manifest["bathymetry"]["sources"]) == 12
    )


def test_public_catalog_and_offline_reference_api(tmp_path, monkeypatch):
    initialize(tmp_path, monkeypatch)
    monkeypatch.setattr(
        main, "settings", replace(main.settings, deployment_mode="public", redis_url=None)
    )
    from app.feed_stream import PUBLIC_FEED_ROUTES

    with TestClient(main.app) as client:
        catalog = {layer["id"] for layer in client.get("/api/v1/layers").json()["layers"]}
        for layer in (*atlas.REFERENCE_LAYERS, *environment.ENVIRONMENT_LAYERS):
            assert layer in catalog and layer in PUBLIC_FEED_ROUTES
        for layer in atlas.REFERENCE_LAYERS:
            response = client.get("/api/v1/atlas/" + layer)
            assert response.status_code == 200 and "public" in response.headers["cache-control"]
        assert client.get("/api/v1/environment/submarine-cables").status_code == 200
        global_feed = client.get("/api/v1/environment/vessel-density-global").json()
        assert global_feed["referenceVintage"] == "January 2015–February 2021"
        assert "Global" in global_feed["coverage"]
        assert "CC BY 4.0" in global_feed["attribution"]
        assert client.get("/api/v1/atlas/vessel-density-global-image").status_code == 200
        response = client.get("/api/v1/atlas/bathymetry-image")
        assert response.status_code == 200 and response.headers["content-type"] == "image/png"
        assert client.get("/api/v1/environment/not-a-layer").status_code == 404


def test_global_density_provenance_has_real_global_extent_and_matching_raster():
    import struct

    provenance = json.loads((atlas.DATA / "vessel-density-global-provenance.json").read_text())
    west, south, east, north = provenance["sourceProfile"]["bounds"]
    assert west <= -180 and east >= 180 and south < -84 and north > 84
    assert provenance["sourceProfile"]["nativeCellDegrees"] == 0.005
    assert (
        provenance["observationStart"] == "2015-01-01" and provenance["observationEnd"] == "2021-02"
    )
    assert provenance["license"] == "CC BY 4.0" and len(provenance["archiveSha256"]) == 64
    png = (atlas.DATA / "vessel-density-global.png").read_bytes()
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", png[16:24]) == (4096, 4096)
    assert len(png) == provenance["pngBytes"] and provenance["positiveOverviewPixels"] > 1_000_000


def test_grib2_validation_and_expanded_public_catalog_topic_budget():
    from app.feed_stream import PUBLIC_FEED_ROUTES, parse_topics

    with pytest.raises(TypeError, match="complete GRIB2"):
        environment.decode_grib(b"not a GRIB message")
    assert parse_topics(",".join(PUBLIC_FEED_ROUTES)) == tuple(PUBLIC_FEED_ROUTES)
