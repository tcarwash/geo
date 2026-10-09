const TEXT_INPUTS=new Set(['INPUT','TEXTAREA','SELECT']);

export function shortcutAction(event){
  if(event.key==='Escape')return 'escape';
  if(event.ctrlKey||event.metaKey||event.altKey||TEXT_INPUTS.has(event.target?.tagName)||event.target?.isContentEditable)return null;
  const key=event.key?.toLowerCase();
  return key==='g'?'goto':key==='l'?'layers':null;
}
