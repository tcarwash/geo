import {useEffect,useRef,forwardRef,useImperativeHandle} from 'react';
import L from 'leaflet';
import {attachCustomLayer} from './customLayers';
import {nasaTileURL} from './imagery';
import {reconcileResources} from './reconcile';
import {liveLayer,glyphIcon} from './liveLayers';
import {maidenheadLayer} from './maidenheadLayer';
import {mufLayer} from './mufLayer';
import {propMufLayer} from './propMufLayer';
import {hfAbsorptionLayer} from './hfAbsorptionLayer';
import cqZones from './data/cqzones.json';
import ituZones from './data/ituzones.json';
import {BASE_MAPS,baseMapController} from './baseMaps';
import {WORLD_OFFSETS,worldCopies} from './worldCopies';
import '@geoman-io/leaflet-geoman-free';
import marker from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
import {sunPosition,RAD,locator,greatCircle} from './core';
L.Icon.Default.mergeOptions({iconUrl:marker,iconRetinaUrl:marker,shadowUrl:shadow});
const palette=['#95b18b','#c4b77e','#cd9b74','#9eacbf','#bc9291','#a5b88a','#c6bba0','#93b8b4','#b4a4be','#d0b37b'];
const textNode = s => {const n=document.createElement('span');n.textContent=s;return n};
const zoneFeatures=(source,type)=>({type:'FeatureCollection',features:source.features.flatMap((feature,index)=>{
 const number=feature.properties?.[type+'_zone_number'],name=feature.properties?.[type+'_zone_name'],loc=feature.properties?.[type+'_zone_name_loc'];
 const polygon={...feature,id:`${type}-${number}-${index}`,properties:{...feature.properties,zoneNumber:number,zoneName:name}};
 return Array.isArray(loc)&&loc.length===2?[polygon,{type:'Feature',id:`${type}-label-${number}-${index}`,geometry:{type:'Point',coordinates:[loc[1],loc[0]]},properties:{zoneNumber:number,zoneName:name,label:`${type==='cq'?'CQ':'ITU'} ${number}`,zoneLabel:true}}]:[polygon];
})});
const RADIO_ZONE_DATA={'cq-zones':zoneFeatures(cqZones,'cq'),'itu-zones':zoneFeatures(ituZones,'itu')};
function paintNight(tile,coords,time){const ctx=tile.getContext('2d');ctx.clearRect(0,0,256,256);const sun=sunPosition(time),sLat=sun.lat*RAD,size=256*Math.pow(2,coords.z);
 for(let y=0;y<256;y+=4){const py=(coords.y*256+y+2)/size,lat=Math.atan(Math.sinh(Math.PI*(1-2*py)));for(let x=0;x<256;x+=4){const lng=((coords.x*256+x+2)/size*360-180)*RAD,alt=Math.asin(Math.sin(lat)*Math.sin(sLat)+Math.cos(lat)*Math.cos(sLat)*Math.cos(lng-sun.lng*RAD))/RAD;if(alt<0){ctx.fillStyle=alt>-6?`rgba(51,41,68,${.18+(-alt/6)*.3})`:alt>-18?`rgba(10,20,43,${.48+(-alt-6)/12*.3})`:'rgba(5,17,34,.84)';ctx.fillRect(x,y,4,4);}}}}
const NightLayer=L.GridLayer.extend({createTile(coords){const tile=L.DomUtil.create('canvas');tile.width=tile.height=256;paintNight(tile,coords,this.options.time);return tile;},setTime(time){this.options.time=time;Object.values(this._tiles||{}).forEach(tile=>paintNight(tile.el,tile.coords,time));}});
export default forwardRef(function MapView({state,feeds,time,locked,chronMode=false,onMove,onInspect,onCoordinate,onCountries,drawings,onDrawings,onReady,onError,onSourceStatus},ref){
 const element=useRef(), map=useRef(),base=useRef(),names=useRef(),night=useRef(),overlays=useRef({}),drawingGroup=useRef(),drawingCopies=useRef(),callbacks=useRef({}),drawingSnapshot=useRef(),saveCurrentDrawings=useRef(),stationMarker=useRef([]),sunMarker=useRef([]),liveResources=useRef(new Map()),tileResources=useRef(new Map()),baseController=useRef(),chronActive=useRef(false),priorView=useRef(null),currentTime=useRef(time);
 chronActive.current=chronMode;currentTime.current=time;
 callbacks.current={onMove,onInspect,onCoordinate,onCountries,onDrawings,onSourceStatus,station:state.station};
 useImperativeHandle(ref,()=>({
  home(){map.current?.fitBounds([[-58,-176],[78,180]],{padding:window.innerWidth<600?[20,140]:[35,95]});},zoom(v){map.current?.setZoom(map.current.getZoom()+v);},
  fly(lat,lng){map.current?.flyTo([lat,lng],Math.max(map.current.getZoom(),4));},
  view(){return {center:[map.current.getCenter().lat,map.current.getCenter().lng],zoom:map.current.getZoom()};},
  setView(v){if(v?.zoom)map.current?.setView(v.center,v.zoom);else map.current?.fitBounds([[-58,-176],[78,180]],{padding:window.innerWidth<600?[20,140]:[35,95]});},
  draw(type){map.current.pm.disableGlobalEditMode();map.current.pm.disableGlobalRemovalMode();map.current.pm.enableDraw(type,{snappable:true,finishOn:'dblclick',pathOptions:{color:'#e3c878',fillColor:'#e3c878',fillOpacity:.15}});},
  finish(){const shape=map.current.pm.Draw.getActiveShape();map.current.pm.Draw[shape]?._finishShape();},
  cancel(){map.current.pm.disableDraw();map.current.pm.disableGlobalEditMode();map.current.pm.disableGlobalRemovalMode();},
  edit(){map.current.pm.toggleGlobalEditMode();},remove(){map.current.pm.toggleGlobalRemovalMode();}
 }),[]);
 useEffect(()=>{
 const m=L.map(element.current,{crs:L.CRS.EPSG3857,zoomControl:false,attributionControl:false,minZoom:.25,maxZoom:8,zoomSnap:.1,zoomDelta:.5,preferCanvas:true});map.current=m;
 if(Number.isFinite(state.map?.zoom))m.setView(state.map.center,state.map.zoom,{animate:false});else m.fitBounds([[-58,-176],[78,180]],{padding:window.innerWidth<600?[20,140]:[35,95],animate:false});
 m.createPane('base-raster').style.zIndex=220;m.createPane('countries').style.zIndex=250;m.createPane('night').style.zIndex=350;m.createPane('labels').style.zIndex=450;m.getPane('labels').style.pointerEvents='none';m.createPane('drawings').style.zIndex=680;m.createPane('locations').style.zIndex=650;
 L.control.attribution({position:'bottomright',prefix:false}).addAttribution('<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth 5.1.2</a> · <a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>').addTo(m);
 drawingGroup.current=L.featureGroup().addTo(m);drawingCopies.current=L.layerGroup().addTo(m);
 m.on('moveend',()=>{if(!chronActive.current)callbacks.current.onMove?.({center:[m.getCenter().lat,m.getCenter().lng],zoom:m.getZoom()})});
 m.on('mousemove click',e=>callbacks.current.onCoordinate?.({...e.latlng,grid:locator(e.latlng.lat,e.latlng.lng)}));
 const saveDrawings=()=>{const c=drawingGroup.current.toGeoJSON();drawingGroup.current.eachLayer(l=>{if(l instanceof L.Circle){const f=c.features.find(f=>f.properties?.id===l.feature?.properties?.id);if(f)f.properties.radius=l.getRadius();}});drawingSnapshot.current=JSON.stringify(c);callbacks.current.onDrawings?.(c);};
 saveCurrentDrawings.current=saveDrawings;
 m.on('pm:create',e=>{e.layer.feature={type:'Feature',properties:{id:crypto.randomUUID(),name:'My annotation',...(e.shape==='Circle'?{radius:e.layer.getRadius()}: {})}};drawingGroup.current.addLayer(e.layer);e.layer.on('pm:edit pm:dragend',saveDrawings);saveDrawings();});m.on('pm:remove',e=>{drawingGroup.current.removeLayer(e.layer);saveDrawings();});
 const controller=new AbortController();fetch('/data/countries.geojson',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('Atlas request failed');return r.json()}).then(data=>{
  callbacks.current.onCountries?.(data.features.map(f=>({name:f.properties.ADMIN,aliases:[f.properties.NAME_EN,f.properties.NAME],lat:f.properties.LABEL_Y,lng:f.properties.LABEL_X})).filter(c=>c.name&&Number.isFinite(c.lat)&&Number.isFinite(c.lng)));
  base.current=L.geoJSON(worldCopies(data),{pane:'countries',pmIgnore:true,style:f=>({fillColor:palette[(f.properties.MAPCOLOR13||1)%palette.length],fillOpacity:1,color:'#345569',weight:.65}),onEachFeature:(f,l)=>{l.on('click',()=>{if(m.pm.globalDrawModeEnabled()||m.pm.globalEditModeEnabled()||m.pm.globalRemovalModeEnabled())return;callbacks.current.onInspect?.({kind:'Geography',title:f.properties.ADMIN,fields:[['Region',f.properties.CONTINENT],['Population',Number(f.properties.POP_EST).toLocaleString()],['Dataset','Natural Earth · 5.1.2']],source:'Generalized political boundaries'});});}}).addTo(m);
  names.current=L.layerGroup().addTo(m);data.features.filter(f=>(f.properties.LABELRANK||6)<5).forEach(f=>{const p=f.properties;if(Number.isFinite(p.LABEL_Y)&&Number.isFinite(p.LABEL_X))WORLD_OFFSETS.forEach(offset=>L.marker([p.LABEL_Y,p.LABEL_X+offset],{pane:'labels',interactive:false,pmIgnore:true,icon:L.divIcon({className:`country-label label-rank-${p.LABELRANK||6}`,html:textNode(p.NAME_EN||p.NAME).outerHTML,iconSize:[120,20],iconAnchor:[60,10]})}).addTo(names.current))});
  [['ATLANTIC OCEAN',5,-35],['PACIFIC OCEAN',0,-145],['INDIAN OCEAN',-25,80]].forEach(([label,lat,lng])=>WORLD_OFFSETS.forEach(offset=>L.marker([lat,lng+offset],{pane:'labels',interactive:false,pmIgnore:true,icon:L.divIcon({className:'ocean-map-label',html:textNode(label).outerHTML,iconSize:[160,20],iconAnchor:[80,10]})}).addTo(names.current)));
  const labelDensity=()=>{const z=m.getZoom();element.current.dataset.labelDensity=z<1.5?'sparse':z<2.5?'medium':'full';};m.on('zoomend',labelDensity);labelDensity();
  onReady?.();
 }).catch(e=>{if(e.name!=='AbortError'){console.error(e);onError?.(e)}});
 return()=>{controller.abort();baseController.current?.dispose();for(const entry of [...liveResources.current.values(),...tileResources.current.values()])entry.dispose();liveResources.current.clear();tileResources.current.clear();m.remove();map.current=null;};
 },[]);
 useEffect(()=>{const m=map.current;if(!m)return;
  const setInteractions=enabled=>['dragging','scrollWheelZoom','doubleClickZoom','touchZoom','boxZoom','keyboard','tap'].forEach(name=>{const handler=m[name];if(handler?.[enabled?'enable':'disable'])handler[enabled?'enable':'disable']()});
  if(chronMode){priorView.current={center:[m.getCenter().lat,m.getCenter().lng],zoom:m.getZoom()};setInteractions(false);let firstAlign=true;const align=()=>{const width=Math.max(256,m.getSize().x),zoom=Math.max(.25,Math.min(8,Math.log2(width/256))),latitude=firstAlign?0:m.getCenter().lat;firstAlign=false;m.setView([latitude,sunPosition(currentTime.current).lng],zoom,{animate:false})};align();window.addEventListener('resize',align);return()=>window.removeEventListener('resize',align)}
  setInteractions(true);if(priorView.current){m.setView(priorView.current.center,priorView.current.zoom,{animate:false});priorView.current=null;}
 },[chronMode]);
 useEffect(()=>{if(!chronMode||!map.current)return;const sun=sunPosition(time);const m=map.current;m.setView([m.getCenter().lat,sun.lng],m.getZoom(),{animate:false});},[chronMode,time]);
 useEffect(()=>{
  const m=map.current,container=element.current;if(!chronMode||!m||!container)return;
  let drag=null;
  const down=event=>{
   if(!event.isPrimary||event.button!==0||event.target.closest?.('a,button,input,select,textarea,.leaflet-control'))return;
   drag={pointerId:event.pointerId,startY:event.clientY,lastY:event.clientY,moved:false};
  };
  const move=event=>{
   if(!drag||event.pointerId!==drag.pointerId)return;
   const delta=event.clientY-drag.lastY;drag.lastY=event.clientY;
   if(Math.abs(event.clientY-drag.startY)>4)drag.moved=true;
   if(!drag.moved||!delta)return;
   event.preventDefault();container.classList.add('chron-pan-active');m.panBy([0,-delta],{animate:false,noMoveStart:true});
   const latitude=m.getCenter().lat;if(latitude>85||latitude< -85)m.setView([Math.max(-85,Math.min(85,latitude)),sunPosition(currentTime.current).lng],m.getZoom(),{animate:false});
  };
  const up=event=>{
   if(!drag||event.pointerId!==drag.pointerId)return;
   const moved=drag.moved;drag=null;container.classList.remove('chron-pan-active');
   if(moved){const suppressClick=click=>{click.preventDefault();click.stopPropagation();container.removeEventListener('click',suppressClick,true);};container.addEventListener('click',suppressClick,true);window.setTimeout(()=>container.removeEventListener('click',suppressClick,true),0);}
  };
  container.addEventListener('pointerdown',down);window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
  return()=>{container.removeEventListener('pointerdown',down);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);container.classList.remove('chron-pan-active');};
 },[chronMode]);
 useEffect(()=>{const m=map.current;if(!m||!base.current)return;
 if(!baseController.current)baseController.current=baseMapController(m,definition=>L.tileLayer(definition.url,{pane:'base-raster',opacity:0,maxZoom:8,attribution:definition.attribution,pmIgnore:true}),id=>base.current.setStyle(f=>({fillColor:id==='grayscale'?'#8a9da3':palette[(f.properties.MAPCOLOR13||1)%palette.length],fillOpacity:['atlas','grayscale'].includes(id)?1:0,color:['atlas','grayscale'].includes(id)?'#345569':'#c5d5db',opacity:['atlas','grayscale'].includes(id)?1:.5})),status=>callbacks.current.onSourceStatus?.('base',status));
 baseController.current.select(BASE_MAPS.find(b=>b.id===state.base)||BASE_MAPS[0]);
 },[state.base,feeds.ready]);
 useEffect(()=>{const m=map.current;if(!m)return;const config=state.layers.find(l=>l.id==='night');if(chronMode||!config?.on){if(night.current)m.removeLayer(night.current);night.current=null;return;}if(!night.current)night.current=new NightLayer({pane:'night',time,opacity:config.opacity,updateWhenIdle:true}).addTo(m);else{night.current.setOpacity(config.opacity);const minute=Math.floor(time.getTime()/60000);if(Math.floor(night.current.options.time.getTime()/60000)!==minute)night.current.setTime(time);}},[chronMode,Math.floor(time.getTime()/60000),state.layers]);
 useEffect(()=>{const m=map.current;if(!m)return;
 const definitions=state.layers.filter(l=>l.on&&!l.custom&&!['night','imagery'].includes(l.id)).map(l=>({...l,...(RADIO_ZONE_DATA[l.id]?{data:RADIO_ZONE_DATA[l.id]}:{}),key:l.id}));
 reconcileResources(liveResources.current,definitions,definition=>{
  const pane=`data-${definition.id}`;if(!m.getPane(pane))m.createPane(pane);
  if(definition.id==='maidenhead')return maidenheadLayer(m,pane);
  if(definition.id==='muf')return mufLayer(L,m,pane,status=>callbacks.current.onSourceStatus?.('muf',status));
  if(definition.id==='prop-muf')return propMufLayer(L,m,pane,status=>callbacks.current.onSourceStatus?.('prop-muf',status));
  if(definition.id==='hf-absorption')return {dispose:hfAbsorptionLayer(L,m,pane,status=>callbacks.current.onSourceStatus?.('hf-absorption',status)),update(){}};
  if(definition.id==='dateline'){const group=L.layerGroup().addTo(m);for(const offset of WORLD_OFFSETS)for(const longitude of [-180,180]){L.polyline([[-85,longitude+offset],[85,longitude+offset]],{pane,color:'#e0c77f',weight:1.25,dashArray:'7 6',interactive:false,pmIgnore:true}).addTo(group);L.marker([0,longitude+offset],{pane,interactive:false,pmIgnore:true,icon:L.divIcon({className:'date-line-label',html:textNode('DATE LINE · 180°').outerHTML,iconSize:[130,18],iconAnchor:[65,9]})}).addTo(group);}return {update(){},dispose(){m.removeLayer(group)}};}
  if(definition.id==='graticule'){const group=L.layerGroup().addTo(m),grid=definition.id==='maidenhead';for(const offset of WORLD_OFFSETS){for(let lon=-180;lon<=180;lon+=grid?20:30)L.polyline([[-85,lon+offset],[85,lon+offset]],{pane,color:grid?'#baa8d2':'#bdd6d6',weight:.7,interactive:false,pmIgnore:true}).addTo(group);for(let lat=-80;lat<=80;lat+=grid?10:30)L.polyline([[lat,-180+offset],[lat,180+offset]],{pane,color:grid?'#baa8d2':'#bdd6d6',weight:.7,interactive:false,pmIgnore:true}).addTo(group);}return {update(){},dispose(){m.removeLayer(group)}};}
  return liveLayer(L,m,definition.id,pane,detail=>callbacks.current.onInspect?.(detail));
 },(entry,definition)=>{const pane=m.getPane(`data-${definition.id}`);pane.style.zIndex=definition.id==='muf'?390:definition.id==='dateline'?610:definition.id==='graticule'?600:620-state.layers.findIndex(l=>l.id===definition.id);pane.style.opacity=definition.opacity;entry.update(feeds[definition.id]?.data||definition.data,definition.showLabels);});
 },[feeds,state.layers]);
 useEffect(()=>{const m=map.current;if(!m)return;
 const definitions=state.layers.filter(l=>l.on&&(l.custom||['imagery','satellite-weather','clouds','eumetsat-clouds','lightning','precipitation'].includes(l.id))).map(l=>({...l,key:JSON.stringify(l.id==='imagery'?{date:l.date}:l.custom?{kind:l.kind,url:l.url,wmsLayers:l.wmsLayers,data:l.data,attribution:l.attribution}:{id:l.id})}));
  reconcileResources(tileResources.current,definitions,definition=>{const pane=definition.custom?`custom-${definition.id}`:definition.id;if(!m.getPane(pane))m.createPane(pane);let source=definition.id==='imagery'?{kind:'xyz',url:nasaTileURL(definition.date),name:'MODIS Terra true color',attribution:'NASA EOSDIS GIBS · MODIS Terra corrected reflectance'}:definition.id==='satellite-weather'?{kind:'wms',url:'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',wmsLayers:'GOES-East_ABI_GeoColor,GOES-West_ABI_GeoColor',name:'GOES-East/West GeoColor',attribution:'NASA EOSDIS GIBS · NOAA GOES ABI'}:definition.id==='clouds'?{kind:'cloud-wms',name:'GOES + Himawari white cloud overlay',sources:[{url:'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',wmsLayers:'GOES-East_ABI_Band13_Clean_Infrared,GOES-West_ABI_Band13_Clean_Infrared,Himawari_AHI_Band13_Clean_Infrared',refreshMs:10*60*1000,attribution:'NASA EOSDIS GIBS · NOAA GOES ABI + Himawari AHI clean infrared · refreshed every 10 minutes'}]}:definition.id==='eumetsat-clouds'?{kind:'contrast-wms',url:'https://view.eumetsat.int/geoserver/wms',wmsLayers:'mumi:worldcloudmap_ir108',crs:L.CRS.EPSG3857,refreshMs:3*60*60*1000,name:'EUMETSAT global geostationary-ring infrared composite',attribution:'EUMETSAT · Geostationary Ring IR10.8 μm multimission composite · refreshed about every 3 hours'}:definition.id==='lightning'?{kind:'wms',url:'https://nowcoast.noaa.gov/geoserver/observations/lightning_detection/ows',wmsLayers:'ldn_lightning_strike_density',name:'Lightning Strike Density',attribution:'NOAA nowCOAST · NWS/NCEP'}:definition.id==='precipitation'?{kind:'wms',url:'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',wmsLayers:'IMERG_Precipitation_Rate_30min',refreshMs:30*60*1000,name:'GPM IMERG precipitation rate',attribution:'NASA GPM IMERG · precipitation rate, 30-minute estimate'}:definition;
  return {dispose:attachCustomLayer(m,source,pane,status=>callbacks.current.onSourceStatus?.(definition.id,{...status,...(definition.id==='imagery'?{dataTime:`${definition.date}T00:00:00Z`,kind:'composite'}:{})}))};
 },(entry,definition)=>{const pane=m.getPane(definition.custom?`custom-${definition.id}`:definition.id);pane.style.zIndex=definition.id==='imagery'?300:620-state.layers.findIndex(l=>l.id===definition.id);pane.style.opacity=definition.opacity;});
 },[state.layers]);
 useEffect(()=>{
  const m=map.current;if(!m||!drawings)return;
  const snapshot=JSON.stringify(drawings);if(snapshot===drawingSnapshot.current)return;drawingSnapshot.current=snapshot;
  drawingGroup.current.clearLayers();drawingCopies.current.clearLayers();
  const style=f=>({color:f.properties?.color||'#e1c57a',weight:f.properties?.lineWidth||2,fillOpacity:f.properties?.fillOpacity??.13});
  L.geoJSON(drawings,{pane:'drawings',style,pointToLayer:(f,ll)=>f.properties?.radius?L.circle(ll,{pane:'drawings',radius:f.properties.radius,color:f.properties?.color||'#e1c57a',weight:f.properties?.lineWidth||2,fillOpacity:f.properties?.fillOpacity??.13}):L.marker(ll),onEachFeature:(f,l)=>{l.bindTooltip(textNode(f.properties?.name||'My annotation'));l.on('pm:edit pm:dragend',()=>saveCurrentDrawings.current?.());}}).eachLayer(l=>drawingGroup.current.addLayer(l));
  WORLD_OFFSETS.filter(offset=>offset!==0).forEach(offset=>{
   const copy=L.geoJSON(worldCopies(drawings,[offset]),{pane:'drawings',style,interactive:false,pmIgnore:true,pointToLayer:(f,ll)=>L.circleMarker(ll,{pane:'drawings',radius:4,color:f.properties?.color||'#e1c57a',interactive:false,pmIgnore:true})});
   copy.eachLayer(layer=>{layer.options.interactive=false;layer.options.pmIgnore=true;});drawingCopies.current.addLayer(copy);
  });
 },[drawings]);
 useEffect(()=>{const m=map.current;if(!m)return;const station=state.station;
 if(!stationMarker.current.length)stationMarker.current=WORLD_OFFSETS.map(offset=>{const marker=L.marker([station.lat,station.lng+offset],{pane:'locations',icon:glyphIcon(L,'station'),title:'Your station',pmIgnore:true}).addTo(m);marker.on('click',()=>{const station=callbacks.current.station;callbacks.current.onInspect?.({kind:'Your station',title:station.callsign||station.name,fields:[['Locator',locator(station.lat,station.lng)],['Latitude',`${station.lat.toFixed(3)}°`],['Longitude',`${station.lng.toFixed(3)}°`]],source:'Configured station location'});});return marker;});
 stationMarker.current.forEach((marker,index)=>marker.setLatLng([station.lat,station.lng+WORLD_OFFSETS[index]]).bindTooltip(textNode(station.callsign||station.name)));
 },[state.station]);
 useEffect(()=>{const m=map.current;if(!m)return;if(chronMode||!state.layers.find(l=>l.id==='night')?.on){sunMarker.current.forEach(marker=>m.removeLayer(marker));sunMarker.current=[];return;}const sun=sunPosition(time);
 if(!sunMarker.current.length)sunMarker.current=WORLD_OFFSETS.map(offset=>L.marker([sun.lat,sun.lng+offset],{pane:'locations',icon:glyphIcon(L,'sun'),title:'Subsolar point',pmIgnore:true}).addTo(m).bindTooltip(textNode('Subsolar point · Sun directly overhead')));
 else sunMarker.current.forEach((marker,index)=>marker.setLatLng([sun.lat,sun.lng+WORLD_OFFSETS[index]]));
 },[chronMode,time.getUTCMinutes(),time.getUTCHours(),state.layers]);
 useEffect(()=>{if(locked||chronMode){map.current?.pm.disableDraw();map.current?.pm.disableGlobalEditMode();map.current?.pm.disableGlobalRemovalMode();}},[locked,chronMode]);
 return <div className="map-canvas" ref={element} aria-label={chronMode?'World atlas. Drag up or down to pan north or south; east-west motion follows local solar time.':'Interactive world atlas'}/>;
});
