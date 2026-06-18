/**
 * Decomposition charts:
 * - Explorer panel: RAPI decomposition bars for selected countries
 * - Redistribution tab: tau* vs capacity, beta sensitivity, regional comparison, waterfall
 */

const DecompositionChart = {
  tooltip: null,

  init() {
    this.tooltip = d3.select("body").append("div")
      .attr("class", "tooltip decomp-main-tooltip")
      .style("display", "none");
  },

  // --- Explorer tab: bottom-right panel ---

  updateExplorer(data, selectedCodes, beta) {
    const container = document.getElementById("decomposition-container");
    container.innerHTML = "";
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    let subset;
    if (selectedCodes.length > 0) {
      subset = data.filter(d => selectedCodes.includes(d.code));
    } else {
      // Show top 10 by RAPI
      subset = [...data].sort((a, b) => {
        const va = App.getMetricValue(a, "rapi") || 0;
        const vb = App.getMetricValue(b, "rapi") || 0;
        return vb - va;
      }).slice(0, 10);
    }

    subset = subset.filter(d => d.pa != null && d.zp);
    if (subset.length === 0) return;

    const marginLeft = 60, marginRight = 20, marginTop = 10, marginBottom = 10;
    const barWidth = w - marginLeft - marginRight;

    const maxRapi = d3.max(subset, d => (d.pa + beta * d.ps) / d.zp) || 0.01;
    const x = d3.scaleLinear().domain([0, maxRapi * 1.1]).range([0, barWidth]);
    const y = d3.scaleBand()
      .domain(subset.map(d => d.code))
      .range([marginTop, h - marginBottom])
      .padding(0.15);

    const svg = d3.select(container)
      .append("svg")
      .attr("width", w)
      .attr("height", h);

    const g = svg.append("g").attr("transform", `translate(${marginLeft}, 0)`);

    // PA bars
    g.selectAll("rect.pa")
      .data(subset).join("rect").attr("class", "pa")
      .attr("x", 0)
      .attr("y", d => y(d.code))
      .attr("width", d => x(d.pa / d.zp))
      .attr("height", y.bandwidth())
      .attr("fill", "#dc2626").attr("opacity", 0.85);

    // beta*PS bars
    g.selectAll("rect.ps")
      .data(subset).join("rect").attr("class", "ps")
      .attr("x", d => x(d.pa / d.zp))
      .attr("y", d => y(d.code))
      .attr("width", d => x(beta * (d.ps || 0) / d.zp))
      .attr("height", y.bandwidth())
      .attr("fill", "#94a3b8").attr("opacity", 0.85);

    // Country labels
    svg.selectAll("text.label")
      .data(subset).join("text").attr("class", "label")
      .attr("x", marginLeft - 4)
      .attr("y", d => y(d.code) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end").attr("font-size", 11)
      .text(d => d.code);

    // Value labels
    g.selectAll("text.value")
      .data(subset).join("text").attr("class", "value")
      .attr("x", d => x((d.pa + beta * (d.ps || 0)) / d.zp) + 4)
      .attr("y", d => y(d.code) + y.bandwidth() / 2 + 4)
      .attr("font-size", 10).attr("fill", "#666")
      .text(d => ((d.pa + beta * (d.ps || 0)) / d.zp).toFixed(4));
  },

  // --- Redistribution tab ---

  updateRedistribution(data, state) {
    this._renderTaustarCapacity(data, state);
    this._renderBetaSensitivity(data, state);
    this._renderRegional(data, state);
    this._renderWaterfall(data, state);
  },

  _renderTaustarCapacity(data, state) {
    const container = document.getElementById("taustar-capacity-container");
    container.innerHTML = "";
    const rect = container.getBoundingClientRect();
    const w = rect.width, h = rect.height;

    let valid = data.filter(d => d.taustar != null && d.capacity != null && d.taustar > 0 && d.capacity > 0);

    const highCapOnly = document.getElementById("high-capacity-toggle")?.checked;
    if (highCapOnly) valid = valid.filter(d => d.capacity >= 1);

    // Region filter
    const regionChecks = document.querySelectorAll("#redist-region-checks input");
    if (regionChecks.length > 0) {
      const checked = new Set();
      regionChecks.forEach(cb => { if (cb.checked) checked.add(cb.value); });
      valid = valid.filter(d => checked.has(d.region));
    }

    if (valid.length === 0) return;

    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const pw = w - margin.left - margin.right;
    const ph = h - margin.top - margin.bottom;

    const svg = d3.select(container).append("svg").attr("width", w).attr("height", h);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xMax = Math.min(d3.max(valid, d => d.capacity) * 1.1, 20);
    const yMax = Math.min(d3.max(valid, d => d.taustar) * 1.1, 5);

    const x = d3.scaleLinear().domain([0, xMax]).range([0, pw]);
    const y = d3.scaleLinear().domain([0, yMax]).range([ph, 0]);
    const r = d3.scaleSqrt()
      .domain(d3.extent(valid, d => d.pop || 1))
      .range([3, 18]);

    g.append("g").attr("transform", `translate(0,${ph})`).call(d3.axisBottom(x).ticks(6));
    g.append("g").call(d3.axisLeft(y).ticks(6));

    // 45-degree reference line (tau*=1)
    g.append("line")
      .attr("x1", 0).attr("y1", y(1)).attr("x2", pw).attr("y2", y(1))
      .attr("stroke", "#999").attr("stroke-dasharray", "4,3").attr("opacity", 0.5);
    g.append("text")
      .attr("x", pw - 4).attr("y", y(1) - 4)
      .attr("text-anchor", "end").attr("font-size", 10).attr("fill", "#999")
      .text("\u03C4* = 1");

    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(DataLoader.regions);
    const tooltip = this.tooltip;
    const selectedCodes = state.selectedCountries;

    g.selectAll("circle")
      .data(valid)
      .join("circle")
      .attr("cx", d => x(d.capacity))
      .attr("cy", d => y(d.taustar))
      .attr("r", d => r(d.pop || 1))
      .attr("fill", d => color(d.region))
      .attr("opacity", d => selectedCodes.length === 0 || selectedCodes.includes(d.code) ? 0.7 : 0.15)
      .attr("stroke", d => selectedCodes.includes(d.code) ? "#000" : "none")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("mouseover", function(event, d) {
        tooltip.style("display", "block")
          .html(`<strong>${d.country}</strong><br>` +
            `\u03C4*: ${d.taustar.toFixed(3)} &nbsp; Capacity: ${d.capacity.toFixed(2)}<br>` +
            `${d.taustar < 1 ? "Can eliminate avoidable poverty" : "Cannot eliminate via redistribution alone"}`);
        d3.select(this).attr("r", r(d.pop || 1) + 3);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 20) + "px");
      })
      .on("mouseout", function(event, d) {
        tooltip.style("display", "none");
        d3.select(this).attr("r", r(d.pop || 1));
      })
      .on("click", (event, d) => App.toggleCountry(d.code));

    // Labels for selected
    const labeled = valid.filter(d => selectedCodes.includes(d.code));
    g.selectAll("text.label")
      .data(labeled).join("text").attr("class", "label")
      .attr("x", d => x(d.capacity) + r(d.pop || 1) + 3)
      .attr("y", d => y(d.taustar) + 4)
      .text(d => d.code)
      .attr("font-size", 11).attr("font-weight", 600).attr("fill", "#333");

    // Axis labels
    svg.append("text")
      .attr("x", margin.left + pw / 2).attr("y", h - 4)
      .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "#666")
      .text("Capacity Ratio (S/G)");
    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + ph / 2)).attr("y", 14)
      .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "#666")
      .text("\u03C4* (Required Redistribution)");
  },

  _renderBetaSensitivity(data, state) {
    const container = document.getElementById("beta-sensitivity-container");
    container.innerHTML = "";
    const rect = container.getBoundingClientRect();
    const w = rect.width, h = rect.height;

    const codes = state.selectedCountries;
    if (codes.length === 0) {
      const svg = d3.select(container).append("svg").attr("width", w).attr("height", h);
      svg.append("text")
        .attr("x", w / 2).attr("y", h / 2)
        .attr("text-anchor", "middle").attr("fill", "#999").attr("font-size", 13)
        .text("Select countries to see \u03B2 sensitivity");
      return;
    }

    const margin = { top: 20, right: 80, bottom: 35, left: 50 };
    const pw = w - margin.left - margin.right;
    const ph = h - margin.top - margin.bottom;

    const betas = [0, 0.25, 0.5, 0.75, 1.0];
    const series = [];

    for (const code of codes) {
      const d = App.getRecord(code);
      if (!d || d.pa == null || d.zp == null) continue;
      const points = betas.map(b => ({
        beta: b,
        rapi: (d.pa + b * (d.ps || 0)) / d.zp,
      }));
      series.push({ code, country: d.country, points, ps: d.ps || 0 });
    }

    if (series.length === 0) return;

    const svg = d3.select(container).append("svg").attr("width", w).attr("height", h);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, 1]).range([0, pw]);
    const allVals = series.flatMap(s => s.points.map(p => p.rapi));
    const yMax = d3.max(allVals) * 1.1 || 0.3;
    const y = d3.scaleLinear().domain([0, yMax]).range([ph, 0]);

    g.append("g").attr("transform", `translate(0,${ph})`).call(d3.axisBottom(x).ticks(5).tickFormat(d => d.toFixed(2)));
    g.append("g").call(d3.axisLeft(y).ticks(6));

    // Current beta indicator
    g.append("line")
      .attr("x1", x(state.beta)).attr("x2", x(state.beta))
      .attr("y1", 0).attr("y2", ph)
      .attr("stroke", "#dc2626").attr("stroke-dasharray", "3,3").attr("opacity", 0.6);

    const color = d3.scaleOrdinal(d3.schemeTableau10);
    const line = d3.line().x(p => x(p.beta)).y(p => y(p.rapi));

    series.forEach((s, i) => {
      const c = color(i);
      g.append("path")
        .datum(s.points)
        .attr("d", line)
        .attr("fill", "none").attr("stroke", c).attr("stroke-width", 2.5);

      // End label
      const last = s.points[s.points.length - 1];
      g.append("text")
        .attr("x", x(last.beta) + 4).attr("y", y(last.rapi) + 4)
        .text(`${s.code}${s.ps < 0.001 ? " (flat)" : ""}`)
        .attr("font-size", 11).attr("font-weight", 600).attr("fill", c);
    });

    // Axis labels
    svg.append("text")
      .attr("x", margin.left + pw / 2).attr("y", h - 2)
      .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "#666")
      .text("\u03B2 (Structural Poverty Weight)");
    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + ph / 2)).attr("y", 14)
      .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "#666")
      .text("AP");
  },

  _renderRegional(data, state) {
    const container = document.getElementById("regional-container");
    container.innerHTML = "";
    const rect = container.getBoundingClientRect();
    const w = rect.width, h = rect.height;

    // Compute regional averages
    const regionStats = {};
    for (const d of data) {
      if (!d.region || d.pa == null) continue;
      if (!regionStats[d.region]) regionStats[d.region] = { pa: [], ps: [], n: 0 };
      regionStats[d.region].pa.push(d.pa);
      regionStats[d.region].ps.push(d.ps || 0);
      regionStats[d.region].n++;
    }

    const regions = Object.entries(regionStats).map(([region, stats]) => ({
      region,
      pa_avg: d3.mean(stats.pa),
      ps_avg: d3.mean(stats.ps),
      n: stats.n,
    })).sort((a, b) => (b.pa_avg + b.ps_avg) - (a.pa_avg + a.ps_avg));

    if (regions.length === 0) return;

    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const pw = w - margin.left - margin.right;
    const ph = h - margin.top - margin.bottom;

    const svg = d3.select(container).append("svg").attr("width", w).attr("height", h);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const maxVal = d3.max(regions, d => d.pa_avg + d.ps_avg);
    const x = d3.scaleLinear().domain([0, maxVal * 1.1]).range([0, pw]);
    const y = d3.scaleBand()
      .domain(regions.map(d => d.region))
      .range([0, ph])
      .padding(0.2);

    g.append("g").attr("transform", `translate(0,${ph})`).call(d3.axisBottom(x).ticks(5));
    g.append("g").call(d3.axisLeft(y));

    // PA bars
    g.selectAll("rect.pa")
      .data(regions).join("rect").attr("class", "pa")
      .attr("x", 0).attr("y", d => y(d.region))
      .attr("width", d => x(d.pa_avg))
      .attr("height", y.bandwidth())
      .attr("fill", "#dc2626").attr("opacity", 0.85);

    // PS bars
    g.selectAll("rect.ps")
      .data(regions).join("rect").attr("class", "ps")
      .attr("x", d => x(d.pa_avg)).attr("y", d => y(d.region))
      .attr("width", d => x(d.ps_avg))
      .attr("height", y.bandwidth())
      .attr("fill", "#94a3b8").attr("opacity", 0.85);

    // Value labels
    g.selectAll("text.val")
      .data(regions).join("text").attr("class", "val")
      .attr("x", d => x(d.pa_avg + d.ps_avg) + 4)
      .attr("y", d => y(d.region) + y.bandwidth() / 2 + 4)
      .attr("font-size", 10).attr("fill", "#666")
      .text(d => `n=${d.n}`);
  },

  _renderWaterfall(data, state) {
    const container = document.getElementById("waterfall-container");
    container.innerHTML = "";
    const rect = container.getBoundingClientRect();
    const w = rect.width, h = rect.height;

    const codes = state.selectedCountries;
    if (codes.length === 0) {
      const svg = d3.select(container).append("svg").attr("width", w).attr("height", h);
      svg.append("text")
        .attr("x", w / 2).attr("y", h / 2)
        .attr("text-anchor", "middle").attr("fill", "#999").attr("font-size", 13)
        .text("Select a country to see decomposition");
      return;
    }

    // Show first selected country
    const code = codes[0];
    const d = App.getRecord(code);
    if (!d || d.pa == null) return;

    const margin = { top: 30, right: 20, bottom: 50, left: 60 };
    const pw = w - margin.left - margin.right;
    const ph = h - margin.top - margin.bottom;

    const svg = d3.select(container).append("svg").attr("width", w).attr("height", h);
    svg.append("text")
      .attr("x", margin.left).attr("y", 16)
      .attr("font-size", 12).attr("font-weight", 600).attr("fill", "#333")
      .text(d.country);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Waterfall items
    const items = [
      { label: "Poverty Gap", value: d.poverty_gap_usd || (d.pa + (d.ps || 0)), color: "#ef4444" },
      { label: "P_A (Avoidable)", value: d.pa, color: "#dc2626" },
      { label: "P_S (Structural)", value: d.ps || 0, color: "#94a3b8" },
      { label: "Surplus", value: d.surplus_usd || 0, color: "#22c55e" },
    ];

    const maxVal = d3.max(items, d => d.value) || 1;
    const x = d3.scaleBand().domain(items.map(d => d.label)).range([0, pw]).padding(0.3);
    const y = d3.scaleLinear().domain([0, maxVal * 1.15]).range([ph, 0]);

    g.append("g").attr("transform", `translate(0,${ph})`).call(d3.axisBottom(x))
      .selectAll("text").attr("font-size", 10)
      .attr("transform", "rotate(-20)").attr("text-anchor", "end");
    g.append("g").call(d3.axisLeft(y).ticks(5));

    g.selectAll("rect.bar")
      .data(items).join("rect").attr("class", "bar")
      .attr("x", d => x(d.label))
      .attr("y", d => y(d.value))
      .attr("width", x.bandwidth())
      .attr("height", d => ph - y(d.value))
      .attr("fill", d => d.color).attr("opacity", 0.85);

    // Value labels on top of bars
    g.selectAll("text.barval")
      .data(items).join("text").attr("class", "barval")
      .attr("x", d => x(d.label) + x.bandwidth() / 2)
      .attr("y", d => y(d.value) - 4)
      .attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#333")
      .text(d => d.value.toFixed(3));
  },
};
