import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldSample,fieldVector,pressureSegments,advanceParticle,fieldInspection} from '../src/fieldMath.js';
const grid={nx:4,ny:3,lon0:0,lat0:90,dx:90,dy:-90,fields:{u:[1,2,3,4,1,2,3,4,1,2,3,4],v:Array(12).fill(2),pressure:[100000,100000,102000,102000,100000,100000,102000,102000,100000,100000,102000,102000]}};
test('interpolates actual field values across wrapped worlds and the date line',()=>{
 assert.equal(fieldSample(grid,'u',0,45),1.5);
 assert.equal(fieldSample(grid,'u',0,405),1.5);
 assert.equal(fieldSample(grid,'u',0,-45),2.5);
 assert.equal(fieldSample(grid,'u',100,0),null);
 const vector=fieldVector(grid,0,0);assert.equal(vector.u,1);assert.equal(vector.v,2);assert.equal(vector.speed,Math.sqrt(5));
});
test('preserves null masks and samples available nodes without inventing nearby values',()=>{
 const masked={...grid,fields:{...grid.fields,u:[null,2,3,4,...grid.fields.u.slice(4)]}};
 assert.equal(fieldSample(masked,'u',90,45),null);
 assert.equal(fieldSample(masked,'u',90,90),2);
 assert.equal(fieldSample(masked,'u',45,0),null);
});
test('pressure contours use hPa and masked pressure remains a gap',()=>{
 const segments=pressureSegments(grid,1010,1);assert(segments.length>0);
 assert(segments.every(segment=>segment.every(([lon])=>lon===135)));
 const blank={...grid,fields:{pressure:Array(12).fill(null)}};assert.deepEqual(pressureSegments(blank,1010,1),[]);
});
test('particle flow follows east/north components and inspection preserves units and valid time',()=>{
 const point=advanceParticle({lat:0,lng:0},{u:2,v:1},1,.5);assert.deepEqual(point,{lat:.5,lng:1});
 const detail=fieldInspection('pressure',grid,0,0,'2026-10-11T21:00:00Z');assert.equal(detail.fields[0][1],'1000.0 hPa');assert.equal(detail.fields[1][1],'2026-10-11T21:00:00Z');
 const wave={...grid,fields:{height:Array(12).fill(2),period:Array(12).fill(10),direction:Array(12).fill(350),swellHeight:Array(12).fill(1.5),swellPeriod:Array(12).fill(12),swellDirection:Array(12).fill(320)}};
 const swell=fieldInspection('waves',wave,0,0,'valid');assert.equal(swell.fields.find(([label])=>label==='Primary swell height')[1],'1.50 m');
});

test('wave directions interpolate circularly across north',()=>{const angles={...grid,fields:{direction:Array.from({length:12},(_,i)=>i%4===0?350:10)}};assert(Math.abs(fieldSample(angles,'direction',0,45))<1e-8);});
