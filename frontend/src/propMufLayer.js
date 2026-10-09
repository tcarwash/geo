import {WORLD_OFFSETS} from './worldCopies.js';
import {mufSourceRow} from './mufLayer.js';

const URL='/prop/renders/current/mufd-normal-now.svg';
const BOUNDS=[[-85.05112878,-180],[85.05112878,180]];
const PLACEHOLDER='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

export function enhanceMufPixels(data){
 for(let i=0;i<data.length;i+=4){
  const r=data[i],g=data[i+1],b=data[i+2];
  if(r>248&&g>248&&b>248){data[i+3]=0;continue;}
  const luminance=.2126*r+.7152*g+.0722*b;
  for(let channel=0;channel<3;channel++)data[i+channel]=Math.max(0,Math.min(255,Math.round(luminance+(data[i+channel]-luminance)*1.65)));
 }
 return data;
}

export function propMufLayer(L,map,pane,onStatus){
 const group=L.layerGroup().addTo(map);
 const overlays=WORLD_OFFSETS.map(offset=>L.imageOverlay(PLACEHOLDER,[[BOUNDS[0][0],BOUNDS[0][1]+offset],[BOUNDS[1][0],BOUNDS[1][1]+offset]],{pane,interactive:false,pmIgnore:true,attribution:'prop.kc2g.com · MUF(3000 km)'}).addTo(group));
 let disposed=false,timer;
 const load=()=>{
  onStatus?.({status:'loading',loading:true});
  const image=new Image();
  image.onload=()=>{
   if(disposed)return;
   try{
    const width=image.naturalWidth,height=image.naturalHeight;
    if(width<1000||height<600)throw new Error('prop.kc2g.com MUF image has an unexpected size.');
    const sx=width*35.305/1144.848,sy=height*24.142/678.886,sw=width*1092.8/1144.848,sh=height*546.4/678.886;
    const size=1024,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    for(let y=0;y<size;y++)context.drawImage(image,sx,sy+mufSourceRow(y,size)/size*sh,sw,1,0,y,size,1);
    const pixels=context.getImageData(0,0,size,size);enhanceMufPixels(pixels.data);
    context.putImageData(pixels,0,0);
    const url=canvas.toDataURL('image/png');overlays.forEach(overlay=>overlay.setUrl(url));
    onStatus?.({status:'current',loading:false,retrievedAt:new Date().toISOString(),source:'prop.kc2g.com'});
   }catch(error){onStatus?.({status:'unavailable',loading:false,error:error.message});}
  };
  image.onerror=()=>{if(!disposed)onStatus?.({status:'unavailable',loading:false,error:'The prop.kc2g.com MUF image could not be loaded.'});};
  image.src=URL;
 };
 load();timer=setInterval(load,300000);
 return {update(){},dispose(){disposed=true;clearInterval(timer);group.clearLayers();map.removeLayer(group)}};
}
