import {test} from 'node:test';
import assert from 'node:assert/strict';
import {liveLayer} from '../src/liveLayers.js';
import {WORLD_OFFSETS} from '../src/worldCopies.js';
test('ISS feed refresh moves the same SVG marker and updates its existing track',()=>{
 const created=[];
 class Layer{constructor(kind,position,options={}){this.kind=kind;this.position=position;this.options=options;this.children=new Set();this.events={};created.push(this)}addTo(parent){parent.addLayer(this);return this}addLayer(l){this.children.add(l);return this}removeLayer(l){this.children.delete(l);return this}clearLayers(){this.children.clear();return this}on(type,fn){this.events[type]=fn;return this}setLatLng(ll){this.position=ll;return this}getLatLng(){return this.position}setLatLngs(coords){this.coords=coords;return this}setStyle(){return this}setRadius(){return this}}
 const L={layerGroup:()=>new Layer('group'),marker:(ll,o)=>new Layer('marker',ll,o),polyline:(c,o)=>new Layer('line',null,o),divIcon:o=>o,GeoJSON:{coordsToLatLng:c=>({lat:c[1],lng:c[0]}),coordsToLatLngs:(c,depth)=>depth?c.map(a=>a.map(p=>({lat:p[1],lng:p[0]}))):c.map(p=>({lat:p[1],lng:p[0]}))}};
 const originalWindow=globalThis.window;globalThis.window={matchMedia:()=>({matches:true})};
 try{
 const map=new Layer('map');let detail;const resource=liveLayer(L,map,'satellite','pane',d=>detail=d);
 const feed=(lon,altitude)=>({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[lon,12]},properties:{catalogId:25544,role:'current-position',name:'ISS',altitudeKm:altitude,epoch:'2026-10-09'}},{type:'Feature',geometry:{type:'MultiLineString',coordinates:[[[lon,12],[lon+1,13]]]},properties:{catalogId:25544,role:'ground-track'}}]});
 resource.update(feed(10,400));const marker=created.find(l=>l.kind==='marker'),track=created.find(l=>l.kind==='line');resource.update(feed(11,401));assert.equal(created.filter(l=>l.kind==='marker').length,WORLD_OFFSETS.length);assert.equal(created.filter(l=>l.kind==='line').length,WORLD_OFFSETS.length);assert.deepEqual(marker.position,{lat:12,lng:11+WORLD_OFFSETS[0]});assert.equal(track.coords[0][0].lng,11+WORLD_OFFSETS[0]);assert.ok(marker.options.icon.html.includes('<svg'));marker.events.click();assert.equal(detail.fields[0][1],'401 km');resource.dispose();assert.equal(map.children.size,0);
 }finally{globalThis.window=originalWindow}
});

test('active event polygons redraw in place and repeat across wrapped worlds',()=>{
 const created=[];
 class Layer{constructor(kind,position,options={}){this.kind=kind;this.position=position;this.options=options;this.events={};created.push(this)}addTo(parent){parent.addLayer(this);return this}addLayer(l){this.children??=new Set();this.children.add(l);return this}removeLayer(l){this.children?.delete(l);return this}clearLayers(){this.children?.clear();return this}on(type,fn){this.events[type]=fn;return this}setLatLng(ll){this.position=ll;return this}getLatLng(){return this.position}setLatLngs(coords){this.coords=coords;return this}setStyle(style){this.style=style;return this}setRadius(radius){this.radius=radius;return this}}
 const coordsToLatLng=([lng,lat])=>({lat,lng});
 const coordsToLatLngs=(coords,depth)=>depth?coords.map(line=>coordsToLatLngs(line,depth-1)):coords.map(coordsToLatLng);
 const L={layerGroup:()=>new Layer('group'),circleMarker:(ll,o)=>new Layer('circle',ll,o),polygon:(ll,o)=>new Layer('polygon',ll,o),polyline:(c,o)=>new Layer('line',null,o),GeoJSON:{coordsToLatLng,coordsToLatLngs}};
 const map=new Layer('map');let detail;const resource=liveLayer(L,map,'wildfires','pane',value=>detail=value);
 const fire=coordinates=>({type:'FeatureCollection',features:[{type:'Feature',id:'fire-1',properties:{title:'River Fire',date:'2026-10-09'},geometry:{type:'Polygon',coordinates}}]});
 const ring=[[-123,45],[-122,45],[-122,46],[-123,45]];
 resource.update(fire([ring]));const polygons=created.filter(layer=>layer.kind==='polygon');
 resource.update(fire([[[-124,45],[-123,45],[-123,46],[-124,45]]]));
 assert.equal(polygons.length,WORLD_OFFSETS.length);assert.equal(created.filter(layer=>layer.kind==='polygon').length,WORLD_OFFSETS.length);
 assert.equal(polygons[0].coords[0][0].lng,-124+WORLD_OFFSETS[0]);assert.equal(polygons[0].style.fillColor,'#ff8b61');
 polygons[0].events.click();assert.equal(detail.title,'River Fire');assert.equal(detail.kind,'Wildfire');resource.dispose();
});
