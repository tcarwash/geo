import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const baseURL=process.env.GEO_UI_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/prop/renders/current/mufd-normal-now.geojson',route=>route.fulfill({status:200,contentType:'application/geo+json',body:JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{'level-value':14,stroke:'#007458','stroke-width':1,title:'14.00'},geometry:{type:'LineString',coordinates:[[8,20],[9,21]]}}]})}));
 await page.route('**/prop/api/stations.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{source:'giro',mufd:12.5,cs:90,station:{name:'Test Station',code:'TS01',latitude:'20.5',longitude:'262.3'},time:'2026-10-09T20:00:00'}])}));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
 let wmsRequest;
 await page.route('https://view.eumetsat.int/geoserver/wms**',async route=>{wmsRequest=new URL(route.request().url());await route.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:png});});
 await page.goto(baseURL);await page.locator('.country-label').first().waitFor();
 const layers=page.getByRole('button',{name:'Layers',exact:true});await layers.click();
 const drawer=page.getByRole('complementary',{name:'layers panel'}),search=page.getByPlaceholder('Find a layer');
 await search.fill('prop.kc2g.com MUF');
 const propRow=drawer.locator('.layer').filter({hasText:'prop.kc2g.com MUF'}),propSwitch=propRow.getByRole('switch');
 await propSwitch.click();await propRow.locator('.layer-status').filter({hasText:'Available'}).waitFor();
 await propRow.locator('.layer-info summary').click();
 await propRow.getByText(/1 contours and 1 stations/).waitFor();
 await page.locator('.leaflet-tooltip.prop-muf-contour-label').filter({hasText:'14 MHz'}).first().waitFor();
 await search.fill('Global cloud composite');
 const cloudRow=drawer.locator('.layer').filter({hasText:'Global cloud composite'}),cloudSwitch=cloudRow.getByRole('switch');
 await cloudSwitch.click();await page.waitForFunction(()=>document.querySelector('.leaflet-tile-loaded')!==null);
 assert.equal(wmsRequest?.searchParams.get('srs'),'EPSG:3857','EUMETSAT WMS requests use Web Mercator coordinates for the Leaflet map');
 await cloudRow.locator('.layer-info summary').click();
 await cloudRow.getByText(/EPSG:3857/).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: prop.kc2g contours carry visible MHz labels and stations render from geographic data; EUMETSAT requests EPSG:3857; no page errors');
 await page.close();
}finally{await browser.close();}
