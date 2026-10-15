const POINT_IDS=new Set(['earthquakes','wildfires','volcanoes','floods','severe-storms','weather-alerts','aurora','satellite','goes-track','contacts','pskreporter','rbn','dx-cluster','pota','wsjtx','storms','cq-zones','itu-zones']);
const RASTER_UNITS={muf:'MHz',precipitation:'mm/h','hf-absorption':'dB'};

export function activeLegendItems(layers,definitions){
  return layers.filter(layer=>layer.on).flatMap(layer=>{
    const definition=definitions.find(item=>item.id===layer.id);
    if(!definition)return [];
    if(['airports','ports'].includes(layer.id))return [{...definition,id:layer.id,kind:'point',symbols:[{label:'Reference hub',color:definition.color,radius:3.5}]}];
    if(['rivers','submarine-cables'].includes(layer.id))return [{...definition,id:layer.id,kind:'point',symbols:[{label:layer.id==='rivers'?'River / lake centerline':'Mapped cable',color:definition.color,shape:'line'}]}];
    if(layer.id==='lakes')return [{...definition,id:layer.id,kind:'point',symbols:[{label:'Inland water',color:definition.color,shape:'square'}]}];
    if(layer.id==='bathymetry')return [{...definition,id:layer.id,kind:'point',symbols:[['0–200 m','#81c6c8'],['200–1,000 m','#64b5bf'],['1,000–3,000 m','#469baa'],['3,000–5,000 m','#2c6c87'],['5,000–7,000 m','#24445f'],['≥7,000 m','#252b45']].map(([label,color])=>({label,color,shape:'square'}))}];
    if(layer.id==='glotec')return [{...definition,id:layer.id,kind:'point',symbols:[['<10 TECU','#647ac2'],['10–<30 TECU','#8fc7cf'],['30–<60 TECU','#e4c27b'],['≥60 TECU','#da777d']].map(([label,color])=>({label,color,shape:'square'}))}];
    if(layer.id==='surface-wind')return [{...definition,id:layer.id,kind:'point',symbols:[['<5 m/s','#80bfc9'],['5–<10 m/s','#9ad6b1'],['10–<20 m/s','#e0d287'],['≥20 m/s','#f09d75']].map(([label,color])=>({label,color,shape:'line'}))}];
    if(layer.id==='ocean-currents')return [{...definition,id:layer.id,kind:'point',symbols:[{label:'Geostrophic flow · m/s',color:definition.color,shape:'line'}]}];
    if(layer.id==='pressure')return [{...definition,id:layer.id,kind:'point',symbols:[{label:'Isobars · 4 hPa interval',color:definition.color,shape:'line'}]}];
    if(layer.id==='waves')return [{...definition,id:layer.id,kind:'point',symbols:[['<1 m','#68b5bd'],['1–<2 m','#79b7d1'],['2–<4 m','#999bd5'],['4–<6 m','#d29dc7'],['≥6 m','#e7977b']].map(([label,color])=>({label,color,shape:'square'}))}];
    if(layer.id==='night-lights')return [{...definition,id:layer.id,kind:'raster',unit:'Black Marble nighttime radiance · daily composite'}];
    if(layer.id==='vegetation')return [{...definition,id:layer.id,kind:'raster',unit:'NDVI · unitless vegetation index'}];
    if(layer.id==='smoke-aerosols')return [{...definition,id:layer.id,kind:'raster',unit:'MAIAC aerosol optical depth · unitless'}];
    if(layer.id==='tectonic-plates')return [{...definition,id:layer.id,kind:'point',symbols:[{label:'Plate boundary',color:'#c6a5df',shape:'line'},{label:'Named plate polygon',color:'#7797ac',shape:'square'}]}];
    if(layer.id==='sea-temperature')return [{...definition,id:layer.id,kind:'raster',unit:'°C · provider temperature palette'}];
    if(layer.id==='vessel-density-global')return [{...definition,id:layer.id,kind:'point',symbols:[['Lower','#0b2c7a'],['Moderate','#20998f'],['Higher','#00db00'],['Highest','#ffff00']].map(([label,color])=>({label:`${label} AIS intensity · log scale`,color,shape:'square'}))}];
    if(layer.id==='vessel-density')return [{...definition,id:layer.id,kind:'raster',unit:'Vessel hours/km²/month · annual mean'}];
    if(layer.id==='air-traffic')return [{...definition,id:layer.id,kind:'point',symbols:[{label:'Aircraft · reported position',color:definition.color},{label:'Search region',color:definition.color,shape:'line'}]}];
    if(layer.id==='air-routes')return [{...definition,id:layer.id,kind:'point',symbols:[{label:'Airport connections · June 2014',color:definition.color,shape:'line'}]}];
    if(layer.id==='sea-routes')return [{...definition,id:layer.id,kind:'point',symbols:['Major','Middle','Minor'].map(label=>({label:`${label} corridor`,color:definition.color,shape:'line'}))}];
    if(layer.id==='wspr')return [{...definition,id:layer.id,kind:'point',symbols:[{label:'Transmitter → reporting receiver · recent reports',color:definition.color,shape:'line'}]}];
    if(layer.id==='earthquakes')return [{...definition,id:layer.id,kind:'point',symbols:[1,3,6].map(magnitude=>({label:`M${magnitude}`,radius:Math.max(3,Math.min(18,magnitude*2)),color:'#e7a05f'}))}];
    if(layer.id==='aurora')return [{...definition,id:layer.id,kind:'point',symbols:[{label:'≤50%',color:'#6cddb2'},{label:'>50%',color:'#b5a0dd'}]}];
    if(layer.id==='prop-muf')return [{...definition,id:layer.id,kind:'point',symbols:[{label:'Contours · MHz',color:definition.color,shape:'line'},{label:'Ionosonde',color:'#ffe28a',shape:'circle',radius:3.5}]}];
    if(layer.id==='weather-alerts')return [{...definition,id:layer.id,kind:'point',symbols:[['Extreme','#e45555'],['Severe','#f28a67'],['Moderate','#edc85b'],['Minor','#72bf8b']].map(([label,color])=>({label,color,radius:5}))}];
    if(layer.id==='air-quality')return [{...definition,id:layer.id,kind:'point',symbols:[['<5','#68b7a3'],['5–<12','#b7bd68'],['12–<25','#e6b45f'],['25–<50','#e78959'],['≥50','#d96668']].map(([label,color])=>({label:`${label} μg/m³`,color,shape:'square'}))}];
    if(POINT_IDS.has(layer.id))return [{...definition,id:layer.id,kind:'point',symbols:[{label:'',color:definition.color}]}];
    if(RASTER_UNITS[layer.id])return [{...definition,id:layer.id,kind:'raster',unit:RASTER_UNITS[layer.id]}];
    return [];
  });
}
