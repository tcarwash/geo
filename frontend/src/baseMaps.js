const gibs=product=>`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product}/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`;
export const BASE_MAPS=[
 {id:'atlas',name:'Political Atlas',description:'Colored countries · offline',icon:'Globe2'},
 {id:'grayscale',name:'Grayscale',description:'Quiet reference · offline',icon:'Globe2'},
 {id:'relief',name:'Relief',description:'Terrain & ocean bathymetry',icon:'Layers3',url:gibs('BlueMarble_ShadedRelief_Bathymetry'),attribution:'NASA EOSDIS GIBS · Blue Marble shaded relief and bathymetry'},
 {id:'blue-marble',name:'Blue Marble',description:'Static satellite composite',icon:'Globe2',url:gibs('BlueMarble_NextGeneration'),attribution:'NASA EOSDIS GIBS · Blue Marble Next Generation'},
];
// Keep the current base visible while a replacement is loading.
export function baseMapController(map,createTiles,applyPolitical,onStatus){
 let active=null,pending=null,generation=0;
 const remove=entry=>{if(entry){entry.layer.off();map.removeLayer(entry.layer)}};
 return {select(definition){const run=++generation;remove(pending);pending=null;
  if(!definition.url){applyPolitical(definition.id);remove(active);active=null;onStatus({status:'reference',loading:false});return;}
  if(active?.id===definition.id){applyPolitical(definition.id);return;}
  const layer=createTiles(definition);pending={id:definition.id,layer};let failed=false;
  layer.on('tileerror',()=>{failed=true;if(generation===run)onStatus({status:'unavailable',loading:false,error:'Base imagery is unavailable in part of this view. The previous base remains visible.'})});
  layer.on('load',()=>{if(generation!==run||failed||active?.layer===layer)return;applyPolitical(definition.id);layer.setOpacity(1);remove(active);active={id:definition.id,layer};pending=null;onStatus({status:'reference',loading:false});});
  onStatus({loading:true,status:'loading'});layer.addTo(map);
 },dispose(){generation++;remove(pending);remove(active);pending=active=null}};
}
