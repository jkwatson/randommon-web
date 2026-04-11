/**
 * Reads filter state from the current URL search params.
 * @param {import('./app.js').AppState} state
 */
export function loadFromUrl(state) {
  const p = new URLSearchParams(window.location.search);

  if (p.has('level'))      state.setLevel(parseInt(p.get('level'), 10));
  if (p.has('biome'))      state.setBiome(p.get('biome'));
  if (p.has('tag'))        state.setTag(p.get('tag'));
  if (p.has('mode'))       state.setMode(p.get('mode'));
  if (p.has('size'))       state.setSize(parseInt(p.get('size'), 10));
  if (p.has('randomness')) state.setRandomness(parseInt(p.get('randomness'), 10));

  const sources = p.getAll('src');
  if (sources.length) {
    state.sources = new Set(sources);
    state._emit();
  }
}

/**
 * Writes current filter state to the URL without reloading the page.
 * @param {import('./app.js').AppState} state
 */
export function saveToUrl(state) {
  const p = new URLSearchParams();

  if (state.level !== null)    p.set('level', state.level);
  if (state.biome !== null)    p.set('biome', state.biome);
  if (state.tag !== null)      p.set('tag', state.tag);
  if (state.mode !== 'cluster') p.set('mode', state.mode);
  if (state.size !== 3)        p.set('size', state.size);
  if (state.randomness !== 1)  p.set('randomness', state.randomness);

  const defaultSources = state.sources.size === 3 && state.sources.has('core') && state.sources.has('SB1') && state.sources.has('SB2');
  if (!defaultSources) {
    for (const s of state.sources) p.append('src', s);
  }

  const qs = p.toString();
  const newUrl = qs ? `${location.pathname}?${qs}` : location.pathname;
  history.replaceState(null, '', newUrl);
}
