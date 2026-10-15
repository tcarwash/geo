const finite=value=>typeof value==='number'&&Number.isFinite(value);
export function fieldSample(grid,name,lat,lon){
 if(!grid||!grid.fields?.[name]||!finite(lat)||!finite(lon))return null;
 const {nx,ny,lon0,lat0,dx,dy}=grid;
 if(!nx||!ny||!dx||!dy)return null;
 const period=Math.abs(nx*dx),wrap=Math.abs(period-360)<Math.abs(dx)*.1;
 let x=(lon-lon0)/dx;
 if(wrap)x=((x%nx)+nx)%nx;
 else {while(x<0&&lon+360<=lon0+dx*(nx-1)){lon+=360;x=(lon-lon0)/dx}while(x>nx-1&&lon-360>=lon0){lon-=360;x=(lon-lon0)/dx}}
 const y=(lat-lat0)/dy;if(x<0||x>(wrap?nx:nx-1)||y<0||y>ny-1)return null;
 const x0=Math.floor(x),y0=Math.floor(y),x1=wrap?(x0+1)%nx:Math.min(nx-1,x0+1),y1=Math.min(ny-1,y0+1),fx=x-x0,fy=y-y0,values=grid.fields[name];
 const weighted=[[values[y0*nx+x0],(1-fx)*(1-fy)],[values[y0*nx+x1],fx*(1-fy)],[values[y1*nx+x0],(1-fx)*fy],[values[y1*nx+x1],fx*fy]];
 if(weighted.some(([value,weight])=>weight>1e-8&&!finite(value)))return null;
 if(name==='direction'||name==='swellDirection'){const sx=weighted.reduce((sum,[v,w])=>sum+(w>1e-8?Math.sin(v*Math.PI/180)*w:0),0),cx=weighted.reduce((sum,[v,w])=>sum+(w>1e-8?Math.cos(v*Math.PI/180)*w:0),0);return Math.hypot(sx,cx)<1e-8?null:(Math.atan2(sx,cx)*180/Math.PI+360)%360;}
 return weighted.reduce((sum,[value,weight])=>sum+(weight>1e-8?value*weight:0),0);
}
export function fieldVector(grid,lat,lon){const u=fieldSample(grid,'u',lat,lon),v=fieldSample(grid,'v',lat,lon);return u==null||v==null?null:{u,v,speed:Math.hypot(u,v),bearing:(Math.atan2(u,v)*180/Math.PI+360)%360};}
export function advanceParticle(point,vector,seconds,scale){const cosine=Math.max(.15,Math.cos(point.lat*Math.PI/180));return {lat:point.lat+vector.v*seconds*scale,lng:point.lng+vector.u*seconds*scale/cosine};}
export function pressureSegments(grid,level,stride=2){
 const values=grid.fields?.pressure||[],segments=[];
 const value=(x,y)=>finite(values[y*grid.nx+x])?values[y*grid.nx+x]/100:NaN;
 for(let y=0;y<grid.ny-stride;y+=stride)for(let x=0;x<grid.nx-stride;x+=stride){
  const coords=[[x,y],[x+stride,y],[x+stride,y+stride],[x,y+stride]],v=coords.map(([x,y])=>value(x,y));
  if(v.some(n=>!Number.isFinite(n)))continue;
  const intersections=[];
  for(let i=0;i<4;i++){
   const next=(i+1)%4;if((v[i]<level)===(v[next]<level))continue;
   const t=(level-v[i])/(v[next]-v[i]),a=coords[i],b=coords[next];
   intersections.push([grid.lon0+(a[0]+(b[0]-a[0])*t)*grid.dx,grid.lat0+(a[1]+(b[1]-a[1])*t)*grid.dy]);
  }
  if(intersections.length===2)segments.push(intersections);
  // Disambiguate saddle cells using their mean, so contours do not form X crossings.
  if(intersections.length===4){const center=v.reduce((a,b)=>a+b)/4;const pairs=(center<level)===(v[0]<level)?[[0,3],[1,2]]:[[0,1],[2,3]];pairs.forEach(([a,b])=>segments.push([intersections[a],intersections[b]]));}
 }
 return segments;
}
export function fieldInspection(id,grid,lat,lng,validTime){
 const vector=fieldVector(grid,lat,lng);
 if(['surface-wind','ocean-currents'].includes(id)&&vector)return {kind:id==='surface-wind'?'Surface wind forecast':'Ocean-current analysis',title:id==='surface-wind'?'10 m wind':'Geostrophic surface current',fields:[['Speed',`${vector.speed.toFixed(2)} m/s`],['Flow toward',`${Math.round(vector.bearing)}° true`],['Valid',validTime||'Unavailable'],['Sample',`${lat.toFixed(2)}°, ${lng.toFixed(2)}°`],['Grid',`${Math.abs(grid.dx)}° × ${Math.abs(grid.dy)}°`]],source:id==='surface-wind'?'NOAA/NCEP GFS':'NOAA CoastWatch · geostrophic analysis'};
 if(id==='pressure'){const pressure=fieldSample(grid,'pressure',lat,lng);if(pressure!=null)return {kind:'Sea-level pressure forecast',title:'Mean sea-level pressure',fields:[['Pressure',`${(pressure/100).toFixed(1)} hPa`],['Valid',validTime||'Unavailable']],source:'NOAA/NCEP GFS'};}
 if(id==='waves'){const height=fieldSample(grid,'height',lat,lng),period=fieldSample(grid,'period',lat,lng),direction=fieldSample(grid,'direction',lat,lng);if(height!=null)return {kind:'Wave forecast',title:'Combined wind waves and swell',fields:[['Significant height',`${height.toFixed(2)} m`],['Primary-wave period',period==null?'Unavailable':`${period.toFixed(1)} s`],['Primary waves from',direction==null?'Unavailable':`${Math.round(direction)}° true`],['Primary swell height',fieldSample(grid,'swellHeight',lat,lng)==null?'Unavailable':`${fieldSample(grid,'swellHeight',lat,lng).toFixed(2)} m`],['Primary swell period',fieldSample(grid,'swellPeriod',lat,lng)==null?'Unavailable':`${fieldSample(grid,'swellPeriod',lat,lng).toFixed(1)} s`],['Primary swell from',fieldSample(grid,'swellDirection',lat,lng)==null?'Unavailable':`${Math.round(fieldSample(grid,'swellDirection',lat,lng))}° true`],['Valid',validTime||'Unavailable']],source:'NOAA/NCEP GFS Wave'};}
 return null;
}
