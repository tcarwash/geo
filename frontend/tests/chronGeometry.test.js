import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chronGeometry,clockTimeScaleShift,solarHourAngle} from '../src/chronGeometry.js';
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
