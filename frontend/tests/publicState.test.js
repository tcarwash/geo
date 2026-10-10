import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_DRAWINGS_KEY,PUBLIC_LAYOUTS_KEY,readPublicDrawings,readPublicLayouts,writePublicDrawings,writePublicLayouts} from '../src/publicState.js';

class MemoryStorage {
 constructor(entries={}){this.entries=new Map(Object.entries(entries));}
 getItem(key){return this.entries.get(key)??null;}
 setItem(key,value){this.entries.set(key,String(value));}
}

const layout=(id='layout-1')=>({id,name:'Display',revision:1,updatedAt:'2026-10-10T12:00:00Z',state:{version:1,layers:[]}});
const drawings={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[-122,45]},properties:{name:'Marker'}}]};

test('public display layouts persist in bounded browser storage and ignore malformed rows',()=>{
 const storage=new MemoryStorage({[PUBLIC_LAYOUTS_KEY]:JSON.stringify([layout(),null,{id:4},layout('layout-2')])});
 assert.deepEqual(readPublicLayouts(storage),[layout(),layout('layout-2')]);
 writePublicLayouts([layout()],storage);
 assert.deepEqual(JSON.parse(storage.getItem(PUBLIC_LAYOUTS_KEY)),[layout()]);
 assert.throws(()=>writePublicLayouts([layout('large'),{...layout('oversized'),state:{value:'x'.repeat(4_200_000)}}],storage),/browser storage limit/);
});

test('public display drawings validate and persist locally without a server revision',()=>{
 const storage=new MemoryStorage();
 const saved=writePublicDrawings(drawings,storage);
 assert.deepEqual(readPublicDrawings(storage),saved);
 assert.equal(JSON.parse(storage.getItem(PUBLIC_DRAWINGS_KEY)).features.length,1);
 assert.throws(()=>writePublicDrawings({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[181,0]},properties:{}}]},storage),/finite longitude\/latitude/);
});
