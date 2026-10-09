# Geo — visual style guide

Version 1.0 · 2026-10-09  
Companion to [PROJECT_SPEC.md](PROJECT_SPEC.md)

## Design intent

Geo should feel like a beautifully printed world atlas brought to life on a large, calm display. Its visual signature comes from clear coastlines, richly colored land, deep blue oceans, a legible global clock, and an unmistakable moving day/night boundary. Live radio, weather, and satellite information adds detail without obscuring the geography.

Aim for a modern cartographic instrument: precise, atmospheric, editorial, and quietly technical. Keep the map as the main event. UI controls should feel carefully made, easy to read from across a room, and effortless to reach on touch screens. Build an original visual identity. Use the Geochron reference for broad cartographic character; do not copy its logo, artwork, proprietary map, or distinctive product UI.

## Visual principles

1. **The Earth owns the screen.** The map fills the available canvas and retains strong geographic contrast under layers.
2. **Color carries geography.** Country colors are varied and warm; sea and night colors are cool and dark. Layer colors have separate, consistent meanings.
3. **Time feels physical.** UTC, local clocks, the sun position, and the moving terminator share an elegant, precise visual language.
4. **Information has a hierarchy.** Start with the world, then the clock, then selected overlays and details. Avoid permanently showing every statistic.
5. **Depth stays restrained.** Use fine borders, translucent panels, subtle shadows, and modest radii. Avoid a generic stack of oversized glass cards.
6. **Every display size feels intentional.** Large-screen controls are visible at distance; mobile controls are thumb-friendly and make room for the map.

## Color system

Use CSS custom properties for all interface and map colors. The values below are the initial palette; fine-tune against the actual country data and darkening layers during implementation.

```css
:root {
  color-scheme: dark;

  /* Interface surfaces */
  --ink-950: #081522;
  --ink-900: #0c1c2b;
  --ink-850: #102537;
  --ink-800: #163044;
  --ink-700: #234258;
  --ink-500: #7890a1;
  --ink-300: #bdcbd3;
  --paper: #f3f0e7;
  --white: #ffffff;

  /* Cartographic ocean */
  --ocean-900: #073e61;
  --ocean-800: #07527a;
  --ocean-700: #08739a;
  --ocean-500: #25a5bc;
  --coastline: #d5e8e3;

  /* Cartographic land: assign by stable feature hash */
  --land-jade: #66ad8e;
  --land-leaf: #91bb65;
  --land-lime: #c3c65e;
  --land-gold: #e7ba55;
  --land-amber: #ed9153;
  --land-coral: #d96c62;
  --land-rose: #ba7788;
  --land-lavender: #8989ba;
  --land-sky: #68a6c0;
  --land-sand: #d9c789;

  /* Lighting */
  --day-wash: #fff2ca;
  --night-wash: #07182c;
  --twilight-civil: #d27475;
  --twilight-nautical: #665e9d;
  --twilight-astronomical: #203452;
  --solar-gold: #ffd36c;

  /* Data accents */
  --accent-cyan: #62d7e3;
  --accent-blue: #77aaff;
  --accent-violet: #b69cff;
  --accent-green: #7bdaa0;
  --accent-yellow: #ffd166;
  --accent-orange: #ff986b;
  --accent-red: #ff6e75;

  /* Interface state */
  --surface: rgb(8 21 34 / 88%);
  --surface-raised: rgb(16 37 55 / 94%);
  --surface-hover: rgb(35 66 88 / 92%);
  --line: rgb(219 234 238 / 17%);
  --line-strong: rgb(219 234 238 / 31%);
  --text: #f3f5f2;
  --text-muted: #b5c4cd;
  --text-quiet: #8297a5;
  --focus: #79dbe8;
}
```

### Country color assignment

- Give each country one of the land colors using a stable hash of its geographic ID. The same country retains its color across renders and base-map styles.
- Select palette colors so neighboring countries differ in hue or lightness. Repeated hues are fine when separated geographically.
- Keep saturation natural and moderately rich, like a premium printed atlas. The color should remain attractive beneath day shading and readable labels.
- Do not assign colors by political region, population, or an implied data value unless that is the explicit choropleth layer.
- Borders use a fine deep blue-gray stroke. Coastlines receive a clearer pale stroke to define the continents against the ocean.
- Disputed territories and unrecognized boundaries use the selected Natural Earth boundary data and its attribution. Never imply that cartographic treatment settles a political dispute.

### Lighting and contrast

The sunlit Earth should preserve land color. A subtle warm wash may tint daylight. A dark, soft-edged night mask should move with the calculated terminator; it must leave country borders, selected features, and labels visible. Twilight bands blend through muted rose, indigo, and navy, with the civil boundary visually clearest. Keep the terminator continuous across the date line and do not approximate it with a straight screen-space gradient.

Make the night effect configurable: night opacity, twilight visibility, grayscale, and optional true-night imagery. Avoid obscuring the map with simultaneous high-opacity night tiles and dark shading. Use one dominant night treatment at a time.

## Typography and numbers

Use a refined, highly legible sans-serif for controls and geographic text. Use a tabular or monospaced face only for UTC readouts, grid locators, coordinates, frequencies, and compact telemetry. A suitable stack is `Inter, "Avenir Next", Avenir, system-ui, sans-serif`; use `ui-monospace, "SFMono-Regular", Consolas, monospace` for technical values. Bundle fonts only when their licenses permit it; retain robust system fallbacks.

Use a clear scale rather than making every label bold:

| Role | Typical size at 1080p | Treatment |
| --- | ---: | --- |
| Hero UTC clock | 44–64 px | Tabular numerals, medium weight, slight tracking |
| Main section title | 22–28 px | Semibold, compact line height |
| Widget title | 16–20 px | Medium or semibold |
| Country label | 11–16 px | Medium, subtle dark/light halo |
| UI body | 14–16 px | Regular, high contrast |
| Secondary metadata | 12–13 px | Muted, never below accessible legibility |
| UTC / locator / telemetry | 13–18 px | Tabular or monospaced numerals |

Scale display typography with a dedicated display-scale setting and viewport-aware sizing. A 4K display should read comfortably from across a room; do not simply double every pixel value. Geographic labels should thin out at low zoom and gain detail as the user zooms in. Use short labels at world scale, and avoid labeling every minor feature simultaneously.

Clock digits should align as values change. Show timezone identifiers or UTC offsets where ambiguity is possible. Distinguish UTC from local time using both labels and placement, not color alone. Render coordinates with consistent decimal precision and hemispheres.

## The map canvas

### Overall map composition

- The map canvas spans the screen. Give it an intentional world framing, with the initial view centered to present all continents and a useful amount of ocean around them.
- Use a subtle navy ocean with enough blue to feel luminous, not black. Maintain sufficient contrast for thin routes and grid lines.
- Keep land colors visible at both 1080p and 4K. Country fills should not compete with weather rasters or an active DX layer.
- Country labels use a restrained halo for reliable contrast over every land fill. Ocean names use lower contrast and a little letter spacing.
- Coastlines should read cleanly at world scale. Country boundaries are finer and less prominent. Internal boundaries may fade at low zoom.
- Graticules are optional and low contrast. Increase line weight and emphasize equator and prime meridian only when selected.
- Show scale and attribution unobtrusively in a consistent map corner. Never cover a critical control or feature.

### Base map variants

Use one visual system across variants:

- **Atlas political** is the default: richly colored countries, blue ocean, crisp borders, readable labels.
- **Night atlas** emphasizes illuminated cities and dark ocean while retaining the political outlines.
- **Relief** uses subdued terrain color and hillshade. Keep labels and borders consistent with the political style.
- **Satellite** is a photographic alternative with darkened, subtle labels. Clearly identify its source and acquisition date.
- **Grayscale** is a low-chroma variant for busy overlay combinations. Keep coast and boundary hierarchy intact.

A style switch must not unexpectedly change the zoom, center, active data layers, or user drawings.

### Geographic labels and markers

Labels are part of the cartography, not floating interface cards. Prefer concise country and city names. Use haloed text rather than opaque label boxes. Avoid collisions through zoom-dependent filtering and priority. Important selected locations may use a small label plate attached to their pin.

Location pins use a refined point symbol: small bright center, thin ring, and optional short leader line. Custom label colors can be chosen by the user, but supply a palette that contrasts against both light and dark regions. Selected pins may pulse gently; reduce motion when requested. Avoid emoji as map symbols.

## Layer visual grammar

Each layer must be identifiable without making the full stack visually noisy. Give every data family a stable color and mark style. Include a legend with units or categorical definitions and an explicit source/time label. Opacity changes must affect the data rendering without washing out controls or attribution.

| Layer family | Suggested appearance |
| --- | --- |
| Solar terminator and twilight | Soft translucent navy night mask; thin warm-gold sun point; rose-to-indigo twilight bands |
| Aurora probability | Semi-transparent mint/teal to violet intensity ramp; discrete legend labels |
| Weather fields | Restrained blue-to-coral sequential ramp, with units and forecast/observation time; optional sparse wind barbs/streamlines |
| Earthquakes | Magnitude-scaled circles in warm amber/orange with a pale outline; age fades gently; selected event gains a halo |
| Satellites | Crisp cyan or white point, optional subtle trail, fine ground track; footprint is a light transparent outline |
| Amateur-radio reports | Small band-colored station dots and fine arc paths; aggregate dense reports and reveal detail on zoom |
| ADIF contacts | Consistent station symbol and great-circle paths colored by band; use filters before relying on many simultaneous colors |
| Maidenhead grid | Fine blue-gray lines; brighter locator cell on hover or selection; labels only at suitable zoom |
| Population and night lights | Raster heat ramp with transparent low values and restrained highlight range |
| Routes and cables | Thin, low-opacity lines that appear above base geography and below selected data; style routes differently from observations |
| User drawings | User-selected stroke and fill; clear active/edit handles; avoid matching default provider accents |

Layer order follows visual purpose: base map, broad raster/weather backgrounds, broad model fields, routes/grids, dynamic point data, selected data and drawings, then widgets and application controls. Let the user reorder compatible overlays. Warn about combinations that hide the map; do not silently alter the user's chosen opacity.

Data type and freshness must be readable in text. For example, distinguish “Forecast · valid 14:00 UTC,” “Observed · 13:52 UTC,” “Model · run 12:00 UTC,” and “Static dataset · 2024.” Color alone must never communicate whether a layer is live or stale.

## Interface surfaces and controls

### General controls

Use compact dark navy surfaces with slight translucency, a fine border, and a soft shadow. Background blur is optional and should remain subtle; controls must still read clearly when blur is unavailable. Prefer a few consistent radii (6 px for compact controls, 10 px for panels, 14 px for larger drawers). Avoid pill-shaped styling on every component.

Icon buttons use simple consistent line icons. Give every icon-only control an accessible name and a tooltip on pointer devices. Use a 44 px minimum touch target even when the visible glyph is smaller. Focus rings use `--focus` with a visible offset. Hover states are understated; selected state is clear at a glance.

Layer rows show a toggle, name, family icon, optional status, and expansion affordance. Put opacity, ordering, source, and legend controls inside an expanded row or detail sheet rather than exposing a wall of sliders. Show loading, stale, unavailable, and disabled states distinctly. Disabled layers explain why they cannot currently be enabled.

Use concise, direct button labels: “Layers,” “Add widget,” “Draw,” “Save layout,” “Fullscreen,” and “Lock display.” Avoid vague labels such as “More” when an action can be named directly.

### Panels and cards

A panel should look like a piece of dark instrument glass above the map. Use a small heading, a strong primary value, muted secondary information, and a subtle divider only when it improves grouping. Keep card padding consistent. Reserve bright accents for key readings, active selection, or warnings.

Use shadows to lift panels from the map, not as decoration on every nested element. Keep the map visible through generous spacing around controls. When a panel obscures an important region, let users move it or collapse it.

### Clocks and time controls

The main UTC clock is a signature element: large, precise, calm, and high contrast. Pair it with a short `UTC` label. Secondary clocks are smaller and grouped by place or zone. Avoid ornamental clock faces that compete with the map unless a user explicitly chooses an analog widget.

A time scrubber uses a fine horizontal track, a bright clear playhead, and explicit date/time labels. Playback speed and simulation mode belong in a secondary control menu. The active time must remain distinct from the current real clock. Use short transition animations; do not animate digits like a slot machine.

## Widgets

Widgets are configurable instrument panels, not arbitrary floating decorations. Their default style matches the dark control surfaces while allowing density and size appropriate to their content.

- Provide visible title bars and dedicated drag handles in edit mode. Hide handles in locked display mode.
- Use a clear focus outline while moving or resizing. Show alignment guides only during the gesture.
- Resize from generous touch targets. Preserve each widget's internal hierarchy at minimum dimensions; clamp to a documented minimum rather than allowing unreadable slivers.
- Clock, space-weather, and satellite widgets lead with one primary value and reveal detail beneath it.
- Text widgets use comfortable line spacing and a restrained reading width.
- Iframe widgets include a small source label and an explicit loading/error state. Use a dark frame and avoid double borders if the embedded page provides its own panel.
- When edit mode is active, a quiet outline or corner grip makes draggable items discoverable. Keep handles off the map's key labels where possible.
- Allow opacity only as a deliberate widget setting. Never lower text contrast below comfortable readability.

On a large display, widgets may float around the world like carefully arranged instrument panels. Keep their placement in the screen margins and over low-detail ocean when practical. On a phone, present widgets in a bottom sheet or stacked panel; do not shrink the map to a tiny desktop miniature.

## Drawing tools and interactions

Drawing mode should be unmistakable without changing the application's entire palette. Use the focus cyan for the active tool, warm amber for in-progress geometry, and a pale outline against map features. Make vertices large enough to manipulate with a finger. Keep undo, finish, cancel, and delete actions separated and clearly labeled.

A completed polygon uses a translucent fill, a crisp stroke, and a small title label when selected. Avoid opaque fills that hide data beneath them. Selected geometry gets handles and a slightly brighter outline. Unselected user geometry remains visible but quiet. Route styles should remain distinguishable from radio paths and transport datasets.

Give immediate feedback when the map is capturing points. On touch, avoid requiring a double-tap to finish a polygon without offering a visible Finish control. Keep map pan/zoom discoverable and resolve gesture conflicts by explicit draw mode.

## Motion and feedback

Motion should explain change: the Earth turns, the terminator advances, data refreshes, and panels open. Use smooth short transitions for menus and selection. Avoid constant pulsing, parallax, animated gradients, bouncing controls, and decorative rotation.

The day/night boundary may update continuously or on a short interval while the underlying data stays calm. Data refresh should use a small status indicator rather than flashing the whole layer. Respect reduced-motion preferences: remove nonessential animation and use static indicators.

Provide clear feedback for save success, failed import, stale data, unavailable providers, and locked display state. Use a short inline message or toast. Keep warnings visible long enough to read and provide a route to the details.

## Responsive and large-display layouts

### Large display and fullscreen

- Default to edge controls and movable widgets that leave most of the map unobstructed.
- Design the 4K layout at actual 3840 × 2160 resolution. Keep essential typography comfortably readable at the expected viewing distance.
- Show the clock, station identity, and a compact data-health indicator by default. Put editing and configuration tools behind a revealable control rail or drawer.
- Fullscreen mode hides edit handles and excess chrome. A tap, mouse movement, or keyboard command reveals controls temporarily; the user can still exit fullscreen clearly.
- Support a persistent display lock and a distinct edit mode. Do not expose destructive or layout-changing actions in the locked presentation.
- Reserve safe margins for displays with overscan or mounted frames. Provide a display-scale adjustment and a preview before saving it.

### Desktop and tablet

Use a narrow floating toolbar or side rail, expandable layer drawer, and draggable widgets. The map remains the dominant surface. On tablet portrait, move layer controls into a sheet and make drawing actions thumb-reachable.

### Phone

- Treat portrait mobile as a focused map with a compact top status strip and bottom action bar.
- Open layers, widgets, and saved layouts in full-height or bottom sheets with clear close controls.
- Keep buttons at least 44 × 44 CSS px and leave room for device safe areas.
- Make the selected feature detail a sheet, not a tiny tooltip.
- Preserve tap-to-inspect, pin, draw, and layer-opacity actions. Put advanced styling in an overflow/settings view.
- Let users use the map at its full viewport size; avoid permanent sidebars and multiple stacked floating cards.

## Accessibility and legibility

Meet WCAG AA contrast for interface text and controls where practical, including labels placed over the map. Data overlays must also be distinguishable using outline, shape, dash, or texture. Never rely on red/green distinctions alone.

Support keyboard navigation, visible focus, Escape to close transient UI, and accessible names for controls. Give layers and their enabled state semantic labels. Provide text equivalents for color legends and chart readouts. Respect browser zoom, high contrast settings, and reduced motion. Touch actions must not depend on hover.

## Content and labels

Write in concise, neutral language. Put units next to values, use ISO-like UTC timestamps consistently, and state the source's temporal meaning. Examples:

- `18:42:06 UTC`
- `San Francisco · PDT · 11:42 AM`
- `Aurora probability · Forecast · valid 18:30 UTC`
- `Wind · 10 m/s · forecast run 12:00 UTC`
- `Orbital elements · epoch 2026-10-09 14:00 UTC`
- `No recent reports · last update 12 min ago`

Do not call a layer “live” unless its upstream data and refresh behavior support that description. Show “No data” or “Unavailable” when a source has no current value. Keep attribution discoverable and preserve upstream terms for licenses and datasets.

## Design tokens for implementation

In addition to the color tokens, centralize the following values so the interface remains consistent:

```css
:root {
  --radius-control: 6px;
  --radius-panel: 10px;
  --radius-drawer: 14px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --control-target: 44px;
  --border-width: 1px;
  --shadow-panel: 0 12px 32px rgb(0 0 0 / 28%);
  --shadow-popover: 0 6px 18px rgb(0 0 0 / 24%);
  --ease-standard: cubic-bezier(.2, .75, .25, 1);
  --duration-fast: 140ms;
  --duration-panel: 220ms;
}
```

Use tokens for spacing, type, color, borders, and focus. Avoid one-off values in component styles unless the map geometry requires them. Keep semantic CSS names (`--text-muted`, `--accent-warning`) rather than encoding a single component's use into the token.

## Visual review checklist

Before calling a screen ready, review it at phone portrait, tablet portrait, 1920 × 1080, and 3840 × 2160. Check the rendered map rather than judging styles only from tokens.

- Does the first view immediately read as a premium world clock and atlas?
- Are country colors varied yet coherent, and do neighboring countries remain distinguishable?
- Can coastlines, labels, the day/night line, and active overlays all be read together?
- Does night feel deep and atmospheric while selected data and boundaries stay visible?
- Are UTC, local time, and data timestamps unambiguous?
- Do layers remain understandable with several enabled and with reduced opacity?
- Can a person use layer controls and drawing tools by touch without covering most of the map?
- Are floating widgets aligned, readable, and safe near screen edges?
- Do panels remain legible over both land and ocean?
- Do the mobile sheet and bottom controls respect safe areas and browser chrome?
- Are empty, loading, stale, failed, selected, locked, and editing states styled consistently?
- Are attribution and source details available without dominating the display?
- Does the layout still look composed with the map centered over a different hemisphere?

## Avoid

- Copying Geochron logos, map artwork, screenshots, or proprietary assets.
- Flat gray land as the default political map, or a black ocean that removes the sense of depth.
- Neon country fills, rainbow gradients without a data scale, or arbitrary colors that change between reloads.
- Thick borders on every country, labels at every zoom, and permanent dense graticules.
- Large opaque cards scattered over the continents.
- A control panel that competes with the map in fullscreen mode.
- Tiny text that is only comfortable at a laptop distance.
- Glows, blur, and shadow that reduce map contrast or create a generic “sci-fi dashboard” look.
- Unlabeled acronyms, stale data presented as current, and colors that imply a value without a legend.
- Interactions that work only with a mouse, hover, or precise double-click.
