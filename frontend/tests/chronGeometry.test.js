import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chronGeometry,solarHourAngle} from '../src/chronGeometry.js';

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
