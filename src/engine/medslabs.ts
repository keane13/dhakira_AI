import { L, type ContextItem, type Localised } from './types';
import type { QuantityMeasure } from '../data/measures';

/**
 * Structured medicines and lab results, entered by staff from a lab report or a
 * medicine review. They feed the patient context, the reversible-cause work-up
 * and the FHIR export.
 *
 * Rules kept here on purpose:
 * - Lab interpretation uses only the reference range printed on the lab's own
 *   report. The app ships no reference ranges, because they differ by lab and method.
 * - Whether a medicine can affect thinking is marked by a clinician or pharmacist.
 *   The app ships no drug list. It only applies two count rules from the 2023 AGS
 *   Beers Criteria (S21), which are about combinations, not single drugs.
 */

export type LabId = 'b12' | 'folate' | 'tsh' | 'ft4' | 'hba1c' | 'glucose' | 'sodium' | 'calcium' | 'hb' | 'creatinine' | 'egfr';
export type WorkupLink = 'b12' | 'thyroid' | 'glucose';

export interface LabTest {
  id: LabId;
  name: Localised;
  /** LOINC code checked ACTIVE on tx.fhir.org on 2026-11-17, matched to the unit below. */
  loinc: string;
  display: string;
  unit: string;
  ucum: string;
  workup?: WorkupLink;
}

const lab = (id: LabId, name: Localised, loinc: string, display: string, unit: string, ucum: string, workup?: WorkupLink): LabTest =>
  ({ id, name, loinc, display, unit, ucum, workup });

/** SI units, as most UAE laboratories report. Each LOINC code is specific to its unit kind (molar or mass). */
export const LAB_TESTS: LabTest[] = [
  lab('b12', L('Vitamin B12', 'فيتامين ب12', 'Vitamin B12'), '14685-2', 'Cobalamin (Vitamin B12) [Moles/volume] in Serum or Plasma', 'pmol/L', 'pmol/L', 'b12'),
  lab('folate', L('Folate', 'الفولات', 'Folat'), '14732-2', 'Folate [Moles/volume] in Serum or Plasma', 'nmol/L', 'nmol/L', 'b12'),
  lab('tsh', L('TSH', 'الهرمون المنبه للدرقية', 'TSH'), '3016-3', 'Thyrotropin [Units/volume] in Serum or Plasma', 'mIU/L', 'm[IU]/L', 'thyroid'),
  lab('ft4', L('Free T4', 'T4 الحر', 'T4 bebas'), '14920-3', 'Thyroxine (T4) free [Moles/volume] in Serum or Plasma', 'pmol/L', 'pmol/L', 'thyroid'),
  lab('hba1c', L('HbA1c', 'السكر التراكمي', 'HbA1c'), '4548-4', 'Hemoglobin A1c/Hemoglobin.total in Blood', '%', '%', 'glucose'),
  lab('glucose', L('Fasting glucose', 'سكر الصيام', 'Gula darah puasa'), '14771-0', 'Fasting glucose [Moles/volume] in Serum or Plasma', 'mmol/L', 'mmol/L', 'glucose'),
  lab('sodium', L('Sodium', 'الصوديوم', 'Natrium'), '2951-2', 'Sodium [Moles/volume] in Serum or Plasma', 'mmol/L', 'mmol/L'),
  lab('calcium', L('Calcium', 'الكالسيوم', 'Kalsium'), '2000-8', 'Calcium [Moles/volume] in Serum or Plasma', 'mmol/L', 'mmol/L'),
  lab('hb', L('Haemoglobin', 'الهيموغلوبين', 'Hemoglobin'), '718-7', 'Hemoglobin [Mass/volume] in Blood', 'g/L', 'g/L'),
  lab('creatinine', L('Creatinine', 'الكرياتينين', 'Kreatinin'), '14682-9', 'Creatinine [Moles/volume] in Serum or Plasma', 'µmol/L', 'umol/L'),
  lab('egfr', L('eGFR (CKD-EPI)', 'معدل الترشيح الكبيبي المقدر (CKD-EPI)', 'eGFR (CKD-EPI)'), '62238-1', 'Glomerular filtration rate [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI)/1.73 sq M', 'mL/min/1.73 m²', 'mL/min/{1.73_m2}'),
];

export const labTest = (id: LabId) => LAB_TESTS.find((x) => x.id === id) as LabTest;

export interface LabResult {
  id: string;
  test: LabId;
  value: number;
  /** Date the sample was taken, as on the report. */
  date: string;
  /** The reference range printed on the lab report. At least one bound is required. */
  low: number | null;
  high: number | null;
  enteredBy: string;
}

export type Flag = 'L' | 'H' | 'N';

export function labFlag(r: Pick<LabResult, 'value' | 'low' | 'high'>): Flag {
  if (r.low !== null && r.value < r.low) return 'L';
  if (r.high !== null && r.value > r.high) return 'H';
  return 'N';
}

const num = (n: number | null): n is number => n !== null && Number.isFinite(n);

export function labProblems(r: LabResult, asOf: string): string[] {
  const p: string[] = [];
  if (!Number.isFinite(r.value) || r.value < 0) p.push('value');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date > asOf) p.push('date');
  if (!num(r.low) && !num(r.high)) p.push('range');
  else if (num(r.low) && num(r.high) && r.low >= r.high) p.push('range');
  return p;
}

export interface MedicineEntry {
  id: string;
  name: string;
  /** Dose and timing as written, for example "25 mg at night". */
  dose: string;
  source: 'patient' | 'care_partner' | 'pharmacy' | 'prescription';
  /** Seen on a prescription, pharmacy record or the packet, not only reported. */
  confirmed: boolean;
  withoutPrescription: boolean;
  /** Marked by a clinician or pharmacist. */
  anticholinergic: boolean;
  cnsActive: boolean;
  date: string;
  enteredBy: string;
}

export function medicineProblems(m: MedicineEntry): string[] {
  const p: string[] = [];
  if (!m.name.trim()) p.push('name');
  if (!m.dose.trim()) p.push('dose');
  return p;
}

export const SOURCE_LABEL: Record<MedicineEntry['source'], Localised> = {
  patient: L('Patient', 'المريض', 'Pasien'),
  care_partner: L('Care partner', 'مرافق الرعاية', 'Pendamping'),
  pharmacy: L('Pharmacy record', 'سجل الصيدلية', 'Catatan apotek'),
  prescription: L('Prescription', 'الوصفة الطبية', 'Resep'),
};

export interface MedicineSignal { key: 'unconfirmed' | 'anticholinergic' | 'cns' | 'otc'; text: Localised; sources: string[] }

/** Count rules only. Two or more anticholinergics, and three or more CNS-active medicines, are combination criteria in Beers 2023. */
export function medicineSignals(meds: MedicineEntry[]): MedicineSignal[] {
  const out: MedicineSignal[] = [];
  const unconfirmed = meds.filter((m) => !m.confirmed).length;
  const anti = meds.filter((m) => m.anticholinergic).length;
  const cns = meds.filter((m) => m.cnsActive).length;
  const otc = meds.filter((m) => m.withoutPrescription).length;
  if (unconfirmed) {
    const n = String(unconfirmed);
    out.push({ key: 'unconfirmed', sources: ['S14'], text: L(
      `Not yet confirmed against a prescription, pharmacy record or the packet: ${n}.`,
      `لم يُؤكَّد بعد مقابل وصفة أو سجل صيدلية أو العبوة: ${n}.`,
      `Belum dikonfirmasi dengan resep, catatan apotek, atau kemasan: ${n}.`,
    ) });
  }
  if (anti >= 2) {
    out.push({ key: 'anticholinergic', sources: ['S21'], text: L(
      `${anti} medicines marked as anticholinergic. Beers 2023 lists using several together as a combination to avoid in older adults. Review with a pharmacist.`,
      `${anti} أدوية مُعلَّمة بأنها مضادة للكولين. تذكر معايير Beers 2023 استخدام عدة منها معًا كتركيبة يُتجنب استخدامها لدى كبار السن. راجعها مع صيدلي.`,
      `${anti} obat ditandai antikolinergik. Beers 2023 mencantumkan penggunaan beberapa sekaligus sebagai kombinasi yang dihindari pada lansia. Tinjau bersama apoteker.`,
    ) });
  }
  if (cns >= 3) {
    out.push({ key: 'cns', sources: ['S21'], text: L(
      `${cns} medicines marked as acting on the brain. Beers 2023 lists three or more from certain classes together as a combination to avoid. Review with a pharmacist.`,
      `${cns} أدوية مُعلَّمة بأنها تؤثر في الدماغ. تذكر معايير Beers 2023 استخدام ثلاثة أو أكثر من فئات معينة معًا كتركيبة يُتجنب استخدامها. راجعها مع صيدلي.`,
      `${cns} obat ditandai bekerja pada otak. Beers 2023 mencantumkan tiga atau lebih dari golongan tertentu sekaligus sebagai kombinasi yang dihindari. Tinjau bersama apoteker.`,
    ) });
  }
  if (otc) {
    const n = String(otc);
    out.push({ key: 'otc', sources: ['S14'], text: L(
      `Bought without a prescription: ${n}. Ask about sleep aids, cold and allergy remedies, and herbal products.`,
      `اشتُري دون وصفة: ${n}. اسأل عن المنومات وأدوية البرد والحساسية والمنتجات العشبية.`,
      `Dibeli tanpa resep: ${n}. Tanyakan obat tidur, obat flu dan alergi, serta produk herbal.`,
    ) });
  }
  return out;
}

const NOT_SUPPLIED = L('Not supplied', 'غير متوفر', 'Tidak tersedia');
const FLAG_TEXT: Record<Flag, Localised> = {
  L: L('below the lab\'s range', 'أقل من نطاق المختبر', 'di bawah rentang lab'),
  H: L('above the lab\'s range', 'أعلى من نطاق المختبر', 'di atas rentang lab'),
  N: L('within the lab\'s range', 'ضمن نطاق المختبر', 'dalam rentang lab'),
};

export function rangeText(r: Pick<LabResult, 'low' | 'high'>, unit: string): string {
  if (num(r.low) && num(r.high)) return `${r.low} to ${r.high} ${unit}`;
  if (num(r.low)) return `≥ ${r.low} ${unit}`;
  return `≤ ${r.high} ${unit}`;
}

/** Latest result per test, newest first by sample date. */
export function latestLabs(labs: LabResult[]): LabResult[] {
  const by = new Map<LabId, LabResult>();
  for (const r of [...labs].sort((a, b) => a.date.localeCompare(b.date))) by.set(r.test, r);
  return [...by.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function labLine(r: LabResult): Localised {
  const test = labTest(r.test);
  const flag = FLAG_TEXT[labFlag(r)];
  const head = `${r.value} ${test.unit}`;
  return L(`${head}, ${flag.en}`, `${head}، ${flag.ar}`, `${head}, ${flag.id}`);
}

function labItem(r: LabResult): ContextItem {
  const test = labTest(r.test);
  const flag = labFlag(r);
  const measure: QuantityMeasure = {
    kind: 'quantity', loinc: test.loinc, display: test.display, category: 'laboratory',
    value: r.value, unit: test.unit, ucum: test.ucum,
    range: { low: r.low, high: r.high }, interpretation: flag,
  };
  return {
    id: `lab-${r.test}`,
    domain: 'metabolic',
    label: test.name,
    value: labLine(r),
    status: flag === 'N' ? 'ok' : 'attention',
    source: L(`Lab report, entered by ${r.enteredBy}`, `تقرير مختبر، أدخله ${r.enteredBy}`, `Laporan lab, dimasukkan oleh ${r.enteredBy}`),
    date: r.date,
    consent: 'clinical',
    contributor: 'metabolic',
    measure,
  };
}

function medsItem(meds: MedicineEntry[]): ContextItem {
  const signals = medicineSignals(meds);
  const flagged = meds.some((m) => m.anticholinergic || m.cnsActive);
  const line = (m: MedicineEntry, lang: 'en' | 'ar' | 'id') => {
    const notes: string[] = [];
    if (!m.confirmed) notes.push({ en: 'not confirmed', ar: 'غير مؤكد', id: 'belum dikonfirmasi' }[lang]);
    if (m.anticholinergic || m.cnsActive) notes.push({ en: 'may affect thinking', ar: 'قد يؤثر في التفكير', id: 'dapat memengaruhi daya pikir' }[lang]);
    return `${m.name.trim()} ${m.dose.trim()}${notes.length ? ` (${notes.join(', ')})` : ''}`;
  };
  const list = (lang: 'en' | 'ar' | 'id') => meds.map((m) => line(m, lang)).join(lang === 'ar' ? '؛ ' : '; ');
  const latest = meds.map((m) => m.date).sort().at(-1) ?? null;
  return {
    id: 'meds',
    domain: 'medication',
    label: L('Medicines', 'الأدوية', 'Obat'),
    value: L(list('en'), list('ar'), list('id')),
    status: signals.some((s) => s.key !== 'otc') || flagged ? 'attention' : 'ok',
    source: L('Medicine review entered in the app', 'مراجعة أدوية مُدخلة في التطبيق', 'Tinjauan obat yang dimasukkan di aplikasi'),
    date: latest,
    consent: 'clinical',
    contributor: 'medicines',
  };
}

/**
 * Entered values replace the authored summaries they cover. The authored "B12 and
 * thyroid" item is replaced as soon as either is entered, and whichever is still
 * missing stays visible as not supplied.
 */
export function mergeContext(base: ContextItem[], labs: LabResult[], meds: MedicineEntry[]): ContextItem[] {
  const latest = latestLabs(labs);
  if (!latest.length && !meds.length) return base;
  const has = (id: LabId) => latest.some((r) => r.test === id);
  const out: ContextItem[] = [];
  for (const item of base) {
    if (item.id === 'meds' && meds.length) continue;
    if (item.id === 'hba1c' && has('hba1c')) continue;
    if (item.id === 'b12' && (has('b12') || has('folate') || has('tsh') || has('ft4'))) {
      const missing: [LabId, boolean][] = [['b12', has('b12')], ['tsh', has('tsh') || has('ft4')]];
      for (const [id, present] of missing) {
        if (!present) {
          out.push({ id: `lab-${id}`, domain: 'metabolic', label: labTest(id).name, value: null, status: 'unknown', source: NOT_SUPPLIED, date: null, consent: 'clinical', contributor: 'metabolic' });
        }
      }
      continue;
    }
    out.push(item);
  }
  return [...(meds.length ? [medsItem(meds)] : []), ...latest.map(labItem), ...out];
}

/** Lines for the matching reversible-cause row: what has been entered, so the clinician can record a finding. */
export function workupEvidence(link: WorkupLink | 'meds', labs: LabResult[], meds: MedicineEntry[]): Localised[] {
  if (link === 'meds') {
    if (!meds.length) return [];
    const n = String(meds.length);
    const count = meds.length === 1
      ? L('1 medicine entered', 'دواء واحد مُدخل', '1 obat dimasukkan')
      : L(`${n} medicines entered`, `${n} أدوية مُدخلة`, `${n} obat dimasukkan`);
    return [count, ...medicineSignals(meds).map((s) => s.text)];
  }
  return latestLabs(labs)
    .filter((r) => labTest(r.test).workup === link)
    .map((r) => {
      const line = labLine(r);
      const name = labTest(r.test).name;
      return L(`${name.en} ${line.en}, ${r.date}`, `${name.ar} ${line.ar}، ${r.date}`, `${name.id} ${line.id}, ${r.date}`);
    });
}
