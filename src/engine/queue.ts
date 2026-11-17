import { L, type Case, type ClinicalRole, type ClinicianDecision, type Localised, type PipelineRun } from './types';

/** What a clinician sees first: who needs a person, in what order, and what to do next. */

export type QueueGroup = 'urgent' | 'signoff' | 'repeat' | 'held' | 'routine' | 'done' | 'stopped';

export const GROUP_ORDER: QueueGroup[] = ['urgent', 'signoff', 'repeat', 'held', 'routine', 'done', 'stopped'];

export type ActionPage = 'workspace' | 'review' | 'check' | 'monitoring';

export interface QueueItem {
  c: Case;
  run: PipelineRun;
  decision: ClinicianDecision | null;
  group: QueueGroup;
  action: { label: Localised; page: ActionPage };
  lastSeen: string | null;
}

export function groupFor(run: PipelineRun, decision: ClinicianDecision | null): QueueGroup {
  if (run.outcome.route === 'stopped') return 'stopped';
  if (run.outcome.route === 'urgent') return 'urgent';
  if (run.outcome.route === 'held') return 'held';
  if (decision?.status === 'approved') return 'done';
  if (run.outcome.route === 'qualified_review') return 'signoff';
  if (run.outcome.route === 'repeat') return 'repeat';
  return 'routine';
}

export function actionFor(group: QueueGroup, role: ClinicalRole, decision: ClinicianDecision | null): QueueItem['action'] {
  const doctor = role === 'doctor';
  switch (group) {
    case 'urgent':
      return { label: L('Hand off now', 'التحويل الآن'), page: 'workspace' };
    case 'signoff':
      if (decision?.status === 'prepared') {
        return doctor
          ? { label: L('Review and sign off', 'المراجعة والتوقيع'), page: 'review' }
          : { label: L('With the doctor for sign-off', 'لدى الطبيب للتوقيع'), page: 'review' };
      }
      if (decision?.status === 'returned') {
        return doctor
          ? { label: L('Returned, waiting for information', 'أعيدت، بانتظار المعلومات'), page: 'review' }
          : { label: L('Add the requested information', 'إضافة المعلومات المطلوبة'), page: 'review' };
      }
      return doctor
        ? { label: L('Review and sign off', 'المراجعة والتوقيع'), page: 'review' }
        : { label: L('Prepare for the doctor', 'الإعداد للطبيب'), page: 'review' };
    case 'repeat':
      return doctor
        ? { label: L('Confirm the repeat plan', 'تأكيد خطة الإعادة'), page: 'review' }
        : { label: L('Repeat the check', 'إعادة الفحص'), page: 'check' };
    case 'held':
      return { label: L('Resolve the hold', 'معالجة التعليق'), page: 'workspace' };
    case 'routine':
      return doctor
        ? { label: L('Confirm the routine plan', 'تأكيد الخطة الروتينية'), page: 'review' }
        : { label: L('Discuss prevention', 'مناقشة الوقاية'), page: 'workspace' };
    case 'done':
      return { label: L('Open follow-up', 'فتح المتابعة'), page: 'monitoring' };
    case 'stopped':
      return { label: L('Ask for permission', 'طلب الإذن'), page: 'workspace' };
  }
}

/** Urgent work first; within a group, the most recently seen person first. */
export function buildQueue(
  cases: Case[],
  runFor: (id: string) => PipelineRun,
  decisionFor: (id: string) => ClinicianDecision | null,
  role: ClinicalRole,
): QueueItem[] {
  return cases
    .map((c): QueueItem => {
      const run = runFor(c.id);
      const decision = decisionFor(c.id);
      const group = groupFor(run, decision);
      return { c, run, decision, group, action: actionFor(group, role, decision), lastSeen: c.observations.at(-1)?.date ?? null };
    })
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
      || (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''));
}
