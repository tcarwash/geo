# Geo backend

Python 3.11+ FastAPI service for shared state and normalized data providers. SQLite is the source of truth for named layouts, drawings, settings, and cached provider responses.

## Run with Docker Compose

From the repository root:

```sh
cp .env.example .env
docker compose up -d --build
```

The API listens on `127.0.0.1:8081` by default (container port `8080`). Check `http://127.0.0.1:8081/healthz`; interactive API docs are at `/docs`. The WSJT-X decoder also listens on UDP port `2237`, published on host loopback only by default. In WSJT-X, open Settings → Reporting, enable UDP Server, and set the target to `127.0.0.1:2237`. Override `GEO_WSJT_X_UDP_PORT` if the port is already in use. Compose stores state in the `geo-data` named volume. `scripts/backup.sh` makes an online SQLite-consistent backup; `scripts/restore.sh path/to/backup.sqlite3` validates a backup, saves the current database under `backups/pre-restore`, then restores and restarts the API if it was running. Store backups outside this host for disaster recovery.

### Public/shared large-display deployment

Set `GEO_DEPLOYMENT_MODE=public` in `.env` and expose only the web service (for example, set `GEO_WEB_BIND=0.0.0.0` behind a TLS-terminating reverse proxy), then run `docker compose up -d --build`. Keep `GEO_API_BIND=127.0.0.1`; public viewers should reach the same-origin Nginx web service, not the API port. Compose keeps the UDP listener port on loopback, and the backend does not start WSJT-X in public mode. Do not expose the UDP port or publish the API directly to the internet.

Public mode is anonymous and server-enforced: all shared writes return `403 public_read_only`, even if `GEO_EDIT_TOKEN` is configured. Shared layouts, drawings, settings, imported contacts, and personalized/local feeds are unavailable (`404`) rather than returning another viewer's state. ADIF, POTA, PSK Reporter, and WSJT-X are removed from the public catalog/UI; the WSJT-X UDP listener is off. `/api/v1/runtime` advertises the mode and disabled layer IDs without secrets. Public browsers use one Server-Sent Events connection for active feed topics instead of polling each layer every 60 seconds. The backend refreshes subscribed topics at each source envelope's expiry and pushes changed envelopes (or metadata-only freshness updates) to subscribers. Redis Pub/Sub fans updates across API processes; a per-topic Redis lock prevents replicas from duplicating refreshes, and the latest envelope is kept in Redis for new subscribers. Compose starts an internal-only Redis service and sets `GEO_REDIS_URL`; a direct single-process development run may leave it unset, but that in-memory mode is not suitable for multiple API workers. Existing SQLite provider caches and source-specific upstream TTLs remain the upstream-fetch boundary. In public mode, only the catalog and explicit public-feed endpoint allowlist use `Cache-Control: public, max-age=30, s-maxage=30`, allowing shared CDN caching; other responses remain private or no-store. Vite's content-hashed `/assets/` files use one-year immutable caching, while the HTML entry is revalidated. Keep query strings in the CDN cache key. The SSE endpoint remains no-store, and Nginx buffering is disabled there; configure the CDN to bypass caching/buffering for it. Runtime and denied/missing private-state reads are no-store. Nginx rate-limits API traffic to 8 requests/second per client address with a burst of 40. If another proxy sits in front of Nginx, configure `set_real_ip_from` only for that proxy's trusted egress ranges and set `real_ip_header` to its client-IP header before relying on per-viewer rate limits. Never trust arbitrary forwarded-IP headers.

Each browser profile keeps its view (`geo-draft`), layouts, and validated drawings in origin-local storage. Layout storage is capped at 20 entries/4 MiB; annotations retain the GeoJSON validation and size limits. Public feed snapshots use IndexedDB with source-expiry metadata, stale-while-offline display, a 24-entry/8 MiB total cap, and a 2 MiB per-feed cap; private/personalized routes are excluded. Use the existing layout/GeoJSON export and import controls to move a setup. Settings → Clear local display data clears this cache and resets that browser's local setup after confirmation. This is browser-local persistence, not user authentication or encryption; anyone using that same browser profile can change or inspect it. Existing state in the server's SQLite volume is preserved but inaccessible while public mode is enabled; switching back to private mode makes it accessible again, so remove or protect old shared state before exposing an instance if it contains sensitive data. Public mode does not override provider licensing or grant permission for commercial use.

Set `GEO_API_BIND=0.0.0.0` only when a firewall and trusted LAN/VPN or reverse proxy controls reachability. For HAProxy, bind on the host interface HAProxy can reach and set `GEO_FORWARDED_ALLOW_IPS` to HAProxy's source IP or trusted subnet; do not use `*`. Keep `GEO_WSJT_X_UDP_BIND` on `127.0.0.1` unless WSJT-X runs on a separate trusted machine; in that case, bind the UDP host port to a specific trusted LAN interface and firewall it. Never expose this local-decode port to the public internet. `GEO_SATELLITE_CATALOG_IDS` is an administrator allowlist, defaulting to ISS catalog ID 25544. Set `GEO_EDIT_TOKEN` to require `X-Geo-Edit-Token` for all writes. Keep the token out of browser bundles. CORS origins are configured explicitly with `GEO_CORS_ORIGINS`.

For local development, create a Python 3.11+ virtual environment, install `backend/requirements-dev.txt`, then run from `backend/`:

```sh
uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

Set `GEO_DATABASE_PATH` to a writable local SQLite path when running outside Compose.

## API

All routes are under `/api/v1` except `/healthz` and FastAPI's `/docs`.

| Route | Purpose |
|---|---|
| `GET /layers` | Implemented and planned layer catalog |
| `GET /runtime` | Current deployment mode and public-mode capabilities; never includes secrets |
| `GET /earthquakes?period=hour%7Cday%7Cweek%7Cmonth&min_magnitude=0` | USGS GeoJSON with filters, normalized timestamps, bounded caching, and last-good stale fallback |
| `GET /natural-events/{wildfires%7Cvolcanoes%7Cfloods%7Csevere-storms}` | NASA EONET active event points and perimeters, with a five-minute cache and last-good stale fallback |
| `GET /aurora` | NOAA SWPC OVATION forecast converted to GeoJSON probability points |
| `GET /space-weather` | Recent NOAA planetary K-index observations |
| `GET /muf` | NOAA SWPC WAM-IPE global MUF forecast image and valid time |
| `GET /storm-tracks` | Current NOAA NHC tropical storm forecast tracks and centers |
| `GET /psk-reporter?callsign=N0CALL&latitude=45&longitude=-122` | Six-hour PSK Reporter receive paths from the configured station to receiver Maidenhead grids |
| `GET /wsjtx/heard?station_call=N0CALL` | Recent local WSJT-X UDP decodes, grouped by heard callsign and mapped to transmitted Maidenhead grids |
| `GET /rbn-spots` | Recent Reverse Beacon Network spots; paths where both station grids are available |
| `GET /dx-cluster-spots` | Recent DX-cluster paths between DXCC entity centroid estimates |
| `GET /satellites/{catalog_id}` | Admin-enabled CelesTrak TLE elements cached for two hours and locally propagated to a current point plus date-line-safe ground track |
| `GET /goes-satellites` | Current GOES-19/East and GOES-18/West subsatellite points plus short SGP4 ground tracks |
| `POST /adif/import?filename=log.adi&replace_existing=false` | Import UTF-8 ADIF text in the raw request body; stores parsed contacts and counts unresolved grids |
| `GET /adif/contacts?band=20m&mode=FT8&after=...&before=...` | Filter/paginate stored contacts and return their GeoJSON point features |
| `GET /layouts`, `POST /layouts`, `GET/PUT/DELETE /layouts/{id}` | Shared revisioned layouts; writes use `If-Match: "revision"` |
| `GET/PUT /drawings` | Shared GeoJSON FeatureCollection with geometry, coordinate, count, and size validation; first write uses `If-Match: "0"` |
| `GET/PUT /settings` | Shared non-secret display settings with revision protection; first write uses `If-Match: "0"` |

Provider responses use the envelope in `PROJECT_SPEC.md`: source, observation/forecast kind, source/data time, fetch/expiry time, status, attribution, units, and data. Upstream requests are restricted to fixed provider URLs; there is no arbitrary URL proxy. Provider errors are sanitized for clients and the last valid cache entry is returned as stale when an upstream refresh fails.

## Current boundary

Implemented: persistent state API, revision conflict handling, optional write token, opt-in public read-only deployment mode, per-browser display persistence, USGS earthquake feed, NOAA OVATION, planetary K-index and WAM-IPE MUF feeds, NHC storm tracks, PSK Reporter/RBN/DX-cluster feeds, an in-memory WSJT-X UDP decode consumer, ADIF import/query with Maidenhead conversion, CelesTrak TLE retrieval with local SGP4 propagation, and Compose packaging. The WSJT-X listener accepts only new, on-air, high-confidence decode messages and retains a bounded rolling window in memory; it never controls the radio or forwards data. EUMETSAT's separate global geostationary-ring infrared layer, NASA GIBS GOES/Himawari white cloud imagery, GPM IMERG precipitation, and NOAA SWPC D-RAP absorption are rendered by the frontend from public sources. See `PROJECT_SPEC.md` for the full milestone and verification matrix.
