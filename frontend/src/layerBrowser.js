// Retain original indices so reordering still acts on the complete layer stack.
export function filterLayerGroups(layers,definitions,groups,search='',filter='all',favorites=[]){
  const query=search.trim().toLowerCase();
  const indexed=layers.map((l,index)=>({l,index,def:l.custom?l:definitions.find(d=>d.id===l.id)}));
  return [...groups,{name:'Custom sources',custom:true}].map(group=>({
    ...group,
    layers:indexed.filter(({l,def})=>def&&(filter!=='active'||l.on)&&(filter!=='favorites'||favorites.includes(l.id))&&(group.custom?l.custom:!l.custom&&group.ids.includes(l.id))&&[def.name,def.subtitle,group.name].some(value=>value?.toLowerCase().includes(query))),
  })).filter(group=>group.layers.length);
}