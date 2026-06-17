/**
 * Scatter plot using D3.
 */

const ScatterChart = {
  svg: null,
  tooltip: null,
  width: 0,
  height: 0,
  margin: { top: 25, right: 20, bottom: 40, left: 50 },
  yLogScale: false,
  _lastArgs: null,

  init(containerId) {
    const container = document.getElementById(containerId);
    const rect = container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const { margin } = this;

    this.tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("display", "none");

    this.svg = d3.select(`#${containerId}`)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.plotArea = this.svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    this.xAxisG = this.plotArea.append("g")
      .attr("transform", `translate(0,${this.height - margin.top - margin.bottom})`);
    this.yAxisG = this.plotArea.append("g");

    this.dotsG = this.plotArea.append("g").attr("class", "dots");
    this.labelsG = this.plotArea.append("g").attr("class", "labels");
  },

  update(data, xField, yField, colorField, selectedCodes = []) {
    this._lastArgs = [data, xField, yField, colorField, selectedCodes];
    const { margin } = this;
    const w = this.width - margin.left - margin.right;
    const h = this.height - margin.top - margin.bottom;

    // Log toggle
    this.svg.selectAll(".log-toggle").remove();
    this.svg.append("text")
      .attr("class", "log-toggle")
      .attr("x", margin.left + 2).attr("y", margin.top - 8)
      .attr("font-size", 13).attr("fill", "#dc2626")
      .attr("cursor", "pointer").attr("text-decoration", "underline")
      .text(this.yLogScale ? "Linear Y" : "Log Y")
      .on("click", () => {
        this.yLogScale = !this.yLogScale;
        if (this._lastArgs) this.update(...this._lastArgs);
      });

    const logXFields = new Set(["gdp_pc", "median_welfare", "mean_welfare"]);
    const useLogX = logXFields.has(xField);

    // Get effective values (handles rapi_live)
    const getX = d => xField === "rapi" ? App.getMetricValue(d, "rapi") : d[xField];
    const getY = d => yField === "rapi" ? App.getMetricValue(d, "rapi") : d[yField];

    const valid = data.filter(d => {
      const xv = getX(d), yv = getY(d);
      return xv != null && yv != null && isFinite(xv) && isFinite(yv) &&
        (!useLogX || xv > 0) && (!this.yLogScale || yv > 0);
    });

    if (valid.length === 0) {
      this.dotsG.selectAll("*").remove();
      this.labelsG.selectAll("*").remove();
      return;
    }

    const xExtent = d3.extent(valid, d => getX(d));
    const yExtent = d3.extent(valid, d => getY(d));
    const xPad = (xExtent[1] - xExtent[0]) * 0.05 || 0.01;
    const yPad = (yExtent[1] - yExtent[0]) * 0.05 || 0.01;

    let x;
    if (useLogX) {
      x = d3.scaleLog()
        .domain([Math.max(0.5, xExtent[0] * 0.8), xExtent[1] * 1.2])
        .range([0, w]);
    } else {
      x = d3.scaleLinear()
        .domain([xExtent[0] - xPad, xExtent[1] + xPad])
        .range([0, w]);
    }

    let y;
    if (this.yLogScale) {
      y = d3.scaleLog()
        .domain([Math.max(1e-6, yExtent[0] * 0.8), yExtent[1] * 1.2])
        .range([h, 0]).clamp(true);
    } else {
      y = d3.scaleLinear()
        .domain([yExtent[0] - yPad, yExtent[1] + yPad])
        .range([h, 0]);
    }

    // Color
    const categories = [...new Set(valid.map(d => d[colorField]).filter(Boolean))].sort();
    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(categories);

    // Axes
    const xAxis = d3.axisBottom(x).ticks(6);
    if (useLogX) xAxis.tickFormat(d3.format("~s"));
    this.xAxisG.call(xAxis);
    this.yAxisG.call(d3.axisLeft(y).ticks(6));

    // Dots
    const tooltip = this.tooltip;

    this.dotsG.selectAll("circle")
      .data(valid, d => d.code)
      .join("circle")
      .attr("cx", d => x(getX(d)))
      .attr("cy", d => y(getY(d)))
      .attr("r", d => selectedCodes.includes(d.code) ? 6 : 3.5)
      .attr("fill", d => color(d[colorField]))
      .attr("opacity", d => selectedCodes.length === 0 || selectedCodes.includes(d.code) ? 0.8 : 0.25)
      .attr("stroke", d => selectedCodes.includes(d.code) ? "#000" : "none")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("mouseover", function(event, d) {
        const fmtVal = v => v == null ? "—" : (v >= 10 ? v.toFixed(1) : v.toFixed(4));
        tooltip.style("display", "block")
          .html(`<strong>${d.country}</strong> (${d.code})<br>` +
            `${METRIC_LABELS[xField] || xField}: ${fmtVal(getX(d))}<br>` +
            `${METRIC_LABELS[yField] || yField}: ${fmtVal(getY(d))}<br>` +
            `P_A: ${fmtVal(d.pa)} &nbsp; P_S: ${fmtVal(d.ps)}`);
        d3.select(this).attr("r", 7);
      })
      .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 20) + "px");
      })
      .on("mouseout", function(event, d) {
        tooltip.style("display", "none");
        d3.select(this).attr("r", selectedCodes.includes(d.code) ? 6 : 3.5);
      })
      .on("click", function(event, d) {
        App.toggleCountry(d.code);
      });

    // Labels for selected
    const labeled = valid.filter(d => selectedCodes.includes(d.code));
    this.labelsG.selectAll("text")
      .data(labeled, d => d.code)
      .join("text")
      .attr("x", d => x(getX(d)) + 8)
      .attr("y", d => y(getY(d)) + 4)
      .text(d => d.code)
      .attr("font-size", 13).attr("font-weight", 600).attr("fill", "#333");

    // Axis labels
    this.svg.selectAll(".axis-label").remove();
    this.svg.append("text")
      .attr("class", "axis-label")
      .attr("x", margin.left + w / 2).attr("y", this.height - 4)
      .attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#666")
      .text((METRIC_LABELS[xField] || xField) + (useLogX ? " (log)" : ""));

    this.svg.append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + h / 2)).attr("y", 14)
      .attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#666")
      .text(METRIC_LABELS[yField] || yField);
  },
};
