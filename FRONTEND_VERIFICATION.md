# Frontend acceptance record

The frontend goal remains active. Successful compilation and computation tests do not establish visual quality or browser interaction correctness.

## Evidence collected

- Production Vite build passes; assets split into application, React, and Leaflet/Geoman bundles.
- Fourteen computation/import tests pass (`cd frontend && npm run check`).
- Development frontend and packaged geography return HTTP 200.
- `Host: geo.ag7su.com` returns HTTP 200; an unapproved host returns HTTP 403.
- Live NOAA Kp endpoint returned a current observation with provider timestamp.
- Docker Compose configuration validates. The frontend image built successfully. The running Nginx container passed configuration validation; its proxied health endpoint is healthy. Current static assets were copied in with an atomic index replacement, and served index bytes match the built index. This does not verify external HAProxy/TLS routing.

## Required browser review

Review actual rendered artifacts at 390×844, 768×1024, 1920×1080, and 3840×2160. Check world framing, country/marker contrast, night shading, label density, clocks, attribution, drawers, widget stacking, and control overlap. Repeat with a different map center and multiple overlays.

Exercise layer visibility/order/opacity; provider unavailable/stale states; widget pointer and keyboard move/resize; viewport shrink; clock timezone changes; fullscreen enter/reveal/exit; polygon/route/circle creation and Finish/Cancel; annotation name/color/undo; drawing save and reload; named layout save/load/conflict; GeoJSON/layout export/import; ADIF import and band/mode filtering. Verify malformed files produce messages rather than a shell crash. Verify locked controls and readonly URL behavior.

## Outstanding implementation scope

Zoom-adaptive Maidenhead field/square/subsquare labels are implemented with bounded visible-cell rendering. Their browser readability remains unverified. Optional P2 providers remain deferred. Long-running physical-display and touch behavior are unverified.

No browser or native application is exposed by the current computer-use connection. Recheck availability before the rendered review. This limitation does not prevent implementation or command-level checks.

Custom XYZ/WMS and file-based GeoJSON sources are implemented with attribution, visibility, order, opacity, removal, layout normalization, and source errors. Eight focused tests pass, including custom-source round-trip and URL validation. Their rendered behavior still needs browser review. See `frontend/EXTENDING.md` for the module example and current boundaries.

NASA MODIS Terra true color is implemented with an acquisition-date selector. Its official EPSG:3857 WMTS capabilities confirmed the product and GoogleMapsCompatible_Level9 matrix. A dated sample returned a 256×256 JPEG. Source: https://nasa-gibs.github.io/gibs-api-docs/access-basics/ . This is endpoint evidence, not browser-rendering proof. Annotation stroke width and fill opacity controls are also implemented.

Smooth update tests use a controlled Leaflet substitute to prove that two ISS feed responses reuse one marker and one ground track while updating position and detail data. Reconciliation tests prove opacity/order changes retain resource identity and a changed source replaces only its own resource. ISS, station, and sun glyphs are local SVGs. These tests do not replace a rendered browser review of animation or tile continuity.

Selectable base maps are implemented: offline Political Atlas and Grayscale; NASA Blue Marble Next Generation and shaded relief/bathymetry. Both NASA static products were verified in the current EPSG:3857 capabilities and sample tiles returned valid JPEGs. A controlled controller test checks keeping the prior base until loading succeeds and keeping a loaded base attached on subsequent load events. The late startup view reset was removed; Vite HMR is disabled. Verify the user-reported flashing/movement in the connected browser before declaring it resolved.

Recent flash diagnosis: map movement saves center/zoom into React state. The built-in overlay reconciliation no longer depends on that state. Maidenhead cells update through move/zoom/resize listeners. Raster base/custom tile layers use noWrap, and the map confines its longitude extent to one world to avoid visible repeated tiles. Code review establishes these paths; browser confirmation of continuous panning/fullscreen is outstanding.

Pointer movement now coalesces coordinate readout updates to at most 12 per second and skips updates that do not change displayed coordinates/locator. This code path also requires browser profiling to verify smoothness on target displays.
