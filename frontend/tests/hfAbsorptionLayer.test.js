import test from 'node:test';
import assert from 'node:assert/strict';
import {drapSourceCoordinate,webMercatorLatitude} from '../src/hfAbsorptionLayer.js';
import {contrastInfraredPixels} from '../src/infraredContrast.js';

test('D-RAP grid transformation maps Web Mercator tile pixels to source lon/lat',()=>{
 assert.equal(webMercatorLatitude(128,0),0);
 const center=drapSourceCoordinate(128,128,0);
 assert.equal(center.x,350);
 assert.equal(center.y,184);
 const wrapped=drapSourceCoordinate(256+128,128,0);
 assert.deepEqual(wrapped,center);
});

test('D-RAP sampling clips polar rows to the valid Web Mercator world',()=>{
 const north=drapSourceCoordinate(128,0,0),south=drapSourceCoordinate(128,256,0);
 assert.ok(north.y>20&&north.y<70);
 assert.ok(south.y>300&&south.y<348);
});

test('global infrared composite boosts cold-cloud contrast and fades warm background',()=>{
 const pixels=new Uint8ClampedArray([40,40,40,255,80,80,80,255,150,150,150,255]);
 contrastInfraredPixels(pixels);
 assert.equal(pixels[3],0);
 assert.ok(pixels[4]<pixels[8]);
 assert.ok(pixels[7]<pixels[11]);
 assert.ok(pixels[8]>140);
});
