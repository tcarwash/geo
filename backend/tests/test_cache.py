import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from app import cache, db


@pytest.mark.asyncio
async def test_expired_cache_is_returned_while_background_refresh_runs(tmp_path, monkeypatch):
    monkeypatch.setattr(
        db, "settings", replace(db.settings, database_path=tmp_path / "cache.sqlite3")
    )
    db.initialize()
    key = "test:stale-while-revalidate"
    expired_at = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    cached = {
        "source": "test",
        "status": "current",
        "fetchedAt": expired_at,
        "expiresAt": expired_at,
        "data": {"value": "last-good"},
    }
    cache.write(key, cached)
    refresh_started = asyncio.Event()
    allow_refresh_to_finish = asyncio.Event()
    refresh_calls = 0

    async def fetch():
        nonlocal refresh_calls
        refresh_calls += 1
        refresh_started.set()
        await allow_refresh_to_finish.wait()
        now = datetime.now(UTC)
        return {
            "source": "test",
            "status": "current",
            "fetchedAt": now.isoformat(),
            "expiresAt": (now + timedelta(minutes=1)).isoformat(),
            "data": {"value": "updated"},
        }

    request = asyncio.create_task(cache.get_or_fetch(key, fetch))
    try:
        await asyncio.wait_for(refresh_started.wait(), timeout=1)
        assert request.done(), "the expired response should not wait for the upstream refresh"
        result = await request
        assert result["data"] == cached["data"]
        assert result["status"] == "stale"
        assert "last-good" in result["staleReason"]
        second = await cache.get_or_fetch(key, fetch)
        assert second["data"] == cached["data"]
        assert refresh_calls == 1
    finally:
        allow_refresh_to_finish.set()

    async def refreshed():
        for _ in range(100):
            saved, fresh = cache.read(key)
            if fresh and saved["data"] == {"value": "updated"}:
                return saved
            await asyncio.sleep(0.01)
        raise AssertionError("background refresh did not update the cache")

    assert (await refreshed())["data"] == {"value": "updated"}


@pytest.mark.asyncio
async def test_cold_cache_miss_waits_for_its_first_fetch(tmp_path, monkeypatch):
    monkeypatch.setattr(
        db, "settings", replace(db.settings, database_path=tmp_path / "cold-cache.sqlite3")
    )
    db.initialize()
    fetch_started = asyncio.Event()
    allow_fetch_to_finish = asyncio.Event()

    async def fetch():
        fetch_started.set()
        await allow_fetch_to_finish.wait()
        now = datetime.now(UTC)
        return {
            "source": "test",
            "status": "current",
            "fetchedAt": now.isoformat(),
            "expiresAt": (now + timedelta(minutes=1)).isoformat(),
            "data": {"value": "first-fetch"},
        }

    request = asyncio.create_task(cache.get_or_fetch("test:cold", fetch))
    try:
        await asyncio.wait_for(fetch_started.wait(), timeout=1)
        assert not request.done()
    finally:
        allow_fetch_to_finish.set()
    assert (await request)["data"] == {"value": "first-fetch"}
