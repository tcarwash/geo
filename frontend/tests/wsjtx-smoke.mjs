import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
  const page=await browser.newPage({viewport,hasTouch:viewport.width<600,reducedMotion:'reduce'});
  const errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/v1/drawings',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({collection:{type:'FeatureCollection',features:[]},revision:0})}));
  await page.route('**/api/v1/wsjtx/heard*',route=>{
   requests.push(route.request().url());
   const now=new Date().toISOString();
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    source:'wsjtx-local-udp',kind:'observation',status:'current',dataTime:now,fetchedAt:now,udpPort:2237,
    data:{type:'FeatureCollection',heardStations:1,locatedStations:1,unlocatedStations:0,features:[{type:'Feature',id:'wsjtx:K1ABC',geometry:{type:'Point',coordinates:[-71,42.5]},properties:{callsign:'K1ABC',locator:'FN42',mode:'FT8',snrDb:-12,frequencyHz:14075450,observedAt:now,precision:'reported Maidenhead locator center'}}]}
   })});
  });
  await page.goto(process.env.GEO_UI_URL||'http://127.0.0.1:4174');
  await page.locator('.country-label').first().waitFor({state:'attached'});
  assert.equal(requests.length,0,'WSJT-X polling stays off until the layer is enabled');
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  await page.getByPlaceholder('Find a layer').fill('WSJT-X heard stations');
  const row=page.locator('.layer').filter({hasText:'WSJT-X heard stations'});
  const toggle=row.getByRole('switch',{name:'WSJT-X heard stations'});
  assert.equal(await toggle.getAttribute('aria-checked'),'false','the local decode layer is opt-in');
  await toggle.click();
  await row.locator('.layer-status').filter({hasText:'Observed'}).waitFor();
  assert(requests.some(url=>url.includes('/api/v1/wsjtx/heard')),'enabling the layer starts polling the local endpoint');
  await row.locator('.layer-info summary').click();
  await row.getByText(/1 stations heard in the rolling 30-minute window/).waitFor();
  await row.getByText('127.0.0.1:2237').waitFor();
  await row.getByText(/Maidenhead grids/).waitFor();
  await row.getByLabel('Show point labels').check();
  const mapLabels=page.locator('.map-point-label').filter({hasText:'K1ABC'});
  await mapLabels.first().waitFor({state:'visible'});
  assert(await mapLabels.count()>0,'the decoded callsign can be labeled on the map');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.map-canvas').isVisible(),true,'the world map remains visible with decoded points enabled');
  const callsignLabels=await page.locator('.map-point-label').filter({hasText:'K1ABC'}).all();
  let labelBounds=null,visibleLabel=null;
  for(const label of callsignLabels){const bounds=await label.boundingBox();if(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height){labelBounds=bounds;visibleLabel=label;break}}
  assert(labelBounds&&visibleLabel,'the decoded callsign has a visible map label');
  await visibleLabel.getByRole('button',{name:'Inspect K1ABC'}).click();
  const inspection=page.locator('.feature');
  await inspection.waitFor({timeout:5000});
  assert.match(await inspection.innerText(),/K1ABC/);
  assert.match(await inspection.innerText(),/FT8/);
  assert.match(await inspection.innerText(),/-12 dB/);
  await page.screenshot({path:`${process.env.TMPDIR||'.'}/geo-wsjtx-${viewport.width}.png`});
  assert.deepEqual(errors,[],'the browser reports no runtime errors');
  console.log(`PASS WSJT-X layer ${viewport.width}×${viewport.height}: opt-in polling, setup/status details, map remains visible`);
  await page.close();
 }
}finally{await browser.close()}
