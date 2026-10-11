import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as chronGeometryHelpers from '../src/chronGeometry.js';
const {chronGeometry,clockTimeScaleShift,solarHourAngle}=chronGeometryHelpers;
import {sunPosition} from '../src/core.js';

test('equinox chron geometry centers noon with vertical day-night edges',()=>{
  assert.equal(solarHourAngle(0,0),90);
  const geometry=chronGeometry(0,1000,500);
  assert.match(geometry.night,/L 250\.00/);
  assert.match(geometry.grayline,/M /);
  assert.ok(geometry.noonX===500);
});

test('seasonal declination bends the terminator and grayline expands beyond daylight',()=>{
  assert.ok(solarHourAngle(45,23.4)>90);
  assert.ok(solarHourAngle(-45,23.4)<90);
  assert.ok(solarHourAngle(45,23.4,-6)>solarHourAngle(45,23.4,0));
  const geometry=chronGeometry(23.4,1440,900);
  assert.ok(geometry.night.split('L').length>20);
  assert.ok(geometry.grayline.length>geometry.night.length/10);
});

test('minimum normal-map zoom keeps the projected world at least as tall as the map',()=>{
  const minimumZoom=chronGeometryHelpers.minimumVerticalMapZoom;
  assert.equal(typeof minimumZoom,'function');
  for(const height of [300,844,900,2160]){
    const zoom=minimumZoom(height);
    assert.ok(256*2**zoom>=height,'zooming out must not shrink the projected world below the map height');
    assert.ok(256*2**(zoom-.1)<height,'the next zoom step out must exceed the vertical map extent');
  }
});

test('Chron zoom rounds up enough to cover the viewport horizontally',()=>{
  const zoomForWidth=chronGeometryHelpers.chronZoomForWidth;
  assert.equal(typeof zoomForWidth,'function');
  for(const width of [390,1440,1920]){
    const zoom=zoomForWidth(width);
    assert.ok(256*2**zoom>=width,'the geographic overlay must cover both horizontal viewport edges');
    assert.ok(256*2**(zoom-.1)<width,'choose only the smallest supported zoom that covers the width');
  }
});

test('Chron vertical panning clamps to projected world bounds',()=>{
  assert.equal(typeof chronGeometryHelpers.clampChronCenterY,'function');
  const clamp=chronGeometryHelpers.clampChronCenterY;
  assert.equal(clamp(0,0,1440,900),450,'wide maps cannot pan far enough to expose space beyond either pole');
  assert.equal(clamp(700,0,1440,900),700,'centers within the allowed range remain unchanged');
  assert.equal(clamp(1440,0,1440,900),990,'wide maps stop with both projected poles still covering the viewport');
  assert.equal(clamp(-20,0,390,844),0,'a tall viewport cannot pan the whole projected world beyond its north edge');
  assert.equal(clamp(410,0,390,844),390,'a tall viewport cannot pan the whole projected world beyond its south edge');
});

test('chron geometry stays finite and covers polar-day and polar-night rows',()=>{
  for(const declination of [-23.4,0,23.4]){
    const geometry=chronGeometry(declination,390,844);
    assert.ok(!/NaN|Infinity/.test(geometry.night+geometry.grayline));
    assert.ok(geometry.night.length>0);
    assert.ok(geometry.grayline.length>0);
  }
  assert.equal(solarHourAngle(80,23.4),180);
  assert.equal(solarHourAngle(-80,23.4),0);
  const portrait=chronGeometry(0,390,844);
  assert.equal(portrait.worldSize,390);
  assert.equal(portrait.worldTop,227);
});

test('a selected clock adds a civil-time offset without shifting the solar map',()=>{
  const londonNoon=new Date('2026-10-10T12:00:00Z');
  const shift=clockTimeScaleShift(londonNoon,{zone:'Europe/London',longitude:0},0);
  assert.ok(Math.abs(shift+1)<0.01,'the London civil-time ruler moves one hour west of solar noon while on BST');
  assert.equal(clockTimeScaleShift(londonNoon,null,0),0,'no selection leaves only the solar scale');
  assert.equal(chronGeometry(0,1200,800).noonX,600,'the astronomical noon meridian stays centered');
});

test('Los Angeles civil noon aligns with its map position, not the solar-hour label',()=>{
  const date=new Date('2026-10-10T19:30:00Z'),zone='America/Los_Angeles',longitude=-118.2437;
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const civilHour=Number(parts.find(part=>part.type==='hour').value)+Number(parts.find(part=>part.type==='minute').value)/60;
  const solarHour=12+((((longitude-sunPosition(date).lng)+180)%360+360)%360-180)/15;
  const shift=clockTimeScaleShift(date,{zone,longitude},sunPosition(date).lng);
  const labelAtLosAngeles=((solarHour-shift)%24+24)%24;
  assert.ok(Math.abs(labelAtLosAngeles-civilHour)<0.01,'the selected place reads its actual timezone-aware clock time on the second ruler');
  assert.ok(shift<0,'when LA civil time is later than solar time, its civil ruler shifts west');
});
