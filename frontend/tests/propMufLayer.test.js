import test from 'node:test';
import assert from 'node:assert/strict';
import {propMufContourLabel,propMufContours,propMufStations} from '../src/propMufLayer.js';

test('prop MUF contour labels show the contour frequency in MHz',()=>{
 assert.equal(propMufContourLabel({properties:{'level-value':14}}),'14 MHz');
 assert.equal(propMufContourLabel({properties:{'level-value':7.5}}),'7.5 MHz');
 assert.equal(propMufContourLabel({properties:{title:'21.00','level-value':21}}),'21 MHz');
 assert.equal(propMufContourLabel({properties:{}}),'');
});

test('prop MUF contours keep their geographic coordinates when world copies are made',()=>{
 const source={type:'FeatureCollection',features:[{type:'Feature',properties:{'level-value':14,stroke:'#007458'},geometry:{type:'LineString',coordinates:[[12,50],[13,51]]}}]};
 const result=propMufContours(source);
 assert.equal(result.type,'FeatureCollection');
 assert.equal(result.features.length,5);
 assert.deepEqual(result.features.find(feature=>feature.worldOffset===0).geometry.coordinates,[[12,50],[13,51]]);
 assert.deepEqual(result.features.find(feature=>feature.worldOffset===360).geometry.coordinates,[[372,50],[373,51]]);
 assert.equal(result.features[0].properties['level-value'],14);
});

test('prop station points normalize provider longitudes from 0–360 into map coordinates',()=>{
 const result=propMufStations([{station:{name:'Austin',latitude:'30.4',longitude:'262.3'},mufd:28.8,cs:100,time:'2026-03-19T22:10:05'}]);
 const station=result.features.find(feature=>feature.worldOffset===0);
 assert.ok(Math.abs(station.geometry.coordinates[0]+97.7)<1e-10);
 assert.equal(station.geometry.coordinates[1],30.4);
 assert.equal(station.properties.name,'Austin');
 assert.equal(station.properties.mufd,28.8);
});

test('prop MUF rejects a malformed contour collection instead of drawing a misleading layer',()=>{
 assert.throws(()=>propMufContours({type:'FeatureCollection',features:[]}),/renderable contour/);
});
