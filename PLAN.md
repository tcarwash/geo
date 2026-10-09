# Data catalog plan

Create `data.md` as a broad catalog of possible data sources for Geo, organized around the idea of a **living globe**: a clean, professional, Geochron-like world display animated by weather, astronomy, radio activity, natural events, and human activity.

## Coverage

Include source candidates and access notes for:

- **Base maps:** political world map, street and vector maps, terrain and relief, satellite imagery, bathymetry, grayscale, and night-light styles.
- **Weather and atmosphere:** satellite imagery (visible, infrared, water vapor, and composites), animated radar, precipitation, clouds, wind, pressure, temperature, severe weather, and forecast/model products. Clearly distinguish observations from forecasts, show source timestamps and coverage, and include animation/time controls.
- **Lightning:** live detections and satellite-derived lightning, historical data and climatologies, local detector/ESPHome possibilities, coverage, access terms, and dedicated map styling.
- **Earthquakes and geohazards:** live and historical earthquake catalogs, magnitude/depth/age, shake intensity, aftershocks, volcanoes, tsunamis, and related event feeds.
- **Amateur radio:** DX cluster and reception spots, PSK Reporter, WSPR, Reverse Beacon Network, POTA, SOTA, repeaters, APRS, Winlink, satellites and passes, Maidenhead grid, DXCC/ITU/CQ regions, beacons, propagation, solar/geomagnetic conditions, ADIF contacts, and local station data.
- **General-interest point/POI and activity data:** cities, landmarks, parks and protected areas, airports, ports, ships, aircraft, rail, roads, trails, weather stations, seismic stations, observatories, wildlife tracking, fires, aurora, and other noteworthy events.
- **Other useful layers:** population, environment, ocean conditions, infrastructure, custom GeoJSON/XYZ/WMS sources, and user-drawn data.

## Source catalog fields

For each source or source family, record its data or layer type, provider, link to official documentation, access method, geographic coverage, update cadence or valid time, authentication or cost, attribution/license considerations, and practical limitations. Separate documented interfaces from candidates that still need an integration spike. Do not describe a source as free, open, redistributable, or production-ready unless its current terms support that claim. Flag feeds that require credentials, approval, subscription, or written permission.

## Visual style and icon guide

Include a coherent style guide for map layers and POI symbols that fits Geo's existing visual guide:

- Keep the map as the visual focus, with deep blue-green oceans, restrained atlas land colors, clear coastlines, readable labels, and a precise day/night boundary.
- Use consistent color ramps, opacity, outlines, scale rules, clustering, and layer ordering. Keep the map legible when several layers are enabled.
- Give each layer family a recognizable, simple line icon. Establish symbol conventions for radio stations/reports, repeaters, satellites, lightning, earthquakes, aircraft, ships, weather stations, parks, cities, and user annotations. Use one consistent icon family, label icon-only controls accessibly, and do not rely on color alone.
- Give point datasets sensible filters, hover/selection details, clustering at low zoom, and a useful detail view. Put source, timestamp, units, and freshness beside the legend or feature details.

## Living-globe presentation

Describe how source layers can support a living-globe experience: clouds and storms move, lightning appears, twilight and city lights shift with time, satellites cross the sky, radio reports draw propagation paths, seismic and natural events appear as they happen, and seasonal or human activity provides slower context. Suggest restrained named display presets so the default stays clean and readable while users can opt into richer views.

The deliverable is `data.md`, with practical source links and concise evidence-based notes. Creating this plan is not the data-catalog deliverable.
