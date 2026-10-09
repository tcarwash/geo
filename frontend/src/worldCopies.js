export const WORLD_OFFSETS = [-720,-360,0,360,720];

export function shiftCoordinates(coordinates,offset){
 if(!Array.isArray(coordinates))return coordinates;
 if(coordinates.length>=2&&typeof coordinates[0]==='number'&&typeof coordinates[1]==='number')return [coordinates[0]+offset,coordinates[1],...coordinates.slice(2)];
 return coordinates.map(value=>shiftCoordinates(value,offset));
}

export function worldCopies(collection,offsets=WORLD_OFFSETS){
 return {type:'FeatureCollection',features:offsets.flatMap(offset=>(collection.features||[]).map(feature=>({...feature,worldOffset:offset,geometry:feature.geometry?{...feature.geometry,coordinates:shiftCoordinates(feature.geometry.coordinates,offset)}:feature.geometry}))) };
}
