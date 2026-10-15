# Additional atlas products

All bundled overlays are opt-in, dated reference products. The runtime does not query Natural Earth, QLever, or the World Bank to serve them.

- Tectonic plates: PB2002 plate polygons and boundary segments by Peter Bird (published 2003), distributed as a GeoJSON conversion by Hugo Ahlenius / Nordpil from a 2014 snapshot. The bundle has 54 named plate records and 241 generalized boundary segments; polar coverage is incomplete. The derivative is available under ODbL 1.0; keep tectonic-plates-LICENSE.txt with the data. Rebuild with uv run --project backend --with shapely python backend/scripts/build_tectonic_data.py from the repository root. The script pins the upstream commit and records file hashes in the FeatureCollection.

- Airports, ports, rivers, lakes: public-domain Natural Earth at commit `ca96624a56bd078437bca8184e78163e5039ad19`. Airports/ports are generalized global hubs, not complete inventories; rivers/lakes use 1:50m geometry. Non-point geometry is generalized by 0.025° with topology preservation, coordinates rounded to four decimals. Input URLs and SHA-256 hashes are in `manifest.json`. Counts: 893 airports, 1,081 ports, 462 river features, 412 lakes.
- Ocean depth: all 12 Natural Earth depth-threshold datasets, from 0 through 10,000 m. Rendered in Web Mercator as a transparent 4096×4096 PNG, preserving polygon holes; bounds ±85.05112878° latitude / ±180° longitude match Leaflet. This is an atlas reference, not a navigation chart. The intermediate 13 MB GeoJSON is a build input and is discarded after rendering.
- Submarine cables: 657 globally mapped OSM `communication=line` ways tagged `submarine=yes`, extracted through QLever from `planet-260921.osm.pbf`. Rounded to four decimals, duplicate ways removed, date-line crossings split. `submarine-cables-provenance.json` records the query, snapshot, response hash, and transformations. The derived database is available under ODbL 1.0; retain its license notice and OpenStreetMap attribution. Coverage is incomplete; this is not TeleGeography data. Overpass queries failed during the source spike, so the app uses a bundled extract with zero global queries at runtime.
- Global vessel density: World Bank / IMF / ESMAP / PROBLUE [Global Shipping Traffic Density](https://datacatalog.worldbank.org/search/dataset/0037580/global-shipping-traffic-density), CC BY 4.0. All vessel categories; hourly AIS positions accumulated January 2015–February 2021. Native cells are 0.005° (~500 m at the equator), including moving and stationary reports. The 535 MB ZIP is a build input; the runtime ships a 4096×4096 Web Mercator PNG. Geo samples provider raster overviews, averages to a geographic overview, reprojects, and applies the European EMODnet blue/teal/green/yellow palette with logarithmic relative-intensity thresholds and sparse-report opacity fading; zero/no-data stays transparent. The result is a visualization of historical activity, not unique vessel counts, live positions, or the European layer's vessel-hours metric. Source extent, hash, raster profile, projection, and transformations are in `vessel-density-global-provenance.json`.

Rebuild from the repository root:

```sh
uv run --project backend --with shapely --with pillow python backend/scripts/build_atlas_data.py
/usr/bin/python3 backend/scripts/build_cable_data.py
curl --fail --location --output /tmp/geo-worldbank-shipdensity-global.zip https://datacatalogfiles.worldbank.org/ddh-published/0037580/5/DR0045406/shipdensity_global.zip
uv run --project backend --with rasterio --with pillow python backend/scripts/build_global_vessel_density.py --archive /tmp/geo-worldbank-shipdensity-global.zip
```

The raster/vector build tools are temporary dependencies, not installed in the server image. Rebuilding OSM uses the query service's then-current snapshot and records that date; rebuilding World Bank data records the input archive's SHA-256. Preserve attribution and license files when redistributing generated artifacts.
