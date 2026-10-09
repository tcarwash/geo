import {greatCircle} from './core.js';
import {glyphSVG} from './mapGlyphs.js';
import {WORLD_OFFSETS,worldCopies} from './worldCopies.js';
const EVENT_COLORS={wildfires:'#ff8b61',volcanoes:'#c2a0ed',floods:'#6dbfe0','severe-storms':'#f1ca70'};
const EVENT_NAMES={wildfires:'Wildfire',volcanoes:'Volcanic event',floods:'Flood event','severe-storms':'Severe storm'};
export const glyphIcon=(L,kind)=>L.divIcon({className:`map-glyph glyph-${kind}`,html:glyphSVG(kind),iconSize:[44,44],iconAnchor:[22,22]});
export function liveLayer(L,map,id,pane,onInspect){
 const group=L.layerGroup().addTo(map),features=new Map(),routes=L.layerGroup().addTo(group);let snapshot;const animations=new Map();
 const inspect=layer=>{const f=layer.feature,p=f.properties||{};
 if(id==='earthquakes')onInspect({kind:'Earthquake',title:p.place||'Earthquake',fields:[['Magnitude',`M ${p.mag}`],['Depth',`${f.geometry.coordinates[2]} km`],['Observed',new Date(p.time).toUTCString()]],source:'U.S. Geological Survey'});
 if(id==='satellite')onInspect({kind:'Satellite model',title:p.name||'ISS',fields:[['Altitude',`${p.altitudeKm??'—'} km`],['Orbital epoch',p.epoch||'Unavailable'],['Position','Calculated with SGP4']],source:'CelesTrak'});
 if(id==='contacts')onInspect({kind:'Radio contact',title:p.callsign,fields:[['Band',p.band],['Mode',p.mode],['Contact',p.contactedAt],['Locator',p.remoteGrid]],source:'Your ADIF log'});
 if(EVENT_NAMES[id])onInspect({kind:EVENT_NAMES[id],title:p.title||EVENT_NAMES[id],fields:[['Reported',p.date||'Time unavailable'],['Status',p.closed?'Closed':'Open'],['Description',p.description||'No additional details']],source:p.sources?.[0]?.url||'NASA EONET'});
 };
 return {dispose(){for(const frame of animations.values())cancelAnimationFrame(frame);animations.clear();group.clearLayers();map.removeLayer(group);features.clear();},update(data){
  if(!data)return;const nextSnapshot=JSON.stringify(data);if(snapshot===nextSnapshot)return;snapshot=nextSnapshot;
  const retained=new Set();
  worldCopies({type:'FeatureCollection',features:data.features||[]}).features.forEach((f,index)=>{if(!f.geometry)return;const p=f.properties||{},g=f.geometry;
   const key=`${String(f.id??p.id??(id==='satellite'?`${p.catalogId}:${p.role}`:id==='aurora'?g.coordinates.join(','):index))}:${f.worldOffset}`;retained.add(key);
   let layer=features.get(key);
   if(!layer){
    if(g.type==='Point'){const ll=L.GeoJSON.coordsToLatLng(g.coordinates);
     if(id==='satellite')layer=L.marker(ll,{pane,icon:glyphIcon(L,'iss'),title:p.name||'International Space Station',pmIgnore:true});
     else layer=L.circleMarker(ll,{pane,pmIgnore:true});
    }else if(g.type==='MultiLineString'||g.type==='LineString')layer=L.polyline([],{pane,color:'#a4ccee',weight:1.7,dashArray:'5 6',interactive:false,pmIgnore:true});
    else if(g.type==='Polygon'||g.type==='MultiPolygon')layer=L.polygon([],{pane,interactive:true,pmIgnore:true});
    else return;
    features.set(key,layer);layer.addTo(group);if((id!=='aurora'&&g.type==='Point')||EVENT_NAMES[id])layer.on('click',()=>inspect(layer));
   }
   layer.feature=f;
  if(g.type==='Point'){const target=L.GeoJSON.coordsToLatLng(g.coordinates),from=layer.getLatLng();if(id==='satellite'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&Math.abs(target.lng-from.lng)<180){if(animations.has(key))cancelAnimationFrame(animations.get(key));const began=performance.now();const step=now=>{const t=Math.min(1,(now-began)/800),ease=t*t*(3-2*t);layer.setLatLng([from.lat+(target.lat-from.lat)*ease,from.lng+(target.lng-from.lng)*ease]);if(t<1)animations.set(key,requestAnimationFrame(step));else animations.delete(key)};animations.set(key,requestAnimationFrame(step));}else layer.setLatLng(target);}else{const depth=g.type==='LineString'?0:['MultiLineString','Polygon'].includes(g.type)?1:2;layer.setLatLngs(L.GeoJSON.coordsToLatLngs(g.coordinates,depth));}
   if(id==='earthquakes'){layer.setRadius(Math.max(3,Math.min(18,(p.mag||0)*2)));layer.setStyle({color:'#ffe2ac',weight:1,fillColor:'#e7a05f',fillOpacity:.65});}
   if(id==='aurora'){layer.setRadius(3);layer.setStyle({stroke:false,fillColor:p.probability>50?'#b5a0dd':'#6cddb2',fillOpacity:Math.max(.1,p.probability/100),interactive:false});}
   if(id==='contacts'){layer.setRadius(4);layer.setStyle({radius:4,color:'#e7d493',weight:1,fillColor:'#d2c085',fillOpacity:.65});}
  if(EVENT_NAMES[id]){const color=EVENT_COLORS[id];if(g.type==='Point')layer.setRadius(5);layer.setStyle({color,weight:1.5,fillColor:color,fillOpacity:g.type==='Point'?.75:.22});}
  });
  for(const [key,layer] of features)if(!retained.has(key)){if(animations.has(key)){cancelAnimationFrame(animations.get(key));animations.delete(key)}group.removeLayer(layer);features.delete(key)}
  if(id==='contacts'){routes.clearLayers();(data.features||[]).filter(f=>f.geometry?.type==='Point'&&f.properties?.localCoordinates).slice(0,250).forEach(f=>WORLD_OFFSETS.forEach(offset=>greatCircle(f.properties.localCoordinates,f.geometry.coordinates).forEach(path=>L.polyline(path.map(([lng,lat])=>[lat,lng+offset]),{pane,color:'#d7c58b',weight:1,opacity:.35,interactive:false,pmIgnore:true}).addTo(routes))));}
 }};
}
