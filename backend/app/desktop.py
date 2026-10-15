from pathlib import Path

import httpx
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles

prop_router = APIRouter()
PROP_PROVIDER_URLS = {
    "contours": "https://prop.kc2g.com/renders/current/mufd-normal-now.geojson",
    "stations": "https://prop.kc2g.com/api/stations.json",
}


async def _prop_response(request: Request, provider: str) -> Response:
    try:
        upstream = await request.app.state.http.get(PROP_PROVIDER_URLS[provider])
        upstream.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "prop_provider_unavailable",
                "message": "Propagation data is temporarily unavailable.",
            },
        ) from exc
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "application/json"),
    )


@prop_router.get("/prop/renders/current/mufd-normal-now.geojson")
async def prop_contours(request: Request) -> Response:
    return await _prop_response(request, "contours")


@prop_router.get("/prop/api/stations.json")
async def prop_stations(request: Request) -> Response:
    return await _prop_response(request, "stations")


def mount_frontend(app: FastAPI, directory: str | Path) -> None:
    path = Path(directory).resolve()
    if not path.is_dir() or not (path / "index.html").is_file():
        raise FileNotFoundError(f"Desktop frontend build is missing: {path}")
    app.mount("/", StaticFiles(directory=path, html=True), name="desktop-frontend")
