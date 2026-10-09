export const NASA_PRODUCT='MODIS_Terra_CorrectedReflectance_TrueColor';
export const NASA_MIN_DATE='2000-02-24';
export const yesterday=()=>new Date(Date.now()-86400000).toISOString().slice(0,10);
export function imageryDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return yesterday();const date=new Date(`${value}T00:00:00Z`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value||value<NASA_MIN_DATE||value>new Date().toISOString().slice(0,10))return yesterday();return value;}
export const nasaTileURL=date=>`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NASA_PRODUCT}/default/${imageryDate(date)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg`;
