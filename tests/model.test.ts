import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { auc } from '../src/engine/metrics';
import { generateCohort } from '../src/engine/cohort';
import { aucByRank, featuresOf, predict, rowsOf, train, trainAndEvaluate, TEST_SEED, TRAIN_SEED } from '../src/engine/model';
import { SHADOW, modelInputFrom, shadowPredict } from '../src/engine/shadow';
import { selectComparable } from '../src/engine/pipeline';
import { CASES, caseById } from '../src/data/cases';
import { runPipeline } from '../src/engine/pipeline';
import type { Case } from '../src/engine/types';

// Rebuilds the frozen artifact: WRITE_SHADOW_MODEL=1 npx vitest run tests/model.test.ts
describe.runIf(process.env.WRITE_SHADOW_MODEL)('artifact writer', () => {
  it('writes src/data/shadow-model.json', () => {
    writeFileSync('src/data/shadow-model.json', `${JSON.stringify(trainAndEvaluate(), null, 1)}\n`);
  });
});

describe('shadow model: training and evaluation', () => {
  const fresh = trainAndEvaluate();

  it('the frozen artifact is exactly what training reproduces', () => {
    expect(fresh.model.weights.length).toBe(SHADOW.model.weights.length);
    fresh.model.weights.forEach((w, i) => expect(w).toBeCloseTo(SHADOW.model.weights[i], 9));
    expect(fresh.model.intercept).toBeCloseTo(SHADOW.model.intercept, 9);
    expect(fresh.model.threshold).toBe(SHADOW.model.threshold);
    expect(fresh.evaluation.auc).toBeCloseTo(SHADOW.evaluation.auc as number, 9);
    expect(fresh.evaluation.gates.map((g) => [g.key, g.pass])).toEqual(SHADOW.evaluation.gates.map((g) => [g.key, g.pass]));
  });

  it('trains and tests on separately seeded cohorts', () => {
    expect(TRAIN_SEED).not.toBe(TEST_SEED);
    const a = generateCohort(TRAIN_SEED, 50).map((r) => r.scores?.join());
    const b = generateCohort(TEST_SEED, 50).map((r) => r.scores?.join());
    expect(a).not.toEqual(b);
  });

  it('passes every pre-registered gate on the held-out cohort', () => {
    for (const g of SHADOW.evaluation.gates) expect(g.pass, `${g.key}: ${g.value}`).toBe(true);
    expect(SHADOW.evaluation.passed).toBe(true);
  });

  it('rank-based AUC matches the pairwise definition, ties included', () => {
    const p = [0.9, 0.8, 0.8, 0.4, 0.3], n = [0.8, 0.5, 0.3, 0.1, 0.1, 0.2];
    expect(aucByRank(p, n)).toBeCloseTo(auc(p, n) as number, 12);
    expect(aucByRank([], n)).toBeNull();
  });

  it('is deterministic: training twice gives identical weights', () => {
    const recs = generateCohort(TRAIN_SEED, 300);
    expect(train(recs).weights).toEqual(train(recs).weights);
  });

  it('leaves out uncalibrated languages instead of training on them', () => {
    const rows = rowsOf(generateCohort(TEST_SEED, 400));
    expect(rows.some((r) => r.rec.language === 'ur')).toBe(false);
  });
});

describe('shadow model: abstaining and staying in shadow', () => {
  const base = { language: 'ar' as const, education: 'mid' as const, ageBand: '60-69' as const, functionReported: false };

  it('abstains with fewer than four visits, for an uncalibrated language, and outside the training range', () => {
    expect(predict(SHADOW.model, { ...base, scores: [7, 7, 7] }).ok).toBe(false);
    expect(predict(SHADOW.model, { ...base, language: 'ur', scores: [7, 7, 7, 6] }).ok).toBe(false);
    expect(featuresOf({ ...base, language: 'id', scores: [7, 7, 7, 6] })).toBeNull();
    const extreme = predict(SHADOW.model, { ...base, scores: [10, 10, 10, 0, 0] });
    expect(extreme.ok).toBe(false);
  });

  it('gives a higher probability for a clear drop than for a stable series', () => {
    const stable = predict(SHADOW.model, { ...base, scores: [7, 7, 8, 7, 8] });
    const drop = predict(SHADOW.model, { ...base, scores: [8, 8, 7, 6, 5] });
    if (!stable.ok || !drop.ok) throw new Error('expected predictions');
    expect(drop.p).toBeGreaterThan(stable.p);
  });

  it('never changes the proposed path, the reason or the next step', () => {
    for (const c of CASES) {
      const withModel = runPipeline(c, { evidenceAvailable: true, decision: null });
      const without = runPipeline(c, { evidenceAvailable: true, decision: null, shadowModel: false });
      expect(withModel.outcome, c.id).toEqual(without.outcome);
    }
  });

  it('gives Khalid an estimate and withholds it for Imran, whose language has no calibration', () => {
    const k = caseById('SYN-102') as Case;
    expect(shadowPredict(modelInputFrom(k, selectComparable(k).comparable, 1)).ok).toBe(true);
    expect(runPipeline(k, { evidenceAvailable: true, decision: null }).shadow?.ok).toBe(true);
    const i = caseById('SYN-105') as Case;
    expect(shadowPredict(modelInputFrom(i, selectComparable(i).comparable, 0)).ok).toBe(false);
  });
});
