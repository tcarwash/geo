import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {DEFAULT_STATE} from '../src/core.js';
import {WORLD_OFFSETS} from '../src/worldCopies.js';

const feed={source:'open-meteo-cams-global',kind:'forecast',status:'current',fetchedAt:'2026-10-10T12:05:00Z',dataTime:'2026-10-10T12:00:00Z',validFrom:'2026-10-10T12:00:00Z',units:{pm2_5:'μg/m³',pm10:'μg/m³'},coverage:'Global · 12° sampled model overview',attribution:'Open-Meteo · CAMS Global · CC BY 4.0',documentationUrl:'https://open-meteo.com/en/docs/air-quality-api',data:{type:'FeatureCollection',gridSpacingDegrees:12,modelResolutionKm:45,features:[
 ...Array.from({length:450},(_,index)=>{
  const latitude=-84+Math.floor(index/30)*12,longitude=-174+(index%30)*12,pm25=[3,18,64][(index+Math.floor(index/30))%3];
  const west=longitude-6,east=longitude+6,south=Math.max(-85,latitude-6),north=Math.min(85,latitude+6);
  return {type:'Feature',id:`sample-${index}`,properties:{pm2_5:pm25,pm10:pm25*1.3,validTime:'2026-10-10T12:00:00Z'},geometry:{type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]}};
 })
 ]}};

const browser=await chromium.launch({headless:true});
try{
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<600});
  let calls=0;const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(state=>localStorage.setItem('geo-draft',JSON.stringify(state)),DEFAULT_STATE);
  await page.route('**/api/v1/air-quality',async route=>{calls++;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(feed)});});
  await page.goto(process.env.GEO_UI_URL||'http://127.0.0.1:4174');
  await page.locator('.country-label').first().waitFor({state:'attached'});
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  const row=page.locator('.layer').filter({has:page.getByRole('switch',{name:'Air quality · PM2.5'})});
  const toggle=row.getByRole('switch',{name:'Air quality · PM2.5'});
  assert.equal(await toggle.getAttribute('aria-checked'),'false','CAMS is opt-in by default');
  const renderStarted=Date.now();
  await toggle.click();
  await page.locator('.leaflet-data-air-quality-pane canvas').waitFor({state:'attached'});
  const renderMs=Date.now()-renderStarted;
  await row.locator('.layer-info summary').click();
  await page.getByText('450 global sample cells').waitFor();
  await page.getByText(/not monitor data, street-level detail, or an official AQI/).waitFor();
  await page.getByRole('link',{name:'Open-Meteo CAMS source details'}).waitFor();
  if(width===1440)await page.screenshot({path:'/home/tyler/.hermes/cache/scratch/geochron-reference/air-quality.png'});
  assert(calls>=1,'enabling the layer requests its same-origin adapter');
  const beforeDisable=calls;
  await toggle.click();
  await page.waitForTimeout(250);
  assert.equal(calls,beforeDisable,'disabling the layer stops subsequent fetches');
  await toggle.click();
  await page.locator('.leaflet-data-air-quality-pane canvas').waitFor({state:'attached'});
  assert(calls>beforeDisable,'re-enabling the layer refreshes without a page error');
  await toggle.click();
  await page.waitForTimeout(100);
  assert.deepEqual(errors,[]);
  const heap=await page.evaluate(()=>performance.memory?.usedJSHeapSize??'unavailable');
  console.log(`PASS CAMS air quality ${width}x${height}: ${feed.data.features.length} polygon fixtures × ${WORLD_OFFSETS.length} world offsets, mount ${renderMs}ms, heap ${heap}; opt-in, caveat, repeated toggle`);
  await page.close();
 }
}finally{await browser.close()}
