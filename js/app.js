/**
 * Avoidable Poverty Index (AP) — live-recompute build.
 *
 * Every metric is recomputed in the browser (compute.js) from each economy's
 * PIP distribution under the user-chosen poverty line, affluence line,
 * mobilization rate f and structural weight β. PIP only.
 * (Internal field name `rapi` is the AP_β index, kept stable to avoid churn.)
 */

const METRIC_LABELS = {
  rapi: "AP",
  pa: "P_A (Avoidable)",
  ps: "P_S (Structural)",
  agr: "ξ / AGR",
  taustar: "τ*",
  capacity: "Capacity",
  hp: "H_p",
  ha: "H_a",
  hm: "H_m",
  gini: "Gini",
  gdp_pc: "GDP/cap",
  median_welfare: "Median $/day",
  mean_welfare: "Mean $/day",
  palma: "Palma",
  p0: "Poverty Rate",
  p1: "Poverty Gap Index",
};

const App = {
  state: {
    activeTab: "explorer",
    metric: "rapi",
    colorBy: "region",
    selectedCountries: [],
    // framework parameters (paper baseline)
    beta: 0.50,
    f: 0.40,
    zp: { type: "relative-median", intercept: 1.30, slope: 0.50,
          absValue: 3.00, floorEnabled: false, floorValue: 3.00 },
    za: { type: "multiple", k: 4, km: 2, percentile: 10, absValue: 30 },
    // scatter
    scatterX: "gdp_pc",
    scatterY: "rapi",
    // rankings
    rankingsMetric: "rapi",
    rankingsRegion: "",
    rankingsView: "bar",
    rankingsSortCol: "rapi",
    rankingsSortAsc: false,
    // cache
    _data: null,
  },

  /** Live record for one economy under current parameters. */
  _record(m) {
    const w = DataLoader.getLatestW(m.code);
    if (!w) return null;
    const rec = Compute.fromDistribution(w, this.state.zp, this.state.za,
      this.state.f, this.state.beta);
    if (!rec) return null;
    let agr_group = "Unknown";
    if (rec.agr != null) {
      if (rec.agr >= 0.999) agr_group = "Fully avoidable";
      else if (rec.agr >= 0.75) agr_group = "Mostly avoidable";
      else if (rec.agr >= 0.5) agr_group = "Mixed (>50% avoidable)";
      else if (rec.agr >= 0.25) agr_group = "Mixed (<50% avoidable)";
      else agr_group = "Mostly structural";
    }
    return {
      code: m.code, country: m.country, region: m.region,
      welfare_type: m.welfare_type, gdp_pc: m.gdp_pc, pop: m.pop,
      year: DataLoader.latestDist.get(m.code)?.y,
      ...rec,
      rapi_live: rec.rapi,
      agr_group,
    };
  },

  /** All economies, recomputed under current parameters (cached per render). */
  getData() {
    if (this.state._data) return this.state._data;
    const out = [];
    for (const m of DataLoader.meta) {
      const r = this._record(m);
      if (r) out.push(r);
    }
    this.state._data = out;
    return out;
  },

  _invalidate() { this.state._data = null; },

  /** Live record for one economy by code (from the current parameter set). */
  getRecord(code) { return this.getData().find(d => d.code === code); },

  getMetricValue(d, metric) {
    if (metric === "rapi") return d.rapi_live != null ? d.rapi_live : d.rapi;
    return d[metric];
  },

  /** Per-year recomputed series for one economy (time-series panel). */
  getCountrySeries(code) {
    const rows = DataLoader.getSeries(code);
    const out = [];
    for (const row of rows) {
      const rec = Compute.fromDistribution(row.w, this.state.zp, this.state.za,
        this.state.f, this.state.beta);
      if (!rec) continue;
      out.push({ year: row.year, has_survey: row.s,
        ...rec, rapi: rec.rapi, rapi_live: rec.rapi });
    }
    return out;
  },

  async init() {
    this._showLoading();
    await DataLoader.loadAll();

    await MapChart.init("map-container");
    ScatterChart.init("scatter-container");
    TimeSeriesChart.init("timeseries-container");
    RankingsChart.init();
    DecompositionChart.init();

    this._wireTabNavigation();
    this._wireExplorerControls();
    this._wireLineControls();
    this._wireBetaSliders();
    this._wireFSliders();
    this._wireRankingsControls();

    this._hideLoading();
    this.render();
  },

  _showLoading() {
    document.querySelectorAll(".panel > div").forEach(el => {
      el.innerHTML = '<div class="loading">Loading data</div>';
    });
  },
  _hideLoading() { document.querySelectorAll(".loading").forEach(el => el.remove()); },

  // --- Tabs ---
  _wireTabNavigation() {
    document.querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => {
        this.state.activeTab = btn.dataset.tab;
        document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
        this.render();
      });
    });
  },

  // --- Explorer controls ---
  _wireExplorerControls() {
    document.querySelectorAll('#metric-radios input[name="metric"]').forEach(radio => {
      radio.addEventListener("change", (e) => {
        this.state.metric = e.target.value;
        this.state.scatterY = e.target.value;
        const sel = document.getElementById("scatter-y");
        if (sel) sel.value = e.target.value;
        this.render();
      });
    });
    document.getElementById("color-by").addEventListener("change", (e) => {
      this.state.colorBy = e.target.value; this.render();
    });
    document.getElementById("scatter-x").addEventListener("change", (e) => {
      this.state.scatterX = e.target.value; this.render();
    });
    document.getElementById("scatter-y").addEventListener("change", (e) => {
      this.state.scatterY = e.target.value; this.render();
    });

    const searchInput = document.getElementById("country-search");
    const countryList = document.getElementById("country-list");
    searchInput.addEventListener("focus", () => {
      this._populateCountryList(searchInput.value); countryList.classList.add("open");
    });
    searchInput.addEventListener("input", () => {
      this._populateCountryList(searchInput.value); countryList.classList.add("open");
    });
    document.addEventListener("mousedown", (e) => {
      const area = searchInput.closest(".control-group");
      if (!area.contains(e.target)) countryList.classList.remove("open");
    });

    document.getElementById("download-data").addEventListener("click", () => this.downloadData());
  },

  // --- Poverty / affluence line + f controls ---
  _wireLineControls() {
    const self = this;
    const reRender = () => { self._invalidate(); self.render(); };

    const zpType = document.getElementById("zp-type");
    const zpRel = document.getElementById("zp-relative-controls");
    const zpAbs = document.getElementById("zp-absolute-controls");
    zpType.addEventListener("change", () => {
      self.state.zp.type = zpType.value;
      zpRel.style.display = zpType.value.startsWith("relative") ? "" : "none";
      zpAbs.style.display = zpType.value === "absolute" ? "" : "none";
      reRender();
    });
    this._slider("zp-intercept", "zp-intercept-value", v => { self.state.zp.intercept = v; }, 2, reRender);
    this._slider("zp-slope", "zp-slope-value", v => { self.state.zp.slope = v; }, 2, reRender);
    this._slider("zp-abs", "zp-abs-value", v => { self.state.zp.absValue = v; }, 2, reRender);

    const floorCheck = document.getElementById("zp-floor-check");
    const floor = document.getElementById("zp-floor");
    floorCheck.addEventListener("change", () => { self.state.zp.floorEnabled = floorCheck.checked; reRender(); });
    floor.addEventListener("input", () => { self.state.zp.floorValue = parseFloat(floor.value) || 0; reRender(); });

    const zaType = document.getElementById("za-type");
    const zaMult = document.getElementById("za-multiple-controls");
    const zaMed = document.getElementById("za-median-controls");
    const zaPct = document.getElementById("za-percentile-controls");
    const zaAbsC = document.getElementById("za-absolute-controls");
    zaType.addEventListener("change", () => {
      self.state.za.type = zaType.value;
      zaMult.style.display = zaType.value === "multiple" ? "" : "none";
      if (zaMed) zaMed.style.display = zaType.value === "median-multiple" ? "" : "none";
      zaPct.style.display = zaType.value === "percentile" ? "" : "none";
      zaAbsC.style.display = zaType.value === "absolute" ? "" : "none";
      reRender();
    });
    this._slider("k-slider", "k-value", v => { self.state.za.k = v; }, 1, reRender);
    this._slider("km-slider", "km-value", v => { self.state.za.km = v; }, 1, reRender);
    this._slider("za-pctile", "za-pctile-value", v => { self.state.za.percentile = Math.round(v); }, 0, reRender);
    this._slider("za-abs", "za-abs-value", v => { self.state.za.absValue = v; }, 0, reRender);
  },

  _slider(id, labelId, set, digits, after) {
    const el = document.getElementById(id);
    const lbl = document.getElementById(labelId);
    if (!el) return;
    el.addEventListener("input", () => {
      const v = parseFloat(el.value);
      set(v);
      if (lbl) lbl.textContent = digits != null ? v.toFixed(digits) : v;
      after();
    });
  },

  // --- β sliders (synced) ---
  _wireBetaSliders() {
    const ids = ["beta-slider", "rankings-beta-slider"];
    const labels = ["beta-value", "rankings-beta-value"];
    const sync = () => {
      ids.forEach((s, i) => {
        const el = document.getElementById(s), lbl = document.getElementById(labels[i]);
        if (el) el.value = this.state.beta;
        if (lbl) lbl.textContent = this.state.beta.toFixed(2);
      });
    };
    ids.forEach(s => {
      const el = document.getElementById(s);
      if (!el) return;
      el.addEventListener("input", () => {
        this.state.beta = parseFloat(el.value);
        this._invalidate(); sync(); this.render();
      });
    });
  },

  // --- f (mobilization) slider ---
  _wireFSliders() {
    const ids = ["f-slider"];
    const labels = ["f-value"];
    const sync = () => {
      ids.forEach((s, i) => {
        const el = document.getElementById(s), lbl = document.getElementById(labels[i]);
        if (el) el.value = this.state.f;
        if (lbl) lbl.textContent = this.state.f.toFixed(2);
      });
    };
    ids.forEach(s => {
      const el = document.getElementById(s);
      if (!el) return;
      el.addEventListener("input", () => {
        this.state.f = parseFloat(el.value);
        this._invalidate(); sync(); this.render();
      });
    });
  },

  // --- Rankings controls ---
  _wireRankingsControls() {
    document.getElementById("rankings-metric").addEventListener("change", (e) => {
      this.state.rankingsMetric = e.target.value;
      this.state.rankingsSortCol = e.target.value;
      this.state.rankingsSortAsc = false;
      if (this.state.activeTab === "rankings") this.render();
    });

    const regionSelect = document.getElementById("rankings-region-filter");
    for (const r of DataLoader.regions) {
      const opt = document.createElement("option");
      opt.value = r; opt.textContent = r; regionSelect.appendChild(opt);
    }
    regionSelect.addEventListener("change", () => {
      this.state.rankingsRegion = regionSelect.value;
      if (this.state.activeTab === "rankings") this.render();
    });

    document.querySelectorAll("#rankings-view-toggle .view-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#rankings-view-toggle .view-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.state.rankingsView = btn.dataset.view;
        if (this.state.activeTab === "rankings") this.render();
      });
    });
    document.getElementById("csv-export").addEventListener("click", () => this.downloadData());
  },

  // --- Country selection ---
  _populateCountryList(query) {
    const list = document.getElementById("country-list");
    list.innerHTML = "";
    const q = query.toLowerCase();
    const filtered = DataLoader.countries.filter(c =>
      c.country.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    ).slice(0, 30);
    for (const c of filtered) {
      const div = document.createElement("div");
      div.className = "country-item" + (this.state.selectedCountries.includes(c.code) ? " selected" : "");
      div.textContent = `${c.country} (${c.code})`;
      div.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        this.toggleCountry(c.code);
        this._populateCountryList(document.getElementById("country-search").value);
        list.classList.add("open");
      });
      list.appendChild(div);
    }
  },

  toggleCountry(code) {
    const idx = this.state.selectedCountries.indexOf(code);
    if (idx >= 0) this.state.selectedCountries.splice(idx, 1);
    else this.state.selectedCountries.push(code);
    this._updateSelectedTags();
    this.render();
  },

  _updateSelectedTags() {
    const container = document.getElementById("selected-countries");
    container.innerHTML = "";
    for (const code of this.state.selectedCountries) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = `${code} ×`;
      tag.addEventListener("click", () => this.toggleCountry(code));
      container.appendChild(tag);
    }
  },

  // --- Download ---
  downloadData() {
    const data = this.getData();
    const cols = ["code", "country", "region", "year", "rapi_live", "pa", "ps", "agr",
      "taustar", "capacity", "hp", "hm", "ha", "p0", "p1", "gini", "palma",
      "gdp_pc", "median_welfare", "mean_welfare", "zp", "za"];
    const headers = cols.map(c => c === "rapi_live" ? "ap" : c);
    let csv = headers.join(",") + "\n";
    for (const row of data) {
      csv += cols.map(c => {
        const v = row[c];
        if (v == null) return "";
        if (typeof v === "string") return `"${v}"`;
        return typeof v === "number" ? +v.toFixed(6) : v;
      }).join(",") + "\n";
    }
    const z = this.state.zp, a = this.state.za;
    csv += `\n# Avoidable Poverty Index (AP) — PIP, 2021 PPP. Parameters:\n`;
    csv += `# poverty_line=${JSON.stringify(z)}\n# affluence_line=${JSON.stringify(a)}\n`;
    csv += `# f=${this.state.f}  beta=${this.state.beta}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const aEl = document.createElement("a");
    aEl.href = url; aEl.download = "rapi_data.csv"; aEl.click();
    URL.revokeObjectURL(url);
  },

  // --- Render ---
  render() {
    switch (this.state.activeTab) {
      case "explorer": this._renderExplorer(); break;
      case "rankings": this._renderRankings(); break;
    }
  },

  _renderExplorer() {
    const { metric, colorBy, selectedCountries } = this.state;
    const data = this.getData();
    MapChart.update(data, metric, selectedCountries);
    ScatterChart.update(data, this.state.scatterX, this.state.scatterY, colorBy, selectedCountries);
    TimeSeriesChart.update(selectedCountries, metric);
    DecompositionChart.updateExplorer(data, selectedCountries, this.state.beta);
  },

  _renderRankings() { RankingsChart.update(this.getData(), this.state); },
};

window.addEventListener("DOMContentLoaded", () => {
  App.init().catch(err => {
    console.error("Failed to initialize:", err);
    document.querySelector("main").innerHTML =
      `<div class="loading" style="color: red;">Failed to load: ${err.message}</div>`;
  });
});
