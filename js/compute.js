/**
 * Live re-computation engine for the RAPI / avoidable-structural framework.
 *
 * Everything is recomputed in the browser from a country's 100-percentile PIP
 * distribution (equal-population bins, 2021 PPP $/day) under user-chosen lines
 * and mobilization. Mirrors the paper's accounting (dapi_revised.tex §2):
 *
 *   G  = (1/n) Σ_{y<z_p} (z_p − y)        mean poverty gap
 *   S  = (1/n) Σ_{y>z_r} (y − z_r)        mean affluent surplus
 *   τ* = G / S                            required rate of redistribution
 *   M  = f · S                            mobilizable resources
 *   P_A = min{G, M}   P_S = max{0, G−M}   G ≡ P_A + P_S
 *   ξ (AGR) = min{1, M/G} = min{1, f/τ*}
 *   RAPI_β = P_A + β P_S = [ξ + β(1−ξ)]·G      (reported normalized by z_p)
 *
 * Validated against the paper's precomputed baseline (f=0.40, β=0.50,
 * z_p = 1.30+0.5·median floorless, z_r = 4 z_p): median error <0.5%.
 */

const Compute = {
  /** Poverty line z_p in $/day from a distribution's median and mean. */
  povertyLine(p, median, mean) {
    let zp;
    switch (p.type) {
      case "relative-mean":   zp = p.intercept + p.slope * mean;   break;
      case "absolute":        zp = p.absValue;                     break;
      case "relative-median":
      default:                zp = p.intercept + p.slope * median;
    }
    if (p.floorEnabled && p.floorValue > 0) zp = Math.max(zp, p.floorValue);
    return zp;
  },

  /** Affluence line z_r in $/day. w must be sorted ascending (it is). */
  affluenceLine(p, zp, w, median) {
    let za;
    switch (p.type) {
      case "median-multiple": za = p.km * median; break;
      case "percentile": {
        const idx = Math.min(w.length - 1, Math.max(0, Math.round(100 - p.percentile)));
        za = w[idx];
        break;
      }
      case "absolute": za = p.absValue; break;
      case "multiple":
      default:         za = p.k * zp;
    }
    return Math.max(za, zp + 0.01); // affluence line never below the poverty line
  },

  /** Gini of equal-population percentile means. */
  gini(w) {
    const n = w.length;
    let sum = 0, cumWeighted = 0;
    for (let i = 0; i < n; i++) sum += w[i];
    if (sum <= 0) return null;
    for (let i = 0; i < n; i++) cumWeighted += (i + 1) * w[i];
    return (2 * cumWeighted) / (n * sum) - (n + 1) / n;
  },

  /** Palma: top-10% share / bottom-40% share (equal-population bins). */
  palma(w) {
    const n = w.length;
    const top = w.slice(Math.round(n * 0.9));
    const bot = w.slice(0, Math.round(n * 0.4));
    const s = a => a.reduce((x, y) => x + y, 0);
    const b = s(bot);
    return b > 0 ? s(top) / b : null;
  },

  /**
   * Recompute the full RAPI record for one country.
   * @param {number[]} wRaw - 100 percentile mean welfares (ascending, $/day)
   * @param {object} zpP - poverty-line params
   * @param {object} zaP - affluence-line params
   * @param {number} f   - mobilization rate
   * @param {number} beta- structural weight
   */
  fromDistribution(wRaw, zpP, zaP, f, beta) {
    const w = wRaw.filter(x => x != null && isFinite(x));
    const n = w.length;
    if (n === 0) return null;

    const median = (w[Math.floor((n - 1) / 2)] + w[Math.ceil((n - 1) / 2)]) / 2;
    let total = 0;
    for (let i = 0; i < n; i++) total += w[i];
    const mean = total / n;

    const zp = this.povertyLine(zpP, median, mean);
    const za = this.affluenceLine(zaP, zp, w, median);

    let G = 0, S = 0, poor = 0, rich = 0;
    for (let i = 0; i < n; i++) {
      const y = w[i];
      if (y < zp) { G += zp - y; poor++; }
      else if (y > za) { S += y - za; rich++; }
    }
    G /= n; S /= n;

    const hp = poor / n, ha = rich / n, hm = 1 - hp - ha;
    const taustar = S > 0 ? G / S : null;            // ∞ when no surplus → omit
    const capacity = G > 0 ? S / G : null;
    const M = f * S;
    const pa = Math.min(G, M);
    const ps = Math.max(0, G - M);
    const agr = G > 0 ? pa / G : null;               // ξ
    const p1 = zp > 0 ? G / zp : null;               // FGT poverty-gap index
    const rapi = zp > 0 ? (pa + beta * ps) / zp : null; // RAPI_β normalized by z_p

    return {
      median_welfare: median, mean_welfare: mean,
      zp, za,
      hp, hm, ha, p0: hp, p1,
      G, S, poverty_gap_usd: G, surplus_usd: S,
      taustar, capacity,
      pa, ps, agr,
      gini: this.gini(w), palma: this.palma(w),
      rapi,
    };
  },
};
