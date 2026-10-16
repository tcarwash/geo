import test from 'node:test';
import assert from 'node:assert/strict';
import {liveLayer} from '../src/liveLayers.js';

class Layer{
 constructor(kind,position,options={}){this.kind=kind;this.position=position;this.options=options;this.events={};this.children=new Set();this.tooltipElement={style:{}};}
 addTo(parent){parent.addLayer(this);return this}
 addLayer(layer){this.children.add(layer);return this}
 removeLayer(layer){this.children.delete(layer);return this}
 clearLayers(){this.children.clear();return this}
 on(type,fn){this.events[type]=fn;return this}
 setLatLng(value){this.position=value;return this}
 getLatLng(){return this.position}
 setStyle(style){this.style=style;return this}
 setRadius(radius){this.radius=radius;return this}
 setLatLngs(value){this.positions=value;return this}
 getTooltip(){return this.tooltip||null}
 bindTooltip(content,options){this.tooltip={content,options,getElement:()=>this.tooltipElement};return this}
 setTooltipContent(content){this.tooltip.content=content;return this}
 unbindTooltip(){this.tooltip=null;return this}
}

test('local GeoJSON uses configured colors, sizes, labels and feature inspection',()=>{
 const previous=globalThis.document;
 const label={style:{},setAttribute(){},addEventListener(){}};
 globalThis.document={createElement:()=>label};
 try{
  const L={layerGroup:()=>new Layer('group'),circleMarker:(position,options)=>new Layer('circle',position,options),GeoJSON:{coordsToLatLng:([lng,lat])=>({lat,lng})}};
  const map=new Layer('map');let detail;
  const resource=liveLayer(L,map,'local-radio-sites','pane',value=>{detail=value});
  const style={custom:true,name:'Repeater sites',attribution:'Local data',labelProperty:'title',color:'#12ab34',labelColor:'#ffeedd',labelBackground:'#102030',labelSize:15,pointSize:8,lineWidth:3,fillOpacity:.4};
  resource.update({type:'FeatureCollection',features:[{type:'Feature',id:'site-1',geometry:{type:'Point',coordinates:[-122.3,47.6]},properties:{title:'Hilltop repeater',callsign:'W1ABC',frequency:'146.52 MHz'}}]},true,style);
  const group=[...map.children][0];
  const marker=[...group.children].find(layer=>layer.kind==='circle');
  assert.equal(marker.radius,8);
  assert.equal(marker.style.fillColor,'#12ab34');
  assert.equal(label.textContent,'Hilltop repeater');
  assert.equal(label.style.color,'#ffeedd');
  assert.equal(marker.tooltipElement.style.backgroundColor,'#102030');
  assert.equal(marker.tooltipElement.style.fontSize,'15px');
  marker.events.click();
  assert.equal(detail.kind,'Local source feature');
  assert.equal(detail.title,'Hilltop repeater');
  assert.deepEqual(detail.fields,[['title','Hilltop repeater'],['callsign','W1ABC'],['frequency','146.52 MHz']]);
  resource.dispose();
 }finally{globalThis.document=previous;}
});

test('local MultiPoint features render one styled marker per coordinate',()=>{
 const L={layerGroup:()=>new Layer('group'),circleMarker:(position,options)=>new Layer('circle',position,options),GeoJSON:{coordsToLatLng:([lng,lat])=>({lat,lng})}};
 const map=new Layer('map');
 const resource=liveLayer(L,map,'local-radio-sites','pane',()=>{});
 resource.update({type:'FeatureCollection',features:[{type:'Feature',id:'stations',geometry:{type:'MultiPoint',coordinates:[[-122.3,47.6],[-122.5,47.8]]},properties:{name:'Station cluster'}}]},false,{custom:true,color:'#12ab34',pointSize:8});
 const group=[...map.children][0];
 const markers=[...group.children].filter(layer=>layer.kind==='circle');
 assert.equal(markers.length,10);
 assert.deepEqual(markers.filter(marker=>Math.abs(marker.position.lng)<=180).map(marker=>marker.position),[{lat:47.6,lng:-122.3},{lat:47.8,lng:-122.5}]);
 assert.ok(markers.every(marker=>marker.radius===8&&marker.style.fillColor==='#12ab34'));
 resource.dispose();
});
