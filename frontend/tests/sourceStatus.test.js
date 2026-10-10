import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceStatusLabel,sourceStatusTone,sourceTimeDetails} from '../src/sourceStatus.js';

const age=value=>`age:${value}`;

test('distinguishes waiting, updating, current, and stale source states',()=>{
  assert.equal(sourceStatusLabel('earthquakes',null,age),'Waiting for source');
  assert.equal(sourceStatusLabel('earthquakes',{loading:true},age),'Updating');
  assert.equal(sourceStatusLabel('earthquakes',{status:'current',kind:'observation',dataTime:'10:00'},age),'Observed · age:10:00');
  assert.equal(sourceStatusLabel('muf',{status:'current',kind:'forecast',dataTime:'10:00'},age),'Forecast · age:10:00');
  assert.equal(sourceStatusLabel('earthquakes',{status:'stale',dataTime:'09:00'},age),'Stale · age:09:00');
  assert.equal(sourceStatusLabel('earthquakes',{staleReason:'upstream timeout',dataTime:'09:00'},age),'Stale · age:09:00');
  assert.equal(sourceStatusLabel('earthquakes',{status:'unavailable',error:'upstream timeout',dataTime:'09:00'},age),'Stale · age:09:00');
});

test('does not call unavailable sources current and identifies non-feed data honestly',()=>{
  assert.equal(sourceStatusLabel('earthquakes',{error:'offline'},age),'Unavailable');
  assert.equal(sourceStatusLabel('earthquakes',{status:'unavailable'},age),'Unavailable');
  assert.equal(sourceStatusLabel('contacts',{status:'user',dataTime:'today'},age),'User data');
  assert.equal(sourceStatusLabel('night',null,age),'Computed');
  assert.equal(sourceStatusLabel('maidenhead',null,age),'Reference');
});

test('separates product time, forecast validity, and retrieval time',()=>{
  assert.deepEqual(sourceTimeDetails({kind:'observation',dataTime:'10:00',fetchedAt:'10:05',validFrom:'09:55',validTo:'10:10'},age),[
    ['Observed','age:10:00'],['Valid from','age:09:55'],['Valid until','age:10:10'],['Retrieved','age:10:05'],
  ]);
  assert.deepEqual(sourceTimeDetails({kind:'forecast',dataTime:'10:00',validFrom:'11:00',fetchedAt:'10:05'},age),[
    ['Issued','age:10:00'],['Valid from','age:11:00'],['Retrieved','age:10:05'],
  ]);
  assert.deepEqual(sourceTimeDetails({kind:'composite',fetchedAt:'10:05'},age),[['Retrieved','age:10:05']]);
});

test('keeps stale cached sources in the stale visual state after refresh errors',()=>{
  assert.equal(sourceStatusTone({loading:true}),'loading');
  assert.equal(sourceStatusTone({error:'timeout',dataTime:'09:00'}),'stale');
  assert.equal(sourceStatusTone({status:'stale',staleReason:'timeout'}),'stale');
  assert.equal(sourceStatusTone({status:'unavailable',error:'offline'}),'unavailable');
});
