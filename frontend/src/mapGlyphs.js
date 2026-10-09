const paths={
 iss:'<path d="M13 7h6v18h-6zM4 9h7v5H4zm0 9h7v5H4zm17-9h7v5h-7zm0 9h7v5h-7zM1 16h30M16 3v4m0 18v4"/>',
 station:'<path d="M16 15v13m-5 0h10M9 22l7-7 7 7M11 9a7 7 0 0 1 10 0M7 5a13 13 0 0 1 18 0"/><circle cx="16" cy="13" r="2"/>',
 sun:'<circle cx="16" cy="16" r="6"/><path d="M16 2v4m0 20v4M2 16h4m20 0h4M6 6l3 3m14 14 3 3M6 26l3-3M23 9l3-3"/>',
 storm:'<path d="M5 22a7 7 0 0 1 1-14 10 10 0 0 1 19 3 6 6 0 0 1 1 11H5Z"/><path d="m18 13-6 8h5l-2 7 7-10h-5l2-5Z"/>',
 goes:'<path d="M16 17v11m-6 0h12M8 17l8-5 8 5M5 8l7 3m15-3-7 3"/><circle cx="16" cy="10" r="3"/><path d="M2 4c3-2 6-2 9 0M21 4c3-2 6-2 9 0"/>',
};
export function glyphSVG(kind){return `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[kind]||paths.station}</svg>`;}
