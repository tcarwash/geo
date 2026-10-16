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
| `POST /local-sources/{source_id}/data` | Push a complete GeoJSON FeatureCollection snapshot into a private local source; replaces the prior snapshot |
| `GET /local-sources/{source_id}` | Read a local source snapshot and its waiting/current/stale status |
| `DELETE /local-sources/{source_id}/data` | Clear a stored local-source snapshot |
| `GET /layouts`, `POST /layouts`, `GET/PUT/DELETE /layouts/{id}` | Shared revisioned layouts; writes use `If-Match: "revision"` |
| `GET/PUT /drawings` | Shared GeoJSON FeatureCollection with geometry, coordinate, count, and size validation; first write uses `If-Match: "0"` |
| `GET/PUT /settings` | Shared non-secret display settings with revision protection; first write uses `If-Match: "0"` |

### Pushed local GeoJSON sources

In private mode, open Layers → Add a custom source → API-pushed GeoJSON. Choose a stable source ID (lowercase letters, numbers, and hyphens; up to 48 characters) and a display name, then add it. Geo shows the POST endpoint in that layer's details and polls its snapshot while the layer is enabled. It stores the latest full snapshot in SQLite; a source becomes stale after five minutes without a new push. Clearing the server snapshot frees its slot but leaves the layer configuration in the current view. Removing the layer from a view does not delete the stored snapshot.

Push a complete FeatureCollection; each request replaces the preceding snapshot. The API accepts WGS84 GeoJSON Point, MultiPoint, LineString, MultiLineString, Polygon, and MultiPolygon features, up to 5,000 features and 5 MB. A private instance holds at most eight source snapshots. Public deployment mode rejects local-source access and writes. Set `GEO_EDIT_TOKEN` to require the `X-Geo-Edit-Token` header; the token is never part of the URL or saved layout. Keep the API on loopback or a trusted LAN/VPN and do not expose it directly to the public internet.

Example (replace the URL, ID, and token with your instance settings; omit the header only when the private instance intentionally has no edit token):

```sh
curl -X POST http://127.0.0.1:8081/api/v1/local-sources/radio-sites/data \\
  -H 'Content-Type: application/json' \\
  -H 'X-Geo-Edit-Token: YOUR_EDIT_TOKEN' \\
  --data-binary @sites.geojson
```

For file-based custom sources, use the same Add a custom source flow and choose GeoJSON file (up to 2 MB). XYZ tiles and WMS overlays are also configurable there; source URLs must be public HTTP(S) URLs without credentials. Feature/label colors, label property and size, point radius, line width, polygon fill, visibility, and opacity are configurable for GeoJSON layers. The existing point-label layers also expose text and background colors plus text size.

Provider responses use the envelope in `PROJECT_SPEC.md`: source, observation/forecast kind, source/data time, fetch/expiry time, status, attribution, units, and data. Upstream requests are restricted to fixed provider URLs; there is no arbitrary URL proxy. Provider errors are sanitized for clients and the last valid cache entry is returned as stale when an upstream refresh fails. When an expired cache entry exists, it is served immediately as stale while a deduplicated background refresh runs; a cold cache with no previous response still waits for its initial fetch.

## Current boundary

Implemented: persistent state API, revision conflict handling, optional write token, opt-in public read-only deployment mode, per-browser display persistence, USGS earthquake feed, NOAA OVATION, planetary K-index and WAM-IPE MUF feeds, NHC storm tracks, PSK Reporter/RBN/DX-cluster feeds, an in-memory WSJT-X UDP decode consumer, ADIF import/query with Maidenhead conversion, CelesTrak TLE retrieval with local SGP4 propagation, and Compose packaging. The WSJT-X listener accepts only new, on-air, high-confidence decode messages and retains a bounded rolling window in memory; it never controls the radio or forwards data. EUMETSAT's separate global geostationary-ring infrared layer, NASA GIBS GOES/Himawari white cloud imagery, GPM IMERG precipitation, and NOAA SWPC D-RAP absorption are rendered by the frontend from public sources. See `PROJECT_SPEC.md` for the full milestone and verification matrix.

## Air and sea transport layers

`GET /api/v1/air-routes` serves a bundled global overview of the top 2,000 historical direct airport pairs from OpenFlights (June 2014), combining direction/codeshares and ranking by distinct airline count. `GET /api/v1/sea-routes` serves bundled Major/Middle/Minor shipping corridors digitized from a 2012 CIA map (P. Benden, 2022). Both are reference products, not current schedules, flight tracks, or navigation charts. They work offline, are off by default, include data provenance/license links, and support public feed streaming/browser caching. Rebuild instructions and transformation/license details are in `app/data/README.md`.

`GET /api/v1/air-traffic` queries the documented ADSB.lol point endpoint. Coverage is regional: `GEO_AIR_TRAFFIC_LATITUDE` (default `45.64`), `GEO_AIR_TRAFFIC_LONGITUDE` (default `-122.66`), and `GEO_AIR_TRAFFIC_RADIUS_NM` (default/max `250`). The center is server-configured and independent of a browser's station settings, so requests/cache/stream are shared. The map displays the search circle. Receiver coverage varies; all airborne aircraft types may appear, not just commercial airlines. Unknown positions, ground reports, and positions older than 60 seconds are omitted; at most 1,000 fresh positions are shown with explicit truncation counts. Missing altitude/speed/track values stay unavailable. A 60-second cache bounds normal refresh to once a minute per server; upstream errors retain the last response with stale status. No keys or aircraft histories are stored in browser layouts.

`GEO_AIR_TRAFFIC_ENABLED` defaults to true in private mode and false in public mode; an empty Compose value uses that default. A disabled layer makes zero provider requests and appears disabled in the UI/catalog. ADSB.lol currently offers keyless access under ODbL and asks production operators to contact the project: review https://api.adsb.lol/docs before setting `GEO_AIR_TRAFFIC_ENABLED=true` for public/production use. No provider contact or production deployment is performed by this change. Preserve ODbL attribution and redistribution obligations. OpenSky is not used as a fallback.

`GET /api/v1/wspr-spots` serves recent WSPRnet reception reports through wspr.live as transmitter-to-receiver paths. The query is limited to 15 minutes, 160–10 m and 6 m, and 1,200 rows; the response is cached for 120 seconds. Coordinates are reported Maidenhead grid centers, not exact antenna sites, and the paths document reports rather than guarantee propagation. wspr.live terms allow only free-to-use, non-commercial applications; preserve attribution and keep queries fast.

## Additional atlas, weather, ocean, and infrastructure layers

The atlas bundle now also includes PB2002 plate boundaries and named plate polygons at GET /api/v1/atlas/tectonic-plates. This is a generalized 2003 model with incomplete polar coverage; it is separate from the earthquake observation feed and is distributed under ODbL 1.0.

Five `/api/v1/atlas/{layer}` products serve bundled airports, ports, rivers, lakes, and ocean depth. `/api/v1/environment/submarine-cables` serves a bundled global OSM communications-cable snapshot. `/api/v1/environment/vessel-density-global` serves a bundled World Bank/IMF global AIS-density visualization (January 2015–February 2021); keep it distinct from `/api/v1/environment/vessel-density`, the EMODnet European annual-average product (currently 2024). Full source hashes, transformation details, licenses, and rebuild commands are in `app/data/atlas/README.md`. Both bundled images use Web Mercator bounds rather than stretching an equirectangular image across the map.

Other `/api/v1/environment/{layer}` endpoints:

- `night-lights`: daily NASA Black Marble NOAA-20 / VIIRS moonlight- and atmosphere-corrected nighttime lights. The latest date comes from the NASA GIBS catalog and is passed explicitly to WMS. Bright pixels can also include fires, fishing fleets, gas flares, snow effects, and other temporary light sources.
- `vegetation`: NOAA-20 / VIIRS rolling 8-day NDVI composite at 500 m, using the latest catalog date. It shows vegetation greenness and seasonal change; it does not define exact forest boundaries.
- `smoke-aerosols`: daily Terra/Aqua MODIS MAIAC aerosol optical depth. The satellite column retrieval can show smoke plumes alongside dust and other aerosols; it is not surface PM2.5 and does not classify aerosol sources. Daytime land coverage, clouds, and retrieval gaps are shown as missing areas.
- `sea-temperature`: NASA GIBS GHRSST MUR daily sea-surface-temperature analysis, using the provider catalog's actual product date and EPSG:3857 WMS.
- `surface-wind` / `pressure`: shared NOAA GFS 1° forecast bundle. Bounded byte-range requests select 10 m east/north wind and mean sea-level pressure from the GRIB2 index; ecCodes validates/decodes scan geometry and issue/valid time. Select a recent available cycle with a four-hour publication allowance and a three-hour forecast valid time; try at most three cycles. Cache one hour; wind and pressure share the same local provider cache. Isobars are drawn every 4 hPa, and animation uses actual vectors with illustrative speed.
- `waves`: NOAA GFS Wave 0.25° global source sampled to a 1° overview. Includes combined significant height, primary-wave period/direction, and first swell-partition height/period/direction. Cache one hour. Arrows point toward propagation; inspected directions describe where waves come from.
- `ocean-currents`: NOAA CoastWatch experimental geostrophic currents from altimetry, 0.25° source sampled at 2°. Null masks remain gaps, no values are fabricated. Provider analysis time is preserved; data older than seven days is marked stale. The current spike returned September 28, 2026, not current October 11 observations. Cache six hours.
- `glotec`: latest supported NOAA GloTEC GeoJSON from its publication index, mapped as 5°×2.5° TEC cells with anomaly and observation-support flag. Flag zero is background-model support. Cache ten minutes; model output older than one hour is marked stale.

Raster source metadata is cached six hours (GIBS) or one day (EMODnet), with actual product dates rather than fetch times. Provider errors keep last-good cached data stale. Source URLs are fixed; the API does not accept arbitrary proxy targets or client secrets. All layers start off and integrate with public SSE and browser caching. The browser allows one feed up to 4 MiB for full swell data while retaining the existing 8 MiB / 24-entry total budget. The backend permits up to 48 topics so the expanded public catalog can be subscribed together.

Local verification includes real provider payloads and raster images, GRIB decoding in the Docker image, fixture-based source/schema/cache checks, desktop/mobile rendering and cleanup, wind animation and reduced-motion behavior, field inspection, and public source snapshots/cache/Chron composition. This does not deploy or push the new changes, contact a production provider, prove physical-device performance, or replace navigation/weather-warning services.
