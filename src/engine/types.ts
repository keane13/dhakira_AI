/** Shared domain types. Everything here is free of UI and network concerns. */
import type { Measure } from '../data/measures';
import type { MedicineEntry } from './medslabs';
import type { Prediction } from './model';

export type Lang = 'en' | 'ar' | 'id';
/** Indonesian comes from `id` when given, otherwise from the dictionary keyed by the English text. */
export interface Localised { en: string; ar: string; id?: string }
export const L = (en: string, ar: string, id?: string): Localised => (id === undefined ? { en, ar } : { en, ar, id });

export type AssessmentLanguage = 'ar' | 'en' | 'id' | 'ur';
export type Education = 'low' | 'mid' | 'high';
export type Mode = 'visual' | 'auditory';

export interface Conditions {
  poorSleep: boolean;
  fasting: boolean;
  lowMood: boolean;
  distraction: boolean;
  aidsWorn: boolean;
  assisted: boolean;
}

export interface Observation {
  visit: number;
  date: string;
  /** Tasks completed out of 10. Null means not recorded; it is never treated as zero. */
  score: number | null;
  language: AssessmentLanguage;
  mode: Mode;
  form: string;
  conditions: Conditions;
  source: 'authored' | 'live-check';
  /** How the check was given. Paper entry exists for people who cannot use a device. */
  administration?: 'device' | 'staff-paper';
  /** Points per task. They add up to `score` when present. */
  parts?: TaskParts;
}

/** The four tasks of the brief check: recall out of 4, the others out of 2. */
export interface TaskParts { recall: number; sequence: number; search: number; switching: number }

export interface FunctionReport {
  date: string;
  reporter: 'self' | 'care_partner';
  /** 0 no reported change, 1 some change, 2 major change. */
  level: 0 | 1 | 2;
  note: Localised;
  source: 'authored' | 'live-check';
}

export type Domain =
  | 'screening' | 'physical' | 'metabolic' | 'sleep' | 'mental' | 'lifestyle'
  | 'sensory' | 'medication' | 'family' | 'genomic';

export type ConsentScope = 'clinical' | 'wearable' | 'family' | 'genomic';

export type ContributorId =
  | 'sleep' | 'medicines' | 'mood' | 'sensory' | 'vascular' | 'metabolic'
  | 'activity' | 'social' | 'function' | 'family_genetics';

export interface ContextItem {
  id: string;
  domain: Domain;
  label: Localised;
  /** Null means unknown or unsupplied. */
  value: Localised | null;
  status: 'ok' | 'attention' | 'unknown';
  source: Localised;
  date: string | null;
  consent: ConsentScope;
  /** A value that requires qualified review on its own, such as a positive mood screen. */
  highRisk?: boolean;
  contributor?: ContributorId;
  /** Structured value with a verified code, for items entered in the app (for example a validated instrument). */
  measure?: Measure;
}

export interface Case {
  id: string;
  name: string;
  age: number;
  sex: 'F' | 'M';
  summary: Localised;
  pathLabel: Localised;
  education: Education;
  preferredLanguage: AssessmentLanguage;
  concern: Localised;
  carePartner: Localised | null;
  consent: Record<ConsentScope | 'access', boolean>;
  suddenChangeFlag: boolean;
  suddenChangeNote?: Localised;
  hearingConcern: boolean;
  visionConcern: boolean;
  observations: Observation[];
  functionReports: FunctionReport[];
  context: ContextItem[];
  clarify: Localised[];
  /** Structured medicine list entered in the app. The authored summary stays in `context`. */
  medicines?: MedicineEntry[];
}

export interface Calibration {
  sd: number;
  reliability: number;
  practiceGain: number;
  version: string;
  status: 'synthetic';
}

export interface ChangeResult {
  formulaVersion: string;
  values: number[];
  baselineValues: number[];
  followupValues: number[];
  baselineMean: number;
  followupMean: number;
  observedChange: number;
  practiceGain: number;
  adjustedChange: number;
  se: number;
  z: number;
  ci95: [number, number];
  numericFlag: 'review' | 'repeat' | 'none';
  rapidDrop: boolean;
  calibration: Calibration;
}

export type Route = 'routine' | 'repeat' | 'qualified_review' | 'urgent' | 'held' | 'stopped';

export type StageStatus = 'passed' | 'stopped' | 'held' | 'skipped' | 'null' | 'waiting' | 'recorded' | 'pending';

export type StageKind = 'rules' | 'scoring' | 'assistance' | 'human';

export interface StageDef {
  n: number;
  key: string;
  title: Localised;
  agent: Localised;
  tool: string;
  kind: StageKind;
}

export interface StageResult extends StageDef {
  status: StageStatus;
  message: Localised;
}

export interface AuditEvent {
  seq: number;
  stage: number;
  agent: string;
  tool: string;
  status: StageStatus;
  detail: string;
}

export type Service =
  | 'primary_care' | 'neurology' | 'geriatrics' | 'mental_health'
  | 'audiology' | 'optometry' | 'sleep_clinic' | 'genetic_counselling';

export interface Contributor {
  id: ContributorId;
  label: Localised;
  why: Localised;
  action: Localised;
  localNote: Localised | null;
  sources: string[];
  service: Service | null;
}

export type ClinicalRole = 'doctor' | 'nurse';

export interface ClinicianDecision {
  reviewer: string;
  reviewerRole: ClinicalRole;
  summary: string;
  stillToClarify: string;
  assessment: string;
  nextStep: string;
  contributors: ContributorId[];
  route: Route;
  services: Service[];
  rationale: string;
  followUpDays: number;
  summaryConfirmed: boolean;
  contributorsReviewed: boolean;
  /** 'prepared' is a nurse's handover: it releases nothing until a doctor approves. */
  status: 'approved' | 'returned' | 'prepared';
  decidedAt: string;
}

export interface PipelineOptions {
  evidenceAvailable: boolean;
  decision: ClinicianDecision | null;
  /** Shadow-mode model at stage 8. On by default; it never affects the route. */
  shadowModel?: boolean;
}

export interface Outcome {
  route: Route;
  /** The reason the route was reached, always shown next to the route. */
  reason: Localised;
  /** What a person should do next. Never an automatic care action. */
  nextStep: Localised;
}

export interface ResolvedContext extends ContextItem {
  authorised: boolean;
}

export interface PipelineRun {
  caseId: string;
  stages: StageResult[];
  audit: AuditEvent[];
  outcome: Outcome;
  change: ChangeResult | null;
  /** Why no change estimate exists. Null when one does. */
  changeNull: Localised | null;
  excluded: { visit: number; reason: Localised }[];
  context: ResolvedContext[];
  contributors: Contributor[];
  suggestedServices: Service[];
  interpretationNotes: Localised[];
  /** Shadow-mode model estimate or its reason for abstaining. Missing on records saved before the model existed. */
  shadow?: Prediction | null;
}
