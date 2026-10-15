import React from 'react';
import {ADDITIONAL_LAYERS} from './additionalLayers.js';
const messages={
 airports:'Generalized reference airport hubs, not a complete airport inventory or navigation database.',
 ports:'Generalized reference ports and harbors, not live port activity.',
 rivers:'Generalized rivers and lake centerlines; small tributaries are omitted at this atlas scale.',
 lakes:'Generalized inland-water outlines from the pinned Natural Earth archive.',
 bathymetry:'Depth bands are metres below sea level. The bundled raster is projected in Web Mercator to align with the map; it is an atlas reference, not a navigation chart.',
 'night-lights':'Daily NASA Black Marble nighttime radiance, corrected for moonlight and viewing conditions. This shows artificial light at night; gas flares, fires, fishing fleets, snow and retrieval gaps can also affect pixels.',
 vegetation:'NASA VIIRS rolling 8-day NDVI at 500 m. Greenness indicates vegetation vigor and seasonal change; it does not classify exact forest boundaries, and clouds, snow, bare ground and water create gaps or low values.',
 'smoke-aerosols':'Daily NASA MAIAC aerosol optical depth from Terra and Aqua MODIS. It can reveal broad smoke plumes alongside dust and other aerosols. This is a satellite column observation, not ground-level PM2.5 or a source-specific smoke classification. Clouds, darkness and retrieval gaps leave blank areas.',
 'tectonic-plates':'PB2002 plate polygons and boundary segments from Peter Bird’s model (published 2003), supplied as a 2014 GeoJSON conversion. Plate boundaries show a generalized scientific model; polar coverage is incomplete.',
 'surface-wind':'10 m wind from the NOAA GFS forecast. Flow trails use the actual wind components; animation speed is illustrative, not a predicted travel time. Reduced-motion displays use static arrows. Click the map to inspect wind speed and valid time.',
 pressure:'NOAA GFS mean sea-level pressure, with isobars every 4 hPa. Click the map to inspect pressure and forecast valid time.',
 'sea-temperature':'GHRSST MUR daily blended sea-surface-temperature analysis via NASA GIBS. This is an analysis of sea-surface conditions, not local beach or water-column temperatures.',
 'ocean-currents':'NOAA CoastWatch experimental geostrophic currents inferred from satellite altimetry. The 0.25° source is sampled on a 2° overview grid. Coastal, land, and equatorial gaps remain empty. This excludes tides and other ageostrophic flow; animation speed is illustrative. Click the map for speed and analysis time.',
 waves:'NOAA GFS Wave forecast: combined significant wave height, primary-wave direction and period, plus primary swell values in map inspection. Arrows point toward wave propagation; inspected direction describes where waves come from. The 0.25° source is sampled on a 1° overview grid. Not for navigation.',
 'vessel-density-global':'Global World Bank/IMF AIS report density from January 2015 through February 2021, covering all vessel categories. Colors show logarithmic relative intensity, including moving and stationary reports. The source counts hourly positions in 0.005° cells; the displayed image is a resampled overview. This is historical traffic activity, not live positions or a count of unique vessels. Its units and period differ from the European annual vessel-hours layer.',
 'vessel-density':'Historical AIS-derived vessel hours per square kilometre per month, averaged over the selected year. Coverage is European waters and adjacent seas, not global live ship tracking. The provider reports reduced satellite AIS coverage from June 2024.',
 glotec:'GloTEC is a data-assimilative ionospheric model. Cells are 5° longitude × 2.5° latitude. TEC is measured in TECU (10¹⁶ electrons/m²). Cells with quality flag zero rely on the background model; click a cell for its observation support and anomaly.',
 'submarine-cables':'Community-mapped undersea communications infrastructure from OpenStreetMap. Coverage is incomplete, geometry is approximate, and routes may be unnamed. Source snapshot date and ODbL attribution are preserved; not for navigation.',
 wspr:'Recent WSPRnet reports for 160–10 m and 6 m, limited to a 15-minute window and at most 1,200 paths. Lines run from transmitting station to reporting receiver; reported Maidenhead positions mark grid centers, not exact antennas. Reports show reception events, not predicted or guaranteed propagation. The free wspr.live service permits only free-to-use applications and asks clients to keep queries fast; Geo caches each response for two minutes.',
};
export default function AdditionalSourceDetails({id,feed}){
 if(!ADDITIONAL_LAYERS.some(layer=>layer.id===id)&&!messages[id])return null;
 const grid=feed?.data;
 return <><p>{messages[id]}</p>{feed?.coverage&&<p>{feed.coverage}</p>}{feed?.referenceVintage&&<p>Reference: {feed.referenceVintage}</p>}{feed?.dataTime&&<p>{feed.kind==='forecast'?'Model issued':'Product time'}: {new Date(feed.dataTime).toUTCString()}</p>}{feed?.validFrom&&feed.kind==='forecast'&&<p>Forecast valid: {new Date(feed.validFrom).toUTCString()}</p>}{Array.isArray(grid?.features)&&<p>{grid.features.length.toLocaleString()} mapped features.</p>}{grid?.type==='GridField'&&<p>Displayed grid: {grid.nx} × {grid.ny} · {Math.abs(grid.dx)}° × {Math.abs(grid.dy)}°.</p>}{feed?.attribution&&<p>{feed.attribution}</p>}{feed?.documentationUrl&&<a href={feed.documentationUrl} target="_blank" rel="noreferrer">Source and product details ↗</a>}</>;
}
