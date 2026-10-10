import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_STATE,LAYERS,normalizeState} from '../src/core.js';

test('International Date Line is an optional map-reference layer',()=>{
  const definition=LAYERS.find(layer=>layer.id==='dateline');
  assert.ok(definition);
  assert.equal(definition.on,false);
  assert.equal(normalizeState(DEFAULT_STATE).layers.find(layer=>layer.id==='dateline').on,false);
  const enabled=normalizeState({...DEFAULT_STATE,layers:DEFAULT_STATE.layers.map(layer=>layer.id==='dateline'?{...layer,on:true,opacity:.8}:layer)});
  assert.equal(enabled.layers.find(layer=>layer.id==='dateline').on,true);
});
