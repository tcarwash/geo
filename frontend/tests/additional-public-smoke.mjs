import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {ADDITIONAL_LAYERS,ADDITIONAL_FEED_ROUTES} from '../src/additionalLayers.js';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
 const feeds={};
 for(const layer of ADDITIONAL_LAYERS){const response=await page.request.get(`http://127.0.0.1:8088/api/v1${ADDITIONAL_FEED_ROUTES[layer.id]}`);assert(response.ok(),layer.id);feeds[layer.id]=await response.json();}
 await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url());requests.push(url.pathname+url.search);
  if(url.pathname.endsWith('/runtime'))return route.fulfill({json:{deploymentMode:'public',sharedState:false,writeEnabled:false,disabledLayers:['contacts','pskreporter','pota','wsjtx','air-traffic']}});
  if(url.pathname.endsWith('/feed-stream'))return route.fulfill({status:200,contentType:'text/event-stream',body:'retry: 60000\n\n'+url.searchParams.get('topics').split(',').map(topic=>`event: feed\ndata: ${JSON.stringify({type:'snapshot',topic,feed:feeds[topic]})}\n\n`).join('')});
  if(url.pathname.endsWith('/bathymetry-image')||url.pathname.endsWith('/vessel-density-global-image')){const response=await route.fetch({url:`http://127.0.0.1:8088${url.pathname}`});return route.fulfill({response});}
  return route.fulfill({status:404,json:{detail:{message:'unavailable'}}});
 });
 await page.goto('http://127.0.0.1:4177');await page.getByRole('button',{name:'Layers',exact:true}).click();
 const search=page.getByPlaceholder('Find a layer');
 for(const layer of ADDITIONAL_LAYERS){await search.fill(layer.name);await page.getByRole('switch',{name:layer.name,exact:true}).click();await page.locator('.layer-status').filter({hasText:/Reference|Composite|Forecast|Analysis|Model|Stale/}).waitFor({timeout:30000});}
 const cache=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('geo-public-feed-cache');request.onsuccess=()=>{const database=request.result;const read=database.transaction('feeds').objectStore('feeds').getAll();read.onsuccess=()=>{database.close();resolve(read.result.map(record=>({key:record.key,bytes:record.bytes})));};read.onerror=()=>reject(read.error)};request.onerror=()=>reject(request.error)}));

 assert(cache.some(record=>record.key==='/environment/waves'),'Full swell feed survives the browser cache');
 assert(cache.reduce((sum,record)=>sum+record.bytes,0)<=8*1024*1024,'Total browser cache stays under 8 MiB');
 assert(requests.filter(path=>path.includes('feed-stream')).length<=ADDITIONAL_LAYERS.length,'One stream per active subscription');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Enter Chron mode',exact:true}).click();await page.screenshot({path:'/tmp/geo-additional-all-public-chron.png'});
 assert.deepEqual(errors,[]);console.log(`PASS public ${ADDITIONAL_LAYERS.length} source snapshots, full swell cache under 8 MiB total, Chron composition and no page errors`);
}finally{await browser.close()}
