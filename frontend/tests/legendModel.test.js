import test from 'node:test';
import assert from 'node:assert/strict';
import {activeLegendItems} from '../src/legendModel.js';

const defs=[{id:'earthquakes',name:'Earthquakes',color:'#edaa69'},{id:'aurora',name:'Aurora forecast',color:'#78cfab'},{id:'weather-alerts',name:'Active weather alerts',color:'#f28a67'},{id:'precipitation',name:'Precipitation rate',color:'#66b9e8'},{id:'muf',name:'Maximum usable frequency',color:'#ef70d5'}];

test('shows active point layers with the actual graduated symbols or categories',()=>{
  const items=activeLegendItems([{id:'earthquakes',on:true},{id:'aurora',on:true}],defs);
  assert.deepEqual(items.find(x=>x.id==='earthquakes').symbols.map(x=>[x.label,x.radius]),[['M1',3],['M3',6],['M6',12]]);
  assert.deepEqual(items.find(x=>x.id==='aurora').symbols.map(x=>[x.label,x.color]),[['≤50%','#6cddb2'],['>50%','#b5a0dd']]);
});

test('includes only active rasters whose displayed product units are documented',()=>{
  const items=activeLegendItems([{id:'precipitation',on:true},{id:'muf',on:true},{id:'imagery',on:true},{id:'aurora',on:false}],defs);
  assert.deepEqual(items.filter(x=>x.kind==='raster').map(x=>[x.id,x.unit]),[['precipitation','mm/h'],['muf','MHz']]);
  assert.deepEqual(items.map(x=>x.id),['precipitation','muf']);
});

test('includes enabled active weather alerts in the map legend',()=>{
  const item=activeLegendItems([{id:'weather-alerts',on:true}],defs)[0];
  assert.equal(item.kind,'point');
  assert.deepEqual(item.symbols.map(({label,color})=>[label,color]),[['Extreme','#e45555'],['Severe','#f28a67'],['Moderate','#edc85b'],['Minor','#72bf8b']]);
});

test('preserves source layer order and omits unknown definitions',()=>{
  const items=activeLegendItems([{id:'muf',on:true},{id:'earthquakes',on:true},{id:'missing',on:true}],defs);
  assert.deepEqual(items.map(x=>x.id),['muf','earthquakes']);
});
