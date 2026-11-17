import { LOINC, MEASURES, type Measure } from '../data/measures';
import { ROUTE_LABEL, SERVICE_LABEL, selectComparable } from './pipeline';
import type { MonitorTask } from './monitoring';
import type { Case, ClinicianDecision, ConsentScope, PipelineRun } from './types';

/**
 * Exports one patient's record as a FHIR R4 collection Bundle.
 *
 * Structural mapping only uses element names checked against the R4 specification,
 * and every external code was verified on tx.fhir.org. Values without an agreed
 * standard code use a clearly local CodeSystem and are listed as gaps in
 * docs/fhir-mapping-spec.md. Nothing is guessed: a missing value is exported as
 * missing, with a data-absent reason, or not exported at all.
 */

export const FHIR_VERSION = '4.0.1';

const SYS = {
  loinc: 'http://loinc.org',
  ucum: 'http://unitsofmeasure.org',
  bcp47: 'urn:ietf:bcp:47',
  obsCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  actReason: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
  dataAbsent: 'http://terminology.hl7.org/CodeSystem/data-absent-reason',
  consentScope: 'http://terminology.hl7.org/CodeSystem/consentscope',
  interpretation: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
  // Local, prototype-only namespaces. example.org is reserved and owned by no one.
  local: 'http://example.org/fhir/CodeSystem/dhakira-local',
  patientId: 'http://example.org/fhir/sid/dhakira-fictional-patient',
  policy: 'http://example.org/fhir/dhakira/policy/research-prototype',
} as const;

const INTERPRETATION = { L: 'Low', H: 'High', N: 'Normal' } as const;

/** Marks every resource as test data so it can never be mistaken for a real record. */
const TEST_TAG = { tag: [{ system: SYS.actReason, code: 'HTEST', display: 'test health data' }] };

export type FhirResource = { resourceType: string; id: string } & Record<string, unknown>;
export interface FhirBundle {
  resourceType: 'Bundle';
  id: string;
  meta: typeof TEST_TAG;
  type: 'collection';
  timestamp: string;
  entry: { fullUrl: string; resource: FhirResource }[];
}

/** Deterministic UUID-shaped id from a seed, so the same record always exports the same ids. */
export function uuidFrom(seed: string): string {
  const parts: string[] = [];
  for (let salt = 0; salt < 4; salt += 1) {
    let h = 0x811c9dc5 ^ salt;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    parts.push(h.toString(16).padStart(8, '0'));
  }
  const hex = parts.join('');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const local = (code: string, display: string) => ({ system: SYS.local, code, display });
const category = (code: 'survey' | 'vital-signs' | 'laboratory' | 'activity') => [{
  coding: [{ system: SYS.obsCategory, code, display: { survey: 'Survey', 'vital-signs': 'Vital Signs', laboratory: 'Laboratory', activity: 'Activity' }[code] }],
}];
const round = (n: number, dp = 3) => Number(n.toFixed(dp));
const ucumQ = (value: number, unit: string, code: string) => ({ value, unit, system: SYS.ucum, code });

export type FhirExportResult = { bundle: FhirBundle } | { error: string };

export function buildFhirBundle(
  c: Case,
  run: PipelineRun,
  decision: ClinicianDecision | null,
  tasks: MonitorTask[],
  now: Date,
): FhirExportResult {
  // Without permission nothing about the patient may leave the app.
  if (!c.consent.access) return { error: 'No permission to access this patient, so no record is exported.' };

  const entries: FhirBundle['entry'] = [];
  const add = (seed: string, resource: { resourceType: string } & Record<string, unknown>): string => {
    const id = uuidFrom(`${c.id}|${seed}`);
    const fullUrl = `urn:uuid:${id}`;
    entries.push({ fullUrl, resource: { ...resource, id, meta: TEST_TAG } });
    return fullUrl;
  };
  const ref = (url: string) => ({ reference: url });

  const patient = add('patient', {
    resourceType: 'Patient',
    identifier: [{ system: SYS.patientId, value: c.id }],
    name: [{ text: c.name, given: [c.name] }],
    gender: c.sex === 'F' ? 'female' : 'male',
    communication: [{ language: { coding: [{ system: SYS.bcp47, code: c.preferredLanguage }] }, preferred: true }],
  });

  // One ambulatory encounter per visit date.
  const encounterFor = new Map<string, string>();
  for (const date of [...new Set(c.observations.map((o) => o.date))].sort()) {
    encounterFor.set(date, add(`encounter|${date}`, {
      resourceType: 'Encounter',
      status: 'finished',
      class: { system: SYS.actCode, code: 'AMB', display: 'ambulatory' },
      subject: ref(patient),
      period: { start: date, end: date },
    }));
  }

  const checkObs = new Map<number, string>();
  for (const o of c.observations) {
    const conditions = Object.entries(o.conditions).filter(([, v]) => v).map(([k]) => k);
    checkObs.set(o.visit, add(`check|${o.visit}`, {
      resourceType: 'Observation',
      status: 'final',
      category: category('survey'),
      code: {
        coding: [local('cognitive-check-total', 'Dhakira brief cognitive check, total out of 10')],
        text: 'Brief cognitive check total (0 to 10). Original, unvalidated items.',
      },
      subject: ref(patient),
      encounter: ref(encounterFor.get(o.date) as string),
      effectiveDateTime: o.date,
      ...(o.score === null
        ? { dataAbsentReason: { coding: [{ system: SYS.dataAbsent, code: 'unknown', display: 'Unknown' }] } }
        : { valueInteger: o.score }),
      method: {
        coding: [local(`presentation-${o.mode}`, o.mode === 'visual' ? 'Presented by sight' : 'Presented by sound')],
        text: `Form ${o.form}${o.administration === 'staff-paper' ? ', given on paper by staff' : ''}`,
      },
      component: [{
        code: { coding: [local('assessment-language', 'Language of the assessment')] },
        valueCodeableConcept: { coding: [{ system: SYS.bcp47, code: o.language }] },
      }],
      ...(conditions.length ? { note: [{ text: `Conditions on the day: ${conditions.join(', ')}` }] } : {}),
    }));
  }

  const levels = [['none', 'No change reported'], ['some', 'Some change reported'], ['major', 'Major change reported']] as const;
  c.functionReports.forEach((f, i) => {
    add(`function|${i}`, {
      resourceType: 'Observation',
      status: 'final',
      category: category('survey'),
      code: { coding: [local('daily-function-change', 'Reported change in familiar daily tasks')] },
      subject: ref(patient),
      ...(encounterFor.has(f.date) ? { encounter: ref(encounterFor.get(f.date) as string) } : {}),
      effectiveDateTime: f.date,
      valueCodeableConcept: { coding: [local(`function-${levels[f.level][0]}`, levels[f.level][1])] },
      note: [{ text: `${f.reporter === 'care_partner' ? 'Reported by a care partner' : 'Self-reported'}: ${f.note.en}` }],
    });
  });

  const lastDate = c.observations.at(-1)?.date ?? now.toISOString().slice(0, 10);
  const changeCode = { coding: [local('adjusted-change-from-baseline', 'Change from own baseline after practice adjustment')] };
  if (run.change) {
    const r = run.change;
    const { comparable } = selectComparable(c);
    add('change', {
      resourceType: 'Observation',
      // Preliminary: the calibration is synthetic and the result is not clinically validated.
      status: 'preliminary',
      category: category('survey'),
      code: changeCode,
      subject: ref(patient),
      effectiveDateTime: lastDate,
      valueQuantity: ucumQ(round(r.adjustedChange), 'tasks', '{tasks}'),
      component: [
        { code: { coding: [local('z-score', 'Standardised change (z)')] }, valueQuantity: ucumQ(round(r.z), 'z', '1') },
        { code: { coding: [local('ci95-lower', 'Illustrative 95% interval, lower bound')] }, valueQuantity: ucumQ(round(r.ci95[0]), 'tasks', '{tasks}') },
        { code: { coding: [local('ci95-upper', 'Illustrative 95% interval, upper bound')] }, valueQuantity: ucumQ(round(r.ci95[1]), 'tasks', '{tasks}') },
      ],
      derivedFrom: comparable.map((o) => ref(checkObs.get(o.visit) as string)),
      method: { text: `${r.formulaVersion}, calibration ${r.calibration.version} (synthetic)` },
      note: [{ text: `Proposed path: ${ROUTE_LABEL[run.outcome.route].en}. ${run.outcome.reason.en} This is a risk signal, not a diagnosis.` }],
    });
  } else {
    add('change', {
      resourceType: 'Observation',
      status: 'preliminary',
      category: category('survey'),
      code: changeCode,
      subject: ref(patient),
      effectiveDateTime: lastDate,
      dataAbsentReason: { coding: [{ system: SYS.dataAbsent, code: 'not-performed', display: 'Not Performed' }] },
      note: [{ text: run.changeNull?.en ?? 'No change estimate was reached.' }],
    });
  }

  // Context values: only items the patient authorised, and only those with a verified code.
  for (const item of run.context) {
    const m: Measure | undefined = item.measure ?? MEASURES[`${c.id}:${item.id}`];
    if (!m || !item.authorised || item.value === null) continue;
    const base = {
      resourceType: 'Observation',
      status: 'final',
      subject: ref(patient),
      ...(item.date ? { effectiveDateTime: item.date } : {}),
      note: [{ text: `Source: ${item.source.en}` }],
    };
    if (m.kind === 'bp') {
      add(`context|${item.id}`, {
        ...base,
        category: category('vital-signs'),
        code: { coding: [{ system: SYS.loinc, code: LOINC.bpPanel.code, display: LOINC.bpPanel.display }] },
        component: [
          { code: { coding: [{ system: SYS.loinc, code: LOINC.systolic.code, display: LOINC.systolic.display }] }, valueQuantity: ucumQ(m.systolic, 'mmHg', 'mm[Hg]') },
          { code: { coding: [{ system: SYS.loinc, code: LOINC.diastolic.code, display: LOINC.diastolic.display }] }, valueQuantity: ucumQ(m.diastolic, 'mmHg', 'mm[Hg]') },
        ],
      });
    } else {
      add(`context|${item.id}`, {
        ...base,
        category: category(m.category),
        code: { coding: [{ system: SYS.loinc, code: m.loinc, display: m.display }] },
        valueQuantity: ucumQ(m.value, m.unit, m.ucum),
        ...(m.interpretation ? {
          interpretation: [{ coding: [{ system: SYS.interpretation, code: m.interpretation, display: INTERPRETATION[m.interpretation] }] }],
        } : {}),
        ...(m.range ? {
          referenceRange: [{
            ...(m.range.low !== null ? { low: ucumQ(m.range.low, m.unit, m.ucum) } : {}),
            ...(m.range.high !== null ? { high: ucumQ(m.range.high, m.unit, m.ucum) } : {}),
            text: 'As printed on the laboratory report',
          }],
        } : {}),
      });
    }
  }

  // Medicines have no agreed drug code in this prototype, so the name travels as text (see GAP-6).
  for (const med of c.consent.clinical ? (c.medicines ?? []) : []) {
    const notes = [
      `Source: ${med.source.replace('_', ' ')}`,
      ...(med.withoutPrescription ? ['Bought without a prescription'] : []),
      ...(med.anticholinergic ? ['Marked by a clinician as anticholinergic'] : []),
      ...(med.cnsActive ? ['Marked by a clinician as acting on the brain (CNS-active)'] : []),
    ];
    add(`medication|${med.id}`, {
      resourceType: 'MedicationStatement',
      // Unconfirmed medicines are recorded as unknown use, not as active.
      status: med.confirmed ? 'active' : 'unknown',
      medicationCodeableConcept: { text: med.name },
      subject: ref(patient),
      dateAsserted: med.date,
      dosage: [{ text: med.dose }],
      note: [{ text: notes.join('. ') }],
    });
  }

  const scopeLabel: Record<ConsentScope, string> = {
    clinical: 'Clinical record', wearable: 'Wearable data', family: 'Family history', genomic: 'Genomic results',
  };
  const denied = (Object.keys(scopeLabel) as ConsentScope[]).filter((s) => !c.consent[s]);
  add('consent', {
    resourceType: 'Consent',
    status: 'active',
    scope: { coding: [{ system: SYS.consentScope, code: 'patient-privacy', display: 'Privacy Consent' }] },
    category: [{ coding: [{ system: SYS.loinc, code: LOINC.consent.code, display: LOINC.consent.display }] }],
    patient: ref(patient),
    policy: [{ uri: SYS.policy }],
    provision: {
      type: 'permit',
      ...(denied.length ? {
        provision: denied.map((s) => ({ type: 'deny', code: [{ coding: [local(`data-scope-${s}`, scopeLabel[s])] }] })),
      } : {}),
    },
  });

  let serviceRequest: string | null = null;
  if (decision?.status === 'approved') {
    const practitioner = add('practitioner', { resourceType: 'Practitioner', name: [{ text: decision.reviewer }] });
    serviceRequest = add('service-request', {
      resourceType: 'ServiceRequest',
      // Draft: this prototype never sends a referral.
      status: 'draft',
      intent: 'plan',
      code: { text: ROUTE_LABEL[decision.route].en },
      subject: ref(patient),
      authoredOn: decision.decidedAt,
      requester: ref(practitioner),
      reasonCode: [{ text: run.outcome.reason.en }],
      note: [
        { text: `Agreed next step: ${decision.nextStep}` },
        ...(decision.services.length ? [{ text: `Services to discuss: ${decision.services.map((s) => SERVICE_LABEL[s].en).join(', ')}` }] : []),
      ],
    });
  }

  tasks.forEach((task) => {
    add(`task|${task.id}`, {
      resourceType: 'Task',
      status: 'requested',
      intent: 'plan',
      description: task.title.en,
      for: ref(patient),
      ...(serviceRequest && task.id === 'followup' ? { focus: ref(serviceRequest) } : {}),
      businessStatus: { text: task.status },
      restriction: { period: { end: task.due } },
    });
  });

  return {
    bundle: {
      resourceType: 'Bundle',
      id: uuidFrom(`${c.id}|bundle|${now.toISOString()}`),
      meta: TEST_TAG,
      type: 'collection',
      timestamp: now.toISOString(),
      entry: entries,
    },
  };
}
