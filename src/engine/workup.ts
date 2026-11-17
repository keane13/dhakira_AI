import { L, type ContributorId, type Localised, type PipelineRun } from './types';

/**
 * Reversible-cause work-up. The tool lists what a clinician may want to rule out
 * and records what they found. It never decides a cause: a finding stays the
 * clinician's entry, and none of it changes the route.
 */

export type WorkupStatus = 'not_started' | 'ordered' | 'normal' | 'abnormal' | 'not_needed';

export interface WorkupItemDef {
  id: string;
  label: Localised;
  why: Localised;
  contributor: ContributorId;
  sources: string[];
}

export const WORKUP_ITEMS: WorkupItemDef[] = [
  {
    id: 'meds', contributor: 'medicines', sources: ['S14'],
    label: L('Medicine review, including sleep aids and anticholinergic load', 'مراجعة الأدوية، بما فيها المنومات والأدوية ذات التأثير المضاد للكولين', 'Tinjauan obat, termasuk obat tidur dan beban antikolinergik'),
    why: L('Some medicines affect attention and memory, and the effect can reverse when they are changed.', 'تؤثر بعض الأدوية في الانتباه والذاكرة، وقد يزول الأثر عند تغييرها.', 'Beberapa obat memengaruhi perhatian dan memori, dan efeknya bisa hilang bila obat diganti.'),
  },
  {
    id: 'b12', contributor: 'metabolic', sources: ['S14'],
    label: L('Vitamin B12 level', 'مستوى فيتامين ب12', 'Kadar vitamin B12'),
    why: L('Low B12 can affect thinking and can be treated.', 'قد يؤثر نقص فيتامين ب12 في التفكير، ويمكن علاجه.', 'B12 yang rendah bisa memengaruhi daya pikir dan bisa diobati.'),
  },
  {
    id: 'thyroid', contributor: 'metabolic', sources: ['S14'],
    label: L('Thyroid function', 'وظيفة الغدة الدرقية', 'Fungsi tiroid'),
    why: L('An underactive or overactive thyroid can change mood, energy and thinking.', 'قد يغيّر خمول الغدة الدرقية أو فرط نشاطها المزاج والطاقة والتفكير.', 'Tiroid yang kurang aktif atau terlalu aktif bisa mengubah suasana hati, energi, dan daya pikir.'),
  },
  {
    id: 'glucose', contributor: 'metabolic', sources: ['S4', 'S14'],
    label: L('Glucose control and lipids', 'ضبط السكر والدهون', 'Kontrol gula darah dan lemak darah'),
    why: L('Poorly controlled diabetes and high LDL are modifiable risks, and low glucose episodes can cause confusion.', 'السكري غير المنضبط وارتفاع الكوليسترول الضار خطران قابلان للتعديل، وقد تسبب نوبات انخفاض السكر ارتباكًا.', 'Diabetes yang tidak terkontrol dan LDL tinggi adalah risiko yang bisa diubah, dan episode gula darah rendah bisa menyebabkan kebingungan.'),
  },
  {
    id: 'mood', contributor: 'mood', sources: ['S4', 'S14'],
    label: L('Validated mood screen', 'فحص مزاج معتمد', 'Skrining suasana hati yang tervalidasi'),
    why: L('Depression can look like memory change and is treatable.', 'قد يبدو الاكتئاب كتغيّر في الذاكرة، وهو قابل للعلاج.', 'Depresi bisa tampak seperti perubahan memori dan bisa diobati.'),
  },
  {
    id: 'sleep', contributor: 'sleep', sources: ['S14', 'S16'],
    label: L('Sleep history and screening for sleep apnoea', 'تاريخ النوم وفحص انقطاع النفس أثناء النوم', 'Riwayat tidur dan skrining apnea tidur'),
    why: L('Short, broken or apnoeic sleep lowers attention and memory and can be treated.', 'يخفض النوم القصير أو المتقطع أو المصحوب بانقطاع النفس الانتباه والذاكرة، ويمكن علاجه.', 'Tidur yang pendek, terputus, atau disertai apnea menurunkan perhatian dan memori, dan bisa ditangani.'),
  },
  {
    id: 'hearing', contributor: 'sensory', sources: ['S4', 'S5'],
    label: L('Hearing test', 'فحص السمع', 'Tes pendengaran'),
    why: L('Hearing loss can look like cognitive change and is a modifiable risk.', 'قد يبدو فقدان السمع كتغيّر إدراكي، وهو خطر قابل للتعديل.', 'Gangguan pendengaran bisa tampak seperti perubahan kognitif dan merupakan risiko yang bisa diubah.'),
  },
  {
    id: 'vision', contributor: 'sensory', sources: ['S4'],
    label: L('Vision check', 'فحص البصر', 'Pemeriksaan penglihatan'),
    why: L('Poor vision affects visual tasks and is a modifiable risk.', 'يؤثر ضعف البصر في المهام البصرية، وهو خطر قابل للتعديل.', 'Penglihatan yang buruk memengaruhi tugas visual dan merupakan risiko yang bisa diubah.'),
  },
];

export interface WorkupEntry { status: WorkupStatus; note: string; date: string }
export type WorkupState = Record<string, WorkupEntry>;

export const STATUS_LABEL: Record<WorkupStatus, Localised> = {
  not_started: L('Not started', 'لم يبدأ', 'Belum dimulai'),
  ordered: L('Ordered or booked', 'طُلب أو حُجز', 'Sudah dipesan atau dijadwalkan'),
  normal: L('Done, no concern', 'تم، دون قلق', 'Selesai, tidak ada masalah'),
  abnormal: L('Done, needs follow-up', 'تم، يحتاج إلى متابعة', 'Selesai, perlu tindak lanjut'),
  not_needed: L('Not needed for this patient', 'غير مطلوب لهذا المريض', 'Tidak diperlukan untuk pasien ini'),
};

export interface WorkupRow extends WorkupItemDef {
  /** Suggested when the patient's own context points to this contributor. */
  suggested: boolean;
  entry: WorkupEntry;
}

export function workupRows(run: PipelineRun, saved: WorkupState | undefined): WorkupRow[] {
  const flagged = new Set(run.contributors.map((c) => c.id));
  return WORKUP_ITEMS
    .map((item) => ({
      ...item,
      suggested: flagged.has(item.contributor),
      entry: saved?.[item.id] ?? { status: 'not_started' as const, note: '', date: '' },
    }))
    .sort((a, b) => Number(b.suggested) - Number(a.suggested));
}

export interface WorkupSummary {
  suggested: number;
  open: number;
  ruledOut: number;
  needsFollowUp: number;
}

/** Counts only: what is still open, ruled out, or found. It never names a cause. */
export function summariseWorkup(rows: WorkupRow[]): WorkupSummary {
  const relevant = rows.filter((r) => r.suggested || r.entry.status !== 'not_started');
  return {
    suggested: rows.filter((r) => r.suggested).length,
    open: relevant.filter((r) => r.entry.status === 'not_started' || r.entry.status === 'ordered').length,
    ruledOut: relevant.filter((r) => r.entry.status === 'normal' || r.entry.status === 'not_needed').length,
    needsFollowUp: relevant.filter((r) => r.entry.status === 'abnormal').length,
  };
}
