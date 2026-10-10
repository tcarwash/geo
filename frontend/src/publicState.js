import {validateDrawings} from './core.js';

export const PUBLIC_LAYOUTS_KEY='geo-public-layouts';
export const PUBLIC_DRAWINGS_KEY='geo-public-drawings';
const MAX_PUBLIC_LAYOUTS=20;
const MAX_LAYOUT_STORAGE_BYTES=4*1024*1024;
const EMPTY_DRAWINGS={type:'FeatureCollection',features:[]};

export function readPublicLayouts(storage=globalThis.localStorage){
 try{
  const parsed=JSON.parse(storage.getItem(PUBLIC_LAYOUTS_KEY)||'[]');
  if(!Array.isArray(parsed))return [];
  return parsed.filter(layout=>layout&&typeof layout.id==='string'&&typeof layout.name==='string'&&layout.state&&typeof layout.state==='object').slice(0,MAX_PUBLIC_LAYOUTS);
 }catch{return [];}
}

export function writePublicLayouts(layouts,storage=globalThis.localStorage){
 if(!Array.isArray(layouts)||layouts.length>MAX_PUBLIC_LAYOUTS)throw new Error(`Keep no more than ${MAX_PUBLIC_LAYOUTS} layouts in this browser.`);
 const serialized=JSON.stringify(layouts);
 if(new TextEncoder().encode(serialized).byteLength>MAX_LAYOUT_STORAGE_BYTES)throw new Error('Saved layouts exceed this browser storage limit. Remove an older layout and try again.');
 storage.setItem(PUBLIC_LAYOUTS_KEY,serialized);
}

export function readPublicDrawings(storage=globalThis.localStorage){
 const saved=storage.getItem(PUBLIC_DRAWINGS_KEY);
 if(saved===null)return {...EMPTY_DRAWINGS};
 try{return validateDrawings(JSON.parse(saved));}catch{return {...EMPTY_DRAWINGS};}
}

export function writePublicDrawings(collection,storage=globalThis.localStorage){
 const valid=validateDrawings(collection);
 storage.setItem(PUBLIC_DRAWINGS_KEY,JSON.stringify(valid));
 return valid;
}
