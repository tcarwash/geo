# Map glyphs

Edit these standalone SVGs to change the custom map markers:

- `iss.svg` — International Space Station
- `goes.svg` — GOES weather satellite
- `storm.svg` — tropical storm
- `station.svg` — station marker
- `sun.svg` — subsolar point

Each file is used by `../../mapGlyphs.js` through its root `id="glyph"`. Keep the `0 0 32 32` viewBox and `currentColor` stroke so the existing Leaflet sizing and color classes continue to work. Other interface icons come from `lucide-react`; the Chron day/night overlay is generated from geometry rather than a static icon.
