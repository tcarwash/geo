import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_STATE,LAYERS} from '../src/core.js';
import {activeLegendItems} from '../src/legendModel.js';
import {liveLayer} from '../src/liveLayers.js';

test('WSJT-X heard stations are opt-in and have a point legend',()=>{
 const definition=LAYERS.find(layer=>layer.id==='wsjtx');
 assert.ok(definition);
 assert.equal(DEFAULT_STATE.layers.find(layer=>layer.id==='wsjtx').on,false);
 const legend=activeLegendItems([{id:'wsjtx',on:true}],LAYERS);
 assert.equal(legend[0].kind,'point');
 assert.equal(legend[0].name,'WSJT-X heard stations');
});

test('WSJT-X heard-station points expose callsign, locator and decode detail',()=>{
 class Layer{
  constructor(kind,position,options={}){this.kind=kind;this.position=position;this.options=options;this.events={};this.children=new Set()}
  addTo(parent){parent.addLayer(this);return this}
  addLayer(layer){this.children.add(layer);return this}
  removeLayer(layer){this.children.delete(layer);return this}
  clearLayers(){this.children.clear();return this}
  on(type,fn){this.events[type]=fn;return this}
  setLatLng(value){this.position=value;return this}
  getLatLng(){return this.position}
  setStyle(style){this.style=style;return this}
  setRadius(radius){this.radius=radius;return this}
  getTooltip(){return null}
  bindTooltip(){return this}
 }
 const L={layerGroup:()=>new Layer('group'),circleMarker:(position,options)=>new Layer('circle',position,options),GeoJSON:{coordsToLatLng:([lng,lat])=>({lat,lng})}};
 const map=new Layer('map');let detail;
 const resource=liveLayer(L,map,'wsjtx','pane',value=>{detail=value});
 resource.update({type:'FeatureCollection',features:[{type:'Feature',id:'wsjtx:K1ABC',geometry:{type:'Point',coordinates:[-71,42.5]},properties:{callsign:'K1ABC',locator:'FN42',mode:'FT8',snrDb:-12,frequencyHz:14075450,observedAt:'2026-10-10T20:00:00Z',precision:'reported Maidenhead locator center'}}]});
 const group=[...map.children][0];
 const marker=[...group.children].find(layer=>layer.kind==='circle'&&layer.position.lng===-71);
 assert.equal(marker.kind,'circle');
 assert.equal(marker.position.lng,-71);
 assert.equal(marker.style.fillColor,definitionColor());
 marker.events.click();
 assert.equal(detail.kind,'WSJT-X heard station');
 assert.equal(detail.title,'K1ABC');
 assert.deepEqual(detail.fields.map(([label])=>label),['Maidenhead locator','Mode','SNR','Frequency','Last decoded','Location precision']);
 assert.equal(detail.source,'WSJT-X · local UDP decodes');
 resource.dispose();
});

function definitionColor(){return LAYERS.find(layer=>layer.id==='wsjtx')?.color;}
