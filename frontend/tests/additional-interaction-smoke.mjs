import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url());const response=await route.fetch({url:`http://127.0.0.1:8087${u.pathname}${u.search}`});await route.fulfill({response});});
 await page.goto('http://127.0.0.1:4177');await page.getByRole('button',{name:'Layers',exact:true}).click();
 const search=page.getByPlaceholder('Find a layer');await search.fill('Surface wind');await page.getByRole('switch',{name:'Surface wind',exact:true}).click();
 const canvas=page.locator('.leaflet-data-surface-wind-pane canvas').last();await canvas.waitFor();
 const hash=()=>canvas.evaluate(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=0,n=0;for(let i=3;i<data.length;i+=4)if(data[i]){hash=(hash+i*data[i])>>>0;n++}return {hash,n}});
 await page.waitForFunction(()=>{const canvas=document.querySelector('.leaflet-data-surface-wind-pane canvas:last-child');if(!canvas)return false;return canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((value,i)=>i%4===3&&value>0)});
 const before=await hash();await page.waitForTimeout(250);const after=await hash();assert(before.n>0&&after.n>0);assert.notEqual(before.hash,after.hash,'Wind trails move using the forecast field');
 await page.keyboard.press('Escape');await page.mouse.click(820,500);await page.getByRole('complementary',{name:'Surface wind forecast details'}).waitFor();assert.match(await page.locator('.feature').innerText(),/m\/s/);
 await page.getByRole('button',{name:'Close detail'}).click();await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);assert.equal((await hash()).n,0,'Reduced motion removes trails and retains static arrows');
 await page.getByRole('button',{name:'Layers',exact:true}).click();await search.fill('Surface wind');await page.getByRole('switch',{name:'Surface wind',exact:true}).click();await search.fill('Waves & swell');await page.getByRole('switch',{name:'Waves & swell',exact:true}).click();await page.locator('.layer-status').filter({hasText:'Forecast'}).waitFor();await page.keyboard.press('Escape');
 // Find an unmasked ocean cell using the actual API grid, then click its map projection.
 const response=await page.request.get('http://127.0.0.1:8087/api/v1/environment/waves');assert(response.ok());const feed=await response.json();
 assert(feed.data.fields.swellHeight.length>0);
 await page.getByRole('button',{name:'Go to coordinates or grid'}).click();
 await page.locator('#goto-query').fill('40 -35');await page.getByRole('button',{name:'Go',exact:true}).click();await page.waitForTimeout(1400);
 await page.mouse.click(760,450);await page.getByRole('complementary',{name:'Wave forecast details'}).waitFor();
 const detail=await page.locator('.feature').innerText();assert.match(detail,/Primary swell height/);assert.match(detail,/Primary swell period/);
 await page.screenshot({path:'/tmp/geo-additional-wave-inspection.png'});
 assert.deepEqual(errors,[]);console.log('PASS real wind animation, map inspection, reduced motion, swell data and no page errors');
}finally{await browser.close()}
