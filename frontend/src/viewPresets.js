// Presets only compose existing layers; they never create or configure map sources.
export const VIEW_PRESETS = Object.freeze({
  atlas: Object.freeze({ id: 'atlas', name: 'Atlas', layers: Object.freeze(['night', 'graticule']) }),
  weather: Object.freeze({ id: 'weather', name: 'Weather', layers: Object.freeze(['clouds', 'precipitation', 'storms']) }),
  radio: Object.freeze({ id: 'radio', name: 'Radio', layers: Object.freeze(['maidenhead', 'muf', 'rbn']) }),
  space: Object.freeze({ id: 'space', name: 'Space', layers: Object.freeze(['night', 'aurora', 'satellite']) }),
});

const SPACE_WIDGET_ID = 'preset-space-weather';
const SPACE_WIDGET = Object.freeze({
  id: SPACE_WIDGET_ID, type: 'space-weather', title: 'Space weather',
  x: 120, y: 180, width: 240, height: 150, zone: 'UTC', text: '',
});

/**
 * Apply a curated visibility composition without mutating state or layer records.
 * Pass the pre-application state as `previous` to restore its layer on/off values
 * and widgets (for example, to implement Undo). Unknown IDs return `state` itself.
 */
export function applyViewPreset(state, id, previous) {
  const preset = VIEW_PRESETS[id];
  if (!preset) return state;
  if (previous) {
    const previousOn = new Map((previous.layers || []).map(layer => [layer.id, layer.on]));
    return {
      ...state,
      layers: state.layers.map(layer => previousOn.has(layer.id)
        ? { ...layer, on: previousOn.get(layer.id) }
        : layer),
      widgets: previous.widgets || state.widgets,
    };
  }

  const visible = new Set(preset.layers);
  const layers = state.layers.map(layer => layer.custom
    ? layer
    : { ...layer, on: visible.has(layer.id) });
  let widgets = (state.widgets || []).filter(widget => widget.id !== SPACE_WIDGET_ID);
  if (id === 'space' && !widgets.some(widget => widget.id === SPACE_WIDGET_ID)) widgets = [...widgets, { ...SPACE_WIDGET }];
  return { ...state, layers, widgets };
}
