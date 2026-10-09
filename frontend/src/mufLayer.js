import {WORLD_OFFSETS} from './worldCopies.js';

const BOUNDS=[[-85.05112878,-180],[85.05112878,180]];
const INITIAL_IMAGE='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

export function mufSourceRow(y,height){
 const mercatorY=y/height;
 const latitude=Math.atan(Math.sinh(Math.PI*(1-2*mercatorY)))*180/Math.PI;
 return Math.max(0,Math.min(height-1,(90-latitude)/180*height));
}

export function mufLayer(L,map,pane,onStatus){
 const group=L.layerGroup().addTo(map);
 const overlays=WORLD_OFFSETS.map(offset=>L.imageOverlay(INITIAL_IMAGE,[[BOUNDS[0][0],BOUNDS[0][1]+offset],[BOUNDS[1][0],BOUNDS[1][1]+offset]],{
  pane,interactive:false,attribution:'NOAA SWPC · WAM-IPE MUF forecast',pmIgnore:true,
 }).addTo(group));
 let requested='';
 return {
  dispose(){group.clearLayers();map.removeLayer(group);},
  update(data){
   const url=data?.imageUrl;
   if(typeof url!=='string'||!url.startsWith('https://services.swpc.noaa.gov/images/animations/wam-ipe/'))return;
   if(url===requested)return;
   requested=url;
   onStatus?.({status:'loading',loading:true});
   const image=new Image();image.crossOrigin='anonymous';
   image.onload=()=>{
    try{
     const sourceWidth=image.naturalWidth,sourceHeight=image.naturalHeight;
     if(sourceWidth<500||sourceHeight<300)throw new Error('NOAA MUF image has an unexpected size.');
     const sx=sourceWidth*867/1600,sy=sourceHeight*88/900,sw=sourceWidth*(1443-867)/1600,sh=sourceHeight*(376-88)/900;
     const canvas=document.createElement('canvas'),size=1024;canvas.width=canvas.height=size;
     const context=canvas.getContext('2d',{alpha:true});
     for(let y=0;y<size;y++)context.drawImage(image,sx,sy+mufSourceRow(y,size)/size*sh,sw,1,0,y,size,1);
     const cropped=canvas.toDataURL('image/png');overlays.forEach(layer=>layer.setUrl(cropped));
     onStatus?.({status:'current',loading:false,dataTime:data.dataTime,validFrom:data.validFrom,source:'NOAA SWPC WAM-IPE'});
    }catch(error){requested='';onStatus?.({status:'unavailable',loading:false,error:error.message});}
   };
   image.onerror=()=>{requested='';onStatus?.({status:'unavailable',loading:false,error:'The NOAA MUF forecast image could not be loaded.'});};
   image.src=url;
  },
 };
}
