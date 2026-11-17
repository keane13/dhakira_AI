import { describe, expect, it } from 'vitest';
import { caseById } from '../src/data/cases';
import { runPipeline } from '../src/engine/pipeline';
import { buildFhirBundle } from '../src/engine/fhir';
import {
  LAB_TESTS, labFlag, labProblems, medicineProblems, medicineSignals, mergeContext, workupEvidence,
  type LabResult, type MedicineEntry,
} from '../src/engine/medslabs';
import type { Case } from '../src/engine/types';

const get = (id: string) => caseById(id) as Case;
const labR = (over: Partial<LabResult>): LabResult => ({ id: 'L1', test: 'b12', value: 150, date: '2026-11-10', low: 200, high: 900, enteredBy: 'Nurse Aisha', ...over });
const med = (over: Partial<MedicineEntry>): MedicineEntry => ({
  id: 'M1', name: 'Metformin', dose: '500 mg twice a day', source: 'prescription', confirmed: true,
  withoutPrescription: false, anticholinergic: false, cnsActive: false, date: '2026-11-10', enteredBy: 'Nurse Aisha', ...over,
});

describe('lab results', () => {
  it('flags only against the range printed on the lab report', () => {
    expect(labFlag({ value: 150, low: 200, high: 900 })).toBe('L');
    expect(labFlag({ value: 950, low: 200, high: 900 })).toBe('H');
    expect(labFlag({ value: 200, low: 200, high: 900 })).toBe('N');
    expect(labFlag({ value: 45, low: 60, high: null })).toBe('L');
  });

  it('requires a value, a past date and at least one sensible range bound', () => {
    expect(labProblems(labR({}), '2026-11-17')).toEqual([]);
    expect(labProblems(labR({ low: null, high: null }), '2026-11-17')).toEqual(['range']);
    expect(labProblems(labR({ low: 900, high: 200 }), '2026-11-17')).toEqual(['range']);
    expect(labProblems(labR({ value: Number.NaN, date: '2026-12-01' }), '2026-11-17')).toEqual(['value', 'date']);
  });

  it('every test has a distinct LOINC code and a UCUM unit', () => {
    expect(new Set(LAB_TESTS.map((t) => t.loinc)).size).toBe(LAB_TESTS.length);
    for (const t of LAB_TESTS) expect(t.ucum).toMatch(/^[\w[\]{}/.%]+$/);
  });

  it('replaces the authored HbA1c, keeps the newest result, and shows what is still missing', () => {
    const base = get('SYN-102').context;
    const merged = mergeContext(base, [labR({}), labR({ id: 'L2', test: 'hba1c', value: 7.1, low: null, high: 6.5, date: '2026-11-01' }), labR({ id: 'L3', test: 'hba1c', value: 7.4, low: null, high: 6.5, date: '2026-11-12' })], []);
    const ids = merged.map((i) => i.id);
    expect(ids).not.toContain('hba1c');
    expect(ids).not.toContain('b12');
    expect(merged.find((i) => i.id === 'lab-hba1c')?.measure).toMatchObject({ value: 7.4, interpretation: 'H' });
    const tsh = merged.find((i) => i.id === 'lab-tsh');
    expect(tsh?.value).toBeNull();
    expect(tsh?.status).toBe('unknown');
    expect(merged.find((i) => i.id === 'lab-b12')?.status).toBe('attention');
  });

  it('leaves the context untouched when nothing is entered', () => {
    const base = get('SYN-101').context;
    expect(mergeContext(base, [], [])).toBe(base);
  });
});

describe('medicines', () => {
  it('requires a name and a dose', () => {
    expect(medicineProblems(med({ name: ' ', dose: '' }))).toEqual(['name', 'dose']);
  });

  it('applies only the Beers combination counts, never a single-drug judgement', () => {
    expect(medicineSignals([med({ anticholinergic: true })]).map((s) => s.key)).toEqual([]);
    expect(medicineSignals([med({ anticholinergic: true }), med({ id: 'M2', anticholinergic: true })]).map((s) => s.key)).toEqual(['anticholinergic']);
    const three = [1, 2, 3].map((n) => med({ id: `M${n}`, cnsActive: true }));
    expect(medicineSignals(three).map((s) => s.key)).toEqual(['cns']);
    expect(medicineSignals([med({ confirmed: false, withoutPrescription: true })]).map((s) => s.key)).toEqual(['unconfirmed', 'otc']);
  });

  it('turns the list into one context item that needs attention when something is unconfirmed or marked', () => {
    const merged = mergeContext(get('SYN-102').context, [], [med({}), med({ id: 'M2', name: 'Sleep aid', dose: '1 tablet at night', confirmed: false, withoutPrescription: true, anticholinergic: true })]);
    const meds = merged.filter((i) => i.id === 'meds');
    expect(meds).toHaveLength(1);
    expect(meds[0].status).toBe('attention');
    expect(meds[0].value?.en).toContain('Sleep aid 1 tablet at night (not confirmed, may affect thinking)');
    expect(mergeContext(get('SYN-102').context, [], [med({})]).find((i) => i.id === 'meds')?.status).toBe('ok');
  });

  it('feeds the matching reversible-cause rows', () => {
    expect(workupEvidence('b12', [labR({})], [])[0].en).toBe('Vitamin B12 150 pmol/L, below the lab\'s range, 2026-11-10');
    expect(workupEvidence('thyroid', [labR({})], [])).toEqual([]);
    expect(workupEvidence('meds', [], [med({ confirmed: false })]).map((l) => l.en)[0]).toBe('1 medicine entered');
  });
});

describe('FHIR export of entered medicines and labs', () => {
  const build = (c: Case) => {
    const run = runPipeline(c, { evidenceAvailable: true, decision: null });
    const r = buildFhirBundle(c, run, null, [], new Date('2026-11-17T09:00:00Z'));
    if ('error' in r) throw new Error(r.error);
    return r.bundle.entry.map((e) => e.resource) as Record<string, any>[];
  };
  const base = get('SYN-102');
  const medicines = [med({}), med({ id: 'M2', name: 'Sleep aid', dose: '1 tablet at night', confirmed: false })];
  const c: Case = { ...base, medicines, context: mergeContext(base.context, [labR({})], medicines) };

  it('exports a lab result with its LOINC code, the reported range and L, H or N', () => {
    const b12 = build(c).find((r) => JSON.stringify(r.code ?? {}).includes('14685-2'));
    expect(b12?.valueQuantity).toEqual({ value: 150, unit: 'pmol/L', system: 'http://unitsofmeasure.org', code: 'pmol/L' });
    expect(b12?.referenceRange[0].low.value).toBe(200);
    expect(b12?.interpretation[0].coding[0].code).toBe('L');
    expect(b12?.category[0].coding[0].code).toBe('laboratory');
  });

  it('exports medicines as MedicationStatement, with unconfirmed ones as unknown use', () => {
    const ms = build(c).filter((r) => r.resourceType === 'MedicationStatement');
    expect(ms.map((m) => [m.medicationCodeableConcept.text, m.status])).toEqual([['Metformin', 'active'], ['Sleep aid', 'unknown']]);
  });

  it('exports no medicines or labs without clinical consent', () => {
    const noClinical: Case = { ...c, consent: { ...c.consent, clinical: false } };
    const res = build(noClinical);
    expect(res.some((r) => r.resourceType === 'MedicationStatement')).toBe(false);
    expect(res.some((r) => JSON.stringify(r.code ?? {}).includes('14685-2'))).toBe(false);
  });
});

// Example for the external R4 validator: FHIR_EXAMPLES_DIR=fhir-examples npx vitest run tests/medslabs.test.ts
describe.runIf(process.env.FHIR_EXAMPLES_DIR)('example bundle with medicines and labs', () => {
  it('writes SYN-102 with entered medicines and every lab test', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const dir = process.env.FHIR_EXAMPLES_DIR as string;
    mkdirSync(dir, { recursive: true });
    const base = get('SYN-102');
    const medicines = [med({}), med({ id: 'M2', name: 'Sleep aid', dose: '1 tablet at night', source: 'care_partner', confirmed: false, withoutPrescription: true, anticholinergic: true })];
    const labs = LAB_TESTS.map((t, i) => labR({ id: `L${i}`, test: t.id, value: 10 + i, low: i % 3 === 0 ? null : 5, high: i % 3 === 1 ? null : 50 }));
    const c: Case = { ...base, medicines, context: mergeContext(base.context, labs, medicines) };
    const run = runPipeline(c, { evidenceAvailable: true, decision: null });
    const r = buildFhirBundle(c, run, null, [], new Date('2026-11-17T09:00:00Z'));
    if ('error' in r) throw new Error(r.error);
    writeFileSync(`${dir}/SYN-102-medicines-labs.json`, `${JSON.stringify(r.bundle, null, 2)}\n`);
  });
});
