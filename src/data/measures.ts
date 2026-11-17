/**
 * Structured values behind context items that have a verified LOINC code.
 * Every code below was checked on tx.fhir.org (CodeSystem $lookup, status ACTIVE)
 * on 2026-11-17. Items not listed here have no agreed code yet and are reported
 * as gaps in docs/fhir-mapping-spec.md rather than exported with a guessed code.
 */

export type ObservationCategory = 'vital-signs' | 'laboratory' | 'activity' | 'survey';

export interface QuantityMeasure {
  kind: 'quantity';
  loinc: string;
  display: string;
  category: ObservationCategory;
  value: number;
  unit: string;
  ucum: string;
  /** Reference range from the lab's own report, for entered lab results. */
  range?: { low: number | null; high: number | null };
  /** L, H or N, derived only from that reported range. */
  interpretation?: 'L' | 'H' | 'N';
}

export interface BloodPressureMeasure {
  kind: 'bp';
  systolic: number;
  diastolic: number;
}

export type Measure = QuantityMeasure | BloodPressureMeasure;

export const LOINC = {
  bpPanel: { code: '85354-9', display: 'Blood pressure panel with all children optional' },
  systolic: { code: '8480-6', display: 'Systolic blood pressure' },
  diastolic: { code: '8462-4', display: 'Diastolic blood pressure' },
  hba1c: { code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' },
  steps: { code: '41950-7', display: 'Number of steps in 24 hour Measured' },
  sleep: { code: '93832-4', display: 'Sleep duration' },
  moca: { code: '72172-0', display: 'Total score [MoCA]' },
  minicog: { code: '72233-0', display: 'Total score [Mini-Cog]' },
  rudas: { code: '98094-6', display: 'Total score [RUDAS]' },
  consent: { code: '59284-0', display: 'Consent Document' },
} as const;

const moca = (value: number): QuantityMeasure => ({ kind: 'quantity', loinc: LOINC.moca.code, display: LOINC.moca.display, category: 'survey', value, unit: 'score', ucum: '{score}' });
const hba1c = (value: number): QuantityMeasure => ({ kind: 'quantity', loinc: LOINC.hba1c.code, display: LOINC.hba1c.display, category: 'laboratory', value, unit: '%', ucum: '%' });
const steps = (value: number): QuantityMeasure => ({ kind: 'quantity', loinc: LOINC.steps.code, display: LOINC.steps.display, category: 'activity', value, unit: 'steps per 24 hours', ucum: '{#}/(24.h)' });
const sleep = (value: number): QuantityMeasure => ({ kind: 'quantity', loinc: LOINC.sleep.code, display: LOINC.sleep.display, category: 'activity', value, unit: 'h', ucum: 'h' });
const bp = (systolic: number, diastolic: number): BloodPressureMeasure => ({ kind: 'bp', systolic, diastolic });

/** Keyed by `${caseId}:${contextItemId}`. */
export const MEASURES: Record<string, Measure> = {
  'SYN-102:screen': moca(24),
  'SYN-102:bp': bp(148, 90),
  'SYN-102:steps': steps(2900),
  'SYN-102:hba1c': hba1c(8.2),
  'SYN-102:sleep': sleep(5.1),
  'SYN-101:screen': moca(21),
  'SYN-101:bp': bp(128, 78),
  'SYN-101:steps': steps(3400),
  'SYN-101:hba1c': hba1c(5.8),
  'SYN-101:sleep': sleep(7),
  'SYN-103:bp': bp(126, 80),
  'SYN-103:steps': steps(7800),
  'SYN-103:hba1c': hba1c(5.5),
  'SYN-104:bp': bp(132, 84),
  'SYN-104:steps': steps(5100),
  'SYN-105:bp': bp(138, 86),
  'SYN-105:hba1c': hba1c(6.3),
  'SYN-108:sleep': sleep(5.5),
  'SYN-108:bp': bp(124, 78),
  'SYN-108:hba1c': hba1c(5.6),
};
