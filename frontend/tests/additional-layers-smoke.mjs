import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {ADDITIONAL_LAYERS} from '../src/additionalLayers.js';
const browser=await chromium.launch();
try{
 for(const touch of [false,true]){
  const page=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1440,height:900},hasTouch:touch,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:`${process.env.GEO_API_URL||'http://127.0.0.1:8087'}${url.pathname}${url.search}`,timeout:60000});await route.fulfill({response});});
  await page.goto(process.env.GEO_UI_URL||'http://127.0.0.1:4177');await page.getByRole('button',{name:'Layers',exact:true}).click();
  const panel=page.locator('#display-panel'),search=panel.locator('.search input');
  for(const definition of ADDITIONAL_LAYERS){
   await search.fill(definition.name);const row=panel.locator('.layer').filter({has:page.getByRole('switch',{name:definition.name,exact:true})}),toggle=row.getByRole('switch',{name:definition.name,exact:true});
   assert.equal(await toggle.isChecked(),false);
   const start=Date.now();await toggle.click();
   await row.locator('.layer-status').filter({hasText:/Reference|Composite|Forecast|Analysis|Model|Stale/}).waitFor({timeout:60000});
   const pane=page.locator(`.leaflet-${definition.raster?definition.id:`data-${definition.id}`}-pane`);await pane.waitFor({state:'attached'});
   if(definition.field){await pane.locator('canvas.geo-field-canvas').first().waitFor();assert.equal(await pane.locator('canvas').count(),2);const painted=await pane.locator('canvas').first().evaluate(canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let n=0;for(let i=3;i<data.length;i+=4)if(data[i])n++;return n});assert(painted>0,`${definition.id} must draw actual field pixels`);}
   else if(definition.raster){await pane.locator('img,canvas.leaflet-tile').first().waitFor({state:'attached'});await page.waitForFunction(id=>{const pane=document.querySelector(`.leaflet-${id}-pane`),tiles=[...pane.querySelectorAll('.leaflet-tile')];if(tiles.length)return tiles.every(tile=>tile.classList.contains('leaflet-tile-loaded'));return [...pane.querySelectorAll('img')].every(image=>image.complete&&image.naturalWidth>0)},definition.id,{timeout:45000});}
   else {await pane.locator('canvas').first().waitFor();}
   await row.locator('summary').click();await row.getByRole('slider',{name:`${definition.name} opacity`}).fill('0.5');assert.equal(await pane.evaluate(element=>element.style.opacity),'0.5');
   console.log(`${touch?'touch':'desktop'} ${definition.id}: ${Date.now()-start} ms · ${await row.locator('.layer-status').innerText()}`);
   if(!touch||['bathymetry','surface-wind','waves','glotec'].includes(definition.id))await page.screenshot({path:`/tmp/geo-additional-${definition.id}-${touch?'touch':'desktop'}.png`});
   await toggle.click();await page.waitForFunction(({id,raster,field})=>{const pane=document.querySelector(`.leaflet-${raster?id:`data-${id}`}-pane`);if(!pane)return true;if(field||raster)return pane.querySelectorAll('img,canvas,.map-glyph').length===0;return [...pane.querySelectorAll('canvas')].every(canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=3;i<data.length;i+=4)if(data[i])return false;return true})},{id:definition.id,raster:!!definition.raster,field:!!definition.field});
   await toggle.click();await row.locator('.layer-status').filter({hasText:/Reference|Composite|Forecast|Analysis|Model|Stale/}).waitFor();await toggle.click();
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${touch?'touch':'desktop'} all ${ADDITIONAL_LAYERS.length} layers; no page errors`);await page.close();
 }
}finally{await browser.close()}
