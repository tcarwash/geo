import {greatCircle} from './core.js';
import {glyphSVG} from './mapGlyphs.js';
import {WORLD_OFFSETS,worldCopies} from './worldCopies.js';
const EVENT_COLORS={wildfires:'#ff8b61',volcanoes:'#c2a0ed',floods:'#6dbfe0','severe-storms':'#f1ca70','weather-alerts':'#f28a67'};
const EVENT_NAMES={wildfires:'Wildfire',volcanoes:'Volcanic event',floods:'Flood event','severe-storms':'Severe storm','weather-alerts':'Weather alert'};
const RADIO_COLORS={pskreporter:'#77d9c4',rbn:'#eed275','dx-cluster':'#c6a4ed',pota:'#a6d879',wsjtx:'#70cdb8',storms:'#ff886e','goes-track':'#9ad8ed'};
const ZONE_COLORS={'cq-zones':'#64bdd0','itu-zones':'#d48cce'};
const airQualityColor=value=>value<5?'#68b7a3':value<12?'#b7bd68':value<25?'#e6b45f':value<50?'#e78959':'#d96668';
const textNode=value=>{const node=document.createElement('span');node.textContent=String(value);return node};
const pointLabel=(id,p)=>p.label||p.activator||p.spotted||p.callsign||p.platform||p.name||p.place||p.headline||p.event||p.title||p.station||(['cq-zones','itu-zones'].includes(id)&&p.zoneNumber?`${id==='cq-zones'?'CQ':'ITU'} ${p.zoneNumber}`:null);
export const glyphIcon=(L,kind)=>L.divIcon({className:`map-glyph glyph-${kind}`,html:glyphSVG(kind),iconSize:[44,44],iconAnchor:[22,22]});
export function liveLayer(L,map,id,pane,onInspect){
 const group=L.layerGroup().addTo(map),features=new Map(),routes=L.layerGroup().addTo(group);let snapshot,labelsSnapshot;const animations=new Map();
 const inspect=layer=>{const f=layer.feature,p=f.properties||{};
 if(id==='air-quality')onInspect({kind:'CAMS global forecast cell',title:'PM2.5 sample',fields:[['PM2.5',`${p.pm2_5.toFixed(1)} μg/m³`],['PM10',p.pm10==null?'Unavailable':`${p.pm10.toFixed(1)} μg/m³`],['Model valid',p.validTime||'Time unavailable'],['Sampling','12° global overview cell']],source:'Open-Meteo · Copernicus CAMS Global'});
 if(id==='earthquakes')onInspect({kind:'Earthquake',title:p.place||'Earthquake',fields:[['Magnitude',`M ${p.mag}`],['Depth',`${f.geometry.coordinates[2]} km`],['Observed',new Date(p.time).toUTCString()]],source:'U.S. Geological Survey'});
 if(id==='satellite')onInspect({kind:'Satellite model',title:p.name||'ISS',fields:[['Altitude',`${p.altitudeKm??'—'} km`],['Orbital epoch',p.epoch||'Unavailable'],['Position','Calculated with SGP4']],source:'CelesTrak'});
 if(id==='goes-track')onInspect({kind:'Weather satellite',title:p.platform||p.name,fields:[['Image center',`${f.geometry.coordinates[1].toFixed(2)}°, ${f.geometry.coordinates[0].toFixed(2)}°`],['Image product',p.imageProduct],['Position update',new Date(p.positionTime).toUTCString()],['Orbital elements',p.epoch||'Unavailable']],source:'CelesTrak TLE · NOAA GOES'});
 if(id==='contacts')onInspect({kind:'Radio contact',title:p.callsign,fields:[['Band',p.band],['Mode',p.mode],['Contact',p.contactedAt],['Locator',p.remoteGrid]],source:'Your ADIF log'});
 if(id==='pskreporter')onInspect({kind:'PSK Reporter path',title:`${p.sender} → ${p.receiver}`,fields:[['Receiver grid',p.receiverLocator],['Frequency',p.frequencyHz?`${(p.frequencyHz/1e6).toFixed(3)} MHz`:'Unavailable'],['Observed',p.observedAt||'Time unavailable'],['Location precision',p.precision]],source:'PSK Reporter'});
 if(id==='rbn')onInspect({kind:'Reverse Beacon Network spot',title:`${p.spotter||'Spotter'} heard ${p.spotted}`,fields:[['Band frequency',p.frequencyKHz?`${p.frequencyKHz} kHz`:'Unavailable'],['Mode',p.mode||'—'],['SNR',p.snrDb==null?'—':`${p.snrDb} dB`],['Location precision',p.precision]],source:'Reverse Beacon Network via Vail ReRBN'});
 if(id==='dx-cluster')onInspect({kind:'DX Cluster spot',title:`${p.spotter||'Spotter'} → ${p.spotted||'DX'}`,fields:[['Frequency',p.frequencyKHz?`${p.frequencyKHz} kHz`:'Unavailable'],['Mode',p.mode||'—'],['Observed',p.observedAt||'Time unavailable'],['Location precision',p.precision]],source:'DX Cluster via jo30.de'});
 if(id==='pota')onInspect({kind:'POTA activation',title:`${p.activator||'Activator'} · ${p.reference||'Park'}`,fields:[['Park',p.park||'Unavailable'],['Region',p.region||'—'],['Frequency',p.frequencyMHz?`${p.frequencyMHz} MHz`:'Unavailable'],['Mode',p.mode||'—'],['Spotter',p.spotter||'—'],['Comments',p.comments||'—'],['Observed',p.observedAt||'Time unavailable'],['Location precision',p.precision]],source:'Parks on the Air'});
 if(id==='wsjtx')onInspect({kind:'WSJT-X heard station',title:p.callsign||'Heard station',fields:[['Maidenhead locator',p.locator||'Unavailable'],['Mode',p.mode||'—'],['SNR',p.snrDb==null?'—':`${p.snrDb} dB`],['Frequency',p.frequencyHz?`${(p.frequencyHz/1e6).toFixed(3)} MHz`:'Unavailable'],['Last decoded',p.observedAt||'Time unavailable'],['Location precision',p.precision]],source:'WSJT-X · local UDP decodes'});
 if(id==='cq-zones'||id==='itu-zones')onInspect({kind:'Amateur radio zone',title:`${id==='cq-zones'?'CQ':'ITU'} zone ${p.zoneNumber||'—'}`,fields:[['Zone',p.zoneName||'—']],source:'HB9HIL amateur-radio zone GeoJSON · MIT'});
 if(id==='storms')onInspect({kind:'Tropical storm track',title:p.name||'Active storm',fields:[['Classification',p.classification||'Unavailable'],['Maximum wind',p.windKnots?`${p.windKnots} kt`:'Unavailable'],['Pressure',p.pressureMb?`${p.pressureMb} mb`:'Unavailable'],['Advisory',p.observedAt||'Time unavailable']],source:'NOAA National Hurricane Center'});
 if(id==='weather-alerts')onInspect({kind:'National Weather Service alert',title:p.headline||p.event||'Active weather alert',fields:[['Severity',p.severity||'Unknown'],['Urgency',p.urgency||'Unknown'],['Certainty',p.certainty||'Unknown'],['Effective',p.effective||p.onset||'Time unavailable'],['Expires',p.expires||'Unknown'],...(typeof p.web==='string'&&p.web.startsWith('https://api.weather.gov/alerts/')?[['Official details',{href:p.web,label:'Open NWS alert'}]]:[])],source:'National Weather Service API'});
 if(EVENT_NAMES[id]&&id!=='weather-alerts')onInspect({kind:EVENT_NAMES[id],title:p.title||EVENT_NAMES[id],fields:[['Reported',p.date||'Time unavailable'],['Status',p.closed?'Closed':'Open'],['Description',p.description||'No additional details']],source:p.sources?.[0]?.url||'NASA EONET'});
 };
 return {dispose(){for(const frame of animations.values())cancelAnimationFrame(frame);animations.clear();group.clearLayers();map.removeLayer(group);features.clear();},update(data,showLabels=false){
  if(!data)return;const nextSnapshot=JSON.stringify(data),nextLabels=!!showLabels;if(snapshot===nextSnapshot&&labelsSnapshot===nextLabels)return;snapshot=nextSnapshot;labelsSnapshot=nextLabels;
  const retained=new Set();
  worldCopies({type:'FeatureCollection',features:data.features||[]}).features.forEach((f,index)=>{if(!f.geometry)return;const p=f.properties||{},g=f.geometry;
   const key=`${String(f.id??p.id??(id==='satellite'?`${p.catalogId}:${p.role}`:id==='aurora'?g.coordinates.join(','):index))}:${f.worldOffset}`;retained.add(key);
   let layer=features.get(key);
   if(!layer){
    if(g.type==='Point'){const ll=L.GeoJSON.coordsToLatLng(g.coordinates);
     if(id==='satellite')layer=L.marker(ll,{pane,icon:glyphIcon(L,'iss'),title:p.name||'International Space Station',pmIgnore:true});
     else if(id==='goes-track')layer=L.marker(ll,{pane,icon:glyphIcon(L,'goes'),title:`${p.platform||p.name} · image center`,pmIgnore:true});
     else if(id==='storms'&&p.stormId)layer=L.marker(ll,{pane,icon:glyphIcon(L,'storm'),title:p.name||'Tropical storm',pmIgnore:true});
     else layer=L.circleMarker(ll,{pane,pmIgnore:true,interactive:!p.zoneLabel});
    }else if(g.type==='MultiLineString'||g.type==='LineString')layer=L.polyline([],{pane,color:RADIO_COLORS[id]||'#a4ccee',weight:1.7,dashArray:'5 6',interactive:['pskreporter','rbn','dx-cluster','pota','storms'].includes(id),pmIgnore:true});
    else if(g.type==='Polygon'||g.type==='MultiPolygon')layer=L.polygon([],{pane,interactive:true,pmIgnore:true});
    else return;
    features.set(key,layer);layer.addTo(group);if((id!=='aurora'&&g.type==='Point'&&!p.zoneLabel)||EVENT_NAMES[id]||['air-quality','pskreporter','rbn','dx-cluster','pota','wsjtx','storms','cq-zones','itu-zones'].includes(id))layer.on('click',()=>inspect(layer));
   }
   layer.feature=f;
  if(g.type==='Point'){const target=L.GeoJSON.coordsToLatLng(g.coordinates),from=layer.getLatLng();if(id==='satellite'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&Math.abs(target.lng-from.lng)<180){if(animations.has(key))cancelAnimationFrame(animations.get(key));const began=performance.now();const step=now=>{const t=Math.min(1,(now-began)/800),ease=t*t*(3-2*t);layer.setLatLng([from.lat+(target.lat-from.lat)*ease,from.lng+(target.lng-from.lng)*ease]);if(t<1)animations.set(key,requestAnimationFrame(step));else animations.delete(key)};animations.set(key,requestAnimationFrame(step));}else layer.setLatLng(target);}else{const depth=g.type==='LineString'?0:['MultiLineString','Polygon'].includes(g.type)?1:2;layer.setLatLngs(L.GeoJSON.coordsToLatLngs(g.coordinates,depth));}
   if(id==='earthquakes'){layer.setRadius(Math.max(3,Math.min(18,(p.mag||0)*2)));layer.setStyle({color:'#ffe2ac',weight:1,fillColor:'#e7a05f',fillOpacity:.65});}
   if(id==='aurora'){layer.setRadius(3);layer.setStyle({stroke:false,fillColor:p.probability>50?'#b5a0dd':'#6cddb2',fillOpacity:Math.max(.1,p.probability/100),interactive:false});}
   if(id==='contacts'){layer.setRadius(4);layer.setStyle({radius:4,color:'#e7d493',weight:1,fillColor:'#d2c085',fillOpacity:.65});}
  if(id==='air-quality'&&g.type==='Polygon'){const color=airQualityColor(p.pm2_5);layer.setStyle({color,weight:.25,opacity:.5,fillColor:color,fillOpacity:.45});}
  if(['cq-zones','itu-zones'].includes(id)){const color=ZONE_COLORS[id];if(g.type==='Polygon'||g.type==='MultiPolygon')layer.setStyle({color,weight:.8,opacity:.8,fillColor:color,fillOpacity:.035});if(p.zoneLabel){layer.setRadius(1);layer.setStyle({color,weight:0,opacity:0,fillOpacity:0});}}
  if(g.type==='Point'&&!p.zoneLabel&&id==='pota'){layer.setRadius(5);layer.setStyle({color:RADIO_COLORS[id],weight:1.2,fillColor:RADIO_COLORS[id],fillOpacity:.8});}
  if(g.type==='Point'){
   const value=pointLabel(id,p);
   if(showLabels&&value){const node=textNode(value);if(id==='wsjtx'){node.setAttribute('role','button');node.setAttribute('tabindex','0');node.setAttribute('aria-label',`Inspect ${p.callsign||value}`);const inspectLabel=event=>{if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;if(event.type==='keydown')event.preventDefault();event.stopPropagation();inspect(layer)};node.addEventListener('click',inspectLabel);node.addEventListener('keydown',inspectLabel);}if(layer.getTooltip())layer.setTooltipContent(node);else layer.bindTooltip(node,{permanent:true,direction:'right',className:'map-point-label',opacity:.95,offset:[7,0],interactive:id==='wsjtx'});}
   else if(layer.getTooltip())layer.unbindTooltip();
  }
  if(['pskreporter','rbn','dx-cluster','pota','storms'].includes(id)&&g.type!=='Point')layer.setStyle({color:RADIO_COLORS[id],weight:id==='storms'?2.8:1.8,opacity:id==='storms'?.9:.72,dashArray:id==='dx-cluster'?'4 5':id==='storms'?'':'5 6'});
  if(['rbn','dx-cluster','pota'].includes(id)&&g.type==='Point'){layer.setRadius(id==='pota'?5:4);layer.setStyle({color:RADIO_COLORS[id],weight:1.2,fillColor:RADIO_COLORS[id],fillOpacity:.8});}
  if(id==='wsjtx'&&g.type==='Point'){layer.setRadius(7);layer.setStyle({color:'#d7fff0',weight:2,fillColor:RADIO_COLORS[id],fillOpacity:.95});}
  if(EVENT_NAMES[id]){const color=id==='weather-alerts'?({'Extreme':'#e45555','Severe':'#f28a67','Moderate':'#edc85b','Minor':'#72bf8b'}[p.severity]||EVENT_COLORS[id]):EVENT_COLORS[id];if(g.type==='Point')layer.setRadius(5);layer.setStyle({color,weight:1.5,fillColor:color,fillOpacity:g.type==='Point'?.75:.22});}
  });
  for(const [key,layer] of features)if(!retained.has(key)){if(animations.has(key)){cancelAnimationFrame(animations.get(key));animations.delete(key)}group.removeLayer(layer);features.delete(key)}
  if(id==='contacts'){routes.clearLayers();(data.features||[]).filter(f=>f.geometry?.type==='Point'&&f.properties?.localCoordinates).slice(0,250).forEach(f=>WORLD_OFFSETS.forEach(offset=>greatCircle(f.properties.localCoordinates,f.geometry.coordinates).forEach(path=>L.polyline(path.map(([lng,lat])=>[lat,lng+offset]),{pane,color:'#d7c58b',weight:1,opacity:.35,interactive:false,pmIgnore:true}).addTo(routes))));}
 }};
}
