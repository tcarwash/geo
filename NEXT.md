# Geo UI roadmap checkpoint

Use this file as the short, current checkpoint. `UI_LAYER_ROADMAP.md` remains the detailed product and source plan. This checkpoint reflects completed local work only; no production deployment has been made.

## Completed

- Layer browser: searchable All/Active views, favorites, empty/reset states, keyboard focus behavior, and responsive layer controls.
- Layer controls and data context: opacity/source details, layer ordering controls, source freshness/status labels, and an active-layer legend with units or symbol meaning.
- Phase 1 clarity: explain overlay stacking and fixed-position layers, and disable Raise/Lower for fixed-order overlays; source details distinguish observation/issue/valid times from retrieval time, retain stale state on refresh errors, and keep cached-data context visible.
- Inspector flow: feature details and drawers are mutually exclusive; reopening Layers after map inspection restores the prior query and scroll position.
- Map navigation: return to station, local-first Go to for coordinates, Maidenhead locators, and bundled country names, plus G/L/Escape shortcuts.
- Curated views: Atlas, Weather, Radio, and Space presets with preview, apply, and undo; unrelated station settings and drawings are preserved.
- Display mode: editing controls can be hidden without entering fullscreen; world clocks can be hidden independently.
- NWS active weather alerts: opt-in US GeoJSON feed behind the backend cache, identifying User-Agent, severity-colored polygons and legend, alert inspection, and official alert links. Alerts without polygon geometry are counted but not drawn. The UI explains that this is informational, not an emergency-warning channel.
- Chron mode: Geochron-style top 24-hour local-solar ruler, screen-centered noon meridian, crisp seasonal day/night boundary, civil-twilight grayline, and map rotation underneath. The map can be panned north/south only; east/west stays solar-time-driven and zoom remains disabled. World clocks and user widgets stay visible. The Chron UTC card collapses/reveals the Layers/Settings rail, with a Hide all/Show all option for a clean map. The International Date Line is an optional dashed, labeled 180°-meridian reference (default off); layer details clarify it is approximate.
- Chron dual-scale behavior: clicking a geolocated world clock adds its timezone/DST-aware civil-time ruler in a contrasting band, explicitly labeled LOCAL NOON; the solar ruler marks SOLAR NOON. Clicking the selected clock again returns to the default solar-only ruler. The solar map and noon meridian do not move. City clock coordinates are editable; the Local clock follows station coordinates.
- WSJT-X heard stations: opt-in local UDP consumer for new, live, high-confidence decodes; aggregates calls by recent receive, maps reported Maidenhead grids, labels SNR/mode/frequency, and keeps a bounded rolling 30-minute in-memory view. The port is loopback-only by default in Compose; no decoded data is persisted, forwarded, or used to control the radio.
- First transport/environment integration: opt-in Open-Meteo CAMS Global PM2.5 sampled overview with PM10 cell inspection, color ranges, source/terms caveats, server-side 12-hour cache, bounded multi-location requests, stale fallback, and no API key. The displayed 12° cells are deliberately coarse relative to the model's ~45 km native resolution; this is not a sensor map or official AQI. Direct live probe timed out in this environment; fixture behavior is tested. OpenAQ observations remain planned and would be key-gated.
- Data-integration plan: source candidates, licensing/coverage caveats, secret-handling gate, and implementation order for air/sea routes, submarine cables, air quality, aircraft tracking, and satellite catalog expansion are documented in `UI_LAYER_ROADMAP.md` and `data.md`.
- Latest verification after public-stream/CDN preparation: 71 frontend tests; 50 backend tests passed/1 optional Redis integration skipped; Ruff; two-profile/offline-cache/SSE browser smoke; Redis cross-hub pub/sub and app-startup checks against a real Redis container; Vite production build; Compose render/build; Nginx config syntax and static-response header checks; public API cache-header tests; and `git diff --check` pass. Vite reports an upstream Leaflet-Geoman sourcemap warning and a >500 kB chunk warning. No deployment performed.
- Propagation/cloud scale check: prop.kc2g MUF draws provider GeoJSON contour lines with always-visible MHz labels and station points in geographic coordinates; 0–360° station longitudes are normalized before rendering. EUMETSAT cloud WMS tiles explicitly use EPSG:3857, matching the map. Both provider data endpoints work through the local proxy. No deployment performed.
- Public deployment baseline: `GEO_DEPLOYMENT_MODE=public` is server-enforced read-only; private/user-state endpoints and feeds are disabled, WSJT-X does not start, and the API catalog hides those layers. Settings, layouts, and drawings save per browser; IndexedDB caches public feeds with expiry/stale fallback under 8 MiB/24 entries; a confirmed reset clears local state and cache. One EventSource per browser subscribes to active public feeds; Redis Pub/Sub fans updates across API replicas and a per-feed lock prevents duplicate refreshes without changing source TTLs. The UI preserves existing data during metadata updates and labels expired/offline feeds stale. CDN-ready headers cover hashed static assets and only the explicit public API allowlist; private/runtime/SSE responses bypass shared caching. Compose/Nginx docs include Redis, SSE proxying, and trusted-proxy/rate-limit guidance. Multi-profile/offline-cache/SSE smoke passes; provider-specific CDN IP trust, TLS, provider terms, and soak review remain before exposure. No public deployment performed.

## Next steps

1. Validate NWS alert rendering under realistic load before calling it release-ready.
   - Live checks returned more than 750 alerts, but only about 210 had polygon boundaries. Keep the layer opt-in and keep the distinction between total alerts and mapped boundaries visible.
   - Measure map interaction and memory on a small touch device and a desktop display; test refresh with a large feed, null geometries, stale fallback, and layer removal/re-enable.
   - If needed, add bounded rendering or simplification without silently dropping alert severity, validity, or official-detail links. Do not present Geo as a replacement for NWS warnings.
   - Initial local baseline: the running API returned 674 alerts, 207 with polygon boundaries (467 unmapped). In headless Chromium at desktop 1440×900 and touch-emulated 390×844, three enable/disable cycles per viewport displayed the total/boundary counts without page errors. Enable-to-response-and-count-display took 319/106/103 ms desktop and 271/91/114 ms touch-emulated; reported JS heap stayed at 38 MiB desktop and 33 MiB touch-emulated, and canvas counts plateaued at 27 and 6. This is a local browser baseline, not a physical-device performance result. Pan/zoom responsiveness, null-geometry/stale-cache scenarios, and a real-device run remain unverified.

2. Prototype the next global weather source: surface wind and sea-level pressure.
   - NOAA/NCEP GFS via NOMADS is a source-data candidate, not a ready-made tile service. First prove retrieval, GRIB decoding/subsetting, rendering, cycle selection, attribution/terms, and stale behavior with a small end-to-end prototype.
   - Stop before production integration if the processing/operations cost or freshness behavior cannot be supported. Then evaluate surface temperature and regional radar using the same provider gate.

3. Define the broader local-data adapter contract before implementing ADS-B/APRS connectors; the first ham-radio local adapter (WSJT-X UDP decode consumer) is implemented.
   - Keep feeds operator-configured and local-first; avoid inbound internet exposure or automatic LAN scanning.
   - Specify supported formats/protocols, privacy and retention, health/staleness, rate and feature limits, credentials handling, and disconnect/removal behavior; begin with a deterministic mock adapter.

4. Reconcile release documentation and gates.
   - Update historical verification records in `CAPABILITIES.md` and `PLAN.md` when preparing a release.
   - Run frontend/backend tests, UI smoke checks, build, source/error scenarios, and a display soak test; deployment remains a separate explicit step.

5. Continue the proposed transport/infrastructure sequence after the CAMS live endpoint is rechecked.
   - Next static-source spike: define whether air routes means U.S. FAA airways or scheduled airline links, then audit one small FAA or OSM ferry extract and its reuse terms.
   - Keep cables and route layers opt-in; do not ship stale OpenFlights routes as current.
   - Do not surface commercial flight tracking until provider terms are cleared; any key-backed source stays disabled until configured through a protected Settings workflow.

## Current data-source caveat

The NWS active-alert endpoint is US-scoped; live samples include alerts with no polygon geometry, so those records cannot be drawn as boundaries. Its API documentation describes rate limits as unpublished. The adapter sets a User-Agent and uses a two-minute server cache. NWS documentation: https://www.weather.gov/documentation/services-web-api

Open-Meteo's no-key free service is limited to eligible non-commercial use and requires CC BY 4.0 attribution. The CAMS layer remains opt-in; its live endpoint could not be verified from this environment because the read-only probe timed out. The app deliberately labels its 12° samples as a coarse model forecast, not monitor observations or an official AQI.

The prop.kc2g.com nowcast has public geographic contours at https://prop.kc2g.com/renders/current/mufd-normal-now.geojson and station observations at https://prop.kc2g.com/api/stations.json. A read-only probe returned 17 LineString contours and 101 station records; station longitude values use 0–360°. The site says maps regenerate every 15 minutes, so Geo refreshes on that interval. Its licensing/rate-limit details beyond public availability remain unverified. The EUMETSAT `mumi:worldcloudmap_ir108` layer is served as WMS; the live endpoint returned PNGs for EPSG:3857 and EPSG:4326 requests, and the UI requests Web Mercator tiles to match Leaflet. EUMETSAT capabilities list EPSG:4326 for the layer, so long-term 3857 reprojection support remains dependent on current server behavior.
