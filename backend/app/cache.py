from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any

from . import db
from .config import settings

_locks: dict[str, asyncio.Lock] = {}


def _lock_for(key: str) -> asyncio.Lock:
    return _locks.setdefault(key, asyncio.Lock())


def read(key: str) -> tuple[dict[str, Any], bool] | None:
    with db.connection() as conn:
        row = conn.execute(
            "SELECT envelope_json, expires_at FROM provider_cache WHERE cache_key = ?", (key,)
        ).fetchone()
    if row is None:
        return None
    envelope = db.loads(row["envelope_json"])
    expires = datetime.fromisoformat(row["expires_at"])
    return envelope, expires > db.utc_now()


def write(key: str, envelope: dict[str, Any]) -> None:
    with db.connection() as conn:
        conn.execute(
            """INSERT INTO provider_cache(cache_key, envelope_json, fetched_at, expires_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(cache_key) DO UPDATE SET envelope_json=excluded.envelope_json,
                 fetched_at=excluded.fetched_at, expires_at=excluded.expires_at""",
            (key, db.dumps(envelope), envelope["fetchedAt"], envelope["expiresAt"]),
        )


async def get_or_fetch(
    key: str,
    fetcher: Callable[[], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    async with _lock_for(key):
        cached = read(key)
        if cached and cached[1]:
            return cached[0]
        try:
            envelope = await fetcher()
            write(key, envelope)
            return envelope
        except Exception:
            if cached:
                envelope, _ = cached
                envelope = {**envelope, "status": "stale", "staleReason": "upstream refresh failed"}
                return envelope
            raise


def envelope(
    *,
    source: str,
    kind: str,
    data: Any,
    attribution: str,
    documentation_url: str,
    data_time: str | None = None,
    valid_from: str | None = None,
    units: dict[str, str] | None = None,
    ttl_seconds: int | None = None,
    status: str = "current",
) -> dict[str, Any]:
    fetched = db.utc_now()
    expires = fetched + timedelta(seconds=ttl_seconds or settings.cache_ttl_seconds)
    return {
        "source": source,
        "kind": kind,
        "fetchedAt": db.iso(fetched),
        "dataTime": data_time,
        "validFrom": valid_from,
        "validTo": None,
        "expiresAt": db.iso(expires),
        "status": status,
        "attribution": attribution,
        "documentationUrl": documentation_url,
        "coverage": None,
        "units": units or {},
        "staleReason": None,
        "data": data,
    }
