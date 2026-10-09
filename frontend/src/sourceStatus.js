const COMPUTED=new Set(['night']);
const REFERENCE=new Set(['graticule','maidenhead','cq-zones','itu-zones']);

export function sourceStatusLabel(id,feed,formatAge=value=>value){
  if(feed?.loading)return 'Updating';
  if(feed?.status==='stale'||feed?.staleReason||((feed?.error||feed?.status==='unavailable')&&feed?.dataTime))return `Stale · ${formatAge(feed.dataTime)}`;
  if(feed?.error||feed?.status==='unavailable')return 'Unavailable';
  if(feed?.status==='user')return 'User data';
  if(feed?.dataTime)return `${feed.kind==='forecast'?'Forecast':'Observed'} · ${formatAge(feed.dataTime)}`;
  if(COMPUTED.has(id))return 'Computed';
  if(REFERENCE.has(id))return 'Reference';
  return 'Waiting for source';
}
