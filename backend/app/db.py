from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import settings


def utc_now() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime | None = None) -> str:
    return (value or utc_now()).isoformat(timespec="seconds").replace("+00:00", "Z")


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.database_path, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def initialize(path: Path | None = None) -> None:
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        db_path = path
    else:
        settings.database_path.parent.mkdir(parents=True, exist_ok=True)
        db_path = settings.database_path
    conn = sqlite3.connect(db_path, timeout=10)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
        )
        current = conn.execute("SELECT COALESCE(MAX(version),0) FROM schema_migrations").fetchone()[0]
        if current < 1:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS layouts (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, state_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS drawings (
                    singleton INTEGER PRIMARY KEY CHECK (singleton = 1), collection_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS settings (
                    singleton INTEGER PRIMARY KEY CHECK (singleton = 1), settings_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS provider_cache (
                    cache_key TEXT PRIMARY KEY, envelope_json TEXT NOT NULL, fetched_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )"""
            )
            conn.execute("INSERT INTO schema_migrations(version,applied_at) VALUES(1,?)", (iso(),))
            current = 1
        if current < 2:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS adif_imports (
                    id TEXT PRIMARY KEY, filename TEXT, imported_at TEXT NOT NULL, record_count INTEGER NOT NULL
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS adif_contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    import_id TEXT NOT NULL REFERENCES adif_imports(id) ON DELETE CASCADE,
                    callsign TEXT NOT NULL, contacted_at TEXT, band TEXT, mode TEXT, frequency_mhz REAL,
                    remote_grid TEXT, remote_lon REAL, remote_lat REAL, local_grid TEXT, local_lon REAL,
                    local_lat REAL, record_json TEXT NOT NULL
                )"""
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS adif_contacts_filter ON adif_contacts(contacted_at,band,mode,callsign)"
            )
            conn.execute("INSERT INTO schema_migrations(version,applied_at) VALUES(2,?)", (iso(),))
            current = 2
        if current < 3:
            columns = {row[1] for row in conn.execute("PRAGMA table_info(layouts)").fetchall()}
            if "schema_version" not in columns:
                conn.execute("ALTER TABLE layouts ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1")
            conn.execute("INSERT INTO schema_migrations(version,applied_at) VALUES(3,?)", (iso(),))
            current = 3
        if current < 4:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS local_source_data (
                    source_id TEXT PRIMARY KEY, collection_json TEXT NOT NULL, updated_at TEXT NOT NULL
                )"""
            )
            conn.execute("INSERT INTO schema_migrations(version,applied_at) VALUES(4,?)", (iso(),))
        conn.commit()
    finally:
        conn.close()


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def loads(value: str) -> Any:
    return json.loads(value)
