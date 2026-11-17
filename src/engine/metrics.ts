/** Validation statistics. Pure functions; each is checked against a published or hand-worked value. */

export interface Proportion { k: number; n: number; p: number | null; lo: number | null; hi: number | null }

/** Wilson score interval. An empty denominator gives null, never zero. */
export function wilson(k: number, n: number, z = 1.959964): Proportion {
  if (n === 0) return { k, n, p: null, lo: null, hi: null };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const m = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { k, n, p, lo: Math.max(0, c - m), hi: Math.min(1, c + m) };
}

/**
 * Area under the ROC curve by the Mann-Whitney count: the chance that a randomly
 * chosen positive scores above a randomly chosen negative, with ties counted as half.
 * Null when either group is empty.
 */
export function auc(positives: number[], negatives: number[]): number | null {
  if (positives.length === 0 || negatives.length === 0) return null;
  let wins = 0;
  for (const p of positives) {
    for (const n of negatives) {
      if (p > n) wins += 1;
      else if (p === n) wins += 0.5;
    }
  }
  return wins / (positives.length * negatives.length);
}

/**
 * ICC(A,1): two-way random effects, absolute agreement, single measurement
 * (McGraw & Wong notation; ICC(2,1) in Shrout & Fleiss).
 */
export function iccA1(rows: number[][]): number | null {
  const n = rows.length;
  if (n < 2) return null;
  const k = rows[0].length;
  if (k < 2) return null;
  const grand = rows.flat().reduce((a, b) => a + b, 0) / (n * k);
  const rowMeans = rows.map((r) => r.reduce((a, b) => a + b, 0) / k);
  const colMeans = Array.from({ length: k }, (_, j) => rows.reduce((a, r) => a + r[j], 0) / n);
  const ssr = k * rowMeans.reduce((a, m) => a + (m - grand) ** 2, 0);
  const ssc = n * colMeans.reduce((a, m) => a + (m - grand) ** 2, 0);
  const sst = rows.flat().reduce((a, x) => a + (x - grand) ** 2, 0);
  const sse = sst - ssr - ssc;
  const msr = ssr / (n - 1);
  const msc = ssc / (k - 1);
  const mse = sse / ((n - 1) * (k - 1));
  const denom = msr + (k - 1) * mse + (k / n) * (msc - mse);
  return denom === 0 ? null : (msr - mse) / denom;
}
