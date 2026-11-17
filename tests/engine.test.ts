import { describe, expect, it } from 'vitest';
import { CASES, caseById } from '../src/data/cases';
import { calculateChange, calibrationFor, fmt } from '../src/engine/scoring';
import { iccA1, wilson } from '../src/engine/metrics';
import { evaluateCohort, generateCohort, NO_FILTER, oneOffComparison } from '../src/engine/cohort';
import { runPipeline, resolveContext } from '../src/engine/pipeline';
import { checkExplanation, numbersIn, templateExplanation } from '../src/engine/explain';
import {
  FORMS, formForVisit, functionLevel, recognitionItems, scoreRecall, scoreSearches, scoreSequences, scoreSwitching,
} from '../src/engine/checkin';
import { buildFlags, buildTasks, changeSeries } from '../src/engine/monitoring';
import { buildPersonPlan, exampleDecision } from '../src/engine/plan';
import type { Calibration, Case, PipelineOptions } from '../src/engine/types';

const OPTIONS: PipelineOptions = { evidenceAvailable: true, decision: null };
const get = (id: string) => caseById(id) as Case;
const run = (c: Case, o = OPTIONS) => runPipeline(c, o);

const REF: Calibration = { sd: 1.5, reliability: 0.85, practiceGain: 0.3, version: 't', status: 'synthetic' };

describe('calculateChange', () => {
  it('matches a hand-worked example', () => {
    // Baseline (8+7+7)/3 = 7.333, follow-up (6+5)/2 = 5.5, observed -1.833, adjusted -2.133.
    // SE = 1.5 * sqrt(0.15 * (1/3 + 1/2)) = 0.5303, z = -4.023, CI = -2.133 +/- 1.0394.
    const r = calculateChange([8, 7, 7, 6, 5], REF)!;
    expect(r.baselineMean).toBeCloseTo(7.3333, 3);
    expect(r.followupMean).toBeCloseTo(5.5, 6);
    expect(r.adjustedChange).toBeCloseTo(-2.1333, 3);
    expect(r.se).toBeCloseTo(0.5303, 3);
    expect(r.z).toBeCloseTo(-4.023, 2);
    expect(r.ci95[0]).toBeCloseTo(-3.173, 2);
    expect(r.ci95[1]).toBeCloseTo(-1.094, 2);
    expect(r.numericFlag).toBe('review');
  });

  it('uses the actual follow-up count in the standard error', () => {
    const r = calculateChange([8, 7, 7, 6], REF)!;
    expect(r.followupValues).toEqual([6]);
    expect(r.se).toBeCloseTo(1.5 * Math.sqrt(0.15 * (1 / 3 + 1)), 6);
  });

  it('uses only the latest two follow-ups', () => {
    const r = calculateChange([8, 8, 8, 2, 7, 7], REF)!;
    expect(r.followupValues).toEqual([7, 7]);
  });

  it('applies the thresholds at their exact boundaries', () => {
    const se = 1.5 * Math.sqrt(0.15 * (1 / 3 + 1 / 2));
    const atZ = (z: number): Calibration => ({ ...REF, practiceGain: -z * se });
    expect(calculateChange([7, 7, 7, 7, 7], atZ(-1.9601))!.numericFlag).toBe('review');
    expect(calculateChange([7, 7, 7, 7, 7], atZ(-1.9599))!.numericFlag).toBe('repeat');
    expect(calculateChange([7, 7, 7, 7, 7], atZ(-1.6451))!.numericFlag).toBe('repeat');
    expect(calculateChange([7, 7, 7, 7, 7], atZ(-1.644))!.numericFlag).toBe('none');
  });

  it('returns null rather than a number for too few or invalid values', () => {
    expect(calculateChange([7, 7, 7], REF)).toBeNull();
    expect(calculateChange([7, 7, 7, 11], REF)).toBeNull();
    expect(calculateChange([7, 7, 7, -1], REF)).toBeNull();
    expect(calculateChange([7, 7, 7, Number.NaN], REF)).toBeNull();
  });

  it('detects a rapid visit-on-visit fall', () => {
    expect(calculateChange([8, 8, 8, 5], REF)!.rapidDrop).toBe(true);
    expect(calculateChange([8, 8, 8, 6], REF)!.rapidDrop).toBe(false);
  });

  it('has no calibration for a language it has not been calibrated for', () => {
    expect(calibrationFor('ur', 'mid')).toBeNull();
  });

  it('never prints a negative zero', () => {
    expect(fmt(-0.001)).toBe('0.00');
  });
});

describe('statistics', () => {
  it('wilson matches a published calculator value', () => {
    // 15/19: 56.7% to 91.5%.
    const w = wilson(15, 19);
    expect(w.lo!).toBeCloseTo(0.567, 3);
    expect(w.hi!).toBeCloseTo(0.915, 3);
  });

  it('wilson returns null for an empty denominator', () => {
    expect(wilson(0, 0).p).toBeNull();
  });

  it('iccA1 reproduces the Shrout and Fleiss worked example', () => {
    const data = [
      [9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8],
      [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7],
    ];
    expect(iccA1(data)!).toBeCloseTo(0.29, 2);
  });
});

describe('pipeline paths', () => {
  it('sends each case down its intended route', () => {
    expect(run(get('SYN-101')).outcome.route).toBe('routine');
    expect(run(get('SYN-102')).outcome.route).toBe('qualified_review');
    expect(run(get('SYN-103')).outcome.route).toBe('repeat');
    expect(run(get('SYN-104')).outcome.route).toBe('held');
    expect(run(get('SYN-105')).outcome.route).toBe('held');
    expect(run(get('SYN-106')).outcome.route).toBe('held');
    expect(run(get('SYN-107')).outcome.route).toBe('urgent');
  });

  it('always has 12 stages in order and always records stage 12', () => {
    for (const c of CASES) {
      for (const consent of [true, false]) {
        const r = run({ ...c, consent: { ...c.consent, access: consent } });
        expect(r.stages.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect(r.stages[11].status).toBe('recorded');
      }
    }
  });

  it('reads nothing without permission', () => {
    const c = get('SYN-102');
    const r = run({ ...c, consent: { ...c.consent, access: false } });
    expect(r.outcome.route).toBe('stopped');
    expect(r.context).toEqual([]);
    expect(r.change).toBeNull();
    expect(r.stages.slice(1, 11).every((s) => s.status === 'skipped')).toBe(true);
    expect(JSON.stringify(r.audit)).not.toContain(c.name);
  });

  it('skips clinical stages after an urgent stop', () => {
    const r = run(get('SYN-107'));
    expect(r.stages[1].status).toBe('stopped');
    expect(r.stages.slice(2, 11).every((s) => s.status === 'skipped')).toBe(true);
    expect(r.change).toBeNull();
  });

  it('does not substitute a visual score for an auditory baseline', () => {
    const r = run(get('SYN-104'));
    expect(r.stages[3].status).toBe('held');
    expect(r.change).toBeNull();
    expect(r.changeNull).not.toBeNull();
  });

  it('withholds the number for an uncalibrated language', () => {
    const r = run(get('SYN-105'));
    expect(r.change).toBeNull();
    expect(r.changeNull?.en).toContain('no calibration');
  });

  it('reports too few visits as unknown, not as no change', () => {
    const r = run(get('SYN-106'));
    expect(r.change).toBeNull();
    expect(r.outcome.reason.en).toContain('not the same as no change');
  });

  it('lets reported function override a reassuring number', () => {
    const c = get('SYN-101');
    const r = run({
      ...c,
      functionReports: [{ date: '2026-10-12', reporter: 'care_partner', level: 1, note: { en: 'x', ar: 'x' }, source: 'authored' }],
    });
    expect(r.change?.numericFlag).toBe('none');
    expect(r.outcome.route).toBe('qualified_review');
  });

  it('sends a high-risk context result to review', () => {
    const c = get('SYN-101');
    const r = run({
      ...c,
      context: c.context.map((i) => (i.id === 'mood' ? { ...i, highRisk: true, status: 'attention' as const } : i)),
    });
    expect(r.outcome.route).toBe('qualified_review');
  });

  it('holds the report but keeps measurements when evidence is unavailable', () => {
    const r = run(get('SYN-102'), { evidenceAvailable: false, decision: null });
    expect(r.stages[8].status).toBe('held');
    expect(r.change).not.toBeNull();
    expect(r.outcome.route).toBe('held');
  });

  it('never releases follow-up without an approved decision', () => {
    const r = run(get('SYN-102'));
    expect(r.stages[9].status).toBe('waiting');
    expect(r.stages[10].status).toBe('pending');
    const c = get('SYN-102');
    const approved = run(c, { evidenceAvailable: true, decision: exampleDecision(c, r, '2026-11-05') });
    expect(approved.stages[9].status).toBe('passed');
    expect(approved.stages[10].status).toBe('passed');
  });

  it('keeps a returned draft from releasing follow-up', () => {
    const c = get('SYN-102');
    const decision = { ...exampleDecision(c, run(c), '2026-11-05'), status: 'returned' as const };
    expect(run(c, { evidenceAvailable: true, decision }).stages[10].status).toBe('pending');
  });

  it('records a clinician route change with its rationale', () => {
    const c = get('SYN-103');
    const decision = { ...exampleDecision(c, run(c), '2026-11-05'), route: 'qualified_review' as const, rationale: 'Family concern at the visit.' };
    const r = run(c, { evidenceAvailable: true, decision });
    expect(r.outcome.route).toBe('qualified_review');
    expect(r.outcome.reason.en).toContain('Family concern');
  });
});

describe('contributor order', () => {
  it('lists function and reversible causes before longer-term prevention', () => {
    const ids = run(get('SYN-102')).contributors.map((k) => k.id);
    expect(ids.slice(0, 3)).toEqual(['function', 'medicines', 'sleep']);
    expect(ids.indexOf('medicines')).toBeLessThan(ids.indexOf('activity'));
  });
});

describe('consent and missing data', () => {
  it('hides a genomic value without genomic consent', () => {
    const apoe = resolveContext(get('SYN-102')).find((i) => i.id === 'apoe')!;
    expect(apoe.value).toBeNull();
    expect(apoe.authorised).toBe(false);
  });

  it('shows the same value when consent is given', () => {
    const c = get('SYN-102');
    const apoe = resolveContext({ ...c, consent: { ...c.consent, genomic: true } }).find((i) => i.id === 'apoe')!;
    expect(apoe.value?.en).toBe('e3/e4');
  });

  it('genomic information never changes the route', () => {
    const c = get('SYN-101');
    const withE4 = { ...c, context: c.context.map((i) => (i.id === 'apoe' ? { ...i, value: { en: 'e4/e4', ar: 'e4/e4' }, status: 'attention' as const } : i)) };
    expect(run(withE4).outcome.route).toBe(run(c).outcome.route);
  });
});

describe('check-in scoring', () => {
  const f = FORMS.A;

  it('rotates forms by visit', () => {
    expect([1, 2, 3, 4].map(formForVisit)).toEqual(['A', 'B', 'C', 'A']);
  });

  it('every form has distinct targets and lures', () => {
    for (const form of Object.values(FORMS)) {
      expect(new Set([...form.learn, ...form.lures]).size).toBe(10);
      expect(new Set(recognitionItems(form).map((p) => p.id)).size).toBe(10);
    }
  });

  it('scores recall with a floor and a cap', () => {
    expect(scoreRecall(f, f.learn)).toBe(4);
    expect(scoreRecall(f, f.learn.slice(0, 4))).toBe(4);
    expect(scoreRecall(f, [...f.learn.slice(0, 3), f.lures[0]])).toBe(2);
    expect(scoreRecall(f, f.lures)).toBe(0);
  });

  it('scores sequences only when exact', () => {
    expect(scoreSequences(f, f.sequences.map((s) => [...s]))).toBe(2);
    expect(scoreSequences(f, [[...f.sequences[0]], [...f.sequences[1]].reverse()])).toBe(1);
    expect(scoreSequences(f, [])).toBe(0);
  });

  it('requires every target and no extras in a search', () => {
    const perfect = f.searches.map((s) => s.grid.flatMap((x, i) => (x === s.target ? [i] : [])));
    expect(scoreSearches(f, perfect)).toBe(2);
    expect(scoreSearches(f, [perfect[0].slice(1), perfect[1]])).toBe(1);
    const nonTarget = f.searches[0].grid.findIndex((x) => x !== f.searches[0].target);
    expect(scoreSearches(f, [[...perfect[0], nonTarget], perfect[1]])).toBe(1);
  });

  it('each switching trial has an answer that fits its rule', () => {
    for (const form of Object.values(FORMS)) {
      for (const t of form.switches) {
        const right = t.options[t.answer];
        const wrong = t.options[t.answer === 0 ? 1 : 0];
        const matches = (o: typeof right) => (t.rule === 'shape' ? o.shape === t.target.shape : o.fill === t.target.fill);
        expect(matches(right)).toBe(true);
        expect(matches(wrong)).toBe(false);
      }
    }
  });

  it('scores switching by correct count', () => {
    const correct = f.switches.map((t) => t.answer as number);
    expect(scoreSwitching(f, correct)).toBe(2);
    expect(scoreSwitching(f, [correct[0] === 0 ? 1 : 0, ...correct.slice(1)])).toBe(1);
    expect(scoreSwitching(f, [])).toBe(0);
  });

  it('notes one small change but does not call it function change', () => {
    expect(functionLevel([0, 0, 0, 0, 0, 0])).toBe(0);
    expect(functionLevel([1, 0, 0, 0, 0, 0])).toBe(0);
    expect(functionLevel([1, 1, 0, 0, 0, 0])).toBe(1);
    expect(functionLevel([2, 0, 0, 0, 0, 0])).toBe(2);
  });

  it('a live check in a different mode stays out of the comparison', () => {
    const c = get('SYN-101');
    const base = run(c);
    const live = {
      ...c,
      observations: [...c.observations, { ...c.observations[4], visit: 6, score: 1, mode: 'auditory' as const, source: 'live-check' as const }],
    };
    const r = run(live);
    expect(r.change!.values).toEqual(base.change!.values);
    expect(r.excluded.map((e) => e.visit)).toContain(6);
  });

  it('a live check in the same mode changes the result', () => {
    const c = get('SYN-101');
    const live = {
      ...c,
      observations: [...c.observations, { ...c.observations[4], visit: 6, score: 3, source: 'live-check' as const }],
    };
    expect(run(live).outcome.route).toBe('qualified_review');
  });
});

describe('explanation checks', () => {
  const r = calculateChange([8, 8, 7, 7, 5], REF)!;

  it('accepts the deterministic template', () => {
    expect(checkExplanation(templateExplanation(r), r).ok).toBe(true);
  });

  it('rejects an invented number', () => {
    const e = templateExplanation(r);
    e.en.body = 'The score fell by 37 points.';
    expect(checkExplanation(e, r).ok).toBe(false);
  });

  it('rejects an invented Arabic-Indic number', () => {
    const e = templateExplanation(r);
    e.ar.body = 'انخفضت بمقدار ٣٧ نقطة.';
    expect(numbersIn(e.ar.body)).toEqual(['37']);
    expect(checkExplanation(e, r).ok).toBe(false);
  });

  it('rejects diagnostic wording in either language', () => {
    const en = templateExplanation(r);
    en.en.body = 'This suggests dementia.';
    expect(checkExplanation(en, r).ok).toBe(false);
    const ar = templateExplanation(r);
    ar.ar.body = 'هذا يشير إلى الخرف.';
    expect(checkExplanation(ar, r).ok).toBe(false);
    const id = templateExplanation(r);
    id.id.body = 'Ini menunjukkan demensia.';
    expect(checkExplanation(id, r).ok).toBe(false);
  });

  it('rejects an invented number in the Indonesian text', () => {
    const e = templateExplanation(r);
    e.id.body = 'Skornya turun 37 poin.';
    expect(checkExplanation(e, r).ok).toBe(false);
  });

  it('rejects a missing language', () => {
    const e = templateExplanation(r) as Partial<ReturnType<typeof templateExplanation>>;
    delete e.ar;
    expect(checkExplanation(e, r).ok).toBe(false);
    expect(checkExplanation(null, r).ok).toBe(false);
  });
});

describe('monitoring and plan', () => {
  it('builds a change series that ends at the pipeline result', () => {
    const c = get('SYN-102');
    const series = changeSeries(c);
    expect(series).toHaveLength(2);
    expect(series.at(-1)!.adjusted).toBeCloseTo(run(c).change!.adjustedChange, 6);
  });

  it('gives no change series for an uncalibrated language', () => {
    expect(changeSeries(get('SYN-105'))).toEqual([]);
  });

  it('gives every flag a source', () => {
    for (const c of CASES) {
      for (const flag of buildFlags(c, run(c))) {
        expect(flag.source.en.length).toBeGreaterThan(0);
        expect(flag.source.ar.length).toBeGreaterThan(0);
      }
    }
  });

  it('marks a task overdue only after its due date', () => {
    const c = get('SYN-102');
    const r = run(c);
    expect(buildTasks(c, r, null, '2026-10-27').find((t) => t.id === 'review')!.status).toBe('open');
    expect(buildTasks(c, r, null, '2026-12-01').find((t) => t.id === 'review')!.status).toBe('overdue');
  });

  it('builds the person plan from the clinician decision only', () => {
    const c = get('SYN-102');
    const d = { ...exampleDecision(c, run(c), '2026-11-05'), contributors: ['sleep' as const] };
    const plan = buildPersonPlan(d);
    expect(plan.actions.map((a) => a.id)).toEqual(['sleep']);
    expect(plan.meaning.en).toContain('not a diagnosis');
    expect(plan.meaning.ar).toContain('ليس تشخيصًا');
  });

  it('every case carries Arabic text for its summary and concern', () => {
    for (const c of CASES) {
      expect(c.summary.ar).toMatch(/[؀-ۿ]/);
      expect(c.concern.ar).toMatch(/[؀-ۿ]/);
    }
  });
});

describe('synthetic cohort', () => {
  const records = generateCohort();

  it('is reproducible', () => {
    expect(generateCohort()).toEqual(records);
  });

  it('keeps every required metric computable', () => {
    const m = evaluateCohort(records);
    expect(m.selected).toBe(240);
    expect(m.completion.p).not.toBeNull();
    expect(m.sensitivity.p).not.toBeNull();
    expect(m.specificity.p).not.toBeNull();
    expect(m.falseReferral.p).not.toBeNull();
    expect(m.icc).not.toBeNull();
    expect(m.meanDaysToAssessment).not.toBeNull();
    const { tp, fp, fn, tn } = m.matrix;
    expect(tp + fp + fn + tn + m.withheld).toBe(Math.round(m.completion.p! * m.selected));
  });

  it('returns null metrics, not zero, for a language with no calibration', () => {
    const m = evaluateCohort(records, { ...NO_FILTER, language: 'ur' });
    expect(m.sensitivity.p).toBeNull();
    expect(m.specificity.p).toBeNull();
    expect(m.withheld).toBeGreaterThan(0);
  });

  it('a stricter threshold cannot raise sensitivity', () => {
    const loose = evaluateCohort(records, NO_FILTER, -1.0);
    const strict = evaluateCohort(records, NO_FILTER, -2.5);
    expect(strict.sensitivity.p!).toBeLessThanOrEqual(loose.sensitivity.p!);
    expect(strict.specificity.p!).toBeGreaterThanOrEqual(loose.specificity.p!);
  });

  it('marks small subgroups as unstable', () => {
    const m = evaluateCohort(records, { language: 'en', education: 'low', ageBand: '70+' });
    expect(m.unstable).toBe(true);
  });

  it('builds the one-off comparison for each education band', () => {
    expect(oneOffComparison(records).map((x) => x.education)).toEqual(['low', 'mid', 'high']);
  });
});
