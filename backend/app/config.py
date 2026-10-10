from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _csv(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    deployment_mode: str
    database_path: Path
    cors_origins: tuple[str, ...]
    cache_ttl_seconds: int
    request_timeout_seconds: float
    user_agent: str
    satellite_catalog_ids: tuple[int, ...]
    wsjtx_udp_host: str
    wsjtx_udp_port: int
    redis_url: str | None


def load_settings() -> Settings:
    deployment_mode = os.getenv("GEO_DEPLOYMENT_MODE", "private").strip().lower()
    if deployment_mode not in {"private", "public"}:
        raise ValueError("GEO_DEPLOYMENT_MODE must be 'private' or 'public'.")
    catalog_ids: list[int] = []
    for raw_id in _csv(os.getenv("GEO_SATELLITE_CATALOG_IDS", "25544,51850,60133"))[:10]:
        try:
            catalog_id = int(raw_id)
        except ValueError:
            continue
        if 1 <= catalog_id <= 999_999:
            catalog_ids.append(catalog_id)
    return Settings(
        deployment_mode=deployment_mode,
        database_path=Path(os.getenv("GEO_DATABASE_PATH", "/data/geo.sqlite3")),
        cors_origins=_csv(os.getenv("GEO_CORS_ORIGINS", "http://localhost:5173,https://geo.ag7su.com")),
        cache_ttl_seconds=max(15, int(os.getenv("GEO_CACHE_TTL_SECONDS", "60"))),
        request_timeout_seconds=max(2.0, float(os.getenv("GEO_REQUEST_TIMEOUT_SECONDS", "12"))),
        user_agent=os.getenv("GEO_USER_AGENT", "GeoDashboard/0.1 (self-hosted geographic display)"),
        satellite_catalog_ids=tuple(catalog_ids),
        wsjtx_udp_host=os.getenv("GEO_WSJT_X_UDP_HOST", "127.0.0.1"),
        wsjtx_udp_port=max(1, min(65535, int(os.getenv("GEO_WSJT_X_UDP_PORT", "2237")))),
        redis_url=os.getenv("GEO_REDIS_URL") or None,
    )


settings = load_settings()
