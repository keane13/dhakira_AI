import { calculateChange, calibrationFor, fmt, BASELINE_VISITS } from './scoring';
import { idOf } from '../i18n';
import { selectComparable } from './pipeline';
import { L, type Case, type ClinicianDecision, type Localised, type PipelineRun } from './types';

export interface MonitorFlag {
  id: string;
  title: Localised;
  source: Localised;
  date: string;
  level: 'review' | 'watch';
}

export interface MonitorTask {
  id: string;
  title: Localised;
  due: string;
  status: 'overdue' | 'open';
}

export interface ChangePoint {
  visit: number;
  date: string;
  adjusted: number;
  z: number;
  lo: number;
  hi: number;
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Recomputes the change estimate as it stood at each encounter after baseline. */
export function changeSeries(c: Case): ChangePoint[] {
  const { comparable, protocol } = selectComparable(c);
  const calibration = protocol ? calibrationFor(protocol.language, c.education) : null;
  if (!calibration) return [];
  const out: ChangePoint[] = [];
  for (let i = BASELINE_VISITS; i < comparable.length; i += 1) {
    const r = calculateChange(comparable.slice(0, i + 1).map((o) => o.score as number), calibration);
    if (r) out.push({ visit: comparable[i].visit, date: comparable[i].date, adjusted: r.adjustedChange, z: r.z, lo: r.ci95[0], hi: r.ci95[1] });
  }
  return out;
}

export function buildFlags(c: Case, run: PipelineRun): MonitorFlag[] {
  const flags: MonitorFlag[] = [];
  const last = c.observations.at(-1);
  const date = last?.date ?? '';
  if (run.outcome.route === 'urgent') {
    flags.push({ id: 'urgent', title: L('Sudden change reported', 'أُبلغ عن تغيّر مفاجئ'), source: L('Supplied safety flag', 'إشارة سلامة واردة'), date, level: 'review' });
  }
  c.functionReports.filter((r) => r.level > 0).forEach((r, i) => {
    flags.push({ id: `function-${i}`, title: L('Reported change in daily function', 'تغيّر مبلّغ عنه في الأداء اليومي'), source: r.reporter === 'care_partner' ? L('Care partner report', 'تقرير مرافق الرعاية') : L('Self report', 'تقرير ذاتي'), date: r.date, level: 'review' });
  });
  if (run.change && run.change.numericFlag !== 'none') {
    const review = run.change.numericFlag === 'review';
    flags.push({
      id: 'numeric',
      title: review
        ? L(`Adjusted change crossed the review threshold (z ${fmt(run.change.z)})`, `تجاوز التغيّر المعدّل عتبة المراجعة (z ${fmt(run.change.z)})`, `Perubahan terkoreksi melewati ambang review (z ${fmt(run.change.z)})`)
        : L(`Borderline change (z ${fmt(run.change.z)})`, `تغيّر حدّي (z ${fmt(run.change.z)})`, `Perubahan di batas (z ${fmt(run.change.z)})`),
      source: L(`Formula tool, ${run.change.formulaVersion}`, `أداة المعادلة، ${run.change.formulaVersion}`, `Alat rumus, ${run.change.formulaVersion}`),
      date,
      level: review ? 'review' : 'watch',
    });
  }
  run.context.filter((i) => i.status === 'attention' && i.value).forEach((i) => {
    flags.push({ id: `context-${i.id}`, title: L(`${i.label.en}: ${i.value?.en}`, `${i.label.ar}: ${i.value?.ar}`, `${idOf(i.label)}: ${i.value ? idOf(i.value) : ''}`), source: i.source, date: i.date ?? date, level: 'watch' });
  });
  run.excluded.forEach((e) => {
    flags.push({ id: `excluded-${e.visit}`, title: L(`Visit ${e.visit} left out of the comparison: ${e.reason.en}`, `استُبعدت الزيارة ${e.visit} من المقارنة: ${e.reason.ar}`, `Kunjungan ${e.visit} tidak ikut dibandingkan: ${idOf(e.reason)}`), source: L('Assessment Protocol Agent', 'وكيل بروتوكول التقييم'), date, level: 'watch' });
  });
  return flags;
}

/** Tasks come from the human decision. Without one, only the preparation tasks exist. */
export function buildTasks(c: Case, run: PipelineRun, decision: ClinicianDecision | null, asOf: string): MonitorTask[] {
  const lastDate = c.observations.at(-1)?.date ?? asOf;
  const tasks: Omit<MonitorTask, 'status'>[] = [];
  if (decision?.status === 'approved') {
    tasks.push({ id: 'followup', title: L(`Follow up: ${decision.nextStep}`, `المتابعة: ${decision.nextStep}`, `Tindak lanjut: ${decision.nextStep}`), due: addDays(decision.decidedAt, decision.followUpDays) });
  } else if (run.outcome.route === 'held') {
    tasks.push({ id: 'hold', title: run.outcome.nextStep, due: addDays(lastDate, 14) });
  } else if (run.outcome.route !== 'stopped' && run.outcome.route !== 'urgent') {
    tasks.push({ id: 'review', title: L('Clinician review of the prepared draft', 'مراجعة الطبيب للمسودة المُعدّة'), due: addDays(lastDate, 7) });
  }
  run.context.filter((i) => i.status === 'unknown' && i.authorised).slice(0, 2).forEach((i) => {
    tasks.push({ id: `missing-${i.id}`, title: L(`Obtain missing result: ${i.label.en}`, `الحصول على النتيجة الناقصة: ${i.label.ar}`, `Lengkapi hasil yang kosong: ${idOf(i.label)}`), due: addDays(lastDate, 21) });
  });
  return tasks.map((t) => ({ ...t, status: t.due < asOf ? 'overdue' : 'open' }));
}
