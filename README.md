# Avoidable Poverty Index (AP) — Explorer

Interactive companion to **"How Much Poverty Could Redistribution End?"**
(Prydz, Lind, Moene). A static, client-side tool that recomputes the
**Avoidable Poverty Index (AP_β)** and its avoidable–structural
decomposition **live in the browser** under user-chosen parameters.

**PIP data only** — 172 World Bank PIP economies, latest survey wave plus a
1990–2024 lined-up series, daily household welfare in 2021 PPP.

## What you can change

- **Poverty line z\_p** — relative to median (default `1.30 + 0.50·median`,
  the floorless Societal Poverty Line), relative to mean, or absolute; optional floor.
- **Affluence line z\_r** — multiple of z\_p (default `4·z_p ≈ 2·median`),
  multiple of the median, a top percentile, or absolute.
- **Mobilization f** — share of the affluent surplus a state can mobilize
  (`M = f·S`, baseline 0.40).
- **Structural weight β** — discount on structural poverty (baseline 0.50).

Everything responds instantly: the world map, scatter, time series, rankings,
the avoidable–structural decomposition, and the τ*-vs-capacity view.

## The accounting (paper §2)

```
G  = mean poverty gap below z_p           S  = mean surplus above z_r
τ* = G / S        (required rate)         M  = f · S   (mobilizable)
P_A = min{G, M}   (avoidable)             P_S = max{0, G − M}  (structural)
ξ  = min{1, M/G} = min{1, f/τ*}           (avoidable share / AGR)
AP_β   = P_A + βP_S                        (shown normalized by z_p)
```

At the baseline (floorless SPL, z\_r = 4z\_p, f = 0.40, β = 0.50) the tool
reproduces the paper's headline figures — e.g. the global gap-weighted
avoidable share is **≈ 84 %**.

## Regenerating the data

```
python3 ../scripts/export_rapi_dist.py
```

Reads the 2021-PPP popshare bins
(`GlobalDist1000bins_1990_20250930_2021_01_02_PROD.csv`) and the paper's
`data_prepped_miser.dta` (latest-wave / survey-year flags, identifiers,
GDP/cap, population), and writes `data/{meta,dist_latest,dist_series}.json`.

## Files

```
index.html            layout, controls, About modal
js/compute.js         the live AP engine (validated <0.5% vs paper baseline)
js/data-loader.js     loads the three JSON files
js/app.js             state, parameter wiring, per-render recompute
js/charts/*.js        map · scatter · timeseries · rankings · decomposition
data/*.json           PIP distributions + metadata
```

No build step, no dependencies beyond D3 / TopoJSON / Observable Plot (CDN).
Open `index.html` over any static server.
