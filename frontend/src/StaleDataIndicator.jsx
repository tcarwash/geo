import {useEffect,useRef,useState} from 'react';
import {TriangleAlert,X} from 'lucide-react';

export default function StaleDataIndicator({entries=[]}){
 const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null);
 useEffect(()=>{
  if(!open)return;
  const outside=event=>{if(!root.current?.contains(event.target))setOpen(false)};
  const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus({preventScroll:true})}};
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
 },[open]);
 useEffect(()=>{if(!entries.length)setOpen(false)},[entries.length]);
 if(!entries.length)return null;
 const label=`${entries.length} stale ${entries.length===1?'layer':'layers'}`;
 const close=()=>{setOpen(false);trigger.current?.focus({preventScroll:true})};
 return <div className="stale-data-control" ref={root}>
  <button ref={trigger} type="button" className="stale-data-trigger" aria-label={`Stale data: ${label}`} aria-expanded={open} aria-controls="stale-data-panel" title="View stale layer data" onClick={()=>setOpen(value=>!value)}>
   <TriangleAlert size={15} aria-hidden="true"/><span aria-hidden="true">{entries.length}</span>
  </button>
  {open&&<section id="stale-data-panel" className="stale-data-panel surface" role="region" aria-label="Stale layer data">
   <header><strong>Stale layer data</strong><button type="button" aria-label="Close stale data details" title="Close" onClick={close}><X size={16}/></button></header>
   <p className="stale-data-guidance">Age uses source data time when available; otherwise, last retrieval.</p>
   <ul>{entries.map(entry=><li key={entry.id}>
    <strong>{entry.name}</strong>
    <span>{entry.ageBasis?`${entry.ageBasis} · ${entry.age}`:entry.age}</span>
    {entry.reason&&<small>{entry.reason}</small>}
   </li>)}</ul>
  </section>}
 </div>;
}
