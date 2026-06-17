/**
 * World choropleth map using D3.
 */

const MapChart = {
  svg: null,
  projection: null,
  path: null,
  topology: null,
  tooltip: null,
  colorScale: null,

  async init(containerId) {
    const container = document.getElementById(containerId);
    const { width, height } = container.getBoundingClientRect();

    this.tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("display", "none");

    this.projection = d3.geoNaturalEarth1()
      .scale(width / 5.5)
      .translate([width / 2, height / 2]);

    this.path = d3.geoPath().projection(this.projection);

    this.svg = d3.select(`#${containerId}`)
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    try {
      const resp = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json");
      this.topology = await resp.json();
    } catch (e) {
      console.warn("Failed to load world topology", e);
      return;
    }

    const countries = topojson.feature(this.topology, this.topology.objects.countries);

    this.svg.append("g")
      .attr("class", "countries")
      .selectAll("path")
      .data(countries.features)
      .join("path")
      .attr("d", this.path)
      .attr("fill", "#ddd")
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5);
  },

  update(data, metric, selectedCodes = []) {
    if (!this.topology) return;

    const iso3ToNum = this._getIso3ToNumeric();
    const isoNumToData = new Map();

    for (const d of data) {
      const numId = iso3ToNum.get(d.code);
      const val = App.getMetricValue(d, metric);
      if (numId && val != null) {
        isoNumToData.set(String(numId).padStart(3, "0"), d);
      }
    }

    const kosovoRec = data.find(d => d.code === "XKX");
    if (kosovoRec && App.getMetricValue(kosovoRec, metric) != null) {
      isoNumToData.set("__KOSOVO__", kosovoRec);
    }

    const lookupRec = (d) => {
      if (d.properties && d.properties.name === "Kosovo") {
        return isoNumToData.get("__KOSOVO__");
      }
      return isoNumToData.get(String(d.id).padStart(3, "0"));
    };

    const values = data.map(d => App.getMetricValue(d, metric)).filter(v => v != null && isFinite(v));
    if (values.length === 0) return;

    const extent = d3.extent(values);

    // Use diverging scale for AGR (centered at 0.5), sequential otherwise
    if (metric === "agr") {
      this.colorScale = d3.scaleDiverging(d3.interpolateRdBu)
        .domain([0, 0.5, 1]);
    } else {
      this.colorScale = d3.scaleSequential(d3.interpolateYlOrRd)
        .domain(extent);
    }

    const tooltip = this.tooltip;
    const colorScale = this.colorScale;
    const metricLabel = METRIC_LABELS[metric] || metric;

    this.svg.select("g.countries")
      .selectAll("path")
      .attr("fill", function(d) {
        const rec = lookupRec(d);
        if (rec) {
          const val = App.getMetricValue(rec, metric);
          if (val != null) return colorScale(val);
        }
        return "#eee";
      })
      .attr("stroke", function(d) {
        const rec = lookupRec(d);
        if (rec && selectedCodes.includes(rec.code)) return "#000";
        return "#fff";
      })
      .attr("stroke-width", function(d) {
        const rec = lookupRec(d);
        if (rec && selectedCodes.includes(rec.code)) return 2;
        return 0.5;
      })
      .on("mouseover", function(event, d) {
        const rec = lookupRec(d);
        if (rec) {
          const val = App.getMetricValue(rec, metric);
          const pa = rec.pa != null ? rec.pa.toFixed(3) : "—";
          const ps = rec.ps != null ? rec.ps.toFixed(3) : "—";
          tooltip.style("display", "block")
            .html(`<strong>${rec.country}</strong><br>` +
              `${metricLabel}: ${val != null ? val.toFixed(4) : "N/A"}<br>` +
              `P_A: ${pa} &nbsp; P_S: ${ps}`);
        }
      })
      .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 20) + "px");
      })
      .on("mouseout", function() {
        tooltip.style("display", "none");
      })
      .on("click", function(event, d) {
        const rec = lookupRec(d);
        if (rec) App.toggleCountry(rec.code);
      });

    this._drawLegend(extent, metric);
  },

  _drawLegend(extent, metric) {
    this.svg.selectAll(".legend").remove();
    const w = 150, h = 10;
    const container = this.svg.node().getBoundingClientRect();
    const x = container.width - w - 20;
    const y = container.height - 30;

    const lg = this.svg.append("g").attr("class", "legend").attr("transform", `translate(${x},${y})`);

    const defs = this.svg.append("defs");
    const gradient = defs.append("linearGradient").attr("id", "map-gradient");
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const val = metric === "agr" ? t : extent[0] + t * (extent[1] - extent[0]);
      gradient.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", this.colorScale(val));
    }

    lg.append("rect").attr("width", w).attr("height", h)
      .style("fill", "url(#map-gradient)");

    const lo = metric === "agr" ? "0" : extent[0].toFixed(2);
    const hi = metric === "agr" ? "1" : extent[1].toFixed(2);
    lg.append("text").attr("y", -2).attr("font-size", 12).attr("fill", "#666").text(lo);
    lg.append("text").attr("x", w).attr("y", -2).attr("text-anchor", "end")
      .attr("font-size", 12).attr("fill", "#666").text(hi);
  },

  _getIso3ToNumeric() {
    const map = new Map();
    const pairs = [
      ["AFG",4],["ALB",8],["DZA",12],["AGO",24],["ARG",32],["ARM",51],
      ["AUS",36],["AUT",40],["AZE",31],["BGD",50],["BLR",112],["BEL",56],
      ["BEN",204],["BTN",64],["BOL",68],["BIH",70],["BWA",72],["BRA",76],
      ["BGR",100],["BFA",854],["BDI",108],["KHM",116],["CMR",120],["CAN",124],
      ["CAF",140],["TCD",148],["CHL",152],["CHN",156],["COL",170],["COG",178],
      ["COD",180],["CRI",188],["CIV",384],["HRV",191],["CUB",192],["CYP",196],
      ["CZE",203],["DNK",208],["DJI",262],["DOM",214],["ECU",218],["EGY",818],
      ["SLV",222],["GNQ",226],["ERI",232],["EST",233],["ETH",231],["FIN",246],
      ["FRA",250],["GAB",266],["GMB",270],["GEO",268],["DEU",276],["GHA",288],
      ["GRC",300],["GTM",320],["GIN",324],["GNB",624],["GUY",328],["HTI",332],
      ["HND",340],["HUN",348],["ISL",352],["IND",356],["IDN",360],["IRN",364],
      ["IRQ",368],["IRL",372],["ISR",376],["ITA",380],["JAM",388],["JPN",392],
      ["JOR",400],["KAZ",398],["KEN",404],["PRK",408],["KOR",410],["KWT",414],
      ["KGZ",417],["LAO",418],["LVA",428],["LBN",422],["LSO",426],["LBR",430],
      ["LBY",434],["LTU",440],["LUX",442],["MDG",450],["MWI",454],["MYS",458],
      ["MLI",466],["MRT",478],["MEX",484],["MDA",498],["MNG",496],["MNE",499],
      ["MAR",504],["MOZ",508],["MMR",104],["NAM",516],["NPL",524],["NLD",528],
      ["NZL",554],["NIC",558],["NER",562],["NGA",566],["MKD",807],["NOR",578],
      ["OMN",512],["PAK",586],["PAN",591],["PNG",598],["PRY",600],["PER",604],
      ["PHL",608],["POL",616],["PRT",620],["QAT",634],["ROU",642],["RUS",643],
      ["RWA",646],["SAU",682],["SEN",686],["SRB",688],["SLE",694],["SGP",702],
      ["SVK",703],["SVN",705],["SOM",706],["ZAF",710],["SSD",728],["ESP",724],
      ["LKA",144],["SDN",729],["SUR",740],["SWZ",748],["SWE",752],["CHE",756],
      ["SYR",760],["TWN",158],["TJK",762],["TZA",834],["THA",764],["TLS",626],
      ["TGO",768],["TTO",780],["TUN",788],["TUR",792],["TKM",795],["UGA",800],
      ["UKR",804],["ARE",784],["GBR",826],["USA",840],["URY",858],["UZB",860],
      ["VEN",862],["VNM",704],["YEM",887],["ZMB",894],["ZWE",716],
      ["XKX",983],["PSE",275],["CYM",136],["MLT",470],
      ["BLZ",84],["BRB",52],["COM",174],["CPV",132],["FJI",242],
      ["FSM",583],["GRD",308],["KIR",296],["LCA",662],["MDV",462],
      ["MHL",584],["MUS",480],["NRU",520],["SLB",90],["STP",678],
      ["SYC",690],["TON",776],["TUV",798],["VUT",548],["WSM",882],
    ];
    for (const [iso3, num] of pairs) map.set(iso3, num);
    return map;
  },
};
