const COMPUTED=new Set(['night']);
const REFERENCE=new Set(['graticule','maidenhead','cq-zones','itu-zones']);

export function sourceStatusLabel(id,feed,formatAge=value=>value){
  if(feed?.loading)return 'Updating';
  if(feed?.status==='stale'||feed?.staleReason||((feed?.error||feed?.status==='unavailable')&&feed?.dataTime))return `Stale · ${formatAge(feed.dataTime||feed.fetchedAt||feed.retrievedAt)}`;
  if(feed?.error||feed?.status==='unavailable')return 'Unavailable';
  if(feed?.kind==='composite'&&feed?.referenceVintage)return `Composite · ${feed.referenceVintage}`;
  if(feed?.kind==='reference')return `Reference · ${feed.referenceVintage||'Date unavailable'}`;
  if(feed?.status==='user')return 'User data';
  if(feed?.status==='current'&&!feed?.dataTime)return feed.retrievedAt?`Available · ${formatAge(feed.retrievedAt)}`:'Available';
  if(feed?.dataTime)return `${feed.kind==='forecast'?'Forecast':feed.kind==='model'?'Model':feed.kind==='analysis'?'Analysis':feed.kind==='composite'?'Composite':'Observed'} · ${formatAge(feed.dataTime)}`;
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

export function staleLayerEntries(feeds,layers,formatAge=value=>value){
  const order=new Map(layers.map((layer,index)=>[layer.id,index]));
  return Object.entries(feeds||{})
    .filter(([,feed])=>feed?.status==='stale'||feed?.staleReason||((feed?.error||feed?.status==='unavailable')&&feed?.dataTime))
    .map(([id,feed])=>{
      const isTimestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
      const hasDataTime=isTimestamp(feed?.dataTime),retrievedAt=feed?.fetchedAt||feed?.retrievedAt;
      const timestamp=hasDataTime?feed.dataTime:isTimestamp(retrievedAt)?retrievedAt:null;
      return {
        id,
        name:layers.find(layer=>layer.id===id)?.name||id,
        age:timestamp?formatAge(timestamp):'Age unavailable',
        ageBasis:timestamp?(hasDataTime?'Data':'Retrieved'):'',
        reason:feed?.staleReason||feed?.error||null,
      };
    })
    .sort((a,b)=>(order.get(a.id)??Number.MAX_SAFE_INTEGER)-(order.get(b.id)??Number.MAX_SAFE_INTEGER));
}

export function sourceTimeDetails(feed,formatTime=value=>value){
  if(!feed)return [];
  const productLabel={observation:'Observed',forecast:'Issued',analysis:'Analysis time',model:'Model time',composite:'Product time',reference:'Reference time',user:'Data time'}[feed.kind]||'Data time';
  return [
    ...(feed.dataTime?[[productLabel,formatTime(feed.dataTime)]]:[]),
    ...(feed.validFrom?[['Valid from',formatTime(feed.validFrom)]]:[]),
    ...(feed.validTo?[['Valid until',formatTime(feed.validTo)]]:[]),
    ...(feed.fetchedAt?[['Retrieved',formatTime(feed.fetchedAt)]]:[]),
  ];
}
