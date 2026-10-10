const COMPUTED=new Set(['night']);
const REFERENCE=new Set(['graticule','maidenhead','cq-zones','itu-zones']);

export function sourceStatusLabel(id,feed,formatAge=value=>value){
  if(feed?.loading)return 'Updating';
  if(feed?.status==='stale'||feed?.staleReason||((feed?.error||feed?.status==='unavailable')&&feed?.dataTime))return `Stale · ${formatAge(feed.dataTime||feed.fetchedAt||feed.retrievedAt)}`;
  if(feed?.error||feed?.status==='unavailable')return 'Unavailable';
  if(feed?.status==='user')return 'User data';
  if(feed?.status==='current'&&!feed?.dataTime)return feed.retrievedAt?`Available · ${formatAge(feed.retrievedAt)}`:'Available';
  if(feed?.dataTime)return `${feed.kind==='forecast'?'Forecast':'Observed'} · ${formatAge(feed.dataTime)}`;
  if(COMPUTED.has(id))return 'Computed';
  if(REFERENCE.has(id))return 'Reference';
  return 'Waiting for source';
}

export function sourceStatusTone(feed){
  if(feed?.loading)return 'loading';
  if(feed?.status==='stale'||feed?.staleReason||((feed?.error||feed?.status==='unavailable')&&feed?.dataTime))return 'stale';
  if(feed?.error||feed?.status==='unavailable')return 'unavailable';
  return '';
}

export function sourceTimeDetails(feed,formatTime=value=>value){
  if(!feed)return [];
  const productLabel={observation:'Observed',forecast:'Issued',model:'Model time',composite:'Product time',reference:'Reference time',user:'Data time'}[feed.kind]||'Data time';
  return [
    ...(feed.dataTime?[[productLabel,formatTime(feed.dataTime)]]:[]),
    ...(feed.validFrom?[['Valid from',formatTime(feed.validFrom)]]:[]),
    ...(feed.validTo?[['Valid until',formatTime(feed.validTo)]]:[]),
    ...(feed.fetchedAt?[['Retrieved',formatTime(feed.fetchedAt)]]:[]),
  ];
}
