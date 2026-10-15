import L from 'leaflet';
import {worldCopies} from './worldCopies.js';
import {contrastInfraredPixels} from './infraredContrast.js';
const text=s=>{const n=document.createElement('span');n.textContent=s;return n};
function cloudLayer(definition,options,pane){
 const layer=L.tileLayer.wms(definition.url,{...options,pane,attribution:text(definition.attribution||options.attribution).innerHTML,layers:definition.wmsLayers,...(definition.wmsTime?{time:definition.wmsTime}:{}),...(definition.crs?{crs:definition.crs}:{}),format:'image/png',transparent:true,version:'1.1.1',maxZoom:8});
 const getTileUrl=layer.getTileUrl.bind(layer);layer.getTileUrl=coords=>getTileUrl(coords).replace(/(format=)image%2fpng/i,'$1image/png');
 layer.options.crossOrigin='anonymous';
 layer.createTile=(coords,done)=>{
  const tile=document.createElement('canvas');tile.width=tile.height=256;
  const image=new Image();image.crossOrigin='anonymous';
  image.onload=()=>{try{const ctx=tile.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,256,256);const pixels=ctx.getImageData(0,0,256,256),data=pixels.data;for(let i=0;i<data.length;i+=4){const y=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2],saturation=Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2]);const cloud=Math.max(0,Math.min(1,(y-112)/92));data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(data[i+3]*cloud*(saturation>70?.8:1));}ctx.putImageData(pixels,0,0);done(null,tile);}catch(error){done(error,tile);}};
  image.onerror=()=>done(new Error('Cloud image tile failed to load'),tile);image.src=layer.getTileUrl(coords);return tile;
 };
 return layer;
}
function attachCloudSources(map,definitions,options,onStatus){
 const layers=definitions.map(definition=>cloudLayer(definition,options,options.pane));
 let failed=false;
 layers.forEach(layer=>{
  layer.on('loading',()=>{failed=false;onStatus({loading:true,status:'loading'})});
  layer.on('tileerror',()=>{failed=true;onStatus({loading:false,status:'unavailable',error:'Some cloud source tiles failed to load. Check provider access and coverage.'})});
  layer.on('load',()=>{if(!failed)onStatus({loading:false,status:'reference'})});
  layer.addTo(map);
 });
 const timers=definitions.map((definition,index)=>definition.refreshMs?setInterval(()=>layers[index].redraw(),definition.refreshMs):null);
 return ()=>{timers.forEach(timer=>{if(timer)clearInterval(timer)});layers.forEach(layer=>{layer.off();map.removeLayer(layer)})};
}
export function attachCustomLayer(map,definition,pane,onStatus){
 const options={pane,attribution:text(definition.attribution).innerHTML,pmIgnore:true};
 let layer;
 if(definition.kind==='cloud-wms'&&definition.sources?.length)return attachCloudSources(map,definition.sources,{...options,pane},onStatus);
 if(definition.kind==='image'){
  const layers=[-720,-360,0,360,720].map(offset=>L.imageOverlay(definition.url,definition.bounds.map(([lat,lon])=>[lat,lon+offset]),{...options,interactive:false}).addTo(map));
  let failures=false;layers.forEach(layer=>{layer.on('error',()=>{failures=true;onStatus({status:'unavailable',error:'Reference image could not be loaded.'})});layer.on('load',()=>{if(!failures)onStatus({loading:false,status:'current'})})});
  return()=>layers.forEach(layer=>{layer.off();map.removeLayer(layer)});
 }
 if(definition.kind==='geojson'){
  layer=L.geoJSON(worldCopies(definition.data),{...options,style:{color:definition.color,weight:1.5,fillOpacity:.15},pointToLayer:(f,ll)=>L.circleMarker(ll,{...options,radius:4,color:definition.color}),onEachFeature:(f,l)=>l.bindTooltip(text(f.properties?.name||definition.name))});
 }else if(definition.kind==='wms'||definition.kind==='cloud-wms'||definition.kind==='contrast-wms'||definition.kind==='night-lights-wms'){
  layer=L.tileLayer.wms(definition.url,{...options,layers:definition.wmsLayers,...(definition.wmsTime?{time:definition.wmsTime}:{}),...(definition.crs?{crs:definition.crs}:{}),format:'image/png',transparent:true,version:'1.1.1',maxZoom:8});
  if(definition.kind==='cloud-wms'){
   return attachCloudSources(map,[definition],options,onStatus);
  }
  if(definition.kind==='contrast-wms'||definition.kind==='night-lights-wms'){
   layer.options.crossOrigin='anonymous';
   layer.createTile=(coords,done)=>{const tile=document.createElement('canvas');tile.width=tile.height=256;const image=new Image();image.crossOrigin='anonymous';image.onload=()=>{try{const ctx=tile.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,256,256);const pixels=ctx.getImageData(0,0,256,256);if(definition.kind==='night-lights-wms'){const data=pixels.data;for(let i=0;i<data.length;i+=4){const brightness=Math.max(data[i],data[i+1],data[i+2]);data[i+3]=Math.round(data[i+3]*Math.max(0,Math.min(1,(brightness-4)/60)));}}else contrastInfraredPixels(pixels.data);ctx.putImageData(pixels,0,0);done(null,tile)}catch(error){done(error,tile)}};image.onerror=()=>done(new Error(definition.kind==='night-lights-wms'?'NASA night-light tile failed to load':'EUMETSAT infrared tile failed to load'),tile);image.src=layer.getTileUrl(coords);return tile};
  }
  const getTileUrl=layer.getTileUrl.bind(layer);
  layer.getTileUrl=coords=>getTileUrl(coords).replace(/(format=)image%2fpng/i,'$1image/png');
 }
 else layer=L.tileLayer(definition.url,{...options,maxZoom:8});
 let failed=false;
 layer.on('loading',()=>{failed=false;onStatus({loading:true,status:'loading'})});
 layer.on('tileerror',()=>{failed=true;onStatus({loading:false,status:'unavailable',error:'Some source tiles failed to load. Check the URL, coverage, and provider access.'})});
 layer.on('load',()=>{if(!failed)onStatus({loading:false,status:'reference'})});
 layer.addTo(map);if(definition.kind==='geojson')onStatus({loading:false,status:'user'});
 const refresh=definition.refreshMs?setInterval(()=>layer.redraw(),definition.refreshMs):null;
 return ()=>{if(refresh)clearInterval(refresh);layer.off();map.removeLayer(layer)};
}
