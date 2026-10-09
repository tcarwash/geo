const paths={
 iss:'<path d="M13 7h6v18h-6zM4 9h7v5H4zm0 9h7v5H4zm17-9h7v5h-7zm0 9h7v5h-7zM1 16h30M16 3v4m0 18v4"/>',
 station:'<path d="M16 15v13m-5 0h10M9 22l7-7 7 7M11 9a7 7 0 0 1 10 0M7 5a13 13 0 0 1 18 0"/><circle cx="16" cy="13" r="2"/>',
 sun:'<circle cx="16" cy="16" r="6"/><path d="M16 2v4m0 20v4M2 16h4m20 0h4M6 6l3 3m14 14 3 3M6 26l3-3M23 9l3-3"/>',
};
export function glyphSVG(kind){return `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[kind]||paths.station}</svg>`;}
