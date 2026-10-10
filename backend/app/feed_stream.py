from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from collections import defaultdict
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("geo.feed_stream")
PUBLIC_FEED_ROUTES = {
    "space-weather": "/api/v1/space-weather",
    "earthquakes": "/api/v1/earthquakes?period=day",
    "wildfires": "/api/v1/natural-events/wildfires",
    "volcanoes": "/api/v1/natural-events/volcanoes",
    "floods": "/api/v1/natural-events/floods",
    "severe-storms": "/api/v1/natural-events/severe-storms",
    "weather-alerts": "/api/v1/weather-alerts",
    "aurora": "/api/v1/aurora",
    "air-quality": "/api/v1/air-quality",
    "satellite": "/api/v1/satellites/25544",
    "goes-track": "/api/v1/goes-satellites",
    "muf": "/api/v1/muf",
    "storms": "/api/v1/storm-tracks",
    "rbn": "/api/v1/rbn-spots",
    "dx-cluster": "/api/v1/dx-cluster-spots",
}
MAX_TOPICS = 32
REDIS_CHANNEL_PREFIX = "geo:feed:"
REDIS_SNAPSHOT_PREFIX = "geo:feed:snapshot:"
REDIS_LOCK_PREFIX = "geo:feed:lock:"
REDIS_SNAPSHOT_TTL_SECONDS = 48 * 60 * 60
LOCK_TTL_SECONDS = 60
REDIS_CONTROL_CHANNEL = "geo:feed:__listener__"
META_FIELDS = ("status", "fetchedAt", "expiresAt", "dataTime", "validFrom", "validTo", "staleReason")
_RELEASE_LOCK = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"


def parse_topics(value: str) -> tuple[str, ...]:
    topics = tuple(dict.fromkeys(item.strip() for item in value.split(",") if item.strip()))
    if not topics or len(topics) > MAX_TOPICS or any(topic not in PUBLIC_FEED_ROUTES for topic in topics):
        raise ValueError("unsupported feed topic")
    return topics


def _expiry_seconds(feed: dict[str, Any], minimum: float, maximum: float = 24 * 60 * 60) -> float:
    expires_at = feed.get("expiresAt")
    if isinstance(expires_at, str):
        try:
            expiry = datetime.fromisoformat(expires_at)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=UTC)
            seconds = (expiry - datetime.now(UTC)).total_seconds()
            return max(minimum, min(maximum, seconds))
        except ValueError:
            pass
    return minimum


def _next_refresh_seconds(feed: dict[str, Any], *, minimum: float, retry: float) -> float:
    if feed.get("status") in {"stale", "unavailable"}:
        return max(minimum, retry)
    return _expiry_seconds(feed, minimum)


def _fingerprint(feed: dict[str, Any]) -> str:
    comparable = {key: feed.get(key) for key in ("source", "kind", "status", "dataTime", "validFrom", "validTo", "data")}
    encoded = json.dumps(comparable, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _snapshot(topic: str, feed: dict[str, Any]) -> dict[str, Any]:
    return {"type": "snapshot", "topic": topic, "feed": feed}


def _metadata(feed: dict[str, Any]) -> dict[str, Any]:
    return {key: feed.get(key) for key in META_FIELDS if key in feed}


class FeedStreamHub:
    def __init__(
        self,
        fetch_feed: Callable[[str], Awaitable[dict[str, Any]]],
        *,
        redis: Any = None,
        min_refresh_seconds: float = 15,
        retry_seconds: float = 30,
        heartbeat_seconds: float = 15,
    ) -> None:
        self.fetch_feed = fetch_feed
        self.redis = redis
        self.min_refresh_seconds = min_refresh_seconds
        self.retry_seconds = retry_seconds
        self.heartbeat_seconds = heartbeat_seconds
        self.origin = uuid.uuid4().hex
        self._latest: dict[str, dict[str, Any]] = {}
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._queue_topics: dict[asyncio.Queue[dict[str, Any]], set[str]] = defaultdict(set)
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._pubsub: Any = None
        self._listener: asyncio.Task[None] | None = None
        self._redis_ready = asyncio.Event()
        self._subscription_lock = asyncio.Lock()
        self._closed = False

    async def start(self) -> None:
        if self.redis is not None:
            self._listener = asyncio.create_task(self._listen_redis(), name="geo-feed-redis-listener")
            await asyncio.wait_for(self._redis_ready.wait(), timeout=10)

    async def close(self) -> None:
        self._closed = True
        for task in (*self._tasks.values(), *((self._listener,) if self._listener else ())):
            task.cancel()
        await asyncio.gather(*self._tasks.values(), *([self._listener] if self._listener else []), return_exceptions=True)
        if self._pubsub is not None:
            await self._pubsub.aclose()
            self._pubsub = None

    @asynccontextmanager
    async def subscribe(self, topics: Sequence[str]) -> AsyncIterator[asyncio.Queue[dict[str, Any]]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
        for topic in topics:
            first_local_subscriber = not self._subscribers[topic]
            self._subscribers[topic].add(queue)
            self._queue_topics[queue].add(topic)
            if first_local_subscriber:
                await self._subscribe_topic(topic)
        try:
            for topic in topics:
                snapshot = await self._read_snapshot(topic)
                if snapshot:
                    self._queue_event(queue, snapshot)
                self._ensure_task(topic)
            yield queue
        finally:
            for topic in topics:
                self._subscribers[topic].discard(queue)
                self._queue_topics[queue].discard(topic)
                if not self._subscribers[topic]:
                    self._subscribers.pop(topic, None)
                    await self._unsubscribe_topic(topic)
                    task = self._tasks.pop(topic, None)
                    if task:
                        task.cancel()
                        await asyncio.gather(task, return_exceptions=True)
            if not self._queue_topics.get(queue):
                self._queue_topics.pop(queue, None)

    async def _subscribe_topic(self, topic: str) -> None:
        if self.redis is None:
            return
        async with self._subscription_lock:
            if self._pubsub is None:
                return
            try:
                await self._pubsub.subscribe(f"{REDIS_CHANNEL_PREFIX}{topic}")
            except Exception:
                logger.warning("Could not subscribe Redis feed channel for %s", topic, exc_info=True)

    async def _unsubscribe_topic(self, topic: str) -> None:
        if self.redis is None:
            return
        async with self._subscription_lock:
            if self._pubsub is None:
                return
            try:
                await self._pubsub.unsubscribe(f"{REDIS_CHANNEL_PREFIX}{topic}")
            except Exception:
                logger.warning("Could not unsubscribe Redis feed channel for %s", topic, exc_info=True)

    def _ensure_task(self, topic: str) -> None:
        if topic not in self._tasks or self._tasks[topic].done():
            self._tasks[topic] = asyncio.create_task(self._refresh_loop(topic), name=f"geo-feed-{topic}")

    async def _read_snapshot(self, topic: str) -> dict[str, Any] | None:
        if self.redis is not None:
            try:
                raw = await self.redis.get(f"{REDIS_SNAPSHOT_PREFIX}{topic}")
                if raw:
                    snapshot = json.loads(raw)
                    if isinstance(snapshot, dict) and snapshot.get("type") == "snapshot":
                        self._latest[topic] = snapshot
                        return snapshot
            except Exception:
                logger.warning("Could not read Redis snapshot for %s", topic, exc_info=True)
        return self._latest.get(topic)

    async def _refresh_loop(self, topic: str) -> None:
        while not self._closed and self._subscribers.get(topic):
            current = await self._read_snapshot(topic)
            current_feed = current.get("feed") if current else None
            remaining = _expiry_seconds(current_feed, self.min_refresh_seconds) if current_feed else 0
            if current_feed and remaining > self.min_refresh_seconds:
                await asyncio.sleep(remaining)
                continue
            lock_token = await self._acquire_lock(topic)
            if lock_token is None:
                await asyncio.sleep(min(5.0, self.retry_seconds))
                continue
            try:
                # Another replica may have refreshed while this worker waited for the lock.
                current = await self._read_snapshot(topic)
                current_feed = current.get("feed") if current else None
                if current_feed and _expiry_seconds(current_feed, self.min_refresh_seconds) > self.min_refresh_seconds:
                    delay = _expiry_seconds(current_feed, self.min_refresh_seconds)
                else:
                    feed = await self.fetch_feed(topic)
                    if not isinstance(feed, dict):
                        raise TypeError("feed endpoint returned a non-object envelope")
                    await self._publish(topic, feed)
                    delay = _next_refresh_seconds(feed, minimum=self.min_refresh_seconds, retry=self.retry_seconds)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("Feed refresh failed for %s", topic, exc_info=True)
                await self._publish_error(topic)
                delay = self.retry_seconds
            finally:
                await self._release_lock(topic, lock_token)
            await asyncio.sleep(delay)

    async def _acquire_lock(self, topic: str) -> str | None:
        token = f"{self.origin}:{uuid.uuid4().hex}"
        if self.redis is None:
            return token
        try:
            acquired = await self.redis.set(f"{REDIS_LOCK_PREFIX}{topic}", token, nx=True, ex=LOCK_TTL_SECONDS)
            return token if acquired else None
        except Exception:
            logger.warning("Redis lock unavailable for %s; skipping refresh to avoid duplicate provider requests", topic, exc_info=True)
            return None

    async def _release_lock(self, topic: str, token: str) -> None:
        if self.redis is None:
            return
        try:
            await self.redis.eval(_RELEASE_LOCK, 1, f"{REDIS_LOCK_PREFIX}{topic}", token)
        except Exception:
            logger.warning("Could not release Redis lock for %s", topic, exc_info=True)

    async def _publish(self, topic: str, feed: dict[str, Any]) -> None:
        previous = await self._read_snapshot(topic)
        previous_feed = previous.get("feed") if previous else None
        if previous_feed is None:
            event = _snapshot(topic, feed)
        elif _fingerprint(previous_feed) != _fingerprint(feed):
            event = {"type": "update", "topic": topic, "feed": feed}
        else:
            event = {"type": "metadata", "topic": topic, "meta": _metadata(feed)}
        snapshot = _snapshot(topic, feed)
        self._latest[topic] = snapshot
        if self.redis is not None:
            try:
                encoded_snapshot = json.dumps(snapshot, separators=(",", ":"), ensure_ascii=False)
                encoded_event = json.dumps({**event, "origin": self.origin}, separators=(",", ":"), ensure_ascii=False)
                await self.redis.set(f"{REDIS_SNAPSHOT_PREFIX}{topic}", encoded_snapshot, ex=REDIS_SNAPSHOT_TTL_SECONDS)
                await self.redis.publish(f"{REDIS_CHANNEL_PREFIX}{topic}", encoded_event)
            except Exception:
                logger.warning("Could not publish Redis update for %s", topic, exc_info=True)
        self._fanout(topic, event)

    async def _publish_error(self, topic: str) -> None:
        snapshot = await self._read_snapshot(topic)
        feed = snapshot.get("feed") if snapshot else None
        if feed:
            stale = {**feed, "status": "stale", "staleReason": "Live refresh failed; showing the last available feed."}
            await self._publish(topic, stale)
        else:
            self._fanout(topic, {"type": "error", "topic": topic, "message": "This feed is temporarily unavailable."})

    def _fanout(self, topic: str, event: dict[str, Any]) -> None:
        for queue in tuple(self._subscribers.get(topic, ())):
            self._queue_event(queue, event)

    def _queue_event(self, queue: asyncio.Queue[dict[str, Any]], event: dict[str, Any]) -> None:
        if queue.full():
            while not queue.empty():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
            for topic in sorted(self._queue_topics.get(queue, ())):
                snapshot = self._latest.get(topic)
                if snapshot and not queue.full():
                    queue.put_nowait(snapshot)
            if queue.full() or queue.qsize():
                return
        queue.put_nowait(event)

    async def _listen_redis(self) -> None:
        while not self._closed:
            try:
                async with self._subscription_lock:
                    self._pubsub = self.redis.pubsub()
                    await self._pubsub.subscribe(REDIS_CONTROL_CHANNEL)
                    for topic in tuple(self._subscribers):
                        await self._pubsub.subscribe(f"{REDIS_CHANNEL_PREFIX}{topic}")
                    self._redis_ready.set()
                async for message in self._pubsub.listen():
                    if self._closed:
                        return
                    if message.get("type") != "message":
                        continue
                    try:
                        event = json.loads(message["data"])
                        topic = event.get("topic")
                        if topic not in PUBLIC_FEED_ROUTES or event.get("origin") == self.origin:
                            continue
                        snapshot = await self._read_snapshot(topic)
                        if snapshot:
                            self._latest[topic] = snapshot
                        self._fanout(topic, {key: value for key, value in event.items() if key != "origin"})
                    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                        logger.warning("Ignoring malformed Redis feed event", exc_info=True)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("Redis feed listener disconnected; retrying", exc_info=True)
                await asyncio.sleep(2)
            finally:
                if self._pubsub is not None:
                    await self._pubsub.aclose()
                    self._pubsub = None
