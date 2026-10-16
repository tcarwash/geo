import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {DEFAULT_STATE} from '../src/core.js';
import {minimumVerticalMapZoom} from '../src/chronGeometry.js';

const browser=await chromium.launch({headless:true});
const savedView=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('geo-draft')).map);
try{
 for(const [width,height] of [[390,844],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on('pageerror',error=>errors.push(error.stack));
  await page.addInitScript(state=>localStorage.setItem('geo-draft',JSON.stringify(state)),DEFAULT_STATE);
  await page.goto(process.env.GEO_UI_URL||'http://127.0.0.1:4174');
  await page.locator('.country-label').first().waitFor({state:'attached'});
  await page.waitForTimeout(500);
  const before=await savedView(page);
  for(let cycle=0;cycle<3;cycle++){
   await page.getByRole('button',{name:'Enter Chron mode'}).click();
   await page.waitForTimeout(350);
   const fullscreen=page.locator('.chron-actions').getByRole('button',{name:'Fullscreen',exact:true});
   assert.equal(await fullscreen.isVisible(),true);
   if(cycle===1){
    await fullscreen.click();
    await page.waitForFunction(()=>!!document.fullscreenElement);
    await page.locator('.chron-actions').getByRole('button',{name:'Exit fullscreen',exact:true}).click();
    await page.waitForFunction(()=>!document.fullscreenElement);
   }
   if(cycle===2){
    await page.setViewportSize({width:width+80,height:height+40});
    await page.waitForTimeout(350);
    await page.setViewportSize({width,height});
    await page.waitForTimeout(350);
   }
   await page.getByRole('button',{name:'Exit Chron',exact:true}).click();
   // Leaflet's delayed zoom transition used to overwrite the restored map.
   await page.waitForTimeout(1000);
   const after=await savedView(page);
   assert(after.zoom>=minimumVerticalMapZoom(height)-1e-9,`restored map must fill the height: ${JSON.stringify(after)}`);
   assert(Math.abs(after.zoom-before.zoom)<.11,'restore the prior zoom after all animations settle');
   assert(Math.abs(after.center[0]-before.center[0])<.5,'restore the prior latitude');
   assert(Math.abs(after.center[1]-before.center[1])<.5,'restore the prior longitude');
   assert.equal(await page.locator('.topbar').isVisible(),true);
   assert.equal(await page.locator('.leaflet-container').evaluate(el=>el.classList.contains('leaflet-grab')),true);
   assert.equal(await page.locator('.chron-night-map-overlay').count(),0);
  }
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`/tmp/geo-chron-exit-${width}.png`});
  console.log(`PASS Chron exit/fullscreen ${width}x${height}: repeated restoration, resize, fullscreen, no page errors`);
  await page.close();
 }
}finally{await browser.close()}
