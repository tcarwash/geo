import {WORLD_OFFSETS,worldCopies} from './worldCopies.js';

const CONTOUR_URL='/prop/renders/current/mufd-normal-now.geojson';
const STATION_URL='/prop/api/stations.json';
const REFRESH_MS=15*60*1000;
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):undefined;
const text=value=>{const node=document.createElement('span');node.textContent=value;return node;};

export function propMufContourLabel(feature){
 const value=finite(feature?.properties?.['level-value']);
 if(value!==undefined)return `${value} MHz`;
 const title=String(feature?.properties?.title||'').trim();
 return title?(/\bMHz$/i.test(title)?title:`${title} MHz`):'';
}

export function propMufContours(collection){
 if(collection?.type!=='FeatureCollection'||!Array.isArray(collection.features))throw new Error('prop.kc2g.com returned an invalid contour collection.');
 const features=collection.features.filter(feature=>feature?.type==='Feature'&&feature.geometry?.type==='LineString'&&Array.isArray(feature.geometry.coordinates)&&feature.geometry.coordinates.length>=2&&feature.geometry.coordinates.every(point=>Array.isArray(point)&&point.length>=2&&Number.isFinite(point[0])&&Number.isFinite(point[1])));
 if(!features.length)throw new Error('prop.kc2g.com returned no renderable contour features.');
 return worldCopies({type:'FeatureCollection',features});
}

export function propMufStations(records){
 if(!Array.isArray(records))throw new Error('prop.kc2g.com returned an invalid station list.');
 const features=records.flatMap(record=>{
  const latitude=finite(record?.station?.latitude),longitude=finite(record?.station?.longitude);
  if(latitude===undefined||longitude===undefined||latitude < -90||latitude > 90)return [];
  const point={type:'Feature',geometry:{type:'Point',coordinates:[((longitude+180)%360+360)%360-180,latitude]},properties:{name:String(record.station.name||record.station.code||'Ionosonde'),code:record.station.code,source:record.source,time:record.time,mufd:finite(record.mufd),fof2:finite(record.fof2),confidence:finite(record.cs)}};
  return [point];
 });
 return worldCopies({type:'FeatureCollection',features});
}

export function propMufLayer(L,map,pane,onStatus){
 const group=L.layerGroup().addTo(map);
 let disposed=false,timer,controller,hasData=false,lastRetrievedAt;
 const load=async()=>{
  if(disposed||controller)return;
  controller=new AbortController();
  onStatus?.({status:'loading',loading:true,...(lastRetrievedAt?{retrievedAt:lastRetrievedAt}:{})});
  try{
   const [contourResponse,stationResponse]=await Promise.all([
    fetch(CONTOUR_URL,{signal:controller.signal}),
    fetch(STATION_URL,{signal:controller.signal}),
   ]);
   if(!contourResponse.ok||!stationResponse.ok)throw new Error('prop.kc2g.com data is temporarily unavailable.');
   const [contourData,stationData]=await Promise.all([contourResponse.json(),stationResponse.json()]);
   const contours=propMufContours(contourData),stations=propMufStations(stationData);
   if(disposed)return;
   group.clearLayers();
   const attribution='<a href="https://prop.kc2g.com/about/" target="_blank" rel="noreferrer">prop.kc2g.com</a> · MUF(3000 km)';
   L.geoJSON(contours,{pane,pmIgnore:true,attribution,style:feature=>({color:/^#[\da-f]{6}$/i.test(feature.properties?.stroke||'')?feature.properties.stroke:'#f1cf78',weight:Math.max(1,finite(feature.properties?.['stroke-width'])||1),opacity:.95}),onEachFeature:(feature,layer)=>{const label=propMufContourLabel(feature);if(label)layer.bindTooltip(text(label),{permanent:true,direction:'center',className:'prop-muf-contour-label',opacity:1,interactive:false});}}).addTo(group);
   L.geoJSON(stations,{pane,pmIgnore:true,attribution,pointToLayer:(feature,latlng)=>L.circleMarker(latlng,{pane,radius:3.5,color:'#17303c',weight:1,fillColor:'#ffe28a',fillOpacity:.95}),onEachFeature:(feature,layer)=>{const p=feature.properties;layer.bindTooltip(text(`${p.name}${Number.isFinite(p.mufd)?` · ${p.mufd} MHz`:''}`));}}).addTo(group);
   hasData=true;lastRetrievedAt=new Date().toISOString();
   onStatus?.({status:'current',loading:false,retrievedAt:lastRetrievedAt,source:'prop.kc2g.com',contourCount:contours.features.length/WORLD_OFFSETS.length,stationCount:stations.features.length/WORLD_OFFSETS.length});
  }catch(error){
   if(disposed||error.name==='AbortError')return;
   onStatus?.({status:hasData?'stale':'unavailable',loading:false,...(lastRetrievedAt?{retrievedAt:lastRetrievedAt}:{}),error:error.message||'prop.kc2g.com data could not be loaded.'});
  }finally{controller=null;}
 };
 load();timer=setInterval(load,REFRESH_MS);
 return {update(){},dispose(){disposed=true;clearInterval(timer);controller?.abort();group.clearLayers();map.removeLayer(group)}};
}
