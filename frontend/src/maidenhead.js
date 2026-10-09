import {clamp,locator} from './core.js';
export function maidenheadCells(bounds,zoom){
 const west=clamp(bounds.west,-180,180),east=clamp(bounds.east,-180,180),south=clamp(bounds.south,-85,85),north=clamp(bounds.north,-85,85);
 if(east<=west||north<=south)return [];
 const levels=zoom>=8?[[2/24,1/24,6],[2,1,4],[20,10,2]]:zoom>=4?[[2,1,4],[20,10,2]]:[[20,10,2]];
 const [dx,dy,length]=levels.find(([x,y])=>(Math.ceil((east-west)/x)+2)*(Math.ceil((north-south)/y)+2)<=400)||levels.at(-1);
 const cells=[];const startX=Math.max(0,Math.floor((west+180)/dx)),endX=Math.min(Math.round(360/dx),Math.ceil((east+180)/dx)),startY=Math.max(0,Math.floor((south+90)/dy)),endY=Math.min(Math.round(180/dy),Math.ceil((north+90)/dy));
 for(let x=startX;x<endX;x++)for(let y=startY;y<endY;y++){const lng=-180+x*dx,lat=-90+y*dy,label=locator(lat+dy/2,lng+dx/2).slice(0,length);cells.push({id:`${length}:${x}:${y}`,label,bounds:[[lat,lng],[lat+dy,lng+dx]],center:[lat+dy/2,lng+dx/2]});}
 return cells;
}
