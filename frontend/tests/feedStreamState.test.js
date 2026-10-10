import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyFeedStreamEvent,createFeedStreamUrl,markExpiredFeeds,markFeedStreamDisconnected,publicStreamTopics,restorePublicFeedSnapshot,PUBLIC_FEED_CACHE_ROUTES} from '../src/feedStreamState.js';

const envelope={source:'USGS',status:'current',fetchedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',data:{features:[{id:1}]}};

test('feed snapshots and changes replace the source data without a loading flash',()=>{
 const feeds=applyFeedStreamEvent({}, {type:'snapshot',topic:'earthquakes',feed:envelope});
 assert.equal(feeds.earthquakes.loading,false);
 assert.equal(feeds.earthquakes.data.features.length,1);
 assert.equal(feeds.earthquakes.error,undefined);
});

test('expired snapshots are stale immediately instead of appearing fresh until the next timer tick',()=>{
 const feed={...envelope,expiresAt:'2020-01-01T00:00:00Z'};
 const next=applyFeedStreamEvent({}, {type:'snapshot',topic:'earthquakes',feed});
 assert.equal(next.earthquakes.status,'stale');
 assert.match(next.earthquakes.staleReason,/expired/i);
});

test('metadata events update freshness while retaining map data identity',()=>{
 const feeds={earthquakes:envelope},data=feeds.earthquakes.data;
 const next=applyFeedStreamEvent(feeds,{type:'metadata',topic:'earthquakes',meta:{status:'current',fetchedAt:'2026-01-01T00:01:00Z',expiresAt:'2099-01-01T00:01:00Z'}});
 assert.equal(next.earthquakes.data,data);
 assert.equal(next.earthquakes.fetchedAt,'2026-01-01T00:01:00Z');
});

test('expired feeds become stale and stream errors preserve available data',()=>{
 const expired={...envelope,expiresAt:'2020-01-01T00:00:00Z'};
 const stale=markExpiredFeeds({earthquakes:expired},Date.parse('2026-01-01T00:00:00Z'));
 assert.equal(stale.earthquakes.status,'stale');
 const failed=applyFeedStreamEvent(stale,{type:'error',topic:'earthquakes',message:'Feed temporarily unavailable.'});
 assert.equal(failed.earthquakes.status,'stale');
 assert.equal(failed.earthquakes.data,expired.data);
 assert.equal(failed.earthquakes.error,'Feed temporarily unavailable.');
});

test('feed stream URL deduplicates topics and cache routes cover streamable public feeds',()=>{
 assert.equal(createFeedStreamUrl(['earthquakes','weather-alerts','earthquakes']),'/api/v1/feed-stream?topics=earthquakes%2Cweather-alerts');
 assert.equal(PUBLIC_FEED_CACHE_ROUTES.earthquakes,'/earthquakes?period=day');
 assert.equal(PUBLIC_FEED_CACHE_ROUTES.contacts,undefined);
});

test('public stream subscriptions filter out private and unknown layer IDs',()=>{
 assert.deepEqual(publicStreamTopics('earthquakes,contacts,wsjtx,not-a-feed,earthquakes'),['earthquakes']);
});

test('restored cached data is immediately labeled current or stale rather than stuck loading',()=>{
 const stale=restorePublicFeedSnapshot({},'earthquakes',{value:envelope,stale:true});
 assert.equal(stale.earthquakes.loading,false);
 assert.equal(stale.earthquakes.status,'stale');
 const newer=restorePublicFeedSnapshot({earthquakes:{...envelope,fetchedAt:'2026-01-02T00:00:00Z'}},'earthquakes',{value:envelope,stale:false});
 assert.equal(newer.earthquakes.fetchedAt,'2026-01-02T00:00:00Z');
});

test('disconnecting clears loading while keeping expired data visibly stale',()=>{
 const expired={...envelope,loading:true,expiresAt:'2020-01-01T00:00:00Z'};
 const next=markFeedStreamDisconnected({earthquakes:expired},['earthquakes'],Date.parse('2026-01-01T00:00:00Z'));
 assert.equal(next.earthquakes.loading,false);
 assert.equal(next.earthquakes.status,'stale');
 assert.equal(next.earthquakes.data,expired.data);
});
