import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 for(const touch of [false,true]){
  const page=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1440,height:900},hasTouch:touch,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());
   const response=await route.fetch({url:`${process.env.GEO_API_URL||'http://127.0.0.1:8085'}${url.pathname}${url.search}`});await route.fulfill({response});
  });
  await page.goto(process.env.GEO_UI_URL||'http://127.0.0.1:4175');
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  const panel=page.locator('#display-panel'),search=panel.locator('.search input');
  for(const [name,id] of [['Air routes · 2014','air-routes'],['Sea routes','sea-routes'],['Air traffic','air-traffic']]){
   await search.fill(name);const row=panel.locator('.layer').filter({has:page.getByRole('switch',{name,exact:true})}),toggle=row.getByRole('switch',{name,exact:true});
   assert.equal(await toggle.isChecked(),false);
   await toggle.click();await row.locator('.layer-status').filter({hasText:/Reference|Observed/}).waitFor({timeout:30000});
   await row.locator('summary').click();
   await row.getByRole('slider',{name:`${name} opacity`}).fill('0.5');
   assert.equal(await row.locator('output').innerText(),'50%');
   const pane=page.locator(`.leaflet-data-${id}-pane`);assert.equal(await pane.evaluate(el=>el.style.opacity),'0.5');
   console.log(`${touch?'touch':'desktop'} ${id}: rendered, adjusted, ${await row.locator('.layer-status').innerText()}`);
   await page.screenshot({path:`/tmp/geo-${id}-${touch?'touch':'desktop'}.png`});
   await toggle.click();assert.equal(await pane.locator('path,.map-glyph').count(),0,'Layer cleanup removes visible features');
   await toggle.click();await row.locator('.layer-status').filter({hasText:/Reference|Observed/}).waitFor();await toggle.click();
  }
  await search.fill('Air traffic');await panel.getByRole('switch',{name:'Air traffic',exact:true}).click();await page.locator('.glyph-aircraft').first().waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/Return to station/}).click();
  await page.waitForTimeout(1800);
  const markers=page.locator('.glyph-aircraft');
  const index=await markers.evaluateAll(elements=>elements.findIndex(el=>{const b=el.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;return x>70&&x<innerWidth-70&&y>130&&y<innerHeight-150&&el.contains(document.elementFromPoint(x,y))}));
  assert(index>=0,'An unobscured live aircraft should be visible near the station');
  await markers.nth(index).click();
  await page.locator('.feature').filter({hasText:'Aircraft observation'}).waitFor();
  await page.screenshot({path:`/tmp/geo-aircraft-inspect-${touch?'touch':'desktop'}.png`});
  assert.deepEqual(errors,[]);console.log(`PASS ${touch?'touch':'desktop'} aircraft inspection and no page errors`);
  await page.close();
 }
}finally{await browser.close()}
