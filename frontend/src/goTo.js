const validNumber=value=>value!==''&&Number.isFinite(Number(value));

function gridCenter(value){
  const grid=value.toUpperCase();
  if(![2,4,6,8].includes(grid.length)||!/^([A-R]{2})(\d{2})?([A-X]{2})?(\d{2})?$/.test(grid))return null;
  let lng=-180,lat=-90,lngSize=20,latSize=10;
  const field=grid.slice(0,2);
  lng+=(field.charCodeAt(0)-65)*lngSize;
  lat+=(field.charCodeAt(1)-65)*latSize;
  if(grid.length>=4){lngSize=2;latSize=1;lng+=Number(grid[2])*lngSize;lat+=Number(grid[3])*latSize;}
  if(grid.length>=6){lngSize=2/24;latSize=1/24;lng+=(grid.charCodeAt(4)-65)*lngSize;lat+=(grid.charCodeAt(5)-65)*latSize;}
  if(grid.length>=8){lngSize=2/240;latSize=1/240;lng+=Number(grid[6])*lngSize;lat+=Number(grid[7])*latSize;}
  return {lat:lat+latSize/2,lng:lng+lngSize/2,label:grid};
}

export function parseGoToQuery(query){
  const value=String(query||'').trim();
  const coords=value.match(/^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:,|\s)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*$/);
  if(coords&&validNumber(coords[1])&&validNumber(coords[2])){
    const lat=Number(coords[1]),lng=Number(coords[2]);
    return Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng,label:`${lat}, ${lng}`}:null;
  }
  return gridCenter(value);
}

export function matchCountries(query,countries){
  const value=String(query||'').trim().toLocaleLowerCase();
  if(value.length<2)return [];
  const matches=country=>[country.name,...(country.aliases||[])].filter(Boolean).some(name=>name.toLocaleLowerCase().includes(value));
  const starts=country=>[country.name,...(country.aliases||[])].filter(Boolean).some(name=>name.toLocaleLowerCase().startsWith(value));
  return countries.filter(matches)
    .sort((a,b)=>Number(starts(b))-Number(starts(a))||a.name.localeCompare(b.name))
    .slice(0,6);
}
