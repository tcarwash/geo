from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any

from . import db
from .config import settings

_locks: dict[str, asyncio.Lock] = {}
_refresh_tasks: dict[str, Any] = {}
_refresh_retry_after: dict[str, float] = {}
_MAX_REFRESH_BACKOFF_KEYS = 512
_REFRESH_RETRY_SECONDS = 30
logger = logging.getLogger("geo.cache")


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


async def _refresh_expired(
    key: str,
    fetcher: Callable[[], Awaitable[dict[str, Any]]],
) -> None:
    try:
        async with _lock_for(key):
            cached = read(key)
            if cached and cached[1]:
                return
            envelope = await fetcher()
            write(key, envelope)
        _refresh_retry_after.pop(key, None)
    except asyncio.CancelledError:
        raise
    except Exception:
        loop = asyncio.get_running_loop()
        if len(_refresh_retry_after) >= _MAX_REFRESH_BACKOFF_KEYS:
            _refresh_retry_after.clear()
        _refresh_retry_after[key] = loop.time() + _REFRESH_RETRY_SECONDS
        logger.warning("Background provider-cache refresh failed", exc_info=True)
    finally:
        task = asyncio.current_task()
        if _refresh_tasks.get(key, None) is task:
            _refresh_tasks.pop(key, None)


def _schedule_refresh(key: str, fetcher: Callable[[], Awaitable[dict[str, Any]]]) -> None:
    loop = asyncio.get_running_loop()
    task = _refresh_tasks.get(key, None)
    if task is not None and task.get_loop() is loop and not task.done():
        return
    if task is not None:
        _refresh_tasks.pop(key, None)
    if _refresh_retry_after.get(key, 0) > loop.time():
        return
    _refresh_retry_after.pop(key, None)
    _refresh_tasks[key] = loop.create_task(
        _refresh_expired(key, fetcher), name="geo-provider-cache-refresh"
    )


def _stale_response(envelope: dict[str, Any]) -> dict[str, Any]:
    return {
        **envelope,
        "status": "stale",
        "staleReason": "Source cache expired; serving the last-good response.",
    }


async def get_or_fetch(
    key: str,
    fetcher: Callable[[], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    cached = read(key)
    if cached:
        envelope, fresh = cached
        if fresh:
            return envelope
        _schedule_refresh(key, fetcher)
        return _stale_response(envelope)

    async with _lock_for(key):
        cached = read(key)
        if cached and cached[1]:
            return cached[0]
        if cached:
            _schedule_refresh(key, fetcher)
            return _stale_response(cached[0])
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
