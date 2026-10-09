import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceMufPixels} from '../src/propMufLayer.js';

test('prop MUF colors stay vivid over colored basemaps and chart white becomes transparent',()=>{
 const pixels=new Uint8ClampedArray([160,190,210,255,255,255,255,255,40,60,80,180]);
 enhanceMufPixels(pixels);
 assert.ok(pixels[0]<150,'blue field is separated from the pastel basemap');
 assert.ok(pixels[2]>225,'blue field remains vivid');
 assert.equal(pixels[7],0,'white chart background is transparent');
 assert.equal(pixels[11],180,'source transparency is preserved');
});
