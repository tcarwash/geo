import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),requests=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const feeds={};
 for(const topic of ['air-routes','sea-routes']){
  const response=await page.request.get(`${process.env.GEO_API_URL||'http://127.0.0.1:8085'}/api/v1/${topic}`);assert(response.ok());feeds[topic]=await response.json();
 }
 await page.addInitScript(()=>localStorage.setItem('geo-draft',JSON.stringify({version:1,layers:[{id:'air-traffic',on:true,opacity:1}]})));
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());requests.push(url.pathname+url.search);
  if(url.pathname.endsWith('/runtime'))return route.fulfill({json:{deploymentMode:'public',sharedState:false,writeEnabled:false,disabledLayers:['contacts','pskreporter','pota','wsjtx','air-traffic']}});
  if(url.pathname.endsWith('/feed-stream')){
   const topics=url.searchParams.get('topics').split(',');assert(!topics.includes('air-traffic'));
   return route.fulfill({status:200,contentType:'text/event-stream',body:topics.map(topic=>`event: feed\ndata: ${JSON.stringify({type:'snapshot',topic,feed:feeds[topic]})}\n\n`).join('')});
  }
  return route.fulfill({status:404,json:{detail:{message:'disabled'}}});
 });
 await page.goto(process.env.GEO_UI_URL||'http://127.0.0.1:4175');await page.getByRole('button',{name:'Layers',exact:true}).click();
 const search=page.getByPlaceholder('Find a layer');await search.fill('Air traffic');
 const traffic=page.getByRole('switch',{name:'Air traffic',exact:true});assert(await traffic.isDisabled());assert.equal(await traffic.isChecked(),false);
 await page.locator('.layer-info summary').click();await page.getByText('Disabled on this server.',{exact:false}).waitFor();
 for(const name of ['Air routes · 2014','Sea routes']){
  await search.fill(name);await page.getByRole('switch',{name,exact:true}).click();
  await page.locator('.layer-status').filter({hasText:/Reference/}).waitFor();
 }
 await page.waitForFunction(()=>document.querySelectorAll('.leaflet-data-air-routes-pane canvas,.leaflet-data-sea-routes-pane canvas').length===2);
 assert.equal(requests.some(path=>path.startsWith('/api/v1/air-traffic')),false);
 assert.deepEqual(errors,[]);console.log('PASS public: restored aircraft disabled with zero aircraft requests; both bundled routes rendered from SSE snapshots');
}finally{await browser.close()}
