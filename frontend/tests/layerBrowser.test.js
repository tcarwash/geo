import test from 'node:test';
import assert from 'node:assert/strict';
import {filterLayerGroups} from '../src/layerBrowser.js';

const groups=[{name:'Earth & weather',ids:['quake','rain']}];
const definitions=[{id:'quake',name:'Earthquakes',subtitle:'USGS events'},{id:'rain',name:'Rainfall',subtitle:'Global precipitation'}];
const layers=[{id:'rain',on:false},{id:'custom',custom:true,name:'Local radar',subtitle:'Regional observations',on:true},{id:'quake',on:true}];

test('matches names, subtitles and groups without changing source order or indices',()=>{
  for(const query of [' EARTH ','weather','']){
    const result=filterLayerGroups(layers,definitions,groups,query);
    assert.deepEqual(result[0].layers.map(({l,index})=>[l.id,index]),[['rain',0],['quake',2]]);
  }
  assert.equal(filterLayerGroups(layers,definitions,groups,'usgs')[0].layers[0].l.id,'quake');
  assert.equal(filterLayerGroups(layers,definitions,groups,'regional')[0].layers[0].l.id,'custom');
  assert.equal(filterLayerGroups(layers,definitions,groups,'custom sources')[0].layers[0].l.id,'custom');
  assert.deepEqual(filterLayerGroups(layers,definitions,groups,'missing'),[]);
});
test('active filter combines with search and includes custom sources',()=>{
  assert.deepEqual(filterLayerGroups(layers,definitions,groups,'','active').flatMap(g=>g.layers.map(({l})=>l.id)),['quake','custom']);
  assert.deepEqual(filterLayerGroups(layers,definitions,groups,'precipitation','active'),[]);
  assert.equal(filterLayerGroups(layers,definitions,groups,'regional','active')[0].layers[0].index,1);
});
test('favorites filter composes with search for built-in and custom layers',()=>{
  const favorites=['rain','custom'];
  assert.deepEqual(filterLayerGroups(layers,definitions,groups,'','favorites',favorites).flatMap(g=>g.layers.map(x=>x.l.id)),['rain','custom']);
  assert.deepEqual(filterLayerGroups(layers,definitions,groups,'USGS','favorites',favorites),[]);
  assert.equal(filterLayerGroups(layers,definitions,groups,'regional','favorites',favorites)[0].layers[0].l.id,'custom');
  assert.deepEqual(filterLayerGroups(layers,definitions,groups,'','favorites',[]),[]);
});
