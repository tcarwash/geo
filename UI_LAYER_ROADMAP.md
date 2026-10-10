# Geo UI and layer roadmap

## Direction

Build a premium living atlas, not a crowded monitoring dashboard. Keep the map dominant; make finding a view, understanding its data, and returning to it effortless. Use restrained navy surfaces, warm geographic accents, compact typography, and progressive disclosure. No additional decorative cards or ambient animation.

This is primarily a proposal, not a source-availability claim. The National Weather Service active-alert source passed an initial documentation/live-endpoint check. The Open-Meteo CAMS air-quality slice is now implemented from the official contract and deterministic fixtures, but its live probe timed out in this environment. Remaining candidates still need source-specific terms, attribution, coverage, rate-limit, and endpoint checks before integration.

## Current baseline

The application already includes searchable All/Active layer filtering, a collapsed base-map selector, focus restoration, world clocks, editable widgets, annotations, saved layouts, custom sources, and read-only mode. Chron now has a top 24-hour local-solar ruler, fixed noon-centered terminator and civil-twilight grayline while the map turns underneath. It supports north/south-only map dragging, keeps world clocks and user widgets visible, and collapses the Layers/Settings rail behind the Chron UTC card; Hide all/Show all returns to or restores the clean map view. Zoom remains disabled. The approximate 180° International Date Line is an optional map-reference layer. Existing data layers include earthquakes, EONET hazards, aurora, ISS and GOES positions, several cloud/imagery products, precipitation, lightning density, tropical storm tracks, MUF/absorption, radio reports, POTA, local WSJT-X decoded stations, radio grids/zones, opt-in NWS alerts, and the first opt-in CAMS air-quality overview.

Chron keeps that solar ruler and day/night map physically solar-accurate; its center marker is labeled SOLAR NOON. Clicking a geolocated world clock adds a timezone/DST-aware civil-time ruler as a second, contrasting band labeled LOCAL NOON; clicking the selected clock again removes it. The map does not rotate to match civil time. City clock coordinates are editable in Settings, and the Local clock follows the configured station.

Latest public-mode verification passes 63 frontend unit tests, 41 backend tests, Ruff, a two-profile/offline-cache browser smoke, Vite production build, Nginx config validation, and public-mode Compose config rendering. The earlier Chron/WSJT-X and layer smoke suite was not rerun during this change. Build warnings remain the existing Leaflet Geoman CSS source-map issue and the frontend chunk slightly exceeding its 500 kB advisory threshold. The direct Open-Meteo live probe timed out, so only the documented contract and deterministic adapter fixtures are verified. `CAPABILITIES.md` and `PLAN.md` contain historical verification counts and should be reconciled before release.

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

Treat local feeds as a first-class source category rather than requiring every ADS-B, APRS, or amateur-radio feed to pass through a hosted Geo service. The first adapter consumes WSJT-X UDP Decode messages, exposes only recent high-confidence live decodes, maps transmitted Maidenhead grid centers, and keeps data in a bounded process-local buffer. Its host UDP port is loopback-only in Compose by default; no radio control, transmission, persistence, or upstream forwarding is implemented. Next candidates include a local ADS-B receiver/aggregator and APRS-IS-compatible gateway where permitted. Potential formats/protocols include documented local HTTP/JSON endpoints, MQTT, and file/stream imports; select additional protocols only after defining a stable adapter contract.

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

## Proposed transport, infrastructure, air-quality, and satellite layers

The CAMS air-quality row below has its first opt-in vertical slice; the other rows remain planning only. Prefer source data with explicit reuse rights; a public map or endpoint is not by itself permission to redistribute. Distinguish scheduled/reference routes from observed live traffic, and keep every new layer opt-in.

| Layer | Candidate source and scope | Access / freshness | Decision and display contract |
|---|---|---|---|
| Air routes | FAA Aeronautical Information Services [open data](https://www.faa.gov/data/aero_data), including ATS Routes. This is an authoritative U.S. airway network, not a global set of commercial airline city pairs. The [OpenFlights route dump](https://openflights.org/data) is historical: its upstream route provider stopped updates in June 2014. | FAA datasets are downloadable and published against effective aeronautical-data cycles. OpenFlights is a stale snapshot. | Start only if a U.S. ATS-airway reference layer is useful; identify it as airways, not flight schedules. Do not publish OpenFlights as current. A global commercial route layer needs a current, permission-cleared source first. Lines are reference routes, never navigational guidance. |
| Sea routes | OpenStreetMap `route=ferry` ways/relations ([tag guide](https://wiki.openstreetmap.org/wiki/Tag:route%3Dferry)) for mapped public ferry services; NOAA [ENC/GIS data](https://www.noaa.gov/data/gis) for U.S.-area traffic-separation schemes and precautionary areas. | OSM is community-updated under the [ODbL](https://www.openstreetmap.org/copyright), with uneven completeness. NOAA ENC features cover charted U.S. waters. Neither source is live ship traffic. | Keep ferry routes and charted shipping schemes as distinct subtypes with coverage labels. Geo's rendering is reference-only, not for navigation. If the requested layer means observed commercial vessel corridors, defer it: deriving lanes requires an AIS archive and a documented right to redistribute the derived product. |
| Undersea cables | OSM communication-line features tagged `submarine=yes` (see [tagging guide](https://wiki.openstreetmap.org/wiki/Key:submarine)); OSM data is ODbL. | Static community mapping; global completeness, positional accuracy, and update cadence are not guaranteed. | A limited, attributed OSM reference layer is the candidate identified in this review. Use active OSM tags, not deprecated `man_made=submarine_cable`; disclose gaps and do not imply engineering accuracy. TeleGeography's [geocoded cable data](https://www2.telegeography.com/license-geocoded-map-data) is separately licensed, so its public interactive map or third-party mirrors are not a free-data shortcut. |
| Air quality | [Implemented first slice](https://open-meteo.com/en/docs/air-quality-api): Open-Meteo CAMS Global current forecast (PM2.5 + PM10 detail), sampled into 450 global 12° cells and fetched in five bounded multi-location requests. OpenAQ station observations remain a separate, future key-gated source. | CAMS Global's native product is about 45 km / 3-hourly, updated twice daily, with a five-day horizon; the current backend caches for 12 hours. Open-Meteo's free service is non-commercial and requires CC BY 4.0 attribution. OpenAQ coverage/times vary and each record's license needs review. | This coarse 12° field is a broad forecast overview, not a native-resolution raster, measured station surface, or official AQI. The official endpoint docs and fixture contract are validated; a direct live read timed out, so live availability remains unverified. Do not use the free Open-Meteo service commercially without permission/plan. Add OpenAQ only after key and source-license handling pass review. |
| Commercial aviation tracking | [ADSB.lol API](https://api.adsb.lol/docs) is the leading free/open candidate; its published API/data license is ODbL. [OpenSky](https://opensky-network.org/about/terms-of-use) is not a default production fallback: its terms require written permission for operational use, including a live product, even for non-profits. | ADSB.lol currently documents public access without an API key, but rate limits are dynamic, production operators are asked to contact the project, and future key requirements may change. Receiver coverage is uneven; ADS-B is not a complete or safety-grade traffic record. | Keep the layer opt-in. Before enabling it, confirm the intended deployment is acceptable under the provider's ODbL/operational terms and agree on a conservative refresh, bounding box, and feature cap. If the chosen provider requires a key, show a disabled “Configure in Settings” row and make no request until credentials validate. Never silently substitute OpenSky. |
| Satellite tracking | Extend the existing [CelesTrak GP/OMM + local SGP4 path](https://celestrak.org/NORAD/documentation/gp-data-formats.php); ISS and GOES tracking already use this design. | No API key in the current integration. CelesTrak says GP data updates every two hours and asks clients to download only once per update; element sets are then propagated locally. | Add an administrator-curated catalog/group selector rather than polling the whole catalog. Cache each selected element set at most once per two-hour update, animate positions locally, and show element epoch/age so long-lived cached elements cannot appear freshly observed. TLE/OMM elements are not real-time ephemerides; label the position as computed. |

## Shared/public display deployment mode (implemented baseline)

Offer a deployment profile (for example, server-enforced `GEO_DEPLOYMENT_MODE=public`, never a query-string-only switch) for an anonymously accessible, large-format display that does not require user accounts. Interpret “shared/public” as shared access to public read-only data—not shared viewer preferences: each browser profile owns its own display setup. Publicly served defaults may be read-only and administrator-seeded; each display can customize locally without changing anyone else’s view.

- `GEO_DEPLOYMENT_MODE=public` is server-enforced; writes return 403 even with an edit token, and shared/user-specific state reads return 404. The runtime endpoint exposes only deployment capabilities, not secrets. Public mode preserves but does not expose any old shared rows in SQLite.
- Layer visibility, clocks, widgets, current view, layouts, and validated drawings remain in origin-local browser storage. Layouts are bounded to 20 entries/4 MiB. Public feed snapshots use IndexedDB with provider expiry, stale/offline display, 24 entries/8 MiB total and 2 MiB per entry. Settings offer a confirmed reset that clears localStorage and the feed cache; import/export moves setups between browsers. Public settings never send account tokens or ADIF/private feed data to the server.
- In public mode, only `/api/v1/layers` and the explicit public-feed route allowlist emit `Cache-Control: public, max-age=30, s-maxage=30` for shared CDN caching; private responses and errors are not shared, and runtime/SSE are `no-store`. CDN cache keys must preserve query strings. Hashed Vite assets use one-year immutable caching, while the HTML entry revalidates; bounded IndexedDB remains the browser offline/stale layer. Nginx limits API traffic to 8 requests/second/client with a burst of 40. A CDN must bypass cache for runtime, SSE, private routes, and errors; it must proxy SSE without buffering and use trusted real-client-IP ranges before viewer-based rate limiting. Do not cache user-specific/private-feed observations in a shared cache.
- Public clients replace 60-second per-layer requests with one `EventSource` at `/api/v1/feed-stream`, subscribing only to active canonical public feed IDs. Each subscription receives the latest server snapshot first, then changed feed envelopes; freshness-only events update status without replacing map data. A visible connection state and per-feed stale state survive reconnects, while browser `EventSource` reconnects automatically.
- The API refreshes subscribed feeds at the existing envelope expiry, preserving provider cadence and SQLite caching. Redis Pub/Sub distributes updates across API processes, a per-topic Redis lock avoids duplicate refreshes, and Redis retains each latest envelope for up to 48 hours for newly connecting processes/clients. Compose supplies an internal-only, non-persistent `geo-events` service via `GEO_REDIS_URL`. Without Redis, the in-memory hub is single-process only. SSE responses are no-store, emit 15-second heartbeats, and bypass Nginx buffering.
- Public UI/API disable ADIF contacts/import, personalized POTA and PSK Reporter requests, and local WSJT-X data/listener by default. Public mode remains subject to every upstream source's terms; it does not make non-commercial sources suitable for commercial use.
- Public mode does not add TLS or user authentication: expose the web service only behind a trusted TLS proxy and keep the API port loopback-only. If Nginx is behind another proxy, configure client-IP trust so the rate limit does not collapse all viewers into one bucket.
- Remaining follow-up: reconcile provider-specific commercial/redistribution terms, review trusted-proxy/TLS setup, and run a real public-facing deployment soak before exposure.

Acceptance covered in this baseline: two independent browser profiles keep separate preferences/layouts/drawings; settings, layouts, and annotations persist locally; one stream replaces public per-feed polling and bounded feed snapshots survive reload and are labeled stale after expiry/offline failure; reset clears localStorage and IndexedDB; server APIs hide user state and reject every write; private/personal feeds are disabled; browser cache headers and reverse-proxy rate limit are configured. Remaining: future API-key-gated feeds, real TLS/proxy deployment, provider terms review, and public soak testing.

### Credential and provider gate for optional live layers

- Keep source credentials out of `geo-draft`, localStorage, shared display settings, saved layouts, exports, URLs, and browser-to-provider requests. The existing shared settings schema rejects secret-like fields; do not weaken that validation to accommodate API keys.
- If a chosen provider requires credentials, add a separate protected server-side credential workflow (or deployment environment configuration). The UI may report only “not configured / configured / validation failed”; never return a saved secret. Mask input and require the existing authorized write path before replacing it.
- In the layer browser, omit an unapproved provider entirely or show it disabled with a direct Settings action. Do not issue upstream requests until provider terms are approved, credentials are present when required, and a deliberate opt-in is enabled. Removing credentials must disable the layer and clear associated cached live data where appropriate.
- The first end-to-end candidate should be the keyless CAMS forecast or a small static reference dataset, not global aircraft polling. For every provider, test cache reuse, stale fallback, attribution, empty/partial coverage, and request ceilings with deterministic fixtures before a live probe.

### Suggested implementation sequence

1. Decide whether “air routes” means airway infrastructure or scheduled airline connections, and whether “sea routes” means ferries, charted traffic-separation schemes, or AIS-derived lanes. Preserve those as distinct products rather than one ambiguous line layer.
2. Verify the first CAMS slice with one live response when the endpoint is reachable; then prototype one small static route extract and record payload shape, source timestamps, coverage, ODbL/CC BY attribution, rendering cost, and cache rules.
3. Add the CelesTrak catalog/group selector using the existing cached TLE/OMM and SGP4 pipeline; do not fetch every group by default.
4. Add OSM ferry/cable and NOAA ENC reference products only after a coverage/attribution/geometry audit. Simplify or bound geometry before rendering and retain source-object identifiers for inspection.
5. Treat live commercial aircraft as a separate gated feature. Obtain provider approval first; implement credential readiness and disabled-row behavior before the feed adapter. Add no live flight layer until the provider's operational terms, key policy, limits, and redistribution rights are settled.

Acceptance: static routes are distinguished from live tracks; each layer has coverage, source time or reference vintage, attribution, and non-navigation/non-safety context where applicable. Missing API keys result in a visible disabled state or hidden layer and zero upstream requests. Credential values never enter browser persistence or layout payloads. No layer is enabled by default.

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
