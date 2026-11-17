import type { AssessmentLanguage, Calibration, ChangeResult, Education } from './types';

export const FORMULA_VERSION = 'dhakira-change 0.3.0';
export const BASELINE_VISITS = 3;
export const MAX_FOLLOWUP_VISITS = 2;
export const REVIEW_Z = -1.96;
export const REPEAT_Z = -1.645;
/** A visit-on-visit fall of this size on a /10 task goes to review whatever z says. */
export const RAPID_DROP = 3;

/**
 * Synthetic calibration, keyed by language and education band.
 * These values are placeholders until local norming replaces them. A language
 * with no row has no calibration: the estimate stays null instead of borrowing
 * another language's parameters.
 */
const CALIBRATION: Partial<Record<`${AssessmentLanguage}|${Education}`, Omit<Calibration, 'version' | 'status'>>> = {
  'ar|low': { sd: 1.7, reliability: 0.8, practiceGain: 0.2 },
  'ar|mid': { sd: 1.5, reliability: 0.85, practiceGain: 0.3 },
  'ar|high': { sd: 1.4, reliability: 0.87, practiceGain: 0.35 },
  'en|low': { sd: 1.7, reliability: 0.8, practiceGain: 0.2 },
  'en|mid': { sd: 1.5, reliability: 0.85, practiceGain: 0.3 },
  'en|high': { sd: 1.4, reliability: 0.87, practiceGain: 0.35 },
};

export function calibrationFor(language: AssessmentLanguage, education: Education): Calibration | null {
  const row = CALIBRATION[`${language}|${education}`];
  return row ? { ...row, version: 'synthetic-2026.11', status: 'synthetic' } : null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function isValidScoreList(values: unknown): values is number[] {
  return Array.isArray(values) && values.every(
    (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10,
  );
}

/**
 * Compare a person with their own baseline on comparable observations.
 *
 * Baseline is the first three values and follow-up is the most recent one or
 * two values after them. Returns null when too few values exist: a missing
 * estimate is never reported as "no change".
 */
export function calculateChange(values: number[], calibration: Calibration): ChangeResult | null {
  if (!isValidScoreList(values) || values.length < BASELINE_VISITS + 1) return null;

  const baselineValues = values.slice(0, BASELINE_VISITS);
  const after = values.slice(BASELINE_VISITS);
  const followupValues = after.slice(-MAX_FOLLOWUP_VISITS);
  const baselineMean = mean(baselineValues);
  const followupMean = mean(followupValues);
  const observedChange = followupMean - baselineMean;
  const adjustedChange = observedChange - calibration.practiceGain;
  const se = calibration.sd * Math.sqrt(
    (1 - calibration.reliability) * (1 / baselineValues.length + 1 / followupValues.length),
  );
  const z = adjustedChange / se;
  const numericFlag = z <= REVIEW_Z ? 'review' : z <= REPEAT_Z ? 'repeat' : 'none';
  const rapidDrop = values.some((v, i) => i > 0 && values[i - 1] - v >= RAPID_DROP);

  return {
    formulaVersion: FORMULA_VERSION,
    values,
    baselineValues,
    followupValues,
    baselineMean,
    followupMean,
    observedChange,
    practiceGain: calibration.practiceGain,
    adjustedChange,
    se,
    z,
    ci95: [adjustedChange - 1.96 * se, adjustedChange + 1.96 * se],
    numericFlag,
    rapidDrop,
    calibration,
  };
}

/** Rounded display helper shared by every surface so a number reads the same everywhere. */
export function fmt(n: number, dp = 2): string {
  const s = n.toFixed(dp);
  return Number(s) === 0 ? (0).toFixed(dp) : s;
}
export const fmtSigned = (n: number, dp = 2) => (n > 0 ? '+' : '') + fmt(n, dp);
