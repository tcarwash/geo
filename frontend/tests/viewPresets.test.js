import test from 'node:test';
import assert from 'node:assert/strict';
import {VIEW_PRESETS, applyViewPreset} from '../src/viewPresets.js';

const state = () => ({base:'terrain',map:{center:[12,34],zoom:3},station:{callsign:'K1ABC'},clocks:[{name:'UTC',zone:'UTC'}],layers:[
  {id:'night',on:false,opacity:.2,showLabels:true},{id:'graticule',on:false,opacity:.3},{id:'clouds',on:true,opacity:.61},{id:'precipitation',on:false,opacity:.4},{id:'storms',on:false,opacity:.5},{id:'maidenhead',on:false,opacity:.6},{id:'muf',on:false,opacity:.7},{id:'rbn',on:false,opacity:.8},{id:'aurora',on:false,opacity:.9},{id:'satellite',on:false,opacity:.45},{id:'custom-1',custom:true,on:true,opacity:.23}],widgets:[{id:'clock1',type:'clock',title:'UTC',x:4,y:5,width:280,height:180,zone:'UTC'}]});
const enabled = s => s.layers.filter(l=>l.on).map(l=>l.id);

test('exports four restrained presets assembled from existing layers', () => {
  assert.deepEqual(Object.keys(VIEW_PRESETS), ['atlas','weather','radio','space']);
  assert.deepEqual(VIEW_PRESETS.atlas.layers, ['night','graticule']);
  assert.deepEqual(VIEW_PRESETS.weather.layers, ['clouds','precipitation','storms']);
  assert.deepEqual(VIEW_PRESETS.radio.layers, ['maidenhead','muf','rbn']);
  assert.deepEqual(VIEW_PRESETS.space.layers, ['night','aurora','satellite']);
});

test('applying every preset changes only built-in layer visibility', () => {
  for (const id of Object.keys(VIEW_PRESETS)) {
    const before=state();
    before.widgets.push({id:'user-space-weather',type:'space-weather',title:'My space weather',x:10,y:20,width:300,height:190});
    const result=applyViewPreset(before,id);
    assert.deepEqual(enabled(result), [...VIEW_PRESETS[id].layers,'custom-1']);
    assert.deepEqual(result.widgets.find(w=>w.id==='user-space-weather'),before.widgets.find(w=>w.id==='user-space-weather'));
    assert.deepEqual(result.layers.map(({id,on})=>({id,on})), before.layers.map(l=>({id:l.id,on:VIEW_PRESETS[id].layers.includes(l.id)||l.custom?true:false})));
    for (const layer of result.layers) assert.deepEqual({...layer,on:before.layers.find(x=>x.id===layer.id).on}, before.layers.find(x=>x.id===layer.id));
    assert.notEqual(result,before);
  }
});

test('Space adds one compact weather widget and other presets remove it', () => {
  const initial=state();
  const space=applyViewPreset(initial,'space');
  const widget=space.widgets.find(w=>w.type==='space-weather');
  assert.ok(widget);
  assert.equal(widget.width,240); assert.equal(widget.height,150);
  assert.equal(space.widgets.filter(w=>w.type==='space-weather').length,1);
  assert.deepEqual(applyViewPreset(space,'atlas').widgets,initial.widgets);
  assert.deepEqual(applyViewPreset(space,'space').widgets,space.widgets);
});

test('preserves unrelated state and accepts prior state as an undo snapshot', () => {
  const before=state(), after=applyViewPreset(before,'weather');
  for(const key of ['base','map','station','clocks']) assert.deepEqual(after[key],before[key]);
  const restored=applyViewPreset(after,'atlas',before);
  assert.deepEqual(restored.layers,before.layers);
  assert.deepEqual(restored.widgets,before.widgets);
  assert.deepEqual(before.layers, state().layers);
});

test('unknown preset ID returns original state unchanged', () => {
  const before=state();
  assert.equal(applyViewPreset(before,'missing'),before);
});
