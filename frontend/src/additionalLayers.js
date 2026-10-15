export const ADDITIONAL_LAYERS=[
 {id:'airports',name:'Airports',subtitle:'Natural Earth · global reference hubs',icon:'Plane',color:'#eec780',opacity:.9,group:'Air & sea transport',labels:true},
 {id:'ports',name:'Ports',subtitle:'Natural Earth · global reference harbors',icon:'Ship',color:'#74cdbb',opacity:.9,group:'Air & sea transport',labels:true},
 {id:'bathymetry',name:'Ocean depth',subtitle:'Natural Earth · depth bands, metres',icon:'Waves',color:'#469baa',opacity:.65,group:'Ocean & water',raster:true},
 {id:'rivers',name:'Rivers',subtitle:'Natural Earth · generalized global rivers',icon:'Waves',color:'#83c6e1',opacity:.8,group:'Ocean & water'},
 {id:'lakes',name:'Lakes',subtitle:'Natural Earth · global inland water',icon:'Waves',color:'#6eaecd',opacity:.8,group:'Ocean & water'},
 {id:'night-lights',name:'City lights',subtitle:'NASA Black Marble · daily nighttime-light composite',icon:'Sun',color:'#e7d49b',opacity:.8,group:'Satellite imagery & clouds',raster:true},
 {id:'vegetation',name:'Vegetation greenness',subtitle:'NASA VIIRS · rolling 8-day NDVI',icon:'Trees',color:'#82c986',opacity:.7,group:'Land & geology',raster:true},
 {id:'smoke-aerosols',name:'Smoke & aerosols',subtitle:'NASA MODIS MAIAC · daily satellite retrieval',icon:'Wind',color:'#dda889',opacity:.65,group:'Earth & weather',raster:true},
 {id:'tectonic-plates',name:'Tectonic plates',subtitle:'PB2002 · plate polygons and boundaries',icon:'Globe2',color:'#c6a5df',opacity:.8,group:'Land & geology'},
 {id:'surface-wind',name:'Surface wind',subtitle:'NOAA GFS · 10 m wind forecast',icon:'Wind',color:'#9de2d0',opacity:.8,group:'Earth & weather',field:true},
 {id:'pressure',name:'Sea-level pressure',subtitle:'NOAA GFS · forecast isobars',icon:'Wind',color:'#d4c5e9',opacity:.85,group:'Earth & weather',field:true},
 {id:'sea-temperature',name:'Sea-surface temperature',subtitle:'NASA GIBS · GHRSST MUR analysis',icon:'Waves',color:'#efaa78',opacity:.65,group:'Ocean & water',raster:true},
 {id:'ocean-currents',name:'Ocean currents',subtitle:'NOAA CoastWatch · geostrophic analysis',icon:'Waves',color:'#80d9e7',opacity:.85,group:'Ocean & water',field:true},
 {id:'waves',name:'Waves & swell',subtitle:'NOAA GFS Wave · height and direction',icon:'Waves',color:'#8fa9ee',opacity:.7,group:'Ocean & water',field:true},
 {id:'vessel-density-global',name:'Vessel density · global',subtitle:'World Bank / IMF · 2015–2021 historical AIS',icon:'Ship',color:'#edb76f',opacity:.8,group:'Air & sea transport',raster:true},
 {id:'vessel-density',name:'Vessel density · Europe',subtitle:'EMODnet · European historical AIS density',icon:'Ship',color:'#f0b870',opacity:.8,group:'Air & sea transport',raster:true},
 {id:'glotec',name:'Ionospheric electron content',subtitle:'NOAA GloTEC · TEC and observation support',icon:'RadioTower',color:'#db9eea',opacity:.6,group:'Space weather & propagation'},
 {id:'submarine-cables',name:'Submarine cables',subtitle:'Mapped undersea infrastructure · reference',icon:'Route',color:'#d2a6ed',opacity:.85,group:'Infrastructure'},
].map(layer=>({...layer,on:false}));
export const ADDITIONAL_FEED_ROUTES=Object.fromEntries(ADDITIONAL_LAYERS.map(layer=>[layer.id,`${['airports','ports','bathymetry','rivers','lakes','tectonic-plates'].includes(layer.id)?'/atlas':'/environment'}/${layer.id}`]));
export const ADDITIONAL_RASTER_IDS=ADDITIONAL_LAYERS.filter(layer=>layer.raster).map(layer=>layer.id);
export const ADDITIONAL_FIELD_IDS=ADDITIONAL_LAYERS.filter(layer=>layer.field).map(layer=>layer.id);
export function additionalInspection(id,feature){
 const p=feature.properties||{};
 if(['airports','ports'].includes(id))return {kind:id==='airports'?'Airport reference':'Port reference',title:p.name_en||p.name||'Unnamed',fields:[['Code',p.iata_code||p.abbrev||p.gps_code||'Unavailable'],['Type',p.type||p.featurecla||'Reference hub'],['Coordinates',`${feature.geometry.coordinates[1].toFixed(3)}°, ${feature.geometry.coordinates[0].toFixed(3)}°`]],source:'Natural Earth · public domain'};
 if(['rivers','lakes'].includes(id))return {kind:id==='rivers'?'River reference':'Lake reference',title:p.name_en||p.name||'Unnamed water feature',fields:[['Feature',p.featurecla||id],['Map','Generalized global atlas reference']],source:'Natural Earth · public domain'};
 if(id==='tectonic-plates')return p.recordType==='plate'?{kind:'Tectonic plate',title:p.plateName,fields:[['Plate code',p.plateCode],['Reference','PB2002 present-day model · published 2003']],source:'Peter Bird · Hugo Ahlenius / Nordpil · ODbL'}:{kind:'Plate boundary',title:`${p.plateA||'Plate'} — ${p.plateB||'Plate'}`,fields:[['Boundary type',p.boundaryType||'Mapped plate boundary'],['Source citation',p.sourceCitation||'PB2002 · Peter Bird (2003)']],source:'Hugo Ahlenius / Nordpil · ODbL'};
 if(id==='glotec')return {kind:'Ionospheric model cell',title:'GloTEC total electron content',fields:[['TEC',`${p.tec?.toFixed(1)} TECU`],['Anomaly',p.anomaly==null?'Unavailable':`${p.anomaly.toFixed(1)} TECU`],['Observation support',p.qualityFlag===0?'No observations · background model':`${p.qualityFlag} · provider quality flag`],['Model valid',p.validTime]],source:'NOAA SWPC · GloTEC'};
 if(id==='submarine-cables')return {kind:'Submarine cable reference',title:p.name||'Unnamed cable',fields:[['Type',p.cableType||'Undersea cable'],['Operator',p.operator||'Unavailable'],['Reference',p.referenceVintage||'Date unavailable'],['Coverage','Community/provider mapping may be incomplete']],source:p.attribution||'OpenStreetMap contributors · ODbL'};
 return null;
}
