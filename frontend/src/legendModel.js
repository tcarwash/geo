const POINT_IDS=new Set(['earthquakes','wildfires','volcanoes','floods','severe-storms','weather-alerts','aurora','satellite','goes-track','contacts','pskreporter','rbn','dx-cluster','pota','storms','cq-zones','itu-zones']);
const RASTER_UNITS={muf:'MHz',precipitation:'mm/h','hf-absorption':'dB'};

export function activeLegendItems(layers,definitions){
  return layers.filter(layer=>layer.on).flatMap(layer=>{
    const definition=definitions.find(item=>item.id===layer.id);
    if(!definition)return [];
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
