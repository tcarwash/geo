import L from 'leaflet';
import {maidenheadCells} from './maidenhead.js';
import {WORLD_OFFSETS} from './worldCopies.js';
export function maidenheadLayer(map,pane){
 const group=L.layerGroup().addTo(map),cells=new Map();
 const update=()=>{const b=map.getBounds(),definitions=WORLD_OFFSETS.flatMap(offset=>maidenheadCells({west:b.getWest()-offset,east:b.getEast()-offset,south:b.getSouth(),north:b.getNorth()},map.getZoom()).map(cell=>({...cell,id:`${cell.id}:${offset}`,bounds:[[cell.bounds[0][0],cell.bounds[0][1]+offset],[cell.bounds[1][0],cell.bounds[1][1]+offset]],center:[cell.center[0],cell.center[1]+offset]}))),keep=new Set(definitions.map(c=>c.id));
 for(const [id,entry] of cells)if(!keep.has(id)){group.removeLayer(entry.outline);if(entry.label)group.removeLayer(entry.label);cells.delete(id)}
 for(const cell of definitions){let entry=cells.get(cell.id);if(!entry){entry={outline:L.rectangle(cell.bounds,{pane,color:'#baa8d2',weight:.6,fill:false,interactive:false,pmIgnore:true}).addTo(group)};cells.set(cell.id,entry)}
 const a=map.latLngToContainerPoint(cell.bounds[0]),b=map.latLngToContainerPoint(cell.bounds[1]),visible=Math.abs(a.x-b.x)>48&&Math.abs(a.y-b.y)>28;
 if(visible&&!entry.label){const label=document.createElement('span');label.textContent=cell.label;entry.label=L.marker(cell.center,{pane,interactive:false,pmIgnore:true,icon:L.divIcon({className:'locator-label',html:label.outerHTML,iconSize:[60,20],iconAnchor:[30,10]})}).addTo(group)}else if(!visible&&entry.label){group.removeLayer(entry.label);entry.label=null;}
 }
 };map.on('moveend zoomend resize',update);update();return {update,dispose(){map.off('moveend zoomend resize',update);cells.clear();map.removeLayer(group)}};
}
