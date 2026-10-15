import {fieldSample,fieldVector,advanceParticle,pressureSegments,fieldInspection} from './fieldMath.js';
const windColor=speed=>speed<5?'#80bfc9':speed<10?'#9ad6b1':speed<20?'#e0d287':'#f09d75';
const waveColor=height=>height<1?'#68b5bd':height<2?'#79b7d1':height<4?'#999bd5':height<6?'#d29dc7':'#e7977b';
export function fieldLayer(L,map,id,pane,onInspect){
 const background=document.createElement('canvas'),flow=document.createElement('canvas');
 for(const canvas of [background,flow]){canvas.className=`geo-field-canvas field-${id}`;canvas.setAttribute('aria-hidden','true');canvas.style.cssText='position:absolute;pointer-events:none';map.getPane(pane).append(canvas);}
 const ctx=background.getContext('2d'),fctx=flow.getContext('2d'),motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let grid=null,snapshot=null,particles=[],frame=null,last=0,disposed=false,validTime;
 const registration={pane,id};map._geoFields??=new Set();map._geoFields.add(registration);
 const project=([lon,lat])=>map.latLngToContainerPoint([Math.max(-85,Math.min(85,lat)),lon]);
 function seed(){const size=map.getSize();particles=Array.from({length:Math.min(900,Math.max(120,Math.round(size.x*size.y/1500)))},()=>{const ll=map.containerPointToLatLng([Math.random()*size.x,Math.random()*size.y]);return {...ll,age:Math.random()*100}});}
 function arrow(x,y,bearing,color,size=6){const angle=(bearing-90)*Math.PI/180;ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(-size,0);ctx.lineTo(size,0);ctx.lineTo(size-4,-3);ctx.moveTo(size,0);ctx.lineTo(size-4,3);ctx.stroke();ctx.restore();}
 function redraw(){
  if(disposed||!grid)return;const size=map.getSize(),top=map.containerPointToLayerPoint([0,0]);
  for(const canvas of [background,flow]){canvas.width=size.x;canvas.height=size.y;L.DomUtil.setPosition(canvas,top);}
  ctx.clearRect(0,0,size.x,size.y);seed();
  if(id==='pressure'){
   const all=grid.fields.pressure.filter(value=>Number.isFinite(value)).map(value=>value/100),min=Math.floor(Math.min(...all)/4)*4,max=Math.ceil(Math.max(...all)/4)*4;
   const offsets=[-360,0,360].map(offset=>offset+360*Math.floor(map.getCenter().lng/360));let labels=[];
   ctx.lineWidth=1;ctx.strokeStyle='#d4c5e9';ctx.fillStyle='#ece4fb';ctx.font='11px ui-monospace, monospace';
   for(let level=min;level<=max;level+=4){const segments=pressureSegments(grid,level);ctx.beginPath();let label=null;
    for(const [a,b] of segments)for(const offset of offsets){const p=project([a[0]+offset,a[1]]),q=project([b[0]+offset,b[1]]);if(Math.max(p.x,q.x)<-5||Math.min(p.x,q.x)>size.x+5||Math.max(p.y,q.y)<-5||Math.min(p.y,q.y)>size.y+5)continue;ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);if(!label&&p.x>45&&p.x<size.x-45&&p.y>80&&p.y<size.y-90&&labels.every(l=>Math.hypot(l.x-p.x,l.y-p.y)>75))label=p;}
    ctx.stroke();if(label){labels.push(label);ctx.strokeStyle='#0c2434';ctx.lineWidth=3;ctx.strokeText(String(level),label.x,label.y);ctx.fillText(String(level),label.x,label.y);ctx.lineWidth=1;ctx.strokeStyle='#d4c5e9';}
   }
  }else{
   if(id==='waves')for(let y=0;y<size.y;y+=7)for(let x=0;x<size.x;x+=7){const ll=map.containerPointToLatLng([x+3,y+3]),height=fieldSample(grid,'height',ll.lat,ll.lng);if(height!=null){ctx.fillStyle=waveColor(height);ctx.globalAlpha=.65;ctx.fillRect(x,y,7,7);}}ctx.globalAlpha=1;
   ctx.lineWidth=1;
   for(let y=32;y<size.y;y+=id==='waves'?90:70)for(let x=32;x<size.x;x+=id==='waves'?90:70){const ll=map.containerPointToLatLng([x,y]);if(id==='waves'){const direction=fieldSample(grid,'direction',ll.lat,ll.lng);if(direction!=null)arrow(x,y,(direction+180)%360,'#e4edf9',7);}else{const vector=fieldVector(grid,ll.lat,ll.lng);if(vector)arrow(x,y,vector.bearing,id==='ocean-currents'?'#80d9e7':windColor(vector.speed),motion.matches?8:5);}}
  }
  animate();
 }
 function animate(){
  if(frame!=null){cancelAnimationFrame(frame);frame=null;}last=0;
  if(disposed||!grid||motion.matches||!['surface-wind','ocean-currents'].includes(id))return;
  const step=timestamp=>{
   if(disposed)return;frame=requestAnimationFrame(step);if(last&&timestamp-last<33)return;
   const seconds=Math.min(.08,last?(timestamp-last)/1000:.033);last=timestamp;const size=map.getSize();
   fctx.globalCompositeOperation='destination-in';fctx.fillStyle='rgba(0,0,0,.93)';fctx.fillRect(0,0,size.x,size.y);fctx.globalCompositeOperation='source-over';fctx.lineWidth=1;
   for(let i=0;i<particles.length;i++){
    let p=particles[i];const vector=fieldVector(grid,p.lat,p.lng),from=map.latLngToContainerPoint(p);
    if(!vector||p.age>120||from.x<0||from.x>size.x||from.y<0||from.y>size.y){const ll=map.containerPointToLatLng([Math.random()*size.x,Math.random()*size.y]);particles[i]={...ll,age:0};continue;}
    const next=advanceParticle(p,vector,seconds,id==='ocean-currents'?1.5:.045),to=map.latLngToContainerPoint(next);
    if(Math.abs(to.x-from.x)<50&&Math.abs(to.y-from.y)<50){fctx.strokeStyle=id==='ocean-currents'?'#91e6ed':windColor(vector.speed);fctx.beginPath();fctx.moveTo(from.x,from.y);fctx.lineTo(to.x,to.y);fctx.stroke();}
    particles[i]={...next,age:p.age+seconds*15};
   }
  };frame=requestAnimationFrame(step);
 }
 const inspect=event=>{
  if(!grid||event.originalEvent?.target?.closest?.('.leaflet-marker-icon'))return;
  const highest=[...map._geoFields].sort((a,b)=>Number(map.getPane(b.pane).style.zIndex)-Number(map.getPane(a.pane).style.zIndex))[0];if(highest!==registration)return;
  const detail=fieldInspection(id,grid,event.latlng.lat,event.latlng.lng,validTime);if(detail)onInspect(detail);
 };
 map.on('moveend zoomend resize',redraw);map.on('click',inspect);motion.addEventListener('change',redraw);
 return {update(data){if(!data)return;const next=JSON.stringify(data);if(next===snapshot)return;snapshot=next;grid=data;validTime=data.validAt;redraw();},dispose(){disposed=true;if(frame!=null)cancelAnimationFrame(frame);map.off('moveend zoomend resize',redraw);map.off('click',inspect);motion.removeEventListener('change',redraw);map._geoFields.delete(registration);background.remove();flow.remove();particles=[];grid=null;}};
}
