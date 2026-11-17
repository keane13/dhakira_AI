import { describe, expect, it } from 'vitest';
import { CASES, caseById } from '../src/data/cases';
import { MEASURES } from '../src/data/measures';
import { runPipeline } from '../src/engine/pipeline';
import { buildTasks } from '../src/engine/monitoring';
import { exampleDecision } from '../src/engine/plan';
import { buildFhirBundle, uuidFrom, type FhirBundle, type FhirResource } from '../src/engine/fhir';
import { INSTRUMENTS, instrumentItem, resultProblems, type InstrumentResult } from '../src/engine/instruments';
import type { Case, PipelineOptions } from '../src/engine/types';

const NOW = new Date('2026-11-17T09:00:00Z');
const get = (id: string) => caseById(id) as Case;

function bundleFor(c: Case, approved: boolean): FhirBundle {
  const plain = runPipeline(c, { evidenceAvailable: true, decision: null });
  const decision = approved && c.consent.access && plain.outcome.route !== 'stopped' ? exampleDecision(c, plain, '2026-11-17') : null;
  const run = decision ? runPipeline(c, { evidenceAvailable: true, decision } as PipelineOptions) : plain;
  const result = buildFhirBundle(c, run, decision, buildTasks(c, run, decision, '2026-11-17'), NOW);
  if ('error' in result) throw new Error(result.error);
  return result.bundle;
}

const ofType = (b: FhirBundle, t: string) => b.entry.map((e) => e.resource).filter((r) => r.resourceType === t);
const refsIn = (value: unknown, out: string[] = []): string[] => {
  if (Array.isArray(value)) value.forEach((v) => refsIn(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'reference' && typeof v === 'string') out.push(v);
      else refsIn(v, out);
    }
  }
  return out;
};
const codes = (r: FhirResource) => JSON.stringify(r.code ?? {});

describe('FHIR R4 export', () => {
  const exportable = CASES.filter((c) => c.consent.access);

  it('makes the same ids for the same record', () => {
    expect(uuidFrom('SYN-102|patient')).toBe(uuidFrom('SYN-102|patient'));
    expect(uuidFrom('SYN-102|patient')).not.toBe(uuidFrom('SYN-101|patient'));
    expect(uuidFrom('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it.each(exportable.map((c) => [c.id, c] as const))('%s: every reference points inside the bundle and every id is unique', (_id, c) => {
    for (const approved of [false, true]) {
      const b = bundleFor(c, approved);
      const urls = new Set(b.entry.map((e) => e.fullUrl));
      expect(urls.size).toBe(b.entry.length);
      for (const ref of refsIn(b.entry.map((e) => e.resource))) expect(urls.has(ref)).toBe(true);
      for (const e of b.entry) expect(e.fullUrl).toBe(`urn:uuid:${e.resource.id}`);
    }
  });

  it('tags the bundle and every resource as test data', () => {
    const b = bundleFor(get('SYN-102'), true);
    for (const r of [b, ...b.entry.map((e) => e.resource)]) {
      expect(JSON.stringify(r.meta)).toContain('"code":"HTEST"');
    }
  });

  it('exports nothing for a patient who has not given permission', () => {
    const c = CASES.find((x) => !x.consent.access);
    if (!c) return;
    const run = runPipeline(c, { evidenceAvailable: true, decision: null });
    expect('error' in buildFhirBundle(c, run, null, [], NOW)).toBe(true);
  });

  it('leaves out context the patient did not authorise and records the refusal in Consent', () => {
    const c = get('SYN-102');
    expect(c.consent.genomic).toBe(false);
    const b = bundleFor(c, false);
    expect(JSON.stringify(b)).not.toContain('e3/e4');
    const consent = ofType(b, 'Consent')[0] as unknown as { provision: { type: string; provision?: { type: string; code: { coding: { code: string }[] }[] }[] } };
    expect(consent.provision.type).toBe('permit');
    expect(consent.provision.provision?.map((p) => [p.type, p.code[0].coding[0].code])).toEqual([['deny', 'data-scope-genomic']]);

    // Withdraw wearable consent: steps and sleep must disappear.
    const noWearable = { ...c, consent: { ...c.consent, wearable: false } };
    const b2 = bundleFor(noWearable, false);
    const obs = ofType(b2, 'Observation').map(codes).join(' ');
    expect(obs).not.toContain('41950-7');
    expect(obs).not.toContain('93832-4');
    expect(obs).toContain('4548-4');
  });

  it('keeps a withheld number missing, never zero', () => {
    const b = bundleFor(get('SYN-105'), false);
    const change = ofType(b, 'Observation').find((r) => codes(r).includes('adjusted-change-from-baseline')) as Record<string, unknown>;
    expect(change.valueQuantity).toBeUndefined();
    expect(JSON.stringify(change.dataAbsentReason)).toContain('not-performed');
    expect(change.status).toBe('preliminary');
  });

  it('exports the calculated change as preliminary, derived from the visits that were compared', () => {
    const b = bundleFor(get('SYN-102'), false);
    const run = runPipeline(get('SYN-102'), { evidenceAvailable: true, decision: null });
    const change = ofType(b, 'Observation').find((r) => codes(r).includes('adjusted-change-from-baseline')) as Record<string, any>;
    expect(change.status).toBe('preliminary');
    expect(change.valueQuantity.value).toBeCloseTo(run.change!.adjustedChange, 3);
    expect(change.component[0].valueQuantity.value).toBeCloseTo(run.change!.z, 3);
    expect(change.derivedFrom.length).toBeGreaterThan(0);
  });

  it('uses only LOINC codes that were verified, with UCUM units', () => {
    const allowed = new Set(['85354-9', '8480-6', '8462-4', '4548-4', '41950-7', '93832-4', '72172-0', '72233-0', '98094-6', '59284-0']);
    for (const c of exportable) {
      const json = JSON.stringify(bundleFor(c, true));
      const loinc = [...json.matchAll(/"system":"http:\/\/loinc\.org","code":"([^"]+)"/g)].map((m) => m[1]);
      for (const code of loinc) expect(allowed.has(code)).toBe(true);
    }
    const bp = ofType(bundleFor(get('SYN-102'), false), 'Observation').find((r) => codes(r).includes('85354-9')) as Record<string, any>;
    expect(bp.component.map((x: any) => [x.code.coding[0].code, x.valueQuantity.value, x.valueQuantity.code])).toEqual([['8480-6', 148, 'mm[Hg]'], ['8462-4', 90, 'mm[Hg]']]);
  });

  it('structured values match what the clinician sees on screen', () => {
    for (const [key, m] of Object.entries(MEASURES)) {
      const [caseId, itemId] = key.split(':');
      const item = get(caseId).context.find((x) => x.id === itemId);
      expect(item?.value, key).not.toBeNull();
      const shown = item!.value!.en.replace(/,/g, '');
      if (m.kind === 'bp') expect(shown, key).toContain(`${m.systolic}/${m.diastolic}`);
      else expect(shown, key).toMatch(new RegExp(`(^|\\D)${String(m.value).replace('.', '\\.')}(\\D|$)`));
    }
  });

  it('only creates a ServiceRequest after a doctor approves, and keeps it as a draft', () => {
    expect(ofType(bundleFor(get('SYN-102'), false), 'ServiceRequest')).toHaveLength(0);
    const b = bundleFor(get('SYN-102'), true);
    const [sr] = ofType(b, 'ServiceRequest') as Record<string, any>[];
    expect(sr.status).toBe('draft');
    expect(sr.intent).toBe('plan');
    const follow = ofType(b, 'Task').find((t) => t.focus) as Record<string, any>;
    expect(follow.focus.reference).toBe(b.entry.find((e) => e.resource.resourceType === 'ServiceRequest')!.fullUrl);
  });

  it('never invents a birth date, since only age is known', () => {
    const [patient] = ofType(bundleFor(get('SYN-102'), false), 'Patient');
    expect(patient.birthDate).toBeUndefined();
  });
});

describe('validated instrument results', () => {
  const result: InstrumentResult = {
    instrument: 'minicog', score: 3, date: '2026-11-10', version: 'Arabic', reading: 'attention', givenBy: 'Nurse Aisha', trained: true,
  };

  it('accepts a complete result and names what is missing otherwise', () => {
    expect(resultProblems(result, '2026-11-17')).toEqual([]);
    expect(resultProblems({ ...result, score: 6 }, '2026-11-17')).toEqual(['score']);
    expect(resultProblems({ ...result, score: 2.5 }, '2026-11-17')).toEqual(['score']);
    expect(resultProblems({ ...result, date: '2026-12-01' }, '2026-11-17')).toEqual(['date']);
    expect(resultProblems({ ...result, version: ' ', trained: false }, '2026-11-17')).toEqual(['version', 'trained']);
    expect(resultProblems({ ...result, instrument: 'moca', score: 30 }, '2026-11-17')).toEqual([]);
  });

  it('keeps the clinician reading as the status, with no cut-off applied by the app', () => {
    expect(instrumentItem({ ...result, score: 5, reading: 'attention' }).status).toBe('attention');
    expect(instrumentItem({ ...result, score: 0, reading: 'ok' }).status).toBe('ok');
  });

  it('exports with its own verified LOINC code in place of the programme screen', () => {
    const base = get('SYN-102');
    const c: Case = { ...base, context: [instrumentItem(result), ...base.context.filter((i) => i.id !== 'screen')] };
    const obs = ofType(bundleFor(c, false), 'Observation');
    const mc = obs.find((r) => codes(r).includes('72233-0')) as Record<string, any> | undefined;
    expect(mc?.valueQuantity).toEqual({ value: 3, unit: 'score', system: 'http://unitsofmeasure.org', code: '{score}' });
    expect(obs.some((r) => codes(r).includes('72172-0'))).toBe(false);
    for (const id of Object.keys(INSTRUMENTS) as (keyof typeof INSTRUMENTS)[]) {
      expect(instrumentItem({ ...result, instrument: id }).measure?.kind).toBe('quantity');
    }
  });
});

// Writes example bundles for the external R4 validator: FHIR_EXAMPLES_DIR=fhir-examples npx vitest run tests/fhir.test.ts
describe.runIf(process.env.FHIR_EXAMPLES_DIR)('example bundles', () => {
  it('writes one approved and one pending bundle per exportable patient', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const dir = process.env.FHIR_EXAMPLES_DIR as string;
    mkdirSync(dir, { recursive: true });
    for (const c of CASES.filter((x) => x.consent.access)) {
      for (const approved of [false, true]) {
        writeFileSync(`${dir}/${c.id}-${approved ? 'approved' : 'pending'}.json`, `${JSON.stringify(bundleFor(c, approved), null, 2)}\n`);
      }
    }
  });
});
