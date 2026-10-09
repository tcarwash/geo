import {useState} from 'react';
import {customLayer} from './core';
export default function CustomSourceForm({onAdd,onError,disabled}){
 const [form,setForm]=useState({kind:'xyz',name:'',url:'',attribution:'',wmsLayers:''}),[data,setData]=useState(null);
 const change=(key,value)=>setForm(f=>({...f,[key]:value}));
 return <details className="custom-source"><summary>Add a custom source</summary><form onSubmit={e=>{e.preventDefault();try{onAdd(customLayer({...form,data}));setForm({...form,name:'',url:'',attribution:''});setData(null)}catch(error){onError(error)}}}>
 <label>Source type<select disabled={disabled} value={form.kind} onChange={e=>change('kind',e.target.value)}><option value="xyz">XYZ tiles</option><option value="wms">WMS overlay</option><option value="geojson">GeoJSON file</option></select></label>
 <label>Layer name<input disabled={disabled} required maxLength="100" value={form.name} onChange={e=>change('name',e.target.value)}/></label>
 {form.kind==='geojson'?<label className="file-button">{data?`${data.features?.length??0} features selected`:'Choose GeoJSON'}<input disabled={disabled} type="file" accept=".json,.geojson" onChange={async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2000000)throw new Error('Choose a file smaller than 2 MB.');setData(JSON.parse(await file.text()))}catch(error){onError(error)}}}/></label>:<label>{form.kind==='xyz'?'Tile URL template':'WMS endpoint'}<input disabled={disabled} required placeholder={form.kind==='xyz'?'https://example.org/{z}/{x}/{y}.png':'https://example.org/wms'} value={form.url} onChange={e=>change('url',e.target.value)}/></label>}
 {form.kind==='wms'&&<label>WMS layer identifier<input disabled={disabled} required value={form.wmsLayers} onChange={e=>change('wmsLayers',e.target.value)}/></label>}
 <label>Source attribution<input disabled={disabled} required maxLength="500" value={form.attribution} onChange={e=>change('attribution',e.target.value)}/></label>
 <p className="muted">Use sources you have permission to display. Tile requests go directly to the provider. WMS uses Web Mercator and version 1.1.1. This view supports public endpoints without credentials.</p><button className="primary" disabled={disabled} type="submit">Add source</button>
 </form></details>
}
