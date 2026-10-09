# Geo

Geo is a self-hosted, large-display world map and clock project. Its implementation plan is in [PROJECT_SPEC.md](PROJECT_SPEC.md), its source inventory and display rules are in [data.md](data.md), and visual direction is in [STYLE_GUIDE.md](STYLE_GUIDE.md).

## Current implementation

The Python backend is in [backend/](backend/README.md). It provides revisioned shared layouts/settings/drawings, ADIF contact import and filters, and normalized USGS, NASA EONET, NOAA SWPC, and CelesTrak data endpoints. Run it with Docker Compose:

```sh
cp .env.example .env
docker compose up -d --build
```

By default the API is available at `http://127.0.0.1:8081`; `/healthz` checks storage and `/docs` lists the API. The React/Leaflet atlas and bundled Natural Earth map are available at `http://127.0.0.1:8082`. See [backend/README.md](backend/README.md) for endpoint, persistence, backup, and access details.

See [CAPABILITIES.md](CAPABILITIES.md) for what is implemented, tested, runtime checked, and still deferred.

## Frontend development

Run `cd frontend && npm ci && npm run dev`, then open http://localhost:5173. Vite proxies API requests to port 8081. Use `npm run build` for production assets and `npm run check` for solar, locator, and layout checks. Compose packages the frontend with same-origin API routing; configure `GEO_WEB_BIND` and `GEO_WEB_PORT` for your reverse proxy.

Current view autosaves in browser storage. Named layouts save to SQLite with revision conflict detection and include annotations and widget positions. Settings accepts an optional edit token kept in session memory. Escape closes panels and cancels drawing. Solar simulation changes shading only. Iframe destinations must permit embedding.

A space-weather widget displays NOAA SWPC Kp observations with timestamps and source status. World clocks and clock widgets offer timezone controls. Widgets support arrow-key movement and Shift+arrow resizing; mobile uses a scrollable stack. Imported layout values are normalized before rendering. Browser visual and interaction verification remains pending. NASA MODIS Terra true-color imagery is available as a dated overlay; it is not instantaneous cloud cover.

`geo.ag7su.com` is explicitly allowed by Vite development and preview servers. `https://geo.ag7su.com` is included in the API CORS configuration. The production Nginx frontend accepts this Host header and proxies API requests on the same origin. Apply changed API environment settings on the next container recreation. DNS, TLS, and HAProxy routing remain host configuration.

Fullscreen hides controls after six seconds; pointer or keyboard input reveals them. Editing handles are suppressed while fullscreen. Station and subsolar positions are marked on the atlas. Drawing tools offer names, colors, and undo for map edits in the current session. Radio logs draw up to 250 great-circle contact paths, split at the date line; contact queries show up to 1,000 records.

Layers → Add a custom source supports public XYZ templates, WMS overlays, and imported GeoJSON files. Enter attribution; WMS uses EPSG:3857 and version 1.1.1. Custom source definitions are saved with layouts. Credential URLs are rejected. [Frontend extension guide](frontend/EXTENDING.md) documents the lifecycle and source limits.

Provider updates reconcile existing feature and tile layers. ISS positions move on the existing SVG marker, with a short transition that respects reduced motion. Opacity and order changes retain loaded tile resources; solar shading repaints its existing canvases. A changed imagery date or source URL replaces only that source. MODIS Terra single-day imagery can contain equatorial swath gaps; those are missing observations rather than complete daily global coverage.

Selectable bases: Political Atlas, Grayscale, NASA Blue Marble Relief, and NASA Blue Marble imagery. The latter two are static composites and require provider access. Switching bases retains the view and overlays. Vite hot reload is disabled for stable display use; refresh once after development code changes. Production static asset publication does not force open displays to reload.

The map repeats horizontally at the date line, keeping its geographic scale consistent on wide and fullscreen displays. The bundled atlas, labels, live features, annotations, and user GeoJSON render aligned copies; raster tile sources wrap at their native world boundary. The Maidenhead overlay updates visible cells on Leaflet move/zoom/resize events without rebuilding other layers.

Global natural-event layers include NASA EONET active wildfires, volcanic activity, floods, and severe storms. Their GeoJSON includes event details and source links; active events refresh through the backend cache.

The pointer coordinate readout is rate-limited to 12 updates per second and ignores changes below its displayed precision, keeping pointer movement from rerendering the full interface unnecessarily.
