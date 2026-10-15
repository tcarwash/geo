import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_FEED_CACHE_MAX_BYTES,PUBLIC_FEED_CACHE_MAX_ENTRIES,PUBLIC_FEED_CACHE_MAX_ENTRY_BYTES,publicFeedCacheExpiry,publicFeedCacheKey} from '../src/publicFeedCache.js';

test('public feed cache accepts same-origin open feeds but excludes private and personalized routes',()=>{
 assert.equal(publicFeedCacheKey('/earthquakes?period=day'),'/earthquakes?period=day');
 for(const route of ['/runtime','/layouts','/drawings','/settings','/adif/contacts','/adif/import','/psk-reporter?callsign=K1ABC','/pota-spots?latitude=40&longitude=-70','/wsjtx/heard','https://upstream.example/feed'])assert.equal(publicFeedCacheKey(route),null,`${route} must not enter the public browser cache`);
});

test('public feed cache honors provider expiry and uses a short fallback TTL',()=>{
 const now=Date.parse('2026-10-10T12:00:00Z');
 assert.equal(publicFeedCacheExpiry({expiresAt:'2026-10-10T12:05:00Z'},now),Date.parse('2026-10-10T12:05:00Z'));
 assert.equal(publicFeedCacheExpiry({},now),now+30_000);
 assert.equal(PUBLIC_FEED_CACHE_MAX_ENTRIES,24);
 assert.equal(PUBLIC_FEED_CACHE_MAX_ENTRY_BYTES,4*1024*1024);
 assert.equal(PUBLIC_FEED_CACHE_MAX_BYTES,8*1024*1024);
});
