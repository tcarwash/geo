export const PUBLIC_FEED_CACHE_MAX_ENTRIES=24;
export const PUBLIC_FEED_CACHE_MAX_ENTRY_BYTES=4*1024*1024;
export const PUBLIC_FEED_CACHE_MAX_BYTES=8*1024*1024;
const DATABASE='geo-public-feed-cache';
const STORE='feeds';
const VERSION=1;
const FALLBACK_TTL_MS=30_000;
const PRIVATE_PATHS=new Set(['/runtime','/layouts','/drawings','/settings','/adif/contacts','/adif/import','/psk-reporter','/pota-spots','/wsjtx/heard']);

export function publicFeedCacheKey(route){
 if(typeof route!=='string'||!route.startsWith('/')||route.startsWith('//'))return null;
 const path=route.split('?')[0];
 if(PRIVATE_PATHS.has(path)||path.startsWith('/adif/')||path.startsWith('/wsjtx/'))return null;
 return route;
}

export function publicFeedCacheExpiry(value,now=Date.now()){
 const expiry=Date.parse(value?.expiresAt||'');
 return Number.isFinite(expiry)?expiry:now+FALLBACK_TTL_MS;
}

function openDatabase(){
 if(!globalThis.indexedDB)throw new Error('IndexedDB is unavailable.');
 return new Promise((resolve,reject)=>{
  const request=globalThis.indexedDB.open(DATABASE,VERSION);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'key'});};
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  request.onerror=()=>reject(request.error||new Error('Could not open the browser feed cache.'));
  request.onblocked=()=>reject(new Error('The browser feed cache is busy in another tab.'));
 });
}

function getRecord(store,key){
 return new Promise((resolve,reject)=>{
  const request=store.get(key);
  request.onsuccess=()=>resolve(request.result||null);
  request.onerror=()=>reject(request.error||new Error('Could not read the browser feed cache.'));
 });
}

export async function readPublicFeedCache(route,now=Date.now()){
 const key=publicFeedCacheKey(route);
 if(!key)return null;
 const database=await openDatabase();
 try{
  const transaction=database.transaction(STORE,'readonly');
  const record=await getRecord(transaction.objectStore(STORE),key);
  return record?{value:record.value,storedAt:record.storedAt,expiresAt:record.expiresAt,stale:record.expiresAt<=now}:null;
 }finally{database.close();}
}

export async function writePublicFeedCache(route,value,now=Date.now()){
 const key=publicFeedCacheKey(route);
 if(!key)return false;
 const serialized=JSON.stringify(value),bytes=new TextEncoder().encode(serialized).byteLength;
 if(bytes>PUBLIC_FEED_CACHE_MAX_ENTRY_BYTES)return false;
 const record={key,value,bytes,storedAt:now,expiresAt:publicFeedCacheExpiry(value,now)};
 const database=await openDatabase();
 try{
  await new Promise((resolve,reject)=>{
   const transaction=database.transaction(STORE,'readwrite'),store=transaction.objectStore(STORE),request=store.getAll();
   request.onsuccess=()=>{
    const records=request.result.filter(item=>item.key!==key);
    records.push(record);
    records.sort((a,b)=>b.storedAt-a.storedAt);
    let total=0;const kept=[];
    for(const item of records){if(kept.length>=PUBLIC_FEED_CACHE_MAX_ENTRIES||total+item.bytes>PUBLIC_FEED_CACHE_MAX_BYTES)continue;kept.push(item);total+=item.bytes;}
    const keptKeys=new Set(kept.map(item=>item.key));
    for(const item of request.result)if(!keptKeys.has(item.key))store.delete(item.key);
    for(const item of kept)store.put(item);
   };
   transaction.oncomplete=()=>resolve();
   transaction.onerror=()=>reject(transaction.error||new Error('Could not save the browser feed cache.'));
   transaction.onabort=()=>reject(transaction.error||new Error('Browser feed cache save was interrupted.'));
  });
  return true;
 }finally{database.close();}
}

export async function clearPublicFeedCache(){
 if(!globalThis.indexedDB)return false;
 const database=await openDatabase();
 try{
  await new Promise((resolve,reject)=>{
   const transaction=database.transaction(STORE,'readwrite');
   transaction.objectStore(STORE).clear();
   transaction.oncomplete=()=>resolve();
   transaction.onerror=()=>reject(transaction.error||new Error('Could not clear the browser feed cache.'));
   transaction.onabort=()=>reject(transaction.error||new Error('Browser feed cache clearing was interrupted.'));
  });
  return true;
 }finally{database.close();}
}
