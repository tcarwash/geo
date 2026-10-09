from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _csv(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    database_path: Path
    cors_origins: tuple[str, ...]
    cache_ttl_seconds: int
    request_timeout_seconds: float
    user_agent: str
    satellite_catalog_ids: tuple[int, ...]


def load_settings() -> Settings:
    catalog_ids: list[int] = []
    for raw_id in _csv(os.getenv("GEO_SATELLITE_CATALOG_IDS", "25544"))[:10]:
        try:
            catalog_id = int(raw_id)
        except ValueError:
            continue
        if 1 <= catalog_id <= 999_999:
            catalog_ids.append(catalog_id)
    return Settings(
        database_path=Path(os.getenv("GEO_DATABASE_PATH", "/data/geo.sqlite3")),
        cors_origins=_csv(os.getenv("GEO_CORS_ORIGINS", "http://localhost:5173,https://geo.ag7su.com")),
        cache_ttl_seconds=max(15, int(os.getenv("GEO_CACHE_TTL_SECONDS", "60"))),
        request_timeout_seconds=max(2.0, float(os.getenv("GEO_REQUEST_TIMEOUT_SECONDS", "12"))),
        user_agent=os.getenv("GEO_USER_AGENT", "GeoDashboard/0.1 (self-hosted geographic display)"),
        satellite_catalog_ids=tuple(catalog_ids),
    )


settings = load_settings()
