import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoToQuery,matchCountries} from '../src/goTo.js';

test('parses coordinate pairs in latitude, longitude order',()=>{
  assert.deepEqual(parseGoToQuery('45.64, -122.66'),{lat:45.64,lng:-122.66,label:'45.64, -122.66'});
  assert.deepEqual(parseGoToQuery('-90 180'),{lat:-90,lng:180,label:'-90, 180'});
});

test('resolves Maidenhead locators to cell centers at supported precision',()=>{
  const point=parseGoToQuery('CN85qp');
  assert.ok(Math.abs(point.lat-45.645833)<0.00001);
  assert.ok(Math.abs(point.lng+122.625)<0.00001);
  assert.deepEqual(parseGoToQuery('CN85'),{lat:45.5,lng:-123,label:'CN85'});
  assert.equal(parseGoToQuery('RR99xx').lat<90,true);
});

test('rejects malformed or out-of-range destinations without throwing',()=>{
  for(const query of ['', 'CN8', 'ZZ99', '91,0', '0,181', 'north']) assert.equal(parseGoToQuery(query),null,query);
});

test('matches bundled country names by exact, prefix, or contained text',()=>{
  const countries=[{name:'United States of America',lat:39,lng:-98},{name:'Canada',lat:56,lng:-106},{name:'France',lat:46,lng:2}];
  assert.equal(matchCountries('can',countries)[0].name,'Canada');
  assert.equal(matchCountries('states',countries)[0].name,'United States of America');
  assert.equal(matchCountries('france',countries)[0].name,'France');
  assert.deepEqual(matchCountries('xyz',countries),[]);
});
