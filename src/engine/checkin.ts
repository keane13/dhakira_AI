import { idOf } from '../i18n';
import { L, type Conditions, type FunctionReport, type Localised, type Mode, type AssessmentLanguage, type Observation, type Case, type TaskParts } from './types';

/**
 * The brief check. Four parts total 10 points so a live result sits on the same
 * scale as the authored series. Items are original and unvalidated: this is a
 * prototype of a monitoring approach, not a scored instrument.
 */

export interface PictureItem { id: string; glyph: string; label: Localised }

const P = (id: string, glyph: string, en: string, ar: string): PictureItem => ({ id, glyph, label: L(en, ar) });

/** Everyday items chosen to be familiar locally. They need cultural review before any real use. */
const PICTURES: PictureItem[] = [
  P('palm', '🌴', 'Palm tree', 'نخلة'),
  P('coffee', '☕', 'Coffee', 'قهوة'),
  P('camel', '🐫', 'Camel', 'جمل'),
  P('key', '🔑', 'Key', 'مفتاح'),
  P('fish', '🐟', 'Fish', 'سمكة'),
  P('lemon', '🍋', 'Lemon', 'ليمونة'),
  P('shoe', '👟', 'Shoe', 'حذاء'),
  P('umbrella', '☂️', 'Umbrella', 'مظلة'),
  P('phone', '📞', 'Phone', 'هاتف'),
  P('car', '🚗', 'Car', 'سيارة'),
  P('rice', '🍚', 'Rice', 'أرز'),
  P('goat', '🐐', 'Goat', 'ماعز'),
  P('clock', '🕰️', 'Clock', 'ساعة'),
  P('chair', '🪑', 'Chair', 'كرسي'),
  P('basket', '🧺', 'Basket', 'سلة'),
  P('book', '📖', 'Book', 'كتاب'),
  P('boat', '⛵', 'Boat', 'قارب'),
  P('moon', '🌙', 'Moon', 'قمر'),
  P('bread', '🫓', 'Bread', 'خبز'),
  P('door', '🚪', 'Door', 'باب'),
];

const pic = (id: string) => PICTURES.find((p) => p.id === id) as PictureItem;

export type FormId = 'A' | 'B' | 'C';

export type Shape = 'circle' | 'diamond' | 'square' | 'triangle';
export type Fill = 'solid' | 'outline';

export interface SwitchTrial {
  rule: 'shape' | 'fill';
  target: { shape: Shape; fill: Fill };
  options: [{ shape: Shape; fill: Fill }, { shape: Shape; fill: Fill }];
  answer: 0 | 1;
}

export interface CheckForm {
  id: FormId;
  learn: string[];
  lures: string[];
  sequences: [number[], number[]];
  searches: [{ target: Shape; grid: Shape[] }, { target: Shape; grid: Shape[] }];
  switches: SwitchTrial[];
}

const c = 'circle' as const, d = 'diamond' as const, s = 'square' as const, t = 'triangle' as const;

export const FORMS: Record<FormId, CheckForm> = {
  A: {
    id: 'A',
    learn: ['palm', 'key', 'fish', 'shoe', 'clock'],
    lures: ['coffee', 'lemon', 'car', 'chair', 'moon'],
    sequences: [[2, 0, 3], [1, 3, 0, 2]],
    searches: [
      { target: c, grid: [c, d, d, c, d, c, d, d, c] },
      { target: d, grid: [s, d, s, d, s, s, d, s, d] },
    ],
    switches: [
      { rule: 'shape', target: { shape: c, fill: 'solid' }, options: [{ shape: c, fill: 'outline' }, { shape: s, fill: 'solid' }], answer: 0 },
      { rule: 'fill', target: { shape: c, fill: 'solid' }, options: [{ shape: c, fill: 'outline' }, { shape: s, fill: 'solid' }], answer: 1 },
      { rule: 'fill', target: { shape: s, fill: 'outline' }, options: [{ shape: c, fill: 'outline' }, { shape: s, fill: 'solid' }], answer: 0 },
      { rule: 'shape', target: { shape: s, fill: 'outline' }, options: [{ shape: c, fill: 'outline' }, { shape: s, fill: 'solid' }], answer: 1 },
    ],
  },
  B: {
    id: 'B',
    learn: ['coffee', 'camel', 'umbrella', 'rice', 'door'],
    lures: ['palm', 'phone', 'goat', 'book', 'bread'],
    sequences: [[1, 2, 0], [3, 0, 2, 1]],
    searches: [
      { target: t, grid: [t, s, t, s, s, t, s, t, s] },
      { target: c, grid: [d, c, d, d, c, c, d, c, d] },
    ],
    switches: [
      { rule: 'fill', target: { shape: t, fill: 'solid' }, options: [{ shape: t, fill: 'outline' }, { shape: d, fill: 'solid' }], answer: 1 },
      { rule: 'shape', target: { shape: t, fill: 'solid' }, options: [{ shape: t, fill: 'outline' }, { shape: d, fill: 'solid' }], answer: 0 },
      { rule: 'shape', target: { shape: d, fill: 'outline' }, options: [{ shape: t, fill: 'outline' }, { shape: d, fill: 'solid' }], answer: 1 },
      { rule: 'fill', target: { shape: d, fill: 'outline' }, options: [{ shape: t, fill: 'outline' }, { shape: d, fill: 'solid' }], answer: 0 },
    ],
  },
  C: {
    id: 'C',
    learn: ['lemon', 'car', 'basket', 'boat', 'moon'],
    lures: ['fish', 'key', 'chair', 'door', 'rice'],
    sequences: [[3, 1, 2], [0, 2, 3, 1]],
    searches: [
      { target: s, grid: [s, c, c, s, s, c, c, s, c] },
      { target: t, grid: [d, t, t, d, d, t, d, d, t] },
    ],
    switches: [
      { rule: 'shape', target: { shape: c, fill: 'outline' }, options: [{ shape: c, fill: 'solid' }, { shape: t, fill: 'outline' }], answer: 0 },
      { rule: 'shape', target: { shape: t, fill: 'solid' }, options: [{ shape: c, fill: 'solid' }, { shape: t, fill: 'outline' }], answer: 1 },
      { rule: 'fill', target: { shape: t, fill: 'solid' }, options: [{ shape: c, fill: 'solid' }, { shape: t, fill: 'outline' }], answer: 0 },
      { rule: 'fill', target: { shape: c, fill: 'outline' }, options: [{ shape: c, fill: 'solid' }, { shape: t, fill: 'outline' }], answer: 1 },
    ],
  },
};

/** Rotates forms across visits to limit learning the items. */
export const formForVisit = (visit: number): FormId => (['A', 'B', 'C'] as FormId[])[(visit - 1) % 3];

export const learnItems = (f: CheckForm) => f.learn.map(pic);

/** Mixed in a fixed order per form, so the recognition screen is the same for everyone. */
export function recognitionItems(f: CheckForm): PictureItem[] {
  const out: PictureItem[] = [];
  f.learn.forEach((id, i) => { out.push(pic(id)); out.push(pic(f.lures[i])); });
  // Each multiplier is coprime with 10, so every item appears exactly once.
  const shift = { A: 3, B: 7, C: 9 }[f.id];
  return out.map((_, i) => out[(i * shift) % out.length]);
}

/** Up to 4 points: hits minus false alarms, floored at zero. */
export function scoreRecall(f: CheckForm, chosen: string[]): number {
  const hits = chosen.filter((id) => f.learn.includes(id)).length;
  const falseAlarms = chosen.length - hits;
  return Math.min(4, Math.max(0, hits - falseAlarms));
}

/** One point per sequence repeated exactly. */
export function scoreSequences(f: CheckForm, responses: number[][]): number {
  return f.sequences.filter((seq, i) => {
    const r = responses[i] ?? [];
    return r.length === seq.length && seq.every((v, j) => v === r[j]);
  }).length;
}

/** One point per grid with every target found and nothing else selected. */
export function scoreSearches(f: CheckForm, selections: number[][]): number {
  return f.searches.filter((search, i) => {
    const targets = search.grid.flatMap((shape, idx) => (shape === search.target ? [idx] : []));
    const chosen = selections[i] ?? [];
    return chosen.length === targets.length && targets.every((idx) => chosen.includes(idx));
  }).length;
}

/** Four trials: all correct scores 2, three correct scores 1, otherwise 0. */
export function scoreSwitching(f: CheckForm, answers: number[]): number {
  const correct = f.switches.filter((trial, i) => answers[i] === trial.answer).length;
  return correct === 4 ? 2 : correct === 3 ? 1 : 0;
}

export type CheckParts = TaskParts;
export const totalScore = (p: CheckParts) => p.recall + p.sequence + p.search + p.switching;

export const FUNCTION_ITEMS: Localised[] = [
  L('Managing medicines', 'إدارة الأدوية'),
  L('Handling money and bills', 'التعامل مع المال والفواتير'),
  L('Finding the way or driving on familiar routes', 'معرفة الطريق أو القيادة في طرق مألوفة'),
  L('Using the phone or messaging family', 'استخدام الهاتف أو مراسلة العائلة'),
  L('Keeping track of appointments and daily routines, such as prayer times where relevant', 'متابعة المواعيد والروتين اليومي، مثل مواقيت الصلاة عند الاقتضاء'),
  L('Preparing food or taking part in household tasks', 'إعداد الطعام أو المشاركة في أعمال المنزل'),
];

/**
 * Answers: 0 no change, 1 some change, 2 major change.
 * One "some" is noted for discussion. Two or more, or any "major", is reported function change.
 */
export function functionLevel(answers: number[]): 0 | 1 | 2 {
  if (answers.some((a) => a === 2)) return 2;
  return answers.filter((a) => a === 1).length >= 2 ? 1 : 0;
}

export interface LiveCheck {
  parts: CheckParts;
  language: AssessmentLanguage;
  mode: Mode;
  form: FormId;
  conditions: Conditions;
  functionAnswers: number[];
  reporter: FunctionReport['reporter'];
  date: string;
  administration: 'device' | 'staff-paper';
}

export function toObservation(c: Case, extras: Observation[], check: LiveCheck): Observation {
  return {
    visit: c.observations.length + extras.length + 1,
    date: check.date,
    score: totalScore(check.parts),
    language: check.language,
    mode: check.mode,
    form: check.form,
    conditions: check.conditions,
    source: 'live-check',
    administration: check.administration,
    parts: { ...check.parts },
  };
}

export function toFunctionReport(check: LiveCheck): FunctionReport {
  const noted = FUNCTION_ITEMS.filter((_, i) => check.functionAnswers[i] > 0);
  const level = functionLevel(check.functionAnswers);
  return {
    date: check.date,
    reporter: check.reporter,
    level,
    note: noted.length
      ? L(`Change noted in: ${noted.map((n) => n.en).join('; ')}`, `تغيّر ملحوظ في: ${noted.map((n) => n.ar).join('؛ ')}`, `Perubahan tercatat pada: ${noted.map((n) => idOf(n)).join('; ')}`)
      : L('No change reported', 'لا تغيير مبلّغ عنه'),
    source: 'live-check',
  };
}
