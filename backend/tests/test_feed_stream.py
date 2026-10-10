import asyncio
import os
from datetime import UTC, datetime, timedelta

import pytest
from redis.asyncio import Redis

from app.feed_stream import FeedStreamHub, _next_refresh_seconds, parse_topics


def test_parse_topics_deduplicates_and_rejects_private_or_unknown_feeds():
    assert parse_topics("earthquakes,weather-alerts,earthquakes") == ("earthquakes", "weather-alerts")
    with pytest.raises(ValueError, match="unsupported feed topic"):
        parse_topics("earthquakes,contacts")


def test_stale_fallback_uses_retry_backoff_instead_of_repolling_an_expired_ttl():
    stale = {"status": "stale", "expiresAt": (datetime.now(UTC) - timedelta(hours=1)).isoformat()}
    assert _next_refresh_seconds(stale, minimum=15, retry=30) == 30


@pytest.mark.asyncio
async def test_feed_subscribers_share_initial_snapshot_and_single_refresh_task():
    calls = 0

    async def fetch_feed(topic):
        nonlocal calls
        calls += 1
        return {"source": topic, "data": {"version": 1}, "expiresAt": (datetime.now(UTC) + timedelta(hours=1)).isoformat()}

    hub = FeedStreamHub(fetch_feed, min_refresh_seconds=0.01)
    await hub.start()
    try:
        async with hub.subscribe(("earthquakes",)) as first:
            first_event = await asyncio.wait_for(first.get(), timeout=1)
            async with hub.subscribe(("earthquakes",)) as second:
                second_event = await asyncio.wait_for(second.get(), timeout=1)
                assert first_event["type"] == second_event["type"] == "snapshot"
                assert first_event["feed"]["data"] == {"version": 1}
                assert second_event["feed"]["data"] == {"version": 1}
                assert calls == 1
    finally:
        await hub.close()


@pytest.mark.asyncio
async def test_feed_hub_publishes_changed_data_to_all_subscribers():
    version = 0

    async def fetch_feed(topic):
        nonlocal version
        version += 1
        return {"source": topic, "data": {"version": version}, "expiresAt": (datetime.now(UTC) - timedelta(seconds=1)).isoformat()}

    hub = FeedStreamHub(fetch_feed, min_refresh_seconds=0.01)
    await hub.start()
    try:
        async with hub.subscribe(("earthquakes",)) as first:
            initial = await asyncio.wait_for(first.get(), timeout=1)
            async with hub.subscribe(("earthquakes",)) as second:
                await asyncio.wait_for(second.get(), timeout=1)
                update_one = await asyncio.wait_for(first.get(), timeout=1)
                update_two = await asyncio.wait_for(second.get(), timeout=1)
                assert initial["feed"]["data"]["version"] == 1
                assert update_one["type"] == update_two["type"] == "update"
                assert update_one["feed"]["data"]["version"] == update_two["feed"]["data"]["version"] == 2
    finally:
        await hub.close()


@pytest.mark.asyncio
async def test_redis_fans_out_snapshots_and_serializes_cross_process_refreshes():
    redis_url = os.getenv("GEO_TEST_REDIS_URL")
    if not redis_url:
        pytest.skip("Set GEO_TEST_REDIS_URL to run the Redis integration test")
    first_redis = Redis.from_url(redis_url, decode_responses=True)
    second_redis = Redis.from_url(redis_url, decode_responses=True)
    await first_redis.flushdb()
    calls = {"first": 0, "second": 0}

    async def fetch_first(topic: str) -> dict:
        calls["first"] += 1
        return {"source": topic, "data": {"version": 1}, "expiresAt": (datetime.now(UTC) + timedelta(hours=1)).isoformat()}

    async def fetch_second(topic: str) -> dict:
        calls["second"] += 1
        return {"source": topic, "data": {"version": 99}, "expiresAt": (datetime.now(UTC) + timedelta(hours=1)).isoformat()}

    first_hub = FeedStreamHub(fetch_first, redis=first_redis)
    second_hub = FeedStreamHub(fetch_second, redis=second_redis)
    await first_hub.start()
    await second_hub.start()
    try:
        async with (
            first_hub.subscribe(("earthquakes",)) as first_queue,
            second_hub.subscribe(("earthquakes",)) as second_queue,
        ):
            first_snapshot = await asyncio.wait_for(first_queue.get(), timeout=3)
            second_snapshot = await asyncio.wait_for(second_queue.get(), timeout=3)
            assert first_snapshot["type"] == second_snapshot["type"] == "snapshot"
            assert first_snapshot["feed"]["data"]["version"] == second_snapshot["feed"]["data"]["version"] == 1
            assert calls == {"first": 1, "second": 0}
            await first_hub._publish("earthquakes", {"source": "earthquakes", "data": {"version": 2}})
            first_update = await asyncio.wait_for(first_queue.get(), timeout=3)
            second_update = await asyncio.wait_for(second_queue.get(), timeout=3)
            assert first_update["type"] == second_update["type"] == "update"
            assert first_update["feed"]["data"]["version"] == second_update["feed"]["data"]["version"] == 2
    finally:
        await first_hub.close()
        await second_hub.close()
        await first_redis.aclose()
        await second_redis.aclose()
