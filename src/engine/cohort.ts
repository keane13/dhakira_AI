import { calculateChange, calibrationFor } from './scoring';
import { auc, iccA1, wilson, type Proportion } from './metrics';
import type { AssessmentLanguage, Education } from './types';

export type AgeBand = '50-59' | '60-69' | '70+';

export interface CohortRecord {
  id: string;
  language: AssessmentLanguage;
  education: Education;
  ageBand: AgeBand;
  complete: boolean;
  /** Five visits; null when the person did not complete the series. */
  scores: number[] | null;
  /** Independently authored reference label. Null when incomplete. */
  referenceChange: boolean | null;
  functionReported: boolean;
  daysToAssessment: number | null;
}

/** Small deterministic generator so every run and every reader sees the same cohort. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const COHORT_SEED = 2026;
export const COHORT_SIZE = 240;

export function generateCohort(seed = COHORT_SEED, size = COHORT_SIZE): CohortRecord[] {
  const r = mulberry32(seed);
  const normal = (m: number, s: number) => {
    const u = Math.max(r(), 1e-9);
    const v = r();
    return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const pick = <T,>(pairs: [T, number][]): T => {
    let x = r();
    for (const [v, w] of pairs) {
      if (x < w) return v;
      x -= w;
    }
    return pairs[pairs.length - 1][0];
  };

  return Array.from({ length: size }, (_, i): CohortRecord => {
    const language = pick<AssessmentLanguage>([['ar', 0.5], ['en', 0.36], ['ur', 0.14]]);
    const education = pick<Education>([['low', 0.3], ['mid', 0.42], ['high', 0.28]]);
    const ageBand = pick<AgeBand>([['50-59', 0.34], ['60-69', 0.4], ['70+', 0.26]]);

    const pComplete = 0.95 - (education === 'low' ? 0.08 : 0) - (ageBand === '70+' ? 0.05 : 0) - (language === 'ur' ? 0.08 : 0);
    const complete = r() < pComplete;

    const pDecline = ageBand === '70+' ? 0.3 : ageBand === '60-69' ? 0.18 : 0.1;
    const declines = r() < pDecline;
    const start = normal(education === 'low' ? 6.4 : education === 'high' ? 7.9 : 7.2, 0.9);
    const drop = declines ? Math.max(0.8, normal(2.2, 0.8)) : 0;
    const noise = education === 'low' ? 0.75 : 0.58;

    const scores = [0, 1, 2, 3, 4].map((v) => {
      const practice = v >= 3 ? 0.3 : 0;
      const decline = v === 3 ? drop * 0.7 : v === 4 ? drop : 0;
      return Math.max(0, Math.min(10, Math.round(normal(start + practice - decline, noise))));
    });

    const labelFlip = r() < 0.05;
    const referenceChange = labelFlip ? !declines : declines;
    const functionReported = r() < (declines ? 0.42 : 0.05);

    // Consumed unconditionally so one record's completion never shifts the next record's draws.
    const wait = Math.round(Math.exp(normal(Math.log(language === 'ar' && education === 'low' ? 24 : 18), 0.45)));
    const missingWait = r() < 0.08;

    return {
      id: `COH-${String(i + 1).padStart(3, '0')}`,
      language,
      education,
      ageBand,
      complete,
      scores: complete ? scores : null,
      referenceChange: complete ? referenceChange : null,
      functionReported: complete && functionReported,
      daysToAssessment: complete && !missingWait ? wait : null,
    };
  });
}

export interface CohortFilter {
  language: AssessmentLanguage | 'all';
  education: Education | 'all';
  ageBand: AgeBand | 'all';
}

export const NO_FILTER: CohortFilter = { language: 'all', education: 'all', ageBand: 'all' };

export interface CohortMetrics {
  selected: number;
  completion: Proportion;
  sensitivity: Proportion;
  specificity: Proportion;
  falseReferral: Proportion;
  referralRate: Proportion;
  /** How well the change estimate alone ranks reference change above no change. Independent of the threshold. */
  changeAuc: number | null;
  icc: number | null;
  iccPairs: number;
  meanDaysToAssessment: number | null;
  assessedReferrals: number;
  missingAssessmentTime: number;
  matrix: { tp: number; fp: number; fn: number; tn: number };
  /** Complete records with no calibration for their language: not classified, not counted as negative. */
  withheld: number;
  /** Referrals that came from reported daily-function change even though z did not cross. */
  functionOverrides: number;
  unstable: boolean;
}

export const UNSTABLE_N = 30;

export function evaluateCohort(records: CohortRecord[], filter: CohortFilter = NO_FILTER, threshold = -1.96): CohortMetrics {
  const selected = records.filter((c) =>
    (filter.language === 'all' || c.language === filter.language)
    && (filter.education === 'all' || c.education === filter.education)
    && (filter.ageBand === 'all' || c.ageBand === filter.ageBand));

  let tp = 0, fp = 0, fn = 0, tn = 0, withheld = 0, functionOverrides = 0;
  const waits: number[] = [];
  let missingWait = 0;
  const pairs: number[][] = [];
  const declineChanged: number[] = [];
  const declineUnchanged: number[] = [];

  for (const c of selected) {
    if (!c.complete || !c.scores) continue;
    pairs.push([c.scores[0], c.scores[1]]);
    const calibration = calibrationFor(c.language, c.education);
    const change = calibration ? calculateChange(c.scores, calibration) : null;
    if (!change) { withheld += 1; continue; }
    (c.referenceChange ? declineChanged : declineUnchanged).push(-change.z);
    const numeric = change.z <= threshold;
    const referred = numeric || c.functionReported;
    if (!numeric && c.functionReported) functionOverrides += 1;
    if (referred && c.referenceChange) tp += 1;
    else if (referred) fp += 1;
    else if (c.referenceChange) fn += 1;
    else tn += 1;
    if (referred) {
      if (c.daysToAssessment === null) missingWait += 1;
      else waits.push(c.daysToAssessment);
    }
  }

  const complete = selected.filter((c) => c.complete).length;
  const positives = tp + fn;
  const negatives = tn + fp;
  const referred = tp + fp;

  return {
    selected: selected.length,
    completion: wilson(complete, selected.length),
    sensitivity: wilson(tp, positives),
    specificity: wilson(tn, negatives),
    falseReferral: wilson(fp, referred),
    referralRate: wilson(referred, positives + negatives),
    changeAuc: auc(declineChanged, declineUnchanged),
    icc: iccA1(pairs),
    iccPairs: pairs.length,
    meanDaysToAssessment: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
    assessedReferrals: waits.length,
    missingAssessmentTime: missingWait,
    matrix: { tp, fp, fn, tn },
    withheld,
    functionOverrides,
    unstable: positives < UNSTABLE_N || negatives < UNSTABLE_N,
  };
}

export interface OneOffComparison {
  education: Education;
  oneOff: Proportion;
  personal: Proportion;
}

/**
 * Compares a single-visit cut-off with the personal-baseline flag among people
 * whose reference label says no change. The generator builds in lower starting
 * scores for lower education, so this shows the question a pilot must answer.
 * It is not evidence of the answer.
 */
export function oneOffComparison(records: CohortRecord[], cutoff = 6): OneOffComparison[] {
  return (['low', 'mid', 'high'] as Education[]).map((education) => {
    let oneOff = 0, personal = 0, n = 0;
    for (const c of records) {
      if (c.education !== education || !c.scores || c.referenceChange !== false) continue;
      const calibration = calibrationFor(c.language, c.education);
      const result = calibration ? calculateChange(c.scores, calibration) : null;
      if (!result) continue;
      n += 1;
      if (c.scores[4] < cutoff) oneOff += 1;
      if (result.z <= -1.96) personal += 1;
    }
    return { education, oneOff: wilson(oneOff, n), personal: wilson(personal, n) };
  });
}
