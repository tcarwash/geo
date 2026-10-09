import L from 'leaflet';
import {worldCopies} from './worldCopies.js';
const text=s=>{const n=document.createElement('span');n.textContent=s;return n};
export function attachCustomLayer(map,definition,pane,onStatus){
 const options={pane,attribution:text(definition.attribution).innerHTML,pmIgnore:true};
 let layer;
 if(definition.kind==='geojson'){
  layer=L.geoJSON(worldCopies(definition.data),{...options,style:{color:definition.color,weight:1.5,fillOpacity:.15},pointToLayer:(f,ll)=>L.circleMarker(ll,{...options,radius:4,color:definition.color}),onEachFeature:(f,l)=>l.bindTooltip(text(f.properties?.name||definition.name))});
 }else if(definition.kind==='wms')layer=L.tileLayer.wms(definition.url,{...options,layers:definition.wmsLayers,format:'image/png',transparent:true,version:'1.1.1',maxZoom:8});
 else layer=L.tileLayer(definition.url,{...options,maxZoom:8});
 let failed=false;
 layer.on('loading',()=>{failed=false;onStatus({loading:true,status:'loading'})});
 layer.on('tileerror',()=>{failed=true;onStatus({loading:false,status:'unavailable',error:'Some source tiles failed to load. Check the URL, coverage, and provider access.'})});
 layer.on('load',()=>{if(!failed)onStatus({loading:false,status:'reference'})});
 layer.addTo(map);if(definition.kind==='geojson')onStatus({loading:false,status:'user'});
 return ()=>{layer.off();map.removeLayer(layer)};
}
