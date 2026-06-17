/**
 * Rankings: bar chart with PA/PS split, decomposition stacks, and sortable table.
 */

const RankingsChart = {
  init() {},

  update(data, state) {
    const metric = state.rankingsMetric;
    const beta = state.beta;
    const region = state.rankingsRegion;
    const view = state.rankingsView;

    let filtered = data;
    if (region) filtered = filtered.filter(d => d.region === region);

    // Sort
    const sortCol = state.rankingsSortCol || metric;
    const sortAsc = state.rankingsSortAsc;
    filtered = [...filtered].sort((a, b) => {
      let va = sortCol === "rapi" ? App.getMetricValue(a, "rapi") : a[sortCol];
      let vb = sortCol === "rapi" ? App.getMetricValue(b, "rapi") : b[sortCol];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return sortAsc ? va - vb : vb - va;
    });

    const barContainer = document.getElementById("rankings-bar-container");
    const decompContainer = document.getElementById("rankings-decomp-container");
    const tableContainer = document.getElementById("rankings-table-container");

    if (view === "bar") {
      barContainer.style.display = "";
      decompContainer.style.display = "none";
      this._renderBar(filtered, metric, beta, barContainer);
    } else if (view === "decomp") {
      barContainer.style.display = "none";
      decompContainer.style.display = "";
      this._renderDecomp(filtered, beta, decompContainer);
    } else {
      barContainer.style.display = "none";
      decompContainer.style.display = "none";
    }

    this._renderTable(filtered, metric, beta, tableContainer, state);
  },

  _renderBar(data, metric, beta, container) {
    container.innerHTML = "";

    const top25 = data.slice(0, 25).filter(d => {
      const val = metric === "rapi" ? App.getMetricValue(d, "rapi") : d[metric];
      return val != null;
    });
    if (top25.length === 0) return;

    const w = container.getBoundingClientRect().width || 800;
    const barH = 20;
    const h = top25.length * barH + 40;
    const marginLeft = 100;

    const svg = d3.select(container)
      .append("svg")
      .attr("width", w)
      .attr("height", h);

    if (metric === "rapi") {
      // Split bars: PA (red) + beta*PS (grey)
      const maxVal = d3.max(top25, d => {
        const pa = (d.pa || 0) / (d.zp || 1);
        const ps = beta * (d.ps || 0) / (d.zp || 1);
        return pa + ps;
      });
      if (!maxVal) return;

      const x = d3.scaleLinear().domain([0, maxVal]).range([0, w - marginLeft - 20]);
      const y = d3.scaleBand().domain(top25.map(d => d.code)).range([20, h - 10]).padding(0.12);

      // PA segment
      svg.selectAll("rect.pa")
        .data(top25).join("rect").attr("class", "pa")
        .attr("x", marginLeft)
        .attr("y", d => y(d.code))
        .attr("width", d => x((d.pa || 0) / (d.zp || 1)))
        .attr("height", y.bandwidth())
        .attr("fill", "#dc2626").attr("opacity", 0.85);

      // PS segment
      svg.selectAll("rect.ps")
        .data(top25).join("rect").attr("class", "ps")
        .attr("x", d => marginLeft + x((d.pa || 0) / (d.zp || 1)))
        .attr("y", d => y(d.code))
        .attr("width", d => x(beta * (d.ps || 0) / (d.zp || 1)))
        .attr("height", y.bandwidth())
        .attr("fill", "#94a3b8").attr("opacity", 0.85);

      // Labels
      svg.selectAll("text.label")
        .data(top25).join("text").attr("class", "label")
        .attr("x", marginLeft - 4)
        .attr("y", d => y(d.code) + y.bandwidth() / 2 + 4)
        .attr("text-anchor", "end").attr("font-size", 12)
        .text(d => d.code);

      // Value labels
      svg.selectAll("text.value")
        .data(top25).join("text").attr("class", "value")
        .attr("x", d => {
          const pa = (d.pa || 0) / (d.zp || 1);
          const ps = beta * (d.ps || 0) / (d.zp || 1);
          return marginLeft + x(pa + ps) + 4;
        })
        .attr("y", d => y(d.code) + y.bandwidth() / 2 + 4)
        .attr("font-size", 11).attr("fill", "#666")
        .text(d => App.getMetricValue(d, "rapi").toFixed(4));

      // Legend
      const lg = svg.append("g").attr("transform", `translate(${marginLeft}, 6)`);
      lg.append("rect").attr("width", 12).attr("height", 10).attr("fill", "#dc2626").attr("opacity", 0.85);
      lg.append("text").attr("x", 16).attr("y", 9).attr("font-size", 11).attr("fill", "#666").text("P_A (Avoidable)");
      lg.append("rect").attr("x", 130).attr("width", 12).attr("height", 10).attr("fill", "#94a3b8").attr("opacity", 0.85);
      lg.append("text").attr("x", 146).attr("y", 9).attr("font-size", 11).attr("fill", "#666").text("\u03B2\u00D7P_S (Structural)");
    } else {
      // Simple bar for non-RAPI metrics
      const maxVal = d3.max(top25, d => d[metric]) || 1;
      const x = d3.scaleLinear().domain([0, maxVal]).range([0, w - marginLeft - 20]);
      const y = d3.scaleBand().domain(top25.map(d => d.code)).range([20, h - 10]).padding(0.12);

      svg.selectAll("rect")
        .data(top25).join("rect")
        .attr("x", marginLeft)
        .attr("y", d => y(d.code))
        .attr("width", d => x(d[metric] || 0))
        .attr("height", y.bandwidth())
        .attr("fill", "#dc2626").attr("opacity", 0.7);

      svg.selectAll("text.label")
        .data(top25).join("text").attr("class", "label")
        .attr("x", marginLeft - 4)
        .attr("y", d => y(d.code) + y.bandwidth() / 2 + 4)
        .attr("text-anchor", "end").attr("font-size", 12)
        .text(d => d.code);

      svg.selectAll("text.value")
        .data(top25).join("text").attr("class", "value")
        .attr("x", d => marginLeft + x(d[metric] || 0) + 4)
        .attr("y", d => y(d.code) + y.bandwidth() / 2 + 4)
        .attr("font-size", 11).attr("fill", "#666")
        .text(d => (d[metric] || 0).toFixed(4));
    }
  },

  _renderDecomp(data, beta, container) {
    container.innerHTML = "";

    const valid = data.filter(d => d.pa != null && d.ps != null && d.zp);
    if (valid.length === 0) return;

    const w = container.getBoundingClientRect().width || 800;
    const barH = 14;
    const marginLeft = 80;
    const marginRight = 20;
    const marginTop = 24;
    const h = valid.length * barH + marginTop + 20;
    const barWidth = w - marginLeft - marginRight;

    const svg = d3.select(container)
      .append("svg")
      .attr("width", w)
      .attr("height", h);

    // Find max RAPI for scaling
    const maxRapi = d3.max(valid, d => (d.pa + d.ps) / d.zp) || 1;
    const x = d3.scaleLinear().domain([0, maxRapi]).range([0, barWidth]);

    const y = d3.scaleBand()
      .domain(valid.map(d => d.code))
      .range([marginTop, h - 10])
      .padding(0.06);

    const g = svg.append("g").attr("transform", `translate(${marginLeft}, 0)`);

    // PA segment (red)
    g.selectAll("rect.pa")
      .data(valid).join("rect").attr("class", "pa")
      .attr("x", 0)
      .attr("y", d => y(d.code))
      .attr("width", d => x(d.pa / d.zp))
      .attr("height", y.bandwidth())
      .attr("fill", "#dc2626");

    // PS segment (grey)
    g.selectAll("rect.ps")
      .data(valid).join("rect").attr("class", "ps")
      .attr("x", d => x(d.pa / d.zp))
      .attr("y", d => y(d.code))
      .attr("width", d => x(d.ps / d.zp))
      .attr("height", y.bandwidth())
      .attr("fill", "#94a3b8");

    // Country labels
    svg.selectAll("text.country-label")
      .data(valid).join("text").attr("class", "country-label")
      .attr("x", marginLeft - 4)
      .attr("y", d => y(d.code) + y.bandwidth() / 2 + 3)
      .attr("text-anchor", "end").attr("font-size", 10)
      .text(d => d.code);

    // Tooltip
    const tooltip = d3.select("body").selectAll(".decomp-tooltip").data([0])
      .join("div").attr("class", "decomp-tooltip tooltip").style("display", "none");

    g.selectAll("rect.hover-target")
      .data(valid).join("rect").attr("class", "hover-target")
      .attr("x", 0)
      .attr("y", d => y(d.code))
      .attr("width", barWidth)
      .attr("height", y.bandwidth())
      .attr("fill", "transparent")
      .on("mouseover", (event, d) => {
        const agr = d.agr != null ? (d.agr * 100).toFixed(1) + "%" : "—";
        tooltip.style("display", "block")
          .html(`<strong>${d.country}</strong><br>` +
            `P_A: ${d.pa.toFixed(3)} &nbsp; P_S: ${d.ps.toFixed(3)}<br>` +
            `AGR: ${agr} (${d.agr >= 0.99 ? "entirely avoidable" : d.agr <= 0.05 ? "mostly structural" : "mixed"})`);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY - 20) + "px");
      })
      .on("mouseout", () => tooltip.style("display", "none"));

    // Legend
    const lg = svg.append("g").attr("transform", `translate(${marginLeft}, 6)`);
    lg.append("rect").attr("width", 12).attr("height", 10).attr("fill", "#dc2626");
    lg.append("text").attr("x", 16).attr("y", 9).attr("font-size", 11).attr("fill", "#666").text("P_A (Avoidable)");
    lg.append("rect").attr("x", 130).attr("width", 12).attr("height", 10).attr("fill", "#94a3b8");
    lg.append("text").attr("x", 146).attr("y", 9).attr("font-size", 11).attr("fill", "#666").text("P_S (Structural)");
  },

  _renderTable(data, metric, beta, container, state) {
    const cols = [
      { key: "rank", label: "#", fmt: d => d },
      { key: "code", label: "Code", fmt: d => d },
      { key: "country", label: "Country", fmt: d => d },
      { key: "region", label: "Region", fmt: d => d },
      { key: "year", label: "Year", fmt: d => d },
      { key: "rapi", label: "RAPI", fmt: d => d != null ? d.toFixed(4) : "—" },
      { key: "pa", label: "P_A", fmt: d => d != null ? d.toFixed(3) : "—" },
      { key: "ps", label: "P_S", fmt: d => d != null ? d.toFixed(3) : "—" },
      { key: "agr", label: "AGR", fmt: d => d != null ? (d * 100).toFixed(1) + "%" : "—" },
      { key: "taustar", label: "\u03C4*", fmt: d => d != null ? d.toFixed(3) : "—" },
      { key: "capacity", label: "Capacity", fmt: d => d != null ? d.toFixed(2) : "—" },
      { key: "hp", label: "H_p", fmt: d => d != null ? (d * 100).toFixed(1) + "%" : "—" },
      { key: "gdp_pc", label: "GDP/cap", fmt: d => d != null ? "$" + d.toFixed(0) : "—" },
    ];

    // Add rank and rapi_live
    const ranked = data.map((d, i) => ({
      ...d,
      rank: i + 1,
      rapi: App.getMetricValue(d, "rapi"),
    }));

    let html = "<table><thead><tr>";
    for (const col of cols) {
      const cls = col.key === state.rankingsSortCol
        ? (state.rankingsSortAsc ? "sorted-asc" : "sorted-desc") : "";
      html += `<th class="${cls}" data-col="${col.key}">${col.label}</th>`;
    }
    html += "</tr></thead><tbody>";

    for (const row of ranked.slice(0, 100)) {
      const highlighted = state.selectedCountries.includes(row.code) ? " highlighted" : "";
      html += `<tr class="${highlighted}" data-code="${row.code}">`;
      for (const col of cols) {
        html += `<td>${col.fmt(row[col.key])}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    container.innerHTML = html;

    // Sort handlers
    container.querySelectorAll("th").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (state.rankingsSortCol === col) {
          state.rankingsSortAsc = !state.rankingsSortAsc;
        } else {
          state.rankingsSortCol = col;
          state.rankingsSortAsc = false;
        }
        App.render();
      });
    });

    // Row click
    container.querySelectorAll("tr[data-code]").forEach(tr => {
      tr.addEventListener("click", () => {
        App.toggleCountry(tr.dataset.code);
      });
    });
  },
};
