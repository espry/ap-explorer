/**
 * Data loading for the Avoidable Poverty Index (AP) explorer (live-recompute build).
 *
 *   meta.json         identifiers + non-recomputable fields (region, gdp/cap, pop)
 *   dist_latest.json  {code: {y, w[100], pop}}        latest PIP wave
 *   dist_series.json  {code: {YYYY: {w[100], s}}}     1990-2024 lined-up series
 *
 * Everything else (z_p, z_r, G, S, τ*, P_A, P_S, ξ, AP, Gini, headcounts)
 * is recomputed in the browser by compute.js under the user's parameters.
 */

const DataLoader = {
  meta: [],
  latestDist: null,   // Map code -> {y, w, pop}
  series: null,       // plain object code -> {year -> {w, s}}
  countries: [],
  regions: [],
  _metaByCode: null,

  async loadAll() {
    const [metaResp, latestResp, seriesResp] = await Promise.all([
      fetch("data/meta.json"),
      fetch("data/dist_latest.json"),
      fetch("data/dist_series.json"),
    ]);
    this.meta = await metaResp.json();
    const latestObj = await latestResp.json();
    this.series = await seriesResp.json();

    this.latestDist = new Map(Object.entries(latestObj));
    this._metaByCode = new Map(this.meta.map(m => [m.code, m]));

    const regionSet = new Set();
    this.countries = [];
    for (const m of this.meta) {
      if (m.region) regionSet.add(m.region);
      this.countries.push({ code: m.code, country: m.country, region: m.region,
        welfare_type: m.welfare_type });
    }
    this.countries.sort((a, b) => a.country.localeCompare(b.country));
    this.regions = Array.from(regionSet).sort();

    console.log(`AP data: ${this.meta.length} PIP economies, ` +
      `${Object.keys(this.series).length} with series.`);
  },

  getMeta(code) { return this._metaByCode.get(code); },

  /** Latest-wave percentile welfares for a country. */
  getLatestW(code) {
    const d = this.latestDist.get(code);
    return d ? d.w : null;
  },

  /** [{year, w, s}] ascending, for the time-series panel. */
  getSeries(code) {
    const s = this.series[code];
    if (!s) return [];
    return Object.keys(s).map(y => ({ year: +y, w: s[y].w, s: s[y].s }))
      .sort((a, b) => a.year - b.year);
  },
};
