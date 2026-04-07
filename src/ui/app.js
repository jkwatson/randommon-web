/**
 * Central app state. Emits 'change' events when state updates.
 */
export class AppState extends EventTarget {
  constructor() {
    super();
    this.level       = null;      // number|null
    this.biome       = null;      // string|null
    this.tag         = null;      // string|null
    this.sources     = new Set(['core']); // empty = all sources
    this.randomness  = 1;         // 1–5
    this.mode        = 'cluster'; // 'cluster'|'walk'
    this.size        = 5;         // 1–10
    this.seedMonster = null;      // Monster|null
  }

  _emit() {
    this.dispatchEvent(new Event('change'));
  }

  setLevel(v)        { this.level = v;         this._emit(); }
  setBiome(v)        { this.biome = v;          this._emit(); }
  setTag(v)          { this.tag = v;            this._emit(); }
  setRandomness(v)   { this.randomness = v;     this._emit(); }
  setMode(v)         { this.mode = v;           this._emit(); }
  setSize(v)         { this.size = v;           this._emit(); }
  setSeedMonster(v)  { this.seedMonster = v;    this._emit(); }
  clearSeed()        { this.seedMonster = null; this._emit(); }

  toggleSource(source) {
    if (this.sources.has(source)) this.sources.delete(source);
    else this.sources.add(source);
    this._emit();
  }
  clearSources()  { this.sources.clear();           this._emit(); }
  resetSources()  { this.sources = new Set(['core']); this._emit(); }

  toChoices() {
    return {
      level:       this.level,
      biome:       this.biome,
      tag:         this.tag,
      sources:     Array.from(this.sources),
      randomness:  this.randomness,
      seedMonster: this.seedMonster,
    };
  }
}
