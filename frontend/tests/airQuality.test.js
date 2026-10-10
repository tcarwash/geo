import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_STATE,LAYERS} from '../src/core.js';
import {activeLegendItems} from '../src/legendModel.js';

test('CAMS air quality stays opt-in and exposes concentration bands, not AQI classes',()=>{
  const definition=LAYERS.find(layer=>layer.id==='air-quality');
  const stateLayer=DEFAULT_STATE.layers.find(layer=>layer.id==='air-quality');
  assert.equal(definition.on,false);
  assert.equal(stateLayer.on,false);
  assert.equal(stateLayer.opacity,0.46,'the coarse global cells should not obscure the basemap');
  const legend=activeLegendItems([{id:'air-quality',on:true}],[definition])[0];
  assert.equal(legend.kind,'point');
  assert.deepEqual(legend.symbols.map(({label,shape})=>[label,shape]),[
    ['<5 μg/m³','square'],
    ['5–<12 μg/m³','square'],
    ['12–<25 μg/m³','square'],
    ['25–<50 μg/m³','square'],
    ['≥50 μg/m³','square'],
  ]);
});
