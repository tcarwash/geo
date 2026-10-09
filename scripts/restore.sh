#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -f "$1" ]]; then
  printf 'Usage: %s path/to/geo-backup.sqlite3\n' "$0" >&2
  exit 2
fi

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
backup_path="$(realpath -- "$1")"
backup_dir="$(dirname -- "$backup_path")"
backup_name="$(basename -- "$backup_path")"

docker compose run --rm --no-deps \
  --volume "$backup_dir:/restore:ro" \
  --entrypoint python geo-api -c '
import sqlite3, sys
source = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro&immutable=1", uri=True)
result = source.execute("PRAGMA integrity_check").fetchone()[0]
source.close()
if result != "ok":
    raise SystemExit("SQLite integrity check failed: " + result)
' "/restore/$backup_name"

# Save the current state before replacement so a mistaken restore can be reversed.
"$repo_root/scripts/backup.sh" "$repo_root/backups/pre-restore"

was_running=0
if docker compose ps --status running --services | grep -qx 'geo-api'; then
  was_running=1
fi
docker compose stop geo-api

restart_api() {
  if [[ $was_running -eq 1 ]]; then
    docker compose start geo-api >/dev/null
  fi
}
trap restart_api EXIT

docker compose run --rm --no-deps \
  --volume "$backup_dir:/restore:ro" \
  --entrypoint python geo-api -c '
import os, sqlite3, sys
target_path = "/data/geo.sqlite3"
for suffix in ("-wal", "-shm"):
    try:
        os.remove(target_path + suffix)
    except FileNotFoundError:
        pass
source = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro&immutable=1", uri=True)
target = sqlite3.connect(target_path)
source.backup(target)
target.close()
source.close()
' "/restore/$backup_name"

restart_api
trap - EXIT
printf 'Restored %s; current pre-restore state is in %s/backups/pre-restore\n' "$backup_path" "$repo_root"
