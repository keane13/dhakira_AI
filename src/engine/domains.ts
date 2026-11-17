import { selectComparable } from './pipeline';
import { BASELINE_VISITS, MAX_FOLLOWUP_VISITS } from './scoring';
import { L, type Case, type Localised, type PipelineRun, type TaskParts } from './types';

/**
 * Change by task area, against the patient's own baseline.
 *
 * Descriptive only. The total score is the one number tested against a threshold.
 * Each task here is scored out of 2 or 4, so one point is a large step and a
 * single visit moves it easily. There is no calibration per task, so there is no
 * z-score, no interval and no flag at this level. The view never names a part of
 * the brain: a task draws on many brain networks at once.
 */

export type TaskKey = keyof TaskParts;

export interface TaskArea { key: TaskKey; max: number; area: Localised; task: Localised }

export const TASK_AREAS: TaskArea[] = [
  { key: 'recall', max: 4, area: L('Learning and memory', 'التعلّم والذاكرة', 'Belajar dan memori'), task: L('Picture recognition', 'التعرّف على الصور', 'Mengenali gambar') },
  { key: 'sequence', max: 2, area: L('Attention and working memory', 'الانتباه والذاكرة العاملة', 'Atensi dan memori kerja'), task: L('Repeat a sequence', 'تكرار تسلسل', 'Mengulang urutan') },
  { key: 'search', max: 2, area: L('Processing speed', 'سرعة المعالجة', 'Kecepatan pemrosesan'), task: L('Find the target', 'إيجاد الهدف', 'Menemukan target') },
  { key: 'switching', max: 2, area: L('Executive function', 'الوظائف التنفيذية', 'Fungsi eksekutif'), task: L('Switch rules', 'تبديل القواعد', 'Berganti aturan') },
];

export type Position = 'below' | 'within' | 'above';

export interface AreaRow {
  area: TaskArea;
  baseline: number[];
  baseMean: number;
  baseMin: number;
  baseMax: number;
  followMean: number;
  /** Where the follow-up average sits against the range of the patient's own baseline visits. */
  position: Position;
}

export type DomainProfile =
  | { ok: true; rows: AreaRow[]; baselineVisits: number[]; followupVisits: number[] }
  | { ok: false; reason: Localised };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function domainProfile(c: Case, run: PipelineRun): DomainProfile {
  // Same gate as the total: if the total change is withheld, so is this view, for the same reason.
  if (!run.change) {
    return { ok: false, reason: run.changeNull ?? L('No change estimate for this patient yet.', 'لا يوجد تقدير للتغيّر لهذا المريض بعد.', 'Belum ada estimasi perubahan untuk pasien ini.') };
  }
  const { comparable } = selectComparable(c);
  const base = comparable.slice(0, BASELINE_VISITS);
  const follow = comparable.slice(BASELINE_VISITS).slice(-MAX_FOLLOWUP_VISITS);
  if ([...base, ...follow].some((o) => !o.parts)) {
    return { ok: false, reason: L(
      'Task-level points were not recorded for every visit used in the total, so this view is not shown.',
      'لم تُسجل نقاط كل مهمة لكل زيارة مستخدمة في المجموع، لذا لا يُعرض هذا العرض.',
      'Poin per tugas tidak tercatat untuk setiap kunjungan yang dipakai dalam total, jadi tampilan ini tidak ditampilkan.',
    ) };
  }
  const rows = TASK_AREAS.map((area): AreaRow => {
    const baseline = base.map((o) => (o.parts as TaskParts)[area.key]);
    const followMean = mean(follow.map((o) => (o.parts as TaskParts)[area.key]));
    const baseMin = Math.min(...baseline);
    const baseMax = Math.max(...baseline);
    const position: Position = followMean < baseMin ? 'below' : followMean > baseMax ? 'above' : 'within';
    return { area, baseline, baseMean: mean(baseline), baseMin, baseMax, followMean, position };
  });
  return { ok: true, rows, baselineVisits: base.map((o) => o.visit), followupVisits: follow.map((o) => o.visit) };
}

export const POSITION_LABEL: Record<Position, Localised> = {
  below: L('Below own baseline range', 'أقل من نطاق خط الأساس الخاص', 'Di bawah rentang baseline sendiri'),
  within: L('Within own baseline range', 'ضمن نطاق خط الأساس الخاص', 'Dalam rentang baseline sendiri'),
  above: L('Above own baseline range', 'أعلى من نطاق خط الأساس الخاص', 'Di atas rentang baseline sendiri'),
};
