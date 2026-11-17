import artifact from '../data/shadow-model.json';
import { predict, type ModelInput, type Prediction, type ShadowArtifact } from './model';
import { L, type Case, type Observation } from './types';
import type { AgeBand } from './cohort';

/**
 * The frozen model and its held-out evaluation. Built by
 * `WRITE_SHADOW_MODEL=1 npx vitest run tests/model.test.ts`; a test fails if
 * retraining no longer reproduces it.
 */
export const SHADOW = artifact as unknown as ShadowArtifact;

export function ageBandOf(age: number): AgeBand | null {
  if (age < 50) return null;
  return age < 60 ? '50-59' : age < 70 ? '60-69' : '70+';
}

/** Model input from the same comparable visits the formula uses. Null when the person is outside the training range. */
export function modelInputFrom(c: Case, comparable: Observation[], functionLevel: number): ModelInput | null {
  const band = ageBandOf(c.age);
  if (!band || comparable.length === 0) return null;
  return {
    scores: comparable.map((o) => o.score as number),
    language: comparable[0].language,
    education: c.education,
    ageBand: band,
    functionReported: functionLevel > 0,
  };
}

/** Never returns an estimate unless every deployment gate passed. */
export function shadowPredict(input: ModelInput | null): Prediction {
  if (!SHADOW.evaluation.passed) {
    return { ok: false, reason: L('The model is withheld because it failed a deployment gate.', 'النموذج محجوب لأنه أخفق في أحد شروط النشر.', 'Model ditahan karena gagal pada salah satu syarat penerapan.') };
  }
  if (!input) {
    return { ok: false, reason: L('The model abstains: age is outside the training range or there are no comparable visits.', 'يمتنع النموذج: العمر خارج نطاق التدريب أو لا توجد زيارات قابلة للمقارنة.', 'Model abstain: usia di luar rentang latih atau tidak ada kunjungan yang sebanding.') };
  }
  return predict(SHADOW.model, input);
}
