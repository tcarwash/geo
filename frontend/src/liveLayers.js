import {additionalInspection} from './additionalLayers.js';
import {greatCircle} from './core.js';
import {glyphSVG} from './mapGlyphs.js';
import {WORLD_OFFSETS,worldCopies} from './worldCopies.js';
const EVENT_COLORS={wildfires:'#ff8b61',volcanoes:'#c2a0ed',floods:'#6dbfe0','severe-storms':'#f1ca70','weather-alerts':'#f28a67'};
const EVENT_NAMES={wildfires:'Wildfire',volcanoes:'Volcanic event',floods:'Flood event','severe-storms':'Severe storm','weather-alerts':'Weather alert'};
const RADIO_COLORS={pskreporter:'#77d9c4',rbn:'#eed275','dx-cluster':'#c6a4ed',wspr:'#8fd4ed',pota:'#a6d879',wsjtx:'#70cdb8',storms:'#ff886e','goes-track':'#9ad8ed'};
const ZONE_COLORS={'cq-zones':'#64bdd0','itu-zones':'#d48cce'};
const airQualityColor=value=>value<5?'#68b7a3':value<12?'#b7bd68':value<25?'#e6b45f':value<50?'#e78959':'#d96668';
const textNode=value=>{const node=document.createElement('span');node.textContent=String(value);return node};
const pointLabel=(id,p)=>p.label||p.activator||p.spotted||p.callsign||p.platform||p.name||p.place||p.headline||p.event||p.title||p.station||(['cq-zones','itu-zones'].includes(id)&&p.zoneNumber?`${id==='cq-zones'?'CQ':'ITU'} ${p.zoneNumber}`:null);
export const glyphIcon=(L,kind)=>L.divIcon({className:`map-glyph glyph-${kind}`,html:glyphSVG(kind),iconSize:[44,44],iconAnchor:[22,22]});
export const aircraftIcon=(L,heading)=>L.divIcon({className:'map-glyph glyph-aircraft',html:`<span style="transform:rotate(${Number.isFinite(heading)?heading:0}deg)">${glyphSVG('aircraft')}</span>`,iconSize:[24,24],iconAnchor:[12,12]});
export function liveLayer(L,map,id,pane,onInspect){
 const group=L.layerGroup().addTo(map),features=new Map(),routes=L.layerGroup().addTo(group);let snapshot,labelsSnapshot;const animations=new Map();
 const inspect=layer=>{const f=layer.feature,p=f.properties||{};
 const additional=additionalInspection(id,f);if(additional)onInspect(additional);
 if(id==='air-traffic')onInspect({kind:'Aircraft observation',title:p.callsign||p.icao,fields:[['ICAO',p.icao],['Registration',p.registration||'Unavailable'],['Aircraft type',p.aircraftType||'Unavailable'],['Barometric altitude',p.altitudeFt==null?'Unavailable':`${p.altitudeFt.toLocaleString()} ft`],['Ground speed',p.groundSpeedKt==null?'Unavailable':`${Math.round(p.groundSpeedKt)} kt`],['True track',p.heading==null?'Unavailable':`${Math.round(p.heading)}°`],['Position observed',p.observedAt||'Time unavailable'],['Position source',p.positionSource||'Unavailable']],source:'ADSB.lol · ODbL 1.0'});
 if(id==='air-routes')onInspect({kind:'Historical airline connection',title:p.name,fields:[['From',`${p.fromAirport} · ${p.fromCity}`],['To',`${p.toAirport} · ${p.toCity}`],['Airlines in snapshot',p.airlineCount],['Reference date',p.referenceVintage],['Geometry','Great-circle connection; not a flown track']],source:'OpenFlights · ODbL 1.0'});
 if(id==='sea-routes')onInspect({kind:'Shipping corridor reference',title:p.name,fields:[['Category',p.category],['Reference',p.referenceVintage],['Geometry','Schematic corridor; not for navigation']],source:'P. Benden / CIA · custom CC BY 4.0 (excluding Statista)'});
 if(id==='air-quality')onInspect({kind:'CAMS global forecast cell',title:'PM2.5 sample',fields:[['PM2.5',`${p.pm2_5.toFixed(1)} μg/m³`],['PM10',p.pm10==null?'Unavailable':`${p.pm10.toFixed(1)} μg/m³`],['Model valid',p.validTime||'Time unavailable'],['Sampling','12° global overview cell']],source:'Open-Meteo · Copernicus CAMS Global'});
 if(id==='earthquakes')onInspect({kind:'Earthquake',title:p.place||'Earthquake',fields:[['Magnitude',`M ${p.mag}`],['Depth',`${f.geometry.coordinates[2]} km`],['Observed',new Date(p.time).toUTCString()]],source:'U.S. Geological Survey'});
 if(id==='satellite')onInspect({kind:'Satellite model',title:p.name||'ISS',fields:[['Altitude',`${p.altitudeKm??'—'} km`],['Orbital epoch',p.epoch||'Unavailable'],['Position','Calculated with SGP4']],source:'CelesTrak'});
 if(id==='goes-track')onInspect({kind:'Weather satellite',title:p.platform||p.name,fields:[['Image center',`${f.geometry.coordinates[1].toFixed(2)}°, ${f.geometry.coordinates[0].toFixed(2)}°`],['Image product',p.imageProduct],['Position update',new Date(p.positionTime).toUTCString()],['Orbital elements',p.epoch||'Unavailable']],source:'CelesTrak TLE · NOAA GOES'});
 if(id==='contacts')onInspect({kind:'Radio contact',title:p.callsign,fields:[['Band',p.band],['Mode',p.mode],['Contact',p.contactedAt],['Locator',p.remoteGrid]],source:'Your ADIF log'});
 if(id==='pskreporter')onInspect({kind:'PSK Reporter path',title:`${p.sender} → ${p.receiver}`,fields:[['Receiver grid',p.receiverLocator],['Frequency',p.frequencyHz?`${(p.frequencyHz/1e6).toFixed(3)} MHz`:'Unavailable'],['Observed',p.observedAt||'Time unavailable'],['Location precision',p.precision]],source:'PSK Reporter'});
 if(id==='rbn')onInspect({kind:'Reverse Beacon Network spot',title:`${p.spotter||'Spotter'} heard ${p.spotted}`,fields:[['Band frequency',p.frequencyKHz?`${p.frequencyKHz} kHz`:'Unavailable'],['Mode',p.mode||'—'],['SNR',p.snrDb==null?'—':`${p.snrDb} dB`],['Location precision',p.precision]],source:'Reverse Beacon Network via Vail ReRBN'});
 if(id==='dx-cluster')onInspect({kind:'DX Cluster spot',title:`${p.spotter||'Spotter'} → ${p.spotted||'DX'}`,fields:[['Frequency',p.frequencyKHz?`${p.frequencyKHz} kHz`:'Unavailable'],['Mode',p.mode||'—'],['Observed',p.observedAt||'Time unavailable'],['Location precision',p.precision]],source:'DX Cluster via jo30.de'});
 if(id==='wspr')onInspect({kind:'WSPR propagation report',title:`${p.transmitter} → ${p.receiver}`,fields:[['Band',p.band||'Unavailable'],['Frequency',p.frequencyHz?`${(p.frequencyHz/1e6).toFixed(6)} MHz`:'Unavailable'],['Distance',p.distanceKm==null?'Unavailable':`${p.distanceKm.toLocaleString()} km`],['Received SNR',p.snrDb==null?'Unavailable':`${p.snrDb} dB`],['Reported power',p.powerDbm==null?'Unavailable':`${p.powerDbm} dBm`],['Transmitter grid',p.transmitterLocator||'Unavailable'],['Receiver grid',p.receiverLocator||'Unavailable'],['Reported',p.observedAt||'Time unavailable'],['Location precision',p.precision]],source:'WSPRnet via wspr.live'});
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
     if(id==='air-traffic')layer=L.marker(ll,{pane,icon:aircraftIcon(L,p.heading),title:p.callsign||p.icao,pmIgnore:true});
     else if(id==='satellite')layer=L.marker(ll,{pane,icon:glyphIcon(L,'iss'),title:p.name||'International Space Station',pmIgnore:true});
     else if(id==='goes-track')layer=L.marker(ll,{pane,icon:glyphIcon(L,'goes'),title:`${p.platform||p.name} · image center`,pmIgnore:true});
     else if(id==='storms'&&p.stormId)layer=L.marker(ll,{pane,icon:glyphIcon(L,'storm'),title:p.name||'Tropical storm',pmIgnore:true});
     else layer=L.circleMarker(ll,{pane,pmIgnore:true,interactive:!p.zoneLabel});
    }else if(g.type==='MultiLineString'||g.type==='LineString')layer=L.polyline([],{pane,color:RADIO_COLORS[id]||'#a4ccee',weight:1.7,dashArray:'5 6',interactive:['rivers','submarine-cables','tectonic-plates','air-routes','sea-routes','pskreporter','rbn','dx-cluster','wspr','pota','storms'].includes(id),pmIgnore:true});
    else if(g.type==='Polygon'||g.type==='MultiPolygon')layer=L.polygon([],{pane,interactive:true,pmIgnore:true});
    else return;
   features.set(key,layer);layer.addTo(group);if((id!=='aurora'&&g.type==='Point'&&!p.zoneLabel)||EVENT_NAMES[id]||['rivers','lakes','glotec','submarine-cables','tectonic-plates','air-routes','sea-routes','air-quality','pskreporter','rbn','dx-cluster','wspr','pota','wsjtx','storms','cq-zones','itu-zones'].includes(id))layer.on('click',()=>inspect(layer));
   }
   layer.feature=f;
  if(g.type==='Point'){const target=L.GeoJSON.coordsToLatLng(g.coordinates),from=layer.getLatLng();if(id==='satellite'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&Math.abs(target.lng-from.lng)<180){if(animations.has(key))cancelAnimationFrame(animations.get(key));const began=performance.now();const step=now=>{const t=Math.min(1,(now-began)/800),ease=t*t*(3-2*t);layer.setLatLng([from.lat+(target.lat-from.lat)*ease,from.lng+(target.lng-from.lng)*ease]);if(t<1)animations.set(key,requestAnimationFrame(step));else animations.delete(key)};animations.set(key,requestAnimationFrame(step));}else layer.setLatLng(target);}else{const depth=g.type==='LineString'?0:['MultiLineString','Polygon'].includes(g.type)?1:2;layer.setLatLngs(L.GeoJSON.coordsToLatLngs(g.coordinates,depth));}
   if(['airports','ports'].includes(id)){layer.setRadius(3.5);layer.setStyle({color:id==='airports'?'#eec780':'#74cdbb',weight:1,fillColor:id==='airports'?'#eec780':'#74cdbb',fillOpacity:.8});}
   if(id==='rivers')layer.setStyle({color:'#83c6e1',weight:1.2,opacity:.8,dashArray:''});
   if(id==='lakes')layer.setStyle({color:'#6eaecd',weight:.7,fillColor:'#6eaecd',fillOpacity:.65});
   if(id==='tectonic-plates'&&p.recordType==='plate'){
    const colors=['#587c91','#886b93','#777c5e','#916e73','#548488','#858064','#696d9d','#798b76'];
    const index=[...String(p.plateCode||'')].reduce((sum,char)=>sum+char.charCodeAt(0),0)%colors.length;
    layer.setStyle({color:colors[index],weight:.7,opacity:.65,fillColor:colors[index],fillOpacity:.045,dashArray:''});
   }
   if(id==='tectonic-plates'&&p.recordType==='boundary'){
    const type=String(p.boundaryType||'').toLowerCase();
    const color=type.includes('subduct')?'#ed9b79':type.includes('ridge')||type.includes('diverg')?'#70c9bd':type.includes('transform')?'#e0c77d':'#c6a5df';
    layer.setStyle({color,weight:1.6,opacity:.9,dashArray:'',fillOpacity:0});
   }
   if(id==='submarine-cables')layer.setStyle({color:'#d2a6ed',weight:1.6,opacity:.8,dashArray:'3 3'});
   if(id==='glotec')layer.setStyle({color:p.tec<10?'#647ac2':p.tec<30?'#8fc7cf':p.tec<60?'#e4c27b':'#da777d',weight:0,fillColor:p.tec<10?'#647ac2':p.tec<30?'#8fc7cf':p.tec<60?'#e4c27b':'#da777d',fillOpacity:.55});
   if(id==='air-traffic')layer.setIcon(aircraftIcon(L,p.heading));
   if(id==='air-routes')layer.setStyle({color:'#8bcce5',weight:1,opacity:.6,dashArray:''});
   if(id==='sea-routes')layer.setStyle({color:'#74cdbb',weight:{Major:2.2,Middle:1.4,Minor:.8}[p.category]||1,opacity:.8,dashArray:p.category==='Minor'?'3 5':''});
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
  if(['pskreporter','rbn','dx-cluster','wspr','pota','storms'].includes(id)&&g.type!=='Point')layer.setStyle({color:RADIO_COLORS[id],weight:id==='storms'?2.8:id==='wspr'?1.45:1.8,opacity:id==='storms'?.9:id==='wspr'?.62:.72,dashArray:id==='dx-cluster'?'4 5':id==='storms'||id==='wspr'?'':'5 6'});
  if(['rbn','dx-cluster','pota'].includes(id)&&g.type==='Point'){layer.setRadius(id==='pota'?5:4);layer.setStyle({color:RADIO_COLORS[id],weight:1.2,fillColor:RADIO_COLORS[id],fillOpacity:.8});}
  if(id==='wsjtx'&&g.type==='Point'){layer.setRadius(7);layer.setStyle({color:'#d7fff0',weight:2,fillColor:RADIO_COLORS[id],fillOpacity:.95});}
  if(EVENT_NAMES[id]){const color=id==='weather-alerts'?({'Extreme':'#e45555','Severe':'#f28a67','Moderate':'#edc85b','Minor':'#72bf8b'}[p.severity]||EVENT_COLORS[id]):EVENT_COLORS[id];if(g.type==='Point')layer.setRadius(5);layer.setStyle({color,weight:1.5,fillColor:color,fillOpacity:g.type==='Point'?.75:.22});}
  });
  for(const [key,layer] of features)if(!retained.has(key)){if(animations.has(key)){cancelAnimationFrame(animations.get(key));animations.delete(key)}group.removeLayer(layer);features.delete(key)}
  if(id==='air-traffic'&&data.center){routes.clearLayers();WORLD_OFFSETS.forEach(offset=>L.circle([data.center[1],data.center[0]+offset],{pane,radius:data.radiusNm*1852,color:'#f1c779',weight:1,opacity:.45,fill:false,dashArray:'5 7',interactive:false,pmIgnore:true}).addTo(routes));}
  if(id==='contacts'){routes.clearLayers();(data.features||[]).filter(f=>f.geometry?.type==='Point'&&f.properties?.localCoordinates).slice(0,250).forEach(f=>WORLD_OFFSETS.forEach(offset=>greatCircle(f.properties.localCoordinates,f.geometry.coordinates).forEach(path=>L.polyline(path.map(([lng,lat])=>[lat,lng+offset]),{pane,color:'#d7c58b',weight:1,opacity:.35,interactive:false,pmIgnore:true}).addTo(routes))));}
 }};
}
