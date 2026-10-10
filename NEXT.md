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
- Prior UI-slice verification: 43 frontend unit tests, six viewport UI smoke checks, desktop and touch layer-browser smoke checks, and a successful Vite build. The build continues to emit the existing Leaflet Geoman CSS source-map warning. The last recorded backend baseline is 19 passing tests.
- Propagation/cloud scale check: prop.kc2g MUF draws provider GeoJSON contour lines with always-visible MHz labels and station points in geographic coordinates; 0–360° station longitudes are normalized before rendering. EUMETSAT cloud WMS tiles explicitly use EPSG:3857, matching the map. Both provider data endpoints work through the local proxy. Verified 48 frontend unit tests, six responsive UI smoke checks, a source-layer browser smoke that confirms contour frequency labels, and a successful Vite build; no deployment performed.

## Next steps

1. Validate NWS alert rendering under realistic load before calling it release-ready.
   - Live checks returned more than 750 alerts, but only about 210 had polygon boundaries. Keep the layer opt-in and keep the distinction between total alerts and mapped boundaries visible.
   - Measure map interaction and memory on a small touch device and a desktop display; test refresh with a large feed, null geometries, stale fallback, and layer removal/re-enable.
   - If needed, add bounded rendering or simplification without silently dropping alert severity, validity, or official-detail links. Do not present Geo as a replacement for NWS warnings.
   - Initial local baseline: the running API returned 674 alerts, 207 with polygon boundaries (467 unmapped). In headless Chromium at desktop 1440×900 and touch-emulated 390×844, three enable/disable cycles per viewport displayed the total/boundary counts without page errors. Enable-to-response-and-count-display took 319/106/103 ms desktop and 271/91/114 ms touch-emulated; reported JS heap stayed at 38 MiB desktop and 33 MiB touch-emulated, and canvas counts plateaued at 27 and 6. This is a local browser baseline, not a physical-device performance result. Pan/zoom responsiveness, null-geometry/stale-cache scenarios, and a real-device run remain unverified.

2. Prototype the next global weather source: surface wind and sea-level pressure.
   - NOAA/NCEP GFS via NOMADS is a source-data candidate, not a ready-made tile service. First prove retrieval, GRIB decoding/subsetting, rendering, cycle selection, attribution/terms, and stale behavior with a small end-to-end prototype.
   - Stop before production integration if the processing/operations cost or freshness behavior cannot be supported. Then evaluate surface temperature and regional radar using the same provider gate.

3. Define the local-data adapter contract before implementing ADS-B/APRS/ham-radio connectors.
   - Keep feeds operator-configured and local-first; avoid inbound internet exposure or automatic LAN scanning.
   - Specify supported formats/protocols, privacy and retention, health/staleness, rate and feature limits, credentials handling, and disconnect/removal behavior; begin with a deterministic mock adapter.

4. Reconcile release documentation and gates.
   - Update historical verification records in `CAPABILITIES.md` and `PLAN.md` when preparing a release.
   - Run frontend/backend tests, UI smoke checks, build, source/error scenarios, and a display soak test; deployment remains a separate explicit step.

## Current data-source caveat

The NWS active-alert endpoint is US-scoped; live samples include alerts with no polygon geometry, so those records cannot be drawn as boundaries. Its API documentation describes rate limits as unpublished. The adapter sets a User-Agent and uses a two-minute server cache. NWS documentation: https://www.weather.gov/documentation/services-web-api

The prop.kc2g.com nowcast has public geographic contours at https://prop.kc2g.com/renders/current/mufd-normal-now.geojson and station observations at https://prop.kc2g.com/api/stations.json. A read-only probe returned 17 LineString contours and 101 station records; station longitude values use 0–360°. The site says maps regenerate every 15 minutes, so Geo refreshes on that interval. Its licensing/rate-limit details beyond public availability remain unverified. The EUMETSAT `mumi:worldcloudmap_ir108` layer is served as WMS; the live endpoint returned PNGs for EPSG:3857 and EPSG:4326 requests, and the UI requests Web Mercator tiles to match Leaflet. EUMETSAT capabilities list EPSG:4326 for the layer, so long-term 3857 reprojection support remains dependent on current server behavior.
