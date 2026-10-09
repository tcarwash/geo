# Geo — project specification

Status: proposed implementation specification  
Date: 2026-10-09  
Workspace: `/home/tyler/dev/geo`

## 1. Product objective

Build a self-hosted, modern world-map dashboard inspired by Geochron, with Leaflet as the map engine. The primary experience is a beautiful, continuously updating world clock and geographic display on a large fullscreen monitor. The same application must remain usable on phones, tablets, and touch displays.

Users can stack independent geographic layers, place draggable and resizable widgets over the map, draw and save geographic regions, and save complete display layouts. Public datasets power the default experience. Adding a layer or widget must not require rewriting the dashboard.

This document is a specification, not a claim that the application or upstream integrations have already been implemented or tested.

## 2. Reference and scope

The requested reference is [Geochron Ham Radio 4K](https://www.geochron.com/ham-radio-4k/). That URL could not be retrieved during research. The available [Geochron UK feature page](https://geochron.co.uk/ham-radio-4k/) provides the comparison baseline; it contains historical product information and is not assumed to be a complete current US catalog.

Its listed capabilities include DX activity, ADIF logs, MUF, amateur satellites, gray line, Maidenhead grids, solar/aurora data, weather, aviation, ISS tracking, location clocks, night lights, transportation routes, population, pollution, submarine cables, earthquakes, and historical COVID statistics. Those categories inform the layer inventory below.

Visual inspiration means similarly rich geopolitical colors, readable geographic labels, dark oceans, and a prominent day/night boundary. Build an original design using appropriately licensed assets; do not depend on Geochron's proprietary maps or feeds.

### Release priorities

- **P0 — foundation:** original colored world map, solar lighting, clocks, layer stacking, widget framework, drawing, persistence, mobile controls, fullscreen, and Docker Compose deployment.
- **P1 — public-data release:** earthquakes, aurora/space weather, ISS/amateur satellites, NASA imagery, Maidenhead grid, and ADIF visualization.
- **P2 — expanded integrations:** weather fields, DX feeds, MUF, aviation, transportation, population, pollution, cable networks, and advanced scheduling as source access permits.

A failed or unavailable P2 provider must not delay a usable P0/P1 application. Keep its integration status explicit.

## 3. Primary workflows

1. Open the dashboard and immediately see the world, current UTC, local time, and the moving night region.
2. Open the layer drawer, enable several overlays, change their order and opacity, and inspect legends and data timestamps.
3. Add a world-clock, space-weather, text, or iframe widget; move and resize it; lock the display to prevent accidental edits.
4. Draw a polygon or route by tapping the map, edit it, give it a name and color, and save or export it.
5. Import an ADIF log, inspect contacts and paths, and filter by band, mode, and time.
6. Save a named layout and reopen it after browser or server restart.
7. Switch into fullscreen display mode with controls hidden; reveal controls with a tap or keyboard shortcut.
8. On a phone, use the same layers and saved layouts through drawers and a readable stacked-widget view.

## 4. Map and visual requirements

### Original Geochron-inspired base map

- Use Leaflet, initially with its standard Web Mercator projection. Explain that polar latitudes are clipped; preserve global coverage within that projection and handle date-line wrapping correctly.
- Provide a packaged political base map from versioned Natural Earth country polygons. No API key is required for the default map.
- Assign adjacent countries distinguishable muted colors: moss, ochre, terracotta, slate, and pale sand. Oceans use deep navy/teal; coastlines and borders remain visible under shading.
- Package a low-resolution world dataset for initial view and load more detail only where needed. Country labels scale with zoom and avoid overwhelming the world view.
- Add optional topographic/satellite and grayscale alternatives, with clearly attributed sources and provider constraints.
- Day/night shading follows the map geometry rather than using a screen-space gradient. Include optional civil, nautical, and astronomical twilight bands.
- Show sun/subsolar position, optional graticule, and a configurable UTC/longitude time ruler. Civil clocks use IANA time zones rather than longitude offsets.
- At 4K, typography and controls scale for viewing distance. Expose a display-scale setting independent of browser zoom.

### Layer composition

- Exactly one base map; any number of compatible overlays.
- Layers expose visibility, opacity, order, legend, source, data time, refresh status, and applicable filters.
- Use Leaflet panes for predictable stacking. Put annotations and selected objects above raster overlays; keep widgets above the map.
- Reordering should work through drag handles and explicit move-up/down buttons.
- Maintain clear distinctions between observations, forecasts, model predictions, historical datasets, and user annotations.
- Incompatible layers explain their constraints. Expensive layers may warn about display performance but must not silently disable another layer.

## 5. Layer inventory and public-data strategy

Priorities below are implementation decisions. “Candidate” means access, licensing, schema, and browser/backend compatibility still require verification before committing to that integration.

| Layer | Priority | Source / method | Required behavior and boundary |
| --- | --- | --- | --- |
| Day/night and gray line | P0 | Local solar-position calculation | Update at least once per minute; twilight bands; date-line-safe geometry; simulation time separate from live time. |
| Political countries and labels | P0 | Natural Earth packaged data | Original color palette; source/version attribution; no mandatory external tiles. |
| Pins and local clocks | P0 | User locations and IANA time zones | Named pins, station location, configurable labels; explicit time-zone selection. |
| Maidenhead grid | P1 | Locally generated locator geometry | Zoom-adaptive grid; locator readout on tap; bounded rendering. |
| Earthquakes | P1 | USGS GeoJSON summary feeds | Magnitude, depth, age filters; popup details; latest successful data retained on failure. |
| Aurora | P1 | NOAA SWPC OVATION JSON | Geographic probability/intensity overlay, forecast timestamp and legend; never label the model as an observation. |
| Solar/space weather | P1 | NOAA SWPC public products | Kp and available solar indicators in widgets; units and timestamps; unavailable values never replaced with invented data. |
| ISS and amateur satellites | P1 | CelesTrak GP/OMM plus local SGP4 propagation | Select catalog objects; current calculated position, ground track, optional geometric footprint; display orbital epoch and stale warnings. |
| ADIF contacts | P1 | Local user upload | Stations, contact counts, great-circle paths, filters; unknown coordinates explicitly unresolved. |
| Night lights | P1 | NASA GIBS candidate night-light product | Static imagery with product date; optional night-only mask. Product ID and projection verified before shipping. |
| Satellite cloud/true-color imagery | P1 | NASA GIBS WMTS/WMS | Acquisition date selector, opacity, missing-tile handling; not presented as instantaneous cloud cover. |
| Precipitation/radar | P2 | RainViewer candidate API | Coverage and observation timestamp visible; provider caps respected; distinguish radar from global rainfall forecasts. |
| Wind, pressure, temperature | P2 | Candidate NOAA forecast grids or suitable public weather provider | Backend converts supported gridded data into tiles/vectors; units, model run, valid time and forecast lead shown. Public availability does not imply a ready global tile API. |
| Live DX reception/spotting | P2 | Candidate PSK Reporter, WSPRnet, or permitted cluster feed | Separate reception reports from cluster announcements; band/mode/age filters; aggregated paths; source-specific access approval and rate limits. |
| MUF / propagation | P2 | Candidate public ionosonde/ionospheric model source | Show spatial/time coverage and model provenance; never manufacture global coverage from sparse measurements. Select source and validate interpolation first. |
| Aircraft | P2 | Candidate OpenSky or another permitted ADS-B provider | Credentials/quotas may apply; global coverage not guaranteed; cap displayed aircraft; position age visible. |
| Population | P2 | Candidate public population raster such as WorldPop | Dataset year and units; licensed, versioned raster converted to efficient tiles. |
| Carbon monoxide / pollution | P2 | Candidate NASA GIBS scientific product | Product-specific units, quality/coverage, date and legend; no unsupported conversion to ground-level air quality. |
| Air and sea routes | P2 | Candidate appropriately licensed static route datasets | Identify schematic/historical routes; never imply live vessel or aircraft positions. |
| Submarine cables | P2 | Candidate redistributable cable geometry | Source license must permit use; no scraping or redistribution of proprietary cable maps. |
| ITU regions and call-sign geography | P2 | Verified region/boundary and prefix datasets | Distinguish ITU regions, zones, DXCC entities, and prefixes; disputed boundaries handled consistently. |
| COVID / historical health statistics | Deferred | Candidate maintained historical dataset | Optional historical comparison only; do not promise a discontinued daily live feed. |
| Custom XYZ, WMS, GeoJSON | P1 | User-supplied permitted endpoints | Configurable attribution, opacity, refresh, and legend; credentials server-side; no arbitrary unrestricted proxy. |

### Verified documentation starting points

- [Leaflet WMS/TMS support](https://leafletjs.com/examples/wms/) documents native WMS and tile integration.
- [NASA GIBS access documentation](https://nasa-gibs.github.io/gibs-api-docs/access-basics/) provides public WMTS/WMS interfaces and projection/time conventions. Check capabilities for each selected layer, matrix set, resolution, and date availability.
- [USGS GeoJSON feed format](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) defines earthquake summary data.
- [NOAA SWPC JSON directory](https://services.swpc.noaa.gov/json/) exposes public JSON products, including OVATION data; verify individual product schemas and timestamp semantics.
- [CelesTrak GP formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php) documents orbital data access. Follow the [usage policy](https://celestrak.org/usage-policy.php); browser animation must not trigger an upstream request every second.
- [RainViewer API documentation](https://www.rainviewer.com/api/weather-maps-api.html) describes radar tile access; confirm current usage limits before integration.

Documentation research verifies possible interfaces, not end-to-end operation from the eventual deployment host. Every provider gets an integration spike before its feature is considered committed.

## 6. Extensible layer architecture

Each bundled layer is registered as a typed module. The shell does not contain source-specific rendering or parsing logic.

A layer definition contains:

- Stable ID, display name, category, description, attribution, and documentation URL.
- Kind: raster, vector, computed geometry, or composite.
- Versioned configuration schema, defaults, filter controls, and legend renderer.
- Supported projections, temporal semantics, refresh cadence, and stale threshold.
- Lifecycle methods to create, attach, update, detach, and dispose its map resources.
- A data adapter reference; cancellation and error/status reporting.

A runtime context provides the map, assigned pane, selected time, station location, data client, and application event bus. Modules must release listeners, workers, timers, and layers on disposal. Slow requests must not overwrite newer filter selections.

Ship developer examples for a GeoJSON layer and an XYZ/WMS layer. Users may configure declarative custom sources through the UI. Arbitrary executable plugins are trusted, deployment-installed code, not JavaScript pasted into a settings field.

## 7. Widgets and layouts

### Bundled widget types

- UTC/local/world clock with multiple IANA time zones and optional analog presentation.
- Station identity: call sign, location, grid, and local solar information.
- Solar/space-weather summary with source freshness.
- Layer legend and data-health summary.
- Text/notes and link panel.
- Iframe panel for a user-selected dashboard or website.
- Satellite summary and selected-object details after the satellite adapter exists.

### Widget contract

Widgets register a stable type ID, version, configuration schema, defaults, renderer, minimum size, and migration function. Layout records hold widget IDs, configuration, position, dimensions, z-order, visibility, and lock state. Adding a widget type must not change the core layout engine.

### Interaction

- Dedicated drag handle and resize handles using Pointer Events for mouse, touch, and pen.
- Move/resize only in edit mode; clicking an iframe or clock must not accidentally move it.
- Prevent iframe pointer capture while its container is being dragged.
- Optional snap grid, edge docking, bring-to-front, duplicate, hide, and remove.
- Keyboard move/resize alternatives and labeled controls.
- Normalize desktop positions against the available viewport; clamp widgets on resize so controls remain reachable.
- On narrow screens, offer a stacked widget sheet while preserving the saved large-display arrangement.
- Show an actionable error when a target refuses embedding through CSP or frame restrictions; offer opening the URL in another tab.
- Restrict iframe URL schemes, use configurable origin allowlists and a conservative sandbox, and never promise to bypass target-site embedding rules. Support local HTTP embeds only where browser mixed-content rules permit.

## 8. Drawing and user geography

Use a maintained Leaflet-compatible drawing library, selected after a touch interaction spike.

- Create polygon, rectangle, circle, polyline, and point features.
- Finish, cancel, undo vertex, edit, and delete through visible touch-friendly controls.
- Configure label, notes, stroke/fill colors, opacity, and line width.
- Persist user features separately from fetched overlays.
- Import/export GeoJSON FeatureCollections. Represent circles as points with documented radius metadata, or export an explicitly approximated polygon.
- Validate uploaded geometry, coordinate ranges, feature count, size, and properties. Treat labels and notes as text.
- Handle date-line crossings in both drawing and rendering without drawing long unintended lines across the map.
- Keep completed features editable after reopening a layout. Confirm deletion of saved drawings and support undo during an editing session.
- Drawing mode owns map clicks; normal map inspection resumes when drawing exits.

## 9. Temporal behavior and data health

Use UTC internally. Distinguish system time, dashboard simulation time, observation/acquisition time, forecast valid time, and fetch time.

Live mode refreshes available sources on provider-appropriate schedules. Historical/simulation mode only affects layers that support it; other layers must clearly indicate their live or fixed-date status. Do not replay current aircraft or reports as historical data.

The adapter service provides normalized responses with `source`, `dataTime`, `fetchedAt`, `expiresAt`, and `status`. Cache by provider and query, deduplicate requests, enforce timeouts, and back off after failures. Serve the last valid response with a stale indicator where appropriate; never mark an unsuccessful fetch as a fresh observation.

Pause unnecessary browser animation in background tabs. Cached layouts, bundled maps, clocks, calculations, and saved drawings remain available without upstream connectivity. Full offline imagery is optional and constrained by provider caching rights. No claim of subsecond absolute clock accuracy without a verified time-sync mechanism.

## 10. Recommended implementation stack

- TypeScript, React, and Vite for the frontend.
- Leaflet as the map engine, with a thin lifecycle integration layer.
- A lightweight TypeScript Node service for normalized provider adapters, caching, settings, and uploads.
- SQLite for versioned layouts, annotations, settings, and shared cache metadata; ordinary files for larger allowed cache assets.
- Browser workers for heavy geometry, satellite propagation, or grid processing where needed.
- A simple widget layout engine supporting pointer interactions, with a custom responsive presentation layer.
- Vitest for meaningful computation/schema tests and Playwright for real interaction tests.
- Docker Compose as the preferred deployment. No required cloud subscription or account for P0/P1 defaults, subject to final provider verification.

Keep modules separated into map shell, layer registry, widget registry, provider adapters, annotations, persistence, and display settings. Dependencies and public datasets are versioned with their licenses recorded.

## 11. Persistence and deployment

### Saved state

Persist base map, map center/zoom, active layer order/configuration, widget layout, drawings, station settings, display scale, and named presets. Use schema versions and explicit migrations. Export/import a portable layout JSON with secrets excluded. Autosave with debounce and surface save failures.

Server storage is the source of truth for shared named layouts; local browser storage can retain a recovery draft. Detect conflicting updates using a revision number instead of silently overwriting another display's edits. Support a read-only display URL and a deliberate edit mode.

### Homelab deployment

Provide `compose.yaml`, `.env.example`, health checks, persistent volumes, and documented backup/restore commands. The stack should run on a Docker host or VM in the existing Proxmox environment and be reachable through HAProxy. Support reverse-proxy headers and configurable public origin; start with root-path hosting unless subpath support is explicitly implemented and tested.

Default deployment is private/LAN-oriented. If exposed publicly, protect editing and upload endpoints through application authentication or a documented reverse-proxy access boundary. Provider keys stay on the server. NetBird is an available private-access option. Existing Home Assistant, Node-RED, and n8n dashboards may be linked or embedded where those applications permit it; integration is optional, not a prerequisite.

Only allow registered provider routes by default. Custom server-side URLs require administrative configuration and validation against SSRF, private metadata endpoints, redirects, and credential leakage. Any explicitly allowed LAN source is narrowly configured, not enabled through a general fetch endpoint.

## 12. Display, mobile, and accessibility

- Fullscreen display mode hides editing chrome and can be exited through visible/tap-revealed controls or Escape.
- Display lock, optional cursor auto-hide, auto-dimming schedule, and saved startup preset.
- Optional rotating presets with configurable interval; rotation pauses during editing.
- At least 44 CSS-pixel touch targets; pinch zoom and one-finger map pan outside edit/drawing gestures.
- Drawers/bottom sheets rather than permanently wide sidebars on phones.
- Keyboard navigation, visible focus, accessible names, and reduced-motion support.
- Legends and provider status remain discoverable when chrome is hidden.
- Never rely solely on color to communicate data health or layer state.

## 13. Performance targets

Treat these as acceptance targets to measure on a documented reference device, not established results:

- A cached/bundled initial world view appears within 3 seconds on the LAN reference host.
- Map pan/zoom remains responsive with six representative active layers and four widgets at 3840 × 2160.
- Long-running display test lasts at least 24 hours without accumulating timers, unbounded feature collections, or steadily growing memory.
- Satellites animate from cached orbital elements; clocks update locally; upstream polling is independent of rendering rate.
- Cluster or aggregate large point sets and cap paths/markers with visible count summaries.
- Tile errors, provider downtime, malformed data, and browser reconnection do not crash the shell.

## 14. Implementation milestones and acceptance

### Milestone 1 — display foundation

Deliver the Compose-runnable shell, packaged colored Leaflet world map, solar terminator/twilight, UTC/local clocks, fullscreen mode, basic layer registry, and named persisted layouts.

Acceptance: correct day/night behavior at equinox and solstice fixtures; date-line handling; usable world view at 1080p and 4K; reload restores settings; documented startup command works from a clean checkout.

### Milestone 2 — editing and extensibility

Deliver movable/resizable widgets, iframe configuration, display lock, drawing/editing, GeoJSON import/export, custom XYZ/WMS/GeoJSON sources, and developer extension examples.

Acceptance: touch and keyboard interaction; blocked-iframe fallback; geometry survives reload/export/import; resize preserves reachable widgets; simultaneous overlays retain independent opacity and order; lifecycle cleanup survives repeated toggling.

### Milestone 3 — public-data integrations

Deliver USGS earthquakes, NOAA aurora/solar summaries, ISS/amateur satellites, Maidenhead grid, selected NASA imagery, and ADIF import.

Acceptance: exercise real provider responses from the deployment host; timestamp and source display; offline/stale/error behavior; credentials not needed for default committed sources; orbital calculation fixtures; ADIF unresolved-location handling; all selected layers usable together.

### Milestone 4 — optional expansion

Implement additional P2 layers after each integration spike verifies source rights, sustainable request limits, geographic/temporal coverage, and deployment accessibility. Add rotating presets and refined kiosk controls.

Acceptance: each integration has a documented provider contract and real-data verification. Unavailable sources remain explicitly unsupported rather than displayed with placeholder live data.

## 15. Verification and deliverables

Deliver complete runnable source, Compose configuration, setup/backup README, developer layer/widget guides, source/license inventory, and a capability matrix marking implemented, tested, and deferred features.

Verification must include:

- Focused tests for solar geometry, date-line handling, schema migration, satellite propagation, and import validation.
- Browser checks for stacking/order/opacity, widget manipulation, drawing, fullscreen, persistence, and narrow-screen layouts.
- Rendered screenshots at phone, tablet, 1080p, and 4K sizes; inspect geographic readability and control overlap.
- Real upstream smoke checks plus controlled stale, timeout, and malformed-response scenarios.
- Clean Compose startup and persistence across container recreation; restore from documented backup.
- A clearly reported boundary between synthetic fixtures, browser automation, real-provider checks, and physical touch/large-display testing.

## 16. Decisions intentionally left for implementation spikes

1. Exact Natural Earth packaging, label placement, and adjacent-country coloring strategy.
2. Touch drawing library and widget drag/resize implementation.
3. Individual NASA product identifiers and valid temporal ranges.
4. Sustainable sources for DX, MUF, forecast weather grids, aviation, population, routes, cables, and ham-region boundaries.
5. Whether a geographic/equirectangular projection option improves the clock-like presentation enough to justify additional Leaflet projection and tile compatibility work.

Default choices are a privately hosted Compose application, one shared household instance, server-persisted named layouts, and a large-display-first design with a distinct mobile presentation. Build the useful public-data foundation before depending on uncertain external feeds.
