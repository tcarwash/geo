import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

// Run against the development server: node tests/ui-smoke.mjs
const browser = await chromium.launch({headless:true});
try {
  for (const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1920,1080],[3840,2160]]) {
    console.log(`CHECK ${width}×${height}`);
    const page = await browser.newPage({viewport:{width,height},hasTouch:width<=600,reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.GEO_UI_URL || 'http://127.0.0.1:4174');
    await page.locator('.country-label').first().waitFor({state:'attached'});
    await page.screenshot({path:`${process.env.TMPDIR || '.'}/geo-ui-${width}.png`});
    await page.keyboard.press('g');
    await page.getByRole('complementary',{name:'goto panel'}).waitFor();
    assert.equal(await page.locator(width<=600?'#display-panel h2':'#goto-query').evaluate(el=>document.activeElement===el),true,'G focuses the destination panel without opening the mobile keyboard');
    await page.keyboard.press('Escape');
    await page.keyboard.press('l');
    await page.getByRole('complementary',{name:'layers panel'}).waitFor();
    await page.keyboard.press('Escape');
    for (const selector of ['.rail','.world-clocks','.hero-clock','.top-actions','.map-tools']) {
      const box=await page.locator(selector).boundingBox();
      assert(box && box.x>=0 && box.y>=0 && box.x+box.width<=width+1 && box.y+box.height<=height+1,`${selector} outside ${width}×${height}`);
    }
    const clocks=await page.locator('.world-clocks').boundingBox();
    const status=await page.locator('.bottom-status').boundingBox();
    assert(clocks.y+clocks.height<=status.y,`Clocks overlap footer at ${width}×${height}`);
    const controls=await page.locator('.map-tools').boundingBox();
    const hero=await page.locator('.hero-clock').boundingBox();
    assert(controls.x+controls.width<=clocks.x||controls.x>=clocks.x+clocks.width||controls.y+controls.height<=clocks.y||controls.y>=clocks.y+clocks.height,`Map controls overlap world clocks at ${width}×${height}`);
    assert(controls.x+controls.width<=hero.x||controls.x>=hero.x+hero.width||controls.y+controls.height<=hero.y||controls.y>=hero.y+hero.height,`Map controls overlap UTC clock at ${width}×${height}`);
    const layers=page.getByRole('button',{name:'Layers',exact:true});
    const station=page.getByRole('button',{name:'Return to station'});
    assert.equal(await station.count(),1,'A dedicated return-to-station control is available');
    await station.click();
    await layers.click();
    assert.equal(await layers.getAttribute('aria-expanded'),'true');
    const drawer=page.getByRole('complementary',{name:'layers panel'});
    await drawer.waitFor();
    await drawer.getByText(/Raise and Lower changes the overlay stack/).waitFor();
    await page.getByPlaceholder('Find a layer').fill('Geographic grid');
    const toggle=drawer.getByRole('switch');
    assert.equal(await toggle.count(),1);
    const before=await toggle.getAttribute('aria-checked');
    await toggle.click();
    assert.notEqual(await toggle.getAttribute('aria-checked'),before);
    await page.getByPlaceholder('Find a layer').fill('');
    await drawer.evaluate(el=>el.scrollTop=el.scrollHeight);
    const close=page.getByRole('button',{name:'Close panel'});
    const box=await close.boundingBox();
    assert(box && box.y>=0 && box.y<height,'Sticky close button remains visible');
    await close.click();
    await layers.click();
    await page.screenshot({path:`${process.env.TMPDIR || '.'}/geo-ui-layers-${width}.png`});
    await page.getByPlaceholder('Find a layer').fill('i');
    await drawer.evaluate(el=>el.scrollTop=el.scrollHeight);
    const retainedLayerSearch=await page.getByPlaceholder('Find a layer').inputValue();
    const retainedLayerScroll=await drawer.evaluate(el=>el.scrollTop);
    await page.keyboard.press('Escape');
    assert.equal(await drawer.count(),0);
    await page.locator('.glyph-station').nth(2).click({force:true});
    await page.locator('.feature').waitFor();
    assert.equal(await page.locator('.drawer').count(),0,'Feature details replace, rather than overlap, the panel');
    await layers.click();
    assert.equal(await page.locator('.feature').count(),0,'Opening a panel dismisses feature details');
    assert.equal(await page.getByPlaceholder('Find a layer').inputValue(),retainedLayerSearch,'Reopening layers after inspection preserves its search');
    assert(Math.abs(await drawer.evaluate(el=>el.scrollTop)-retainedLayerScroll)<2,'Reopening layers after inspection restores browser scroll');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Go to coordinates or grid'}).click();
    await page.getByLabel('Country, coordinates, or Maidenhead locator').fill(width===390?'Canada':width===320?'CN85qp':'45.64, -122.66');
    if(width===390) await page.getByRole('complementary',{name:'goto panel'}).getByRole('button',{name:'Canada',exact:true}).click();
    else await page.getByRole('button',{name:'Go',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Centered on'}).waitFor();
    assert.equal(await page.locator('.drawer').count(),0,'Go to closes after centering on a local destination');
    if(width===1920){
      await page.route('**/api/v1/earthquakes*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'current',kind:'observation',fetchedAt:'2026-10-09T20:05:00Z',dataTime:'2026-10-09T20:00:00Z',validFrom:'2026-10-09T19:55:00Z',data:{type:'FeatureCollection',features:[]}})}));
      await layers.click();
      await page.getByPlaceholder('Find a layer').fill('Earthquakes');
      const earthquake=drawer.getByRole('switch',{name:'Earthquakes'});
      if(await earthquake.getAttribute('aria-checked')==='false')await earthquake.click();
      await drawer.locator('.layer-status').filter({hasText:'Observed'}).waitFor();
      const earthquakeRow=drawer.locator('.layer').filter({hasText:'Earthquakes'});
      await earthquakeRow.locator('.layer-info summary').click();
      for(const label of ['Observed','Valid from','Retrieved'])await earthquakeRow.locator('.source-times dt').getByText(label,{exact:true}).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'Widgets',exact:true}).click();
      await page.getByRole('button',{name:/Layer legend/}).click();
      const legend=page.locator('.widget .point-legend');
      await legend.getByText('M1',{exact:true}).waitFor();
      assert(await legend.getByText('M3',{exact:true}).count());
      assert(await legend.getByText('M6',{exact:true}).count());
      for(const name of ['Precipitation rate','Maximum usable frequency']){
        await layers.click();
        await page.getByPlaceholder('Find a layer').fill(name);
        const layerSwitch=drawer.getByRole('switch',{name});
        if(await layerSwitch.getAttribute('aria-checked')==='false')await layerSwitch.click();
        if(name==='Maximum usable frequency'){
          const row=drawer.locator('.layer').filter({hasText:name});
          await row.locator('.layer-info summary').click();
          assert.equal(await row.getByRole('button',{name:'Raise',exact:true}).isDisabled(),true,'Fixed-order MUF cannot be raised');
          assert.equal(await row.getByRole('button',{name:'Lower',exact:true}).isDisabled(),true,'Fixed-order MUF cannot be lowered');
        }
        await page.keyboard.press('Escape');
      }
      await legend.getByText('mm/h',{exact:true}).waitFor();
      await legend.getByText('MHz',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Settings',exact:true}).click();
      const clockToggle=page.getByRole('checkbox',{name:'Show world clocks'});
      await clockToggle.uncheck();
      assert.equal(await page.locator('.world-clocks').count(),0,'World clocks can be hidden independently');
      await clockToggle.check();
      assert.equal(await page.locator('.world-clocks').count(),1,'World clocks can be restored independently');
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button',{name:'Enter display mode',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Settings',exact:true}).count(),0,'Display mode hides configuration controls');
    assert.equal(await page.getByRole('button',{name:'Draw',exact:true}).count(),0,'Display mode hides drawing tools');
    await layers.click();
    assert(await drawer.getByRole('switch').first().isDisabled());
    await page.getByRole('button',{name:'Exit display mode',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Settings',exact:true}).count(),1,'Exit returns to the full Explore controls');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}×${height}: bounds, panels, filtering, toggle, sticky close, Escape, locking; no page errors`);
    await page.close();
  }
} finally {
  await browser.close();
}
