# Geo UI and layer roadmap

## Direction

Build a premium living atlas, not a crowded monitoring dashboard. Keep the map dominant; make finding a view, understanding its data, and returning to it effortless. Use restrained navy surfaces, warm geographic accents, compact typography, and progressive disclosure. No additional decorative cards or ambient animation.

This is primarily a proposal, not an implementation or source-availability claim. The National Weather Service active-alert candidate has now passed an initial official-documentation and live-endpoint check; other source candidates still need official documentation, licensing, attribution, coverage, rate-limit, and endpoint checks before integration.

## Current baseline

The application already includes searchable All/Active layer filtering, a collapsed base-map selector, focus restoration, world clocks, editable widgets, annotations, saved layouts, custom sources, and read-only mode. Existing layers include earthquakes, EONET hazards, aurora, ISS and GOES positions, several cloud/imagery products, precipitation, lightning density, tropical storm tracks, MUF/absorption, radio reports, POTA, radio grids/zones, and opt-in National Weather Service active alerts. Improve these before introducing duplicates.

The frontend suite now passes 48 unit tests; six-viewport smoke checks cover source-time details, fixed-order controls, and restoring layer search/scroll after inspection. A source-layer browser smoke verifies visible prop.kc2g contour frequency labels, the vector path, and EUMETSAT's Web Mercator WMS request. The backend suite's last recorded baseline is 19 passing tests; backend tests were not rerun for this frontend slice. Vite emits a Leaflet Geoman CSS source-map warning, but the build succeeds. `CAPABILITIES.md` and `PLAN.md` contain historical verification counts and should be reconciled before release.

The prop.kc2g MUF layer consumes `/renders/current/mufd-normal-now.geojson` contour features and `/api/stations.json` station data through same-origin routes, renders geographic vectors instead of stretching its SVG chart, and places permanent MHz labels on contour lines. The source site's stated 15-minute map regeneration interval is used for refresh. The WMS `mumi:worldcloudmap_ir108` EUMETSAT composite is explicitly requested in EPSG:3857 to align with Leaflet; a live PNG probe succeeded, although the service capabilities advertise EPSG:4326 for this layer, so reprojection remains a provider behavior to monitor.

## Phase 1 — Make the existing product easier to use

### 1. Active-layer workspace
- Add an active count to the Active filter and a compact source-status indicator to each active row.
- Keep visibility toggles immediately accessible; move opacity, label density, and ordering into a consistently named Adjust disclosure.
- Add keyboard-operable Raise/Lower controls with an explicit explanation of stack order and fixed-order layers.
- Add favorites without confusing favorites with enabled layers.
- Preserve search and scroll when switching between a layer and its detail view.

Acceptance: a user can find a layer, enable it, adjust opacity, and inspect its source without losing context. Active filtering and favorites survive appropriate layout/browser persistence boundaries.

### 2. Source confidence and legends
- Standardize badges: Observed, Forecast, Computed, Reference, and User data.
- Show observation/valid time separately from retrieval time; never label successful retrieval as a fresh observation.
- Provide compact, unit-bearing legends for raster layers and symbol scales for point layers.
- Distinguish loading, stale-but-visible, unavailable, and empty results. Keep last valid data visible where safe.
- Move technical provider descriptions into Source details; keep visible copy concise.

Acceptance: users can tell what a color means, when the data applies, and whether it is trustworthy without opening settings. Cached data cannot appear live after an error.

### 3. Map-first navigation
- Add a local-first “Go to” control for bundled countries, coordinates, and Maidenhead locators. Evaluate a geocoder only for city/address search.
- Add a clear return-to-station action; keep Fit world separate.
- Standardize the feature inspector: title, essential facts, age, provider, optional full details.
- Resolve drawer/inspector collisions on small screens; only one primary reading surface at a time.
- Add discoverable keyboard shortcuts, excluding text inputs and respecting Escape.

Acceptance: keyboard and touch users can navigate to their station or a locator without changing their display configuration.

## Phase 2 — Curated views and a cleaner display mode

### 4. Built-in view presets
Start with four restrained presets assembled from existing layers:
- Atlas: geography, day/night, subdued labels.
- Weather: one cloud product, precipitation, optional storm tracks.
- Radio: Maidenhead, one propagation product, selected spot source, station.
- Space: day/night, aurora, ISS and a compact space-weather reading.

Preview affected layers before applying. Preserve station configuration, user drawings, and saved layouts. Offer Undo for replacing an active composition. Do not simultaneously enable overlapping cloud products by default.

### 5. Presentation and mobile refinement
- Separate Explore and Display intent with clear labels rather than an ambiguous Editing state.
- Display mode hides editing controls but keeps an obvious way back; fullscreen remains a separate action.
- Offer a compact instrument strip and independently hideable clocks.
- Use a mobile sheet with stable controls, safe-area spacing, and no automatic software keyboard on opening.
- Preserve widget placement and prevent overlap when changing orientation or display size.

Acceptance: display mode is usable without fullscreen; exit works with touch and keyboard. Narrow phones, landscape, desktop, and 4K retain accessible controls and readable attribution.

## Phase 3 — Time-aware weather and earth layers

Build a shared time/legend model before adding multiple animated products. Store available frames, observation time, valid time, forecast issue time, coverage, units, and source attribution. Cap frame caching, cancel stale requests, and avoid recreating map resources on refresh. Unsupported layers remain live and explicitly say so during playback.

Priority additions:

| Priority | Addition | Why | Candidate / integration gate |
|---|---|---|---|
| First | Surface wind and sea-level pressure | Explains cloud and storm motion; contours/arrows first, optional particles later | NOAA/NCEP GFS via NOMADS is a verified global source-data candidate: official catalogs list 0.25° GRIB2, cycles every six hours, and UGRD/VGRD at 10 m plus PRMSL. It is not a drop-in map/tile service; the atlas would own GRIB retrieval/subsetting, decoding, rendering/tiling, cycle selection, stale-data handling, and operations. Validate a small end-to-end prototype and terms/attribution before production. Official references: https://www.nco.ncep.noaa.gov/pmb/products/gfs/nomads/ ; https://nomads.ncep.noaa.gov/gribfilter.php?ds=gfs_0p25 ; https://nomads.ncep.noaa.gov/info.php?page=gribfilter ; https://www.ncei.noaa.gov/sites/default/files/2023-12/NCEI%20PD-10-2-02%20-%20Open%20Data%20Policy%20Signed.pdf |
| First | Surface temperature | Familiar, useful context with a clear unit-bearing legend | Share the weather-model pipeline where possible; distinguish modeled from observed temperature |
| First | Radar reflectivity | Complements existing global precipitation estimates | NOAA radar/nowCOAST products are candidates; validate current service, geographic coverage, frames, and permitted caching |
| Next | Weather alert polygons | Actionable regional context | NWS alerts as a US-scoped candidate; no implied global coverage or emergency-service reliability |
| Next | Night lights | Strong living-atlas identity without high refresh cost | NASA Black Marble or an appropriate VIIRS composite; verify licensing, tile product, acquisition period, and gaps |
| Next | Higher-resolution active-fire detections | More precise than EONET event summaries | NASA FIRMS candidate; validate credentials, quotas, latency, and confidence fields; label detections rather than fire perimeters |

For each new layer: implement one vertical slice (provider → cache → map → legend → inspector → tests), then accept or stop before adding another.

## Phase 4 — Radio and space depth

Prioritize useful context over dense trails of points:

1. Selected satellite passes: next rise, maximum elevation, set time, and visibility from the configured station; extend the existing orbital pipeline and retain an administrator-controlled catalog.
2. WSPR reception: band, age, distance and SNR filters, bounded paths, and receiver/transmitter detail; confirm documented access and redistribution terms before committing.
3. SOTA activity: summits and current activators with separate reference/live states; validate data access and attribution.
4. Repeaters: nearby search and band/mode filters; provider licensing is a prerequisite.
5. APRS: explicit opt-in, bounded recent history, privacy-aware presentation, and a permitted provider interface; defer until retention and access rules are settled.

Also improve current radio paths: identify exact coordinates versus grid centers versus country-centroid estimates, cap visible paths, and support band/mode/age filtering consistently.

### Local and operator-provided data

Treat local feeds as a first-class, future source category rather than requiring every ADS-B, APRS, or amateur-radio feed to pass through a hosted Geo service. Support operator-controlled inputs such as a local ADS-B receiver/aggregator, APRS-IS-compatible local gateway where permitted, and other ham-radio tools or station software. Potential formats/protocols include documented local HTTP/JSON endpoints, MQTT, and file/stream imports; select protocols only after defining a stable adapter contract.

- Add an explicit “Local data” connection area for configuring, testing, enabling, pausing, and removing local sources independently.
- Prefer outbound connections initiated by the Geo client or an explicitly installed local bridge. Do not require inbound internet exposure or silently scan the LAN.
- Show connection health, last message time, source identity, coverage, and stale/disconnected state separately from observation time.
- Make privacy and retention visible: local-only by default, no upstream relay unless the operator explicitly configures one; document what is stored, for how long, and where.
- Bound update rates, history, and rendered features; deduplicate and filter before map rendering. Allow per-source age, range, band, symbol, and category controls where relevant.
- Keep ADS-B, APRS, and other feeds opt-in and visually distinct from authoritative public products. Include licensing, access, privacy, and attribution checks for each adapter; local availability does not itself grant redistribution rights.
- Add adapters incrementally, starting with the simplest documented local feed and a mock source for deterministic tests. Test disconnect/reconnect, malformed messages, clock skew, high-volume input, and removal of credentials/configuration.

Acceptance: an operator can connect a supported local feed without exposing a public service, understand whether it is live or stale, control what appears on the map, and remove it without affecting public layers or saved station settings.

## Defer until the core experience is solid

Aircraft, ships, dense infrastructure/POIs, and wildlife tracking. These introduce coverage, credentials, licensing, privacy, and rendering costs without improving the core atlas as directly. Do not add them merely to grow the catalog.

## Shared acceptance and release gates

- No new source is enabled by default; default map stays legible.
- Source documentation, attribution, geographic coverage, timing semantics, authentication, cost, and caching terms recorded before production integration.
- Each layer has a legend or explicit reason none is needed, accessible toggle, loading/empty/error/stale states, and layout round-trip tests.
- Browser tests cover filters, keyboard focus, mobile touch, stacking, source errors, and switching views without map jumps.
- Verify frame playback, pause/resume, date-line behavior, request cancellation, and memory/resource retention for time-aware layers.
- Establish measured rendering/network baselines before setting performance budgets; test bounded datasets on the target display hardware.
- Fix the existing ISS mock mismatch and update verification records; run unit tests, build, browser smoke checks, and a display soak test before release.
- Deployment is a separate explicit step; a successful local build does not mean the running production service changed.

## Recommended next implementation slice

The NWS alert layer is an initial weather-data vertical slice: the browser can opt into a server-cached GeoJSON feed; severity is represented by color and a legend; polygon inspection exposes severity, urgency, certainty, expiry, and the official alert link. The upstream API requires an identifying User-Agent, offers GeoJSON, and describes its rate limits as unpublished; the adapter sets a User-Agent and caches for two minutes. Its active-alert endpoint is United States coverage, not global coverage. Live checks returned more than 750 alerts, of which about 210 had polygon boundaries; alerts without polygon geometry remain counted in the feed but are not drawn. NWS API documentation: https://www.weather.gov/documentation/services-web-api

Continue validation and usability work before broadening the data catalog. Wind/pressure remains the next proposed global weather source family, followed by temperature and regional radar; do not integrate them until an operationally supportable provider/pipeline is established.
