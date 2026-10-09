#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

backup_dir="${1:-$repo_root/backups}"
mkdir -p -- "$backup_dir"
backup_dir="$(cd -- "$backup_dir" && pwd)"
backup_name="geo-$(date -u +%Y%m%dT%H%M%SZ)-$$.sqlite3"
temporary_path="$backup_dir/.${backup_name}.tmp"

docker compose run --rm --no-deps \
  --volume "$backup_dir:/backup" \
  --entrypoint python geo-api -c '
import sqlite3, sys
source = sqlite3.connect("/data/geo.sqlite3")
target = sqlite3.connect(sys.argv[1])
source.backup(target)
result = target.execute("PRAGMA integrity_check").fetchone()[0]
target.close()
source.close()
if result != "ok":
    raise SystemExit("SQLite integrity check failed: " + result)
' "/backup/$(basename -- "$temporary_path")"

mv -- "$temporary_path" "$backup_dir/$backup_name"
printf 'Backup written: %s\n' "$backup_dir/$backup_name"
