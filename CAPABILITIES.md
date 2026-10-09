# Geo capability status

Status is based on the repository and checks run on 2026-10-09. “Runtime checked” means the API container was exercised here; it does not establish availability from the eventual HAProxy deployment host or a 24-hour display device.

| Capability | State | Evidence / boundary |
|---|---|---|
| FastAPI service and Compose deployment | Implemented, runtime checked | Container built and started; `/healthz` reported storage healthy on port 8081. Host port 8080 was already occupied, so Compose defaults to 8081. |
| SQLite state and schema migrations | Implemented, tested | Layouts, drawings, settings, provider cache, ADIF tables; tests cover migration from schema version 1 and saved layout persistence across container recreation. |
| Shared named layouts | Implemented, tested | CRUD endpoints, payload size checks, schema version, ETags, optimistic conflict response. |
| Drawings and settings persistence | Implemented, tested | GeoJSON type/coordinate/count/size validation; initial write uses revision zero. Settings and layout payloads reject secret-like keys. |
| USGS earthquakes | Implemented, tested, runtime checked | Hour/day/week/month GeoJSON feeds, magnitude filter, 60-second cache, stale fallback. A live hour query returned successfully. |
| NASA EONET active events | Implemented, tested, upstream checked | Separate active wildfires, volcanoes, floods, and severe-storm layers; GeoJSON event points/perimeters, five-minute cache, stale fallback. Live category feeds returned successfully; the running API container still needs recreation to expose the new endpoint. |
| NOAA aurora forecast | Implemented, tested, runtime checked | OVATION values normalized to GeoJSON points and forecast envelope; live request returned successfully. This remains a forecast/model product. |
| NOAA planetary K index | Implemented, tested, runtime checked | Recent observations with UTC timestamps and Kp units; live request returned successfully. |
| CelesTrak satellite position and track | Implemented, tested, runtime checked | Admin allowlist (ISS 25544 by default), two-hour TLE cache, local SGP4 position and date-line-split track; live request returned successfully. |
| ADIF import and contact query | Implemented, tested | UTF-8 raw-body import (10 MB max), Maidenhead conversion, filters, pagination, and unresolved locations. Frontend upload and band/mode filter wiring implemented and build checked; browser import interaction remains unverified. |
| Optional shared write token | Implemented, tested | `GEO_EDIT_TOKEN` protects write endpoints; no account/session management or per-user permissions. Keep service private or put an authentication boundary at the reverse proxy. |
| Natural Earth packaged map and frontend | Implemented, build and rendered checked | Atlas shell, clocks, layers, widgets, drawing, layouts, ADIF upload, and horizontal world copies that preserve map scale on wide displays. Browser interaction checks remain pending. |
| NASA GIBS product delivery | Implemented, endpoint checked | MODIS Terra corrected-reflectance true color; EPSG:3857 GoogleMapsCompatible_Level9; acquisition date selector. Current capabilities and sample JPEG checked. Browser tile rendering still unverified. |
| Backup/restore | Implemented, round-trip checked | `scripts/backup.sh` uses SQLite's online backup API; `scripts/restore.sh` validates the input and saves the current DB before replacement. A test layout was changed, restored from backup, read back, then removed. |
| Deployment-host source checks | Not verified | Current live checks ran from the local Compose container. Verify provider reachability and HAProxy routing after deployment configuration. |

Backend tests: `cd backend && uv run --python 3.12 pytest -q` (13 passed). Static checks: `cd backend && uv run --python 3.12 ruff check app tests` (passed). Compose startup, recreation persistence, current USGS/NOAA/CelesTrak feeds, and backup/restore round-trip were exercised locally.

Frontend checks: 16 tests cover solar fixtures, longitude wrapping, locator generation, imported state, GeoJSON validation, date-line routing, world copies, ISS reconciliation, and event perimeter updates. Production build passes. Vite accepts `geo.ag7su.com` (HTTP 200) and rejects an unapproved hostname (HTTP 403). Map controls, fullscreen reveal behavior, annotation name/color/undo, widget keyboard controls, and mobile stacking are implemented but need browser interaction verification.

Current frontend production image builds successfully. Running Nginx configuration validates and its proxied health endpoint returns storage healthy. Current index bytes match the production build; the application bundle returns HTTP 200 with Host geo.ag7su.com. Thirteen focused tests pass, including smooth-update resource retention and bounded Maidenhead grid generation. Physical/display and connected-browser verification remain outstanding.
