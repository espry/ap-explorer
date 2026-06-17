/**
 * Time series chart using D3.
 */

const TimeSeriesChart = {
  svg: null,
  tooltip: null,
  width: 0,
  height: 0,
  margin: { top: 20, right: 60, bottom: 30, left: 55 },

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

    this.xAxisG = this.plotArea.append("g");
    this.yAxisG = this.plotArea.append("g");
  },

  update(codes, metric) {
    const { margin } = this;
    const w = this.width - margin.left - margin.right;
    const h = this.height - margin.top - margin.bottom;

    this.xAxisG.attr("transform", `translate(0,${h})`);
    this.plotArea.selectAll(".series-g, .hint, .legend-g").remove();
    this.xAxisG.selectAll("*").remove();
    this.yAxisG.selectAll("*").remove();

    if (codes.length === 0) {
      this.plotArea.append("text")
        .attr("class", "hint")
        .attr("x", w / 2).attr("y", h / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#999").attr("font-size", 13)
        .text("Select countries to see trends");
      return;
    }

    const color = d3.scaleOrdinal(d3.schemeTableau10);
    const series = [];

    for (const code of codes) {
      const ts = App.getCountrySeries(code)
        .filter(d => d[metric] != null && isFinite(d[metric]))
        .sort((a, b) => a.year - b.year);
      if (ts.length > 0) series.push({ code, data: ts });
    }

    if (series.length === 0) return;

    const allYears = series.flatMap(s => s.data.map(d => d.year));
    const allValues = series.flatMap(s => s.data.map(d => d[metric]));

    const x = d3.scaleLinear()
      .domain(d3.extent(allYears))
      .range([0, w]);

    const yMin = Math.min(0, d3.min(allValues));
    const y = d3.scaleLinear()
      .domain([yMin, d3.max(allValues) * 1.1])
      .range([h, 0]);

    this.xAxisG.call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d")));
    this.yAxisG.call(d3.axisLeft(y).ticks(6));

    const tooltip = this.tooltip;

    series.forEach((s, i) => {
      const g = this.plotArea.append("g").attr("class", "series-g");
      const c = color(i);

      const fullLine = d3.line()
        .defined(d => d[metric] != null)
        .x(d => x(d.year))
        .y(d => y(d[metric]));

      // Dashed line for full series
      g.append("path")
        .datum(s.data)
        .attr("d", fullLine)
        .attr("fill", "none")
        .attr("stroke", c)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4,3")
        .attr("opacity", 0.5);

      // Solid between survey years
      const surveyPts = s.data.filter(d => d.has_survey === 1);
      if (surveyPts.length > 1) {
        g.append("path")
          .datum(surveyPts)
          .attr("d", fullLine)
          .attr("fill", "none")
          .attr("stroke", c)
          .attr("stroke-width", 2.5);
      }

      // Survey dots
      g.selectAll("circle.survey")
        .data(surveyPts)
        .join("circle")
        .attr("class", "survey")
        .attr("cx", d => x(d.year))
        .attr("cy", d => y(d[metric]))
        .attr("r", 4)
        .attr("fill", c)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .on("mouseover", function(event, d) {
          tooltip.style("display", "block")
            .html(`<strong>${s.code}</strong> ${d.year} (survey)<br>${METRIC_LABELS[metric] || metric}: ${d[metric].toFixed(4)}`);
          d3.select(this).attr("r", 6);
        })
        .on("mousemove", function(event) {
          tooltip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", function() {
          tooltip.style("display", "none");
          d3.select(this).attr("r", 4);
        });

      // End label
      const last = s.data[s.data.length - 1];
      g.append("text")
        .attr("x", x(last.year) + 5)
        .attr("y", y(last[metric]) + 5)
        .text(s.code)
        .attr("font-size", 13).attr("font-weight", 600).attr("fill", c);
    });

    // Legend
    const lg = this.plotArea.append("g")
      .attr("class", "legend-g")
      .attr("transform", `translate(${w - 140}, ${h - 30})`);

    lg.append("line").attr("x1", 0).attr("x2", 18).attr("y1", 0).attr("y2", 0)
      .attr("stroke", "#666").attr("stroke-width", 2.5);
    lg.append("circle").attr("cx", 9).attr("cy", 0).attr("r", 3).attr("fill", "#666");
    lg.append("text").attr("x", 22).attr("y", 4).attr("font-size", 11).attr("fill", "#666")
      .text("Survey year");

    lg.append("line").attr("x1", 0).attr("x2", 18).attr("y1", 16).attr("y2", 16)
      .attr("stroke", "#666").attr("stroke-width", 1.5).attr("stroke-dasharray", "4,3").attr("opacity", 0.5);
    lg.append("text").attr("x", 22).attr("y", 20).attr("font-size", 11).attr("fill", "#666")
      .text("Interpolated");
  },
};
