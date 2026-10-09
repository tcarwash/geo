# Geo backend

Python 3.11+ FastAPI service for shared state and normalized data providers. SQLite is the source of truth for named layouts, drawings, settings, and cached provider responses.

## Run with Docker Compose

From the repository root:

```sh
cp .env.example .env
docker compose up -d --build
```

The API listens on `127.0.0.1:8081` by default (container port `8080`). Check `http://127.0.0.1:8081/healthz`; interactive API docs are at `/docs`. Compose stores state in the `geo-data` named volume. `scripts/backup.sh` makes an online SQLite-consistent backup; `scripts/restore.sh path/to/backup.sqlite3` validates a backup, saves the current database under `backups/pre-restore`, then restores and restarts the API if it was running. Store backups outside this host for disaster recovery.

Set `GEO_API_BIND=0.0.0.0` only when a firewall and trusted LAN/VPN or reverse proxy controls reachability. For HAProxy, bind on the host interface HAProxy can reach and set `GEO_FORWARDED_ALLOW_IPS` to HAProxy's source IP or trusted subnet; do not use `*`. `GEO_SATELLITE_CATALOG_IDS` is an administrator allowlist, defaulting to ISS catalog ID 25544. Set `GEO_EDIT_TOKEN` to require `X-Geo-Edit-Token` for all writes. Keep the token out of browser bundles. CORS origins are configured explicitly with `GEO_CORS_ORIGINS`.

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
| `GET /earthquakes?period=hour%7Cday%7Cweek%7Cmonth&min_magnitude=0` | USGS GeoJSON with filters, normalized timestamps, bounded caching, and last-good stale fallback |
| `GET /natural-events/{wildfires%7Cvolcanoes%7Cfloods%7Csevere-storms}` | NASA EONET active event points and perimeters, with a five-minute cache and last-good stale fallback |
| `GET /aurora` | NOAA SWPC OVATION forecast converted to GeoJSON probability points |
| `GET /space-weather` | Recent NOAA planetary K-index observations |
| `GET /muf` | NOAA SWPC WAM-IPE global MUF forecast image and valid time |
| `GET /storm-tracks` | Current NOAA NHC tropical storm forecast tracks and centers |
| `GET /psk-reporter?callsign=N0CALL&latitude=45&longitude=-122` | Six-hour PSK Reporter receive paths from the configured station to receiver Maidenhead grids |
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

Implemented: persistent state API, revision conflict handling, optional write token, USGS earthquake feed, NOAA OVATION, planetary K-index and WAM-IPE MUF feeds, NHC storm tracks, PSK Reporter/RBN/DX-cluster feeds, ADIF import/query with Maidenhead conversion, CelesTrak TLE retrieval with local SGP4 propagation, and Compose packaging. EUMETSAT's separate global geostationary-ring infrared layer, NASA GIBS GOES/Himawari white cloud imagery, GPM IMERG precipitation, and NOAA SWPC D-RAP absorption are rendered by the frontend from public sources. See `PROJECT_SPEC.md` for the full milestone and verification matrix.
