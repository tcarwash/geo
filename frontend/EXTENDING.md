# Frontend source and widget extension guide

## Custom sources

The Layers drawer configures public XYZ, WMS, and GeoJSON file overlays. `customLayer()` in `src/core.js` validates and normalizes source definitions before they enter saved state. `attachCustomLayer()` in `src/customLayers.js` creates a Leaflet layer, attaches status listeners, and returns a disposer that removes both listeners and resources.

A normalized source looks like:

```js
{
  id: 'custom-example', custom: true, kind: 'xyz',
  name: 'Example tiles', attribution: 'Example provider',
  url: 'https://example.org/{z}/{x}/{y}.png',
  on: true, opacity: 0.65
}
```

This is a schema example, not a working provider. Replace its URL only with a permitted source. WMS definitions add `wmsLayers`; GeoJSON definitions replace the URL with a validated FeatureCollection in `data`.

To add a source renderer, extend the accepted kind list and validation in `customLayer`, the corresponding form controls in `CustomSourceForm.jsx`, and the renderer branch in `attachCustomLayer`. Every renderer must use its assigned pane, mark provider features `pmIgnore: true`, escape attribution and tooltip text, report failures, and return a cleanup function. The map owns order and opacity; a renderer should not change other layers or map center.

Sources load directly in the browser. There is no arbitrary server-side fetch proxy. HTTPS deployments require compatible source URLs; WMS must support Web Mercator. The current public-source workflow rejects credentials in URL userinfo and sensitive query parameter names. Eight custom sources maximum; the UI bounds total layout size before insertion. Uploaded GeoJSON is kept with the layout, so small reference datasets are appropriate. No remote GeoJSON polling is currently implemented.

## Bundled providers

Bundled provider definitions live in `LAYERS`; refresh adapters live in `App.jsx`, and renderers in `MapView.jsx`. Those legacy branches are not yet a complete plugin registry. Source envelopes preserve provider status and timestamps. Keep observation, forecast, model, and reference semantics explicit. Never use widget render rates as upstream polling rates.

## Widgets

Widget types are normalized in `normalizeState`, selected through the Widgets drawer, and rendered by `Widget` in `App.jsx`. Saved records contain ID, type, configuration, position, width, and height. Current types are clock, station, note, iframe, and space-weather.

When adding a type, add its normalization, creation defaults, renderer, and selection entry together. Keep minimum size and keyboard movement meaningful. Pointer drag owns only the title bar, while textarea/iframe interactions own their content. On phones, widgets stack without rewriting saved desktop coordinates. Provider-backed widgets use the existing refresh lifecycle; unavailable values remain unavailable.
