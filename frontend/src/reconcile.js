// Preserve resource identity across refreshes and presentation changes.
export function reconcileResources(cache,definitions,create,present){
 const enabled=new Set(definitions.map(d=>d.id));
 for(const [id,entry] of cache)if(!enabled.has(id)){entry.dispose();cache.delete(id)}
 definitions.forEach((definition,index)=>{
  let entry=cache.get(definition.id);
  if(!entry||entry.key!==definition.key){entry?.dispose();entry=create(definition);entry.key=definition.key;cache.set(definition.id,entry)}
  present(entry,definition,index);
 });
}
