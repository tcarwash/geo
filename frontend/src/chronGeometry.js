import {clamp,RAD} from './core.js';

export function solarHourAngle(latitude,declination,altitude=0){
 const phi=clamp(latitude,-90,90)*RAD,dec=clamp(declination,-90,90)*RAD,h=altitude*RAD;
 const denominator=Math.cos(phi)*Math.cos(dec);
 if(Math.abs(denominator)<1e-12)return Math.sin(phi)*Math.sin(dec)>=Math.sin(h)?180:0;
 const cosine=(Math.sin(h)-Math.sin(phi)*Math.sin(dec))/denominator;
 return cosine<=-1?180:cosine>=1?0:Math.acos(cosine)/RAD;
}

const mercatorLatitude=y=>Math.atan(Math.sinh(Math.PI*(1-2*y)))/RAD;
const point=(x,y)=>`${x.toFixed(2)} ${y.toFixed(2)}`;
const strip=(x0a,x0b,x1b,x1a,y0,y1)=>`M ${point(x0a,y0)} L ${point(x0b,y0)} L ${point(x1b,y1)} L ${point(x1a,y1)} Z`;

export function chronGeometry(declination,width,height,rows=240){
 const w=Math.max(1,width),h=Math.max(1,height),world=w,offset=(h-world)/2,center=w/2;
 const night=[],grayline=[];
 const x=(angle,side)=>center+side*angle*w/360;
 for(let i=0;i<rows;i++){
  const y0=offset+world*i/rows,y1=offset+world*(i+1)/rows;
  const lat0=mercatorLatitude(i/rows),lat1=mercatorLatitude((i+1)/rows);
  const top={day:solarHourAngle(lat0,declination,0),civil:solarHourAngle(lat0,declination,-6)};
  const bottom={day:solarHourAngle(lat1,declination,0),civil:solarHourAngle(lat1,declination,-6)};
  night.push(strip(0,x(top.day,-1),x(bottom.day,-1),0,y0,y1));
  night.push(strip(x(top.day,1),w,w,x(bottom.day,1),y0,y1));
  grayline.push(strip(x(top.civil,-1),x(top.day,-1),x(bottom.day,-1),x(bottom.civil,-1),y0,y1));
  grayline.push(strip(x(top.day,1),x(top.civil,1),x(bottom.civil,1),x(bottom.day,1),y0,y1));
 }
 return {night:night.join(''),grayline:grayline.join(''),noonX:center,worldSize:world,worldTop:offset};
}
