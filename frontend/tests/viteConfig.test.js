import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../vite.config.js';

test('prop provider proxy removes only the local routing prefix',()=>{
 const rewrite=config.server.proxy['/prop'].rewrite;
 assert.equal(rewrite('/prop/api/stations.json'),'/api/stations.json');
 assert.equal(rewrite('/prop/renders/current/mufd-normal-now.geojson'),'/renders/current/mufd-normal-now.geojson');
});
