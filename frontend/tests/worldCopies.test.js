import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_OFFSETS,worldCopies} from '../src/worldCopies.js';

test('geographic copies retain features and shift every longitude by whole worlds',()=>{
 const source={type:'FeatureCollection',features:[
  {type:'Feature',id:'marker',properties:{name:'ISS'},geometry:{type:'Point',coordinates:[170,12]}},
  {type:'Feature',id:'country',properties:{name:'Fiji'},geometry:{type:'Polygon',coordinates:[[[179,-1],[181,-1],[181,1],[179,1],[179,-1]]]}}
 ]};
 const result=worldCopies(source);
 assert.equal(result.features.length,source.features.length*WORLD_OFFSETS.length);
 for(const offset of WORLD_OFFSETS){
  const marker=result.features.find(f=>f.id==='marker'&&f.worldOffset===offset);
  const country=result.features.find(f=>f.id==='country'&&f.worldOffset===offset);
  assert.deepEqual(marker.geometry.coordinates,[170+offset,12]);
  assert.deepEqual(country.geometry.coordinates[0][1],[181+offset,-1]);
 }
 assert.deepEqual(source.features[1].geometry.coordinates[0][1],[181,-1]);
});
