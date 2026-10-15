import test from 'node:test';
import assert from 'node:assert/strict';
import {LAYERS,normalizeState} from '../src/core.js';
import {sourceStatusLabel} from '../src/sourceStatus.js';
import {activeLegendItems} from '../src/legendModel.js';
import {PUBLIC_FEED_CACHE_ROUTES} from '../src/feedStreamState.js';
import {liveLayer} from '../src/liveLayers.js';
import {WORLD_OFFSETS} from '../src/worldCopies.js';

test('transport references preserve their vintage and survive old layout imports as opt-in layers',()=>{
 const state=normalizeState({version:1,layers:[]});
 for(const id of ['air-traffic','air-routes','sea-routes']){
  assert.equal(state.layers.find(layer=>layer.id===id).on,false);
  assert(PUBLIC_FEED_CACHE_ROUTES[id]);
  assert(activeLegendItems([{id,on:true}],LAYERS)[0].symbols.length>0);
 }
 assert.equal(sourceStatusLabel('air-routes',{kind:'reference',status:'current',referenceVintage:'June 2014'}),'Reference · June 2014');
 assert.match(sourceStatusLabel('air-traffic',{status:'stale',dataTime:'then'},value=>value),/^Stale/);
});

test('aircraft retain identity, rotate to heading, inspect updated values, and disappear on refresh',()=>{
 const created=[];
 class Layer{
  constructor(kind,position,options={}){Object.assign(this,{kind,position,options,events:{},children:new Set()});created.push(this)}
  addTo(parent){parent.addLayer(this);return this}addLayer(layer){this.children.add(layer);return this}removeLayer(layer){this.children.delete(layer);return this}clearLayers(){this.children.clear();return this}
  on(type,fn){this.events[type]=fn;return this}setLatLng(ll){this.position=ll;return this}getLatLng(){return this.position}setLatLngs(coords){this.coords=coords;return this}setStyle(style){this.style=style;return this}setIcon(icon){this.icon=icon;return this}getTooltip(){return null}
 }
 const coordsToLatLng=([lng,lat])=>({lat,lng});
 const L={layerGroup:()=>new Layer('group'),marker:(ll,options)=>new Layer('marker',ll,options),circle:(ll,options)=>new Layer('circle',ll,options),polyline:(coords,options)=>new Layer('line',null,options),divIcon:options=>options,GeoJSON:{coordsToLatLng,coordsToLatLngs:(coords,depth)=>depth?coords.map(line=>line.map(coordsToLatLng)):coords.map(coordsToLatLng)}};
 const map=new Layer('map');let detail;
 const resource=liveLayer(L,map,'air-traffic','pane',value=>detail=value);
 const feed=(lon,heading,altitude)=>({type:'FeatureCollection',center:[-122,45],radiusNm:250,features:[{type:'Feature',id:'abcdef',geometry:{type:'Point',coordinates:[lon,45]},properties:{callsign:'TEST42',icao:'abcdef',heading,altitudeFt:altitude,groundSpeedKt:450,observedAt:'2026-10-11T22:00:00Z'}}]});
 resource.update(feed(-122,45,30000));const marker=created.find(layer=>layer.kind==='marker');
 resource.update(feed(-121,90,31000));
 assert.equal(created.filter(layer=>layer.kind==='marker').length,WORLD_OFFSETS.length);
 assert.equal(marker.position.lng,-121+WORLD_OFFSETS[0]);
 assert.match(marker.icon.html,/rotate\(90deg\)/);assert.match(marker.icon.html,/aircraft/);
 assert.equal(created.filter(layer=>layer.kind==='circle')[0].options.radius,250*1852);
 marker.events.click();assert.equal(detail.title,'TEST42');assert.equal(detail.fields.find(([label])=>label==='Barometric altitude')[1],'31,000 ft');
 resource.update({type:'FeatureCollection',features:[]});
 assert.equal(created.find(layer=>layer.kind==='group').children.has(marker),false);
 resource.dispose();assert.equal(map.children.size,0);
 for(const id of ['air-routes','sea-routes']){
  const routes=liveLayer(L,map,id,'pane',value=>detail=value);
  routes.update({type:'FeatureCollection',features:[{type:'Feature',id:'route',geometry:{type:'MultiLineString',coordinates:[[[170,30],[180,32]],[[-180,32],[-170,34]]]},properties:{name:'Reference route',category:'Major',referenceVintage:'2012',fromAirport:'From',toAirport:'To'}}]});
  const line=created.filter(layer=>layer.kind==='line').at(-1);assert.equal(line.options.interactive,true);line.events.click();assert.match(detail.kind,/Historical|reference/);assert.equal(detail.title,'Reference route');routes.dispose();
 }
});
