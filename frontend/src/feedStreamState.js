export const PUBLIC_FEED_CACHE_ROUTES={
 'space-weather':'/space-weather',earthquakes:'/earthquakes?period=day',wildfires:'/natural-events/wildfires',volcanoes:'/natural-events/volcanoes',floods:'/natural-events/floods','severe-storms':'/natural-events/severe-storms','weather-alerts':'/weather-alerts',aurora:'/aurora','air-quality':'/air-quality',satellite:'/satellites/25544','goes-track':'/goes-satellites',muf:'/muf',storms:'/storm-tracks',rbn:'/rbn-spots','dx-cluster':'/dx-cluster-spots'
};

export function publicStreamTopics(value){
 const topics=Array.isArray(value)?value:String(value||'').split(',');
 return [...new Set(topics.map(topic=>String(topic).trim()).filter(topic=>Object.hasOwn(PUBLIC_FEED_CACHE_ROUTES,topic)))];
}

export function restorePublicFeedSnapshot(feeds,topic,cached){
 if(!Object.hasOwn(PUBLIC_FEED_CACHE_ROUTES,topic)||!cached?.value)return feeds;
 const currentFetched=Date.parse(feeds[topic]?.fetchedAt||''),cachedFetched=Date.parse(cached.value.fetchedAt||'');
 if(Number.isFinite(currentFetched)&&Number.isFinite(cachedFetched)&&currentFetched>cachedFetched)return feeds;
 const value={...cached.value,loading:false,error:undefined};
 if(cached.stale){value.status='stale';value.staleReason=value.staleReason||'Browser copy has passed its source expiry.'}
 return {...feeds,[topic]:value};
}

export function createFeedStreamUrl(topics){
 const unique=[...new Set(topics)].filter(topic=>Object.hasOwn(PUBLIC_FEED_CACHE_ROUTES,topic));
 return unique.length?`/api/v1/feed-stream?topics=${encodeURIComponent(unique.join(','))}`:'';
}

export function applyFeedStreamEvent(feeds,event,now=Date.now()){
 if(!event||!Object.hasOwn(PUBLIC_FEED_CACHE_ROUTES,event.topic))return feeds;
 const current=feeds[event.topic]||{};
 if((event.type==='snapshot'||event.type==='update')&&event.feed&&typeof event.feed==='object'){
  const feed={...event.feed,loading:false,error:undefined},expiry=Date.parse(feed.expiresAt||'');
  if(Number.isFinite(expiry)&&expiry<=now&&feed.status!=='stale'){
   feed.status='stale';
   feed.staleReason=feed.staleReason||'Feed snapshot expired before delivery.';
  }
  return {...feeds,[event.topic]:feed};
 }
 if(event.type==='metadata'&&event.meta&&typeof event.meta==='object')return {...feeds,[event.topic]:{...current,...event.meta,loading:false,error:undefined}};
 if(event.type==='error'){
  const hasData=current.data!==undefined&&current.data!==null;
  return {...feeds,[event.topic]:{...current,status:hasData?'stale':'unavailable',loading:false,...(hasData?{staleReason:current.staleReason||'Live updates are unavailable; showing the last available data.'}:{}),error:event.message||'Feed temporarily unavailable.'}};
 }
 return feeds;
}

export function markExpiredFeeds(feeds,now=Date.now()){
 let next=feeds;
 for(const [topic,feed] of Object.entries(feeds)){
  const expiry=Date.parse(feed?.expiresAt||'');
  if(!Number.isFinite(expiry)||expiry>now||feed.status==='stale'||feed.status==='unavailable')continue;
  if(next===feeds)next={...feeds};
  next[topic]={...feed,status:'stale',loading:false,staleReason:feed.staleReason||'Feed expired while live updates were disconnected.'};
 }
 return next;
}

export function markFeedStreamDisconnected(feeds,topics,now=Date.now()){
 let next=markExpiredFeeds(feeds,now);
 for(const topic of topics){
  const feed=next[topic]||{},hasData=feed.data!==undefined&&feed.data!==null,expiry=Date.parse(feed.expiresAt||''),expired=Number.isFinite(expiry)&&expiry<=now;
  if(!feed.loading&&hasData&&!expired)continue;
  if(next===feeds)next={...feeds};
  next[topic]={...feed,loading:false,...(!hasData?{status:'unavailable',error:feed.error||'Live updates are reconnecting.'}:{}),...(expired?{status:'stale',staleReason:feed.staleReason||'Feed expired while live updates were disconnected.'}:{})};
 }
 return next;
}


