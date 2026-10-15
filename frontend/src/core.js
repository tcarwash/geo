import {ADDITIONAL_LAYERS} from './additionalLayers.js';
import {BASE_MAPS} from './baseMaps.js';
import {imageryDate,yesterday} from './imagery.js';
export const RAD = Math.PI / 180;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function sunPosition(date) {
  const d = date.getTime() / 86400000 - 10957.5;
  const g = (357.529 + .98560028 * d) * RAD;
  const lambda = (280.459 + .98564736 * d + 1.915 * Math.sin(g) + .02 * Math.sin(2*g)) * RAD;
  const e = (23.439 - .00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e)*Math.sin(lambda), Math.cos(lambda)) / RAD;
  const dec = Math.asin(Math.sin(e)*Math.sin(lambda)) / RAD;
  const gmst = 280.46061837 + 360.98564736629*d;
  return {lat: dec, lng: ((ra-gmst)%360+540)%360-180};
}
export function locator(lat, lng) {
  let x = clamp(lng+180,0,359.999999), y=clamp(lat+90,0,179.999999);
  let r=String.fromCharCode(65+Math.floor(x/20),65+Math.floor(y/10)); x%=20; y%=10;
  r+=`${Math.floor(x/2)}${Math.floor(y)}`;
  return r+String.fromCharCode(97+Math.floor((x%2)*12),97+Math.floor((y%1)*24));
}
export const dateLabel = date => new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}).format(date);
export const timeLabel = (date,zone='UTC',seconds=false) => new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{}),hour12:false,timeZone:zone}).format(date);
export function ageLabel(value) { if(!value)return 'Time unavailable'; const n=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));return n<1?'Just now':n<60?`${n} min ago`:n<1440?`${Math.floor(n/60)} hr ago`:`${Math.floor(n/1440)} days ago`; }
export const LAYERS = [
 ...ADDITIONAL_LAYERS,
 {id:'air-traffic',name:'Air traffic',subtitle:'ADSB.lol · regional live positions',icon:'Plane',color:'#f1c779',on:false,opacity:.95},
 {id:'air-routes',name:'Air routes · 2014',subtitle:'OpenFlights · historical global connections',icon:'Route',color:'#8bcce5',on:false,opacity:.6},
 {id:'sea-routes',name:'Sea routes',subtitle:'Global shipping corridors · 2012 reference',icon:'Ship',color:'#74cdbb',on:false,opacity:.8},
 {id:'imagery',name:'Satellite true color',subtitle:'NASA GIBS · dated imagery',icon:'Layers3',color:'#84cfce',on:false,opacity:.7,date:yesterday()},
 {id:'night',name:'Day & night',subtitle:'Solar terminator · computed',icon:'Sun',color:'#e1c77a',on:true,opacity:.78},
 {id:'graticule',name:'Geographic grid',subtitle:'Latitude & longitude · reference',icon:'Grid3X3',color:'#89b3bc',on:true,opacity:.28},
 {id:'dateline',name:'International Date Line',subtitle:'Approximate · 180° meridian',icon:'Clock',color:'#e0c77f',on:false,opacity:.9},
 {id:'air-quality',name:'Air quality · PM2.5',subtitle:'CAMS global · coarse sampled forecast',icon:'Wind',color:'#f09a68',on:false,opacity:.46},
 {id:'earthquakes',name:'Earthquakes',subtitle:'USGS · observed',icon:'Activity',color:'#edaa69',on:false,opacity:.9},
 {id:'wildfires',name:'Wildfires',subtitle:'NASA EONET · active events',icon:'Flame',color:'#ff8b61',on:false,opacity:.9},
 {id:'volcanoes',name:'Volcanic activity',subtitle:'NASA EONET · active events',icon:'Mountain',color:'#c2a0ed',on:false,opacity:.9},
 {id:'floods',name:'Floods',subtitle:'NASA EONET · active events',icon:'Waves',color:'#6dbfe0',on:false,opacity:.9},
 {id:'severe-storms',name:'Severe storms',subtitle:'NASA EONET · active events',icon:'TriangleAlert',color:'#f1ca70',on:false,opacity:.9},
 {id:'weather-alerts',name:'Active weather alerts',subtitle:'National Weather Service · United States',icon:'TriangleAlert',color:'#f28a67',on:false,opacity:.82},
 {id:'aurora',name:'Aurora forecast',subtitle:'NOAA SWPC · model',icon:'Waves',color:'#78cfab',on:false,opacity:.55},
 {id:'satellite',name:'International Space Station',subtitle:'CelesTrak · SGP4 model',icon:'Satellite',color:'#9bbfed',on:false,opacity:.9},
 {id:'goes-track',name:'GOES satellite positions',subtitle:'GOES-19 / GOES-18 · orbital model',icon:'Satellite',color:'#9ad8ed',on:false,opacity:.95},
 {id:'maidenhead',name:'Maidenhead grid',subtitle:'Amateur radio · reference',icon:'Radio',color:'#c8a8d7',on:false,opacity:.5},
 {id:'contacts',name:'My radio contacts',subtitle:'Your imported ADIF log',icon:'Route',color:'#d7c58b',on:false,opacity:.8},
 {id:'muf',name:'Maximum usable frequency',subtitle:'NOAA WAM-IPE · global forecast',icon:'Waves',color:'#ef70d5',on:false,opacity:.7},
 {id:'prop-muf',name:'prop.kc2g.com MUF (3000 km)',subtitle:'Live ionosonde readings + geographic contours',icon:'Waves',color:'#b0e1b5',on:false,opacity:.9},
 {id:'satellite-weather',name:'Satellite weather',subtitle:'GOES-East/West · GeoColor',icon:'CloudSun',color:'#92d8ee',on:false,opacity:.8},
 {id:'clouds',name:'Satellite clouds (white)',subtitle:'GOES + Himawari · infrared, refreshed every 10 min',icon:'CloudSun',color:'#d8e5ec',on:false,opacity:.72},
 {id:'eumetsat-clouds',name:'Global cloud composite',subtitle:'EUMETSAT geostationary ring · infrared, refreshed every 3 hr',icon:'CloudSun',color:'#c6d4da',on:false,opacity:.72},
 {id:'hf-absorption',name:'HF radio absorption',subtitle:'NOAA SWPC D-RAP · HF absorption estimate',icon:'Waves',color:'#a77be7',on:false,opacity:.72},
 {id:'precipitation',name:'Precipitation rate',subtitle:'NASA GPM IMERG · global, 30-minute estimate',icon:'CloudRain',color:'#66b9e8',on:false,opacity:.72},
 {id:'lightning',name:'Lightning density',subtitle:'NOAA nowCOAST · 15-minute density',icon:'CloudLightning',color:'#f0d46e',on:false,opacity:.8},
 {id:'storms',name:'Tropical storm tracks',subtitle:'NOAA NHC · advisory forecast tracks',icon:'Wind',color:'#ff886e',on:false,opacity:.9},
 {id:'pskreporter',name:'PSK Reporter paths',subtitle:'Your transmissions · receiver grids',icon:'RadioTower',color:'#77d9c4',on:false,opacity:.8},
 {id:'rbn',name:'Reverse Beacon Network',subtitle:'RBN · spotter and station grids',icon:'Activity',color:'#eed275',on:false,opacity:.85},
 {id:'dx-cluster',name:'DX Cluster paths',subtitle:'DX Cluster · country-centroid estimates',icon:'Radio',color:'#c6a4ed',on:false,opacity:.8},
 {id:'wspr',name:'WSPR propagation paths',subtitle:'WSPRnet · recent HF and 6 m spots',icon:'RadioTower',color:'#8fd4ed',on:false,opacity:.65},
 {id:'pota',name:'Parks on the Air spots',subtitle:'POTA · activator parks and paths from your station',icon:'MapPin',color:'#a6d879',on:false,opacity:.82},
 {id:'wsjtx',name:'WSJT-X heard stations',subtitle:'WSJT-X · local UDP decoded messages',icon:'RadioTower',color:'#70cdb8',on:false,opacity:.9},
 {id:'cq-zones',name:'CQ zones',subtitle:'Amateur radio · CQ World Wide zones',icon:'Grid3X3',color:'#76c7d4',on:false,opacity:.22},
 {id:'itu-zones',name:'ITU zones',subtitle:'Amateur radio · ITU zones',icon:'Grid3X3',color:'#d79bd8',on:false,opacity:.18},
];
const DEFAULT_CLOCKS=[{name:'Local',zone:Intl.DateTimeFormat().resolvedOptions().timeZone,useStation:true,lat:null,lng:null},{name:'London',zone:'Europe/London',lat:51.5074,lng:-.1278},{name:'Tokyo',zone:'Asia/Tokyo',lat:35.6762,lng:139.6503},{name:'Sydney',zone:'Australia/Sydney',lat:-33.8688,lng:151.2093}];
export const DEFAULT_STATE = {version:1,base:'atlas',map:{center:[20,8],zoom:null},layers:LAYERS.map(x=>({id:x.id,on:x.on,opacity:x.opacity,showLabels:false,...(x.date?{date:x.date}:{})})),widgets:[],station:{name:'My station',callsign:'',lat:45.64,lng:-122.66,zone:Intl.DateTimeFormat().resolvedOptions().timeZone},scale:1,clocks:DEFAULT_CLOCKS};
export function validZone(zone) {try {timeLabel(new Date(),zone);return typeof zone==='string'&&zone.length>0;}catch{return false;}}
export function safeEmbed(value) {try {const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
export function normalizeState(raw) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('This file does not contain a Geo layout.');
 if(raw.version!==undefined&&raw.version!==1)throw new Error('This layout version is not supported.');
 const next={...DEFAULT_STATE};
 next.base=BASE_MAPS.some(b=>b.id===raw.base)?raw.base:'atlas';
 const layers=Array.isArray(raw.layers)?raw.layers:[];
 next.layers=LAYERS.map(d=>{const x=layers.find(l=>l&&l.id===d.id);return {id:d.id,on:x?!!x.on:d.on,opacity:clamp(finite(x?.opacity,d.opacity),0,1),showLabels:!!x?.showLabels,...(d.id==='imagery'?{date:imageryDate(x?.date||d.date)}:{})};});
 next.layers.push(...layers.filter(l=>l?.custom).slice(0,8).map(customLayer));
 const order=layers.map(l=>l?.id);next.layers.sort((a,b)=>(order.includes(a.id)?order.indexOf(a.id):99)-(order.includes(b.id)?order.indexOf(b.id):99));
 next.widgets=(Array.isArray(raw.widgets)?raw.widgets:[]).slice(0,12).filter(w=>w&&['note','clock','station','iframe','space-weather','legend'].includes(w.type)&&(w.type!=='iframe'||safeEmbed(w.url))).map((w,i)=>({...w,id:typeof w.id==='string'?w.id:`widget-${i}`,title:String(w.title||'Widget').slice(0,100),zone:validZone(w.zone)?w.zone:'UTC',x:clamp(finite(w.x,120),0,10000),y:clamp(finite(w.y,180),90,10000),width:clamp(finite(w.width,280),220,1600),height:clamp(finite(w.height,180),150,1200),text:String(w.text||'').slice(0,10000),...(w.type==='iframe'?{url:safeEmbed(w.url)}:{})}));
 next.scale=clamp(finite(raw.scale,1),.85,1.5);
 const station=raw.station&&typeof raw.station==='object'?raw.station:{};
 next.station={...DEFAULT_STATE.station,name:String(station.name||DEFAULT_STATE.station.name),callsign:String(station.callsign||''),lat:clamp(finite(station.lat,DEFAULT_STATE.station.lat),-90,90),lng:clamp(finite(station.lng,DEFAULT_STATE.station.lng),-180,180),zone:validZone(station.zone)?station.zone:DEFAULT_STATE.station.zone};
 next.clocks=(Array.isArray(raw.clocks)?raw.clocks:DEFAULT_STATE.clocks).slice(0,4).filter(c=>c&&validZone(c.zone)).map(c=>{const defaults=DEFAULT_STATE.clocks.find(clock=>clock.name===c.name&&clock.zone===c.zone),useStation=c.useStation===true||c.name==='Local';const coordinate=(key,bound)=>{const value=Object.hasOwn(c,key)?c[key]:defaults?.[key];if(value===null||value===''||value===undefined)return null;const number=Number(value);return Number.isFinite(number)?clamp(number,bound[0],bound[1]):null;};return {name:String(c.name||c.zone),zone:c.zone,useStation,lat:useStation?null:coordinate('lat',[-90,90]),lng:useStation?null:coordinate('lng',[-180,180])};});
 if(Array.isArray(raw.map?.center)&&raw.map.center.length===2&&raw.map.center.every(Number.isFinite))next.map={center:[clamp(raw.map.center[0],-85,85),clamp(raw.map.center[1],-220,220)],zoom:raw.map.zoom===null?null:clamp(finite(raw.map.zoom,2),.25,8)};
 return next;
}
export async function api(path,options={}) {
 const response=await fetch(`/api/v1${path}`,{...options,headers:{...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...options.headers}});
 if(!response.ok){let p;try{p=await response.json()}catch{} throw new Error(response.status===412?'This layout changed on another display. Reload it before saving.':p?.detail?.message||`Request failed (${response.status})`);}
 if(response.status===204)return null;
 return response.json();
}
export function download(name,value) {const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

export function validateDrawings(collection) {
 if(!collection||collection.type!=='FeatureCollection'||!Array.isArray(collection.features)||collection.features.length>5000)throw new Error('Choose a GeoJSON FeatureCollection with at most 5,000 features.');
 if(JSON.stringify(collection).length>2000000)throw new Error('This GeoJSON file is too large.');
 const coordinate=p=>{if(!Array.isArray(p)||p.length<2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw new Error('GeoJSON coordinates must be finite longitude/latitude values.');};
 const line=(p,min=2)=>{if(!Array.isArray(p)||p.length<min)throw new Error('A geometry has too few coordinates.');p.forEach(coordinate);};
 const polygon=p=>{if(!Array.isArray(p)||!p.length)throw new Error('A polygon needs an outer ring.');p.forEach(r=>{line(r,4);if(r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1])throw new Error('Polygon rings must be closed.');});};
 return {type:'FeatureCollection',features:collection.features.map((f,i)=>{
 if(f?.type!=='Feature'||!f.geometry)throw new Error('Each annotation must be a GeoJSON Feature with geometry.');
 const g=f.geometry,c=g.coordinates;
 if(g.type==='Point')coordinate(c);else if(g.type==='MultiPoint'||g.type==='LineString')line(c,g.type==='MultiPoint'?1:2);else if(g.type==='Polygon')polygon(c);else if(g.type==='MultiLineString'){if(!Array.isArray(c)||!c.length)throw new Error('Empty geometry.');c.forEach(p=>line(p));}else if(g.type==='MultiPolygon'){if(!Array.isArray(c)||!c.length)throw new Error('Empty geometry.');c.forEach(polygon);}else throw new Error('This annotation geometry type is not supported.');
 const p=f.properties||{};const radius=Number(p.radius);if(p.radius!==undefined&&(!Number.isFinite(radius)||radius<=0||radius>20000000))throw new Error('Circle radius must be positive and expressed in meters.');
 return {...f,properties:{...p,id:typeof p.id==='string'?p.id:`imported-${i}`,name:String(p.name||'My annotation').slice(0,100),color:/^#[0-9a-f]{6}$/i.test(p.color)?p.color:'#e1c57a',lineWidth:clamp(finite(p.lineWidth,2),1,8),fillOpacity:clamp(finite(p.fillOpacity,.13),0,.8),notes:String(p.notes||'').slice(0,2000),...(p.radius!==undefined?{radius}:{})}};
 })};
}

export function greatCircle(from,to,steps=64) {
 if(!Array.isArray(from)||!Array.isArray(to)||from.length<2||to.length<2||![...from,...to].every(Number.isFinite))return [];
 const vector=([lng,lat])=>[Math.cos(lat*RAD)*Math.cos(lng*RAD),Math.cos(lat*RAD)*Math.sin(lng*RAD),Math.sin(lat*RAD)];
 const a=vector(from),b=vector(to),angle=Math.acos(clamp(a.reduce((v,x,i)=>v+x*b[i],0),-1,1));
 if(angle<1e-7)return [[from,to]];
 // Antipodal endpoints have no unique shortest path; omit rather than invent a route.
 if(Math.abs(Math.sin(angle))<1e-7)return [];
 const paths=[[]];let previous;
 for(let i=0;i<=steps;i++){const t=i/steps,u=Math.sin((1-t)*angle)/Math.sin(angle),v=Math.sin(t*angle)/Math.sin(angle);const p=a.map((x,j)=>x*u+b[j]*v);const point=[Math.atan2(p[1],p[0])/RAD,Math.atan2(p[2],Math.hypot(p[0],p[1]))/RAD];
 if(previous&&Math.abs(point[0]-previous[0])>180){const edge=previous[0]>0?180:-180,unwrapped=point[0]+(edge>0?360:-360),fraction=(edge-previous[0])/(unwrapped-previous[0]),lat=previous[1]+fraction*(point[1]-previous[1]);paths.at(-1).push([edge,lat]);paths.push([[-edge,lat]]);}
 paths.at(-1).push(point);previous=point;
 }
 return paths;
}

export function customLayer(raw) {
 if(!raw||!['xyz','wms','geojson'].includes(raw.kind))throw new Error('Choose XYZ tiles, WMS, or GeoJSON.');
 const name=String(raw.name||'').trim(),attribution=String(raw.attribution||'').trim();
 if(!name||!attribution)throw new Error('A source name and attribution are required.');
 let url;
 if(raw.kind!=='geojson'){
  url=String(raw.url||'').trim();const parsed=new URL(url.replace(/\{[a-z]+\}/gi,'0'));
  if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Use an HTTP/HTTPS URL without credentials.');
  if([...parsed.searchParams.keys()].some(k=>/token|secret|key|password|auth|credential/i.test(k)))throw new Error('Credential-bearing URLs cannot be saved in layouts.');
  if(raw.kind==='xyz'&&!['{z}','{x}','{y}'].every(t=>url.includes(t)))throw new Error('XYZ templates must include {z}, {x}, and {y}.');
  if(raw.kind==='wms'&&!String(raw.wmsLayers||'').trim())throw new Error('Enter the WMS layer identifier.');
 }
 return {id:typeof raw.id==='string'&&/^custom-[a-z0-9-]+$/i.test(raw.id)?raw.id:`custom-${globalThis.crypto.randomUUID()}`,custom:true,kind:raw.kind,name:name.slice(0,100),attribution:attribution.slice(0,500),subtitle:`${raw.kind.toUpperCase()} · custom source`,icon:raw.kind==='geojson'?'Route':'Layers3',color:'#84cfce',on:raw.on!==false,opacity:clamp(Number.isFinite(+raw.opacity)?+raw.opacity:.65,0,1),...(url?{url}:{}),...(raw.kind==='wms'?{wmsLayers:String(raw.wmsLayers).trim()}:{ }),...(raw.kind==='geojson'?{data:validateDrawings(raw.data)}:{})};
}
