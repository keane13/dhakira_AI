import { describe, expect, it } from 'vitest';
import { CASES, caseById } from '../src/data/cases';
import { runPipeline } from '../src/engine/pipeline';
import { domainProfile, TASK_AREAS } from '../src/engine/domains';
import { toObservation, totalScore } from '../src/engine/checkin';
import type { Case } from '../src/engine/types';

const get = (id: string) => caseById(id) as Case;
const run = (c: Case) => runPipeline(c, { evidenceAvailable: true, decision: null });

describe('task areas against the patient\'s own baseline', () => {
  it('authored task points add up to every visit total and stay within each task maximum', () => {
    for (const c of CASES) {
      for (const o of c.observations) {
        if (o.score === null) { expect(o.parts).toBeUndefined(); continue; }
        expect(o.parts, `${c.id} V${o.visit}`).toBeDefined();
        expect(totalScore(o.parts!), `${c.id} V${o.visit}`).toBe(o.score);
        for (const a of TASK_AREAS) expect(o.parts![a.key]).toBeLessThanOrEqual(a.max);
      }
    }
  });

  it('uses the same baseline and follow-up visits as the total', () => {
    const c = get('SYN-102');
    const r = run(c);
    const p = domainProfile(c, r);
    if (!p.ok) throw new Error('expected a profile');
    expect(p.baselineVisits).toEqual([1, 2, 3]);
    expect(p.followupVisits).toEqual([4, 5]);
    const recall = p.rows.find((x) => x.area.key === 'recall')!;
    expect(recall.baseMean).toBe(3);
    expect(recall.followMean).toBe(1.5);
    expect(recall.position).toBe('below');
    // The task means add up to the same follow-up mean the total uses.
    expect(p.rows.reduce((s, x) => s + x.followMean, 0)).toBeCloseTo(r.change!.followupMean, 10);
  });

  it('is withheld, with the same reason, whenever the total change is withheld', () => {
    for (const id of ['SYN-105', 'SYN-104', 'SYN-106']) {
      const c = get(id);
      const r = run(c);
      const p = domainProfile(c, r);
      expect(p.ok, id).toBe(false);
      if (!p.ok && r.changeNull) expect(p.reason).toEqual(r.changeNull);
    }
  });

  it('is withheld when a visit in the comparison has no task points', () => {
    const c = get('SYN-102');
    const stripped: Case = { ...c, observations: c.observations.map((o, i) => (i === 4 ? { ...o, parts: undefined } : o)) };
    const p = domainProfile(stripped, run(stripped));
    expect(p.ok).toBe(false);
  });

  it('keeps the task points of a live check', () => {
    const c = get('SYN-102');
    const o = toObservation(c, [], {
      parts: { recall: 2, sequence: 1, search: 2, switching: 2 }, language: 'ar', mode: 'visual', form: 'C', reporter: 'self',
      date: '2026-11-17', administration: 'device', conditions: c.observations[0].conditions, functionAnswers: [0, 0, 0, 0, 0, 0],
    });
    expect(o.parts).toEqual({ recall: 2, sequence: 1, search: 2, switching: 2 });
    expect(o.score).toBe(7);
  });
});
