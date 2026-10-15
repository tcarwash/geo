from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.desktop import mount_frontend, prop_router


@pytest.mark.asyncio
async def test_desktop_frontend_serves_index_and_bundled_assets(tmp_path: Path):
    (tmp_path / "index.html").write_text("<main>Geo desktop</main>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("window.geoReady = true;")
    app = FastAPI()
    mount_frontend(app, tmp_path)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://geo") as client:
        index = await client.get("/")
        asset = await client.get("/assets/app.js")

    assert index.status_code == 200
    assert "Geo desktop" in index.text
    assert asset.status_code == 200
    assert asset.text == "window.geoReady = true;"


@pytest.mark.asyncio
async def test_desktop_prop_proxy_reuses_backend_http_client():
    requests = []

    def upstream(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            headers={"content-type": "application/geo+json"},
            json={"type": "FeatureCollection", "features": []},
        )

    app = FastAPI()
    app.include_router(prop_router)
    app.state.http = AsyncClient(transport=httpx.MockTransport(upstream))
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://geo") as client:
            response = await client.get("/prop/renders/current/mufd-normal-now.geojson")
    finally:
        await app.state.http.aclose()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/geo+json")
    assert response.json()["type"] == "FeatureCollection"
    assert requests[0].url.host == "prop.kc2g.com"
    assert requests[0].url.path == "/renders/current/mufd-normal-now.geojson"


@pytest.mark.asyncio
async def test_desktop_prop_proxy_returns_bad_gateway_on_upstream_failure():
    app = FastAPI()
    app.include_router(prop_router)
    app.state.http = AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(503, text="unavailable"))
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://geo") as client:
            response = await client.get("/prop/api/stations.json")
    finally:
        await app.state.http.aclose()

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "prop_provider_unavailable"
