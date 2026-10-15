const glyphs={
 aircraft:new URL('./assets/glyphs/aircraft.svg?no-inline',import.meta.url).href,
 iss:new URL('./assets/glyphs/iss.svg?no-inline',import.meta.url).href,
 station:new URL('./assets/glyphs/station.svg?no-inline',import.meta.url).href,
 sun:new URL('./assets/glyphs/sun.svg?no-inline',import.meta.url).href,
 storm:new URL('./assets/glyphs/storm.svg?no-inline',import.meta.url).href,
 goes:new URL('./assets/glyphs/goes.svg?no-inline',import.meta.url).href,
};

export function glyphAsset(kind){return (glyphs[kind]||glyphs.station).replace('?no-inline','');}
export function glyphSVG(kind){return `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="${glyphAsset(kind)}#glyph"/></svg>`;}
