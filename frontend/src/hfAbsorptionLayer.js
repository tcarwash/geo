const DRAP_URL='https://services.swpc.noaa.gov/images/d-rap/global.png';
// NOAA's global plot occupies the left 680 x 328 pixels; the remaining pixels
// are a legend and status panel. The plot itself uses a regular lon/lat grid.
const PLOT={x:10,y:20,width:680,height:328,longitude:[-180,180],latitude:[90,-90]};

export function webMercatorLatitude(pixelY,zoom){
 const world=256*2**zoom;
 return Math.atan(Math.sinh(Math.PI*(1-2*pixelY/world)))*180/Math.PI;
}
export function drapSourceCoordinate(pixelX,pixelY,zoom){
 const world=256*2**zoom;
 const x=((pixelX%world)+world)%world;
 const longitude=x/world*360-180;
 const latitude=webMercatorLatitude(pixelY,zoom);
 return {x:PLOT.x+(longitude+180)/360*PLOT.width,y:PLOT.y+(90-latitude)/180*PLOT.height};
}

function readDrapImage(){
 return new Promise((resolve,reject)=>{
  const image=new Image();image.crossOrigin='anonymous';
  image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);resolve({pixels:ctx.getImageData(0,0,canvas.width,canvas.height),width:canvas.width,height:canvas.height,retrievedAt:new Date().toISOString()});}catch(error){reject(error)}};
  image.onerror=()=>reject(new Error('NOAA D-RAP image could not be loaded.'));
  image.src=`${DRAP_URL}?_=${Date.now()}`;
 });
}

export function hfAbsorptionLayer(L,map,pane,onStatus){
 const layer=new L.GridLayer({pane,interactive:false,updateWhenIdle:true,keepBuffer:2});
 let source=null,disposed=false,loading=false;
 const render=(tile,coords)=>{
  const ctx=tile.getContext('2d'),pixels=ctx.createImageData(256,256),dest=pixels.data;
  const size=256*2**coords.z;
  for(let y=0;y<256;y++){
   const globalY=coords.y*256+y,lat=webMercatorLatitude(globalY,coords.z);
   if(lat>PLOT.latitude[0]||lat<PLOT.latitude[1])continue;
   const sy=Math.max(0,Math.min(source.height-1,Math.round(PLOT.y+(90-lat)/180*PLOT.height)));
   for(let x=0;x<256;x++){
    const globalX=coords.x*256+x,wrappedX=((globalX%size)+size)%size;
    const sx=Math.max(0,Math.min(source.width-1,Math.round(PLOT.x+wrappedX/size*PLOT.width)));
    const si=(sy*source.width+sx)*4,di=(y*256+x)*4,r=source.pixels.data[si],g=source.pixels.data[si+1],b=source.pixels.data[si+2];
    const high=Math.max(r,g,b),low=Math.min(r,g,b),chroma=high-low;
    // Keep the colored 1 dB absorption scale and discard the plot's black
    // background and white coastlines/labels, which are not absorption data.
    if(high>35&&chroma>24){dest[di]=r;dest[di+1]=g;dest[di+2]=b;dest[di+3]=Math.round(190*Math.min(1,chroma/70));}
   }
  }
  ctx.putImageData(pixels,0,0);
 };
 layer.createTile=(coords,done)=>{const tile=document.createElement('canvas');tile.width=tile.height=256;if(source){render(tile,coords);done(null,tile)}else{pending.then(()=>{if(disposed)return;render(tile,coords);done(null,tile)}).catch(error=>done(error,tile))}return tile;};
 let pending;
 const refresh=async()=>{
  if(loading||disposed)return;loading=true;
  if(!source)onStatus?.({status:'loading',loading:true});
  try{const next=await readDrapImage();if(disposed)return;source=next;layer.redraw();onStatus?.({status:'live',loading:false,dataTime:next.retrievedAt,source:'NOAA SWPC D-RAP'});}
  catch(error){if(!disposed)onStatus?.({status:source?'stale':'unavailable',loading:false,error:error.message})}
  finally{loading=false}
 };
 pending=refresh();layer.addTo(map);
 const timer=setInterval(refresh,60*1000);
 return ()=>{disposed=true;clearInterval(timer);layer.off();map.removeLayer(layer)};
}
