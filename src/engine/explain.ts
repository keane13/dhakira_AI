import { fmt } from './scoring';
import type { ChangeResult, Lang } from './types';

export interface Explanation {
  en: { headline: string; body: string };
  ar: { headline: string; body: string };
  id: { headline: string; body: string };
}

export const EXPLANATION_LANGS: Lang[] = ['en', 'ar', 'id'];

/** Deterministic wording used whenever no live model passes its checks. */
export function templateExplanation(r: ChangeResult): Explanation {
  const b = fmt(r.baselineMean), f = fmt(r.followupMean), a = fmt(r.adjustedChange), g = fmt(r.practiceGain);
  const lo = fmt(r.ci95[0]), hi = fmt(r.ci95[1]);
  const excludesZero = r.ci95[1] < 0 || r.ci95[0] > 0;
  return {
    en: {
      headline: r.adjustedChange < 0 ? 'Lower follow-up result after the practice adjustment' : 'No fall in the follow-up result after the practice adjustment',
      body: `The average went from ${b} at baseline to ${f} at follow-up, out of 10. After allowing ${g} for practice, the change is ${a} tasks, with an illustrative 95% interval from ${lo} to ${hi}. ${excludesZero ? 'That interval lies on one side of zero under the demonstration assumptions.' : 'That interval includes zero under the demonstration assumptions.'} This is a task result, not a diagnosis, and it does not explain the cause.`,
    },
    ar: {
      headline: r.adjustedChange < 0 ? 'نتيجة متابعة أقل بعد تعديل أثر التمرين' : 'لا انخفاض في نتيجة المتابعة بعد تعديل أثر التمرين',
      body: `انتقل المتوسط من ${b} عند خط الأساس إلى ${f} عند المتابعة، من أصل 10. بعد احتساب ${g} لأثر التمرين، يبلغ التغيّر ${a} مهمة، بفاصل توضيحي 95% من ${lo} إلى ${hi}. ${excludesZero ? 'يقع هذا الفاصل على جانب واحد من الصفر وفق افتراضات العرض.' : 'يشمل هذا الفاصل الصفر وفق افتراضات العرض.'} هذه نتيجة مهمة وليست تشخيصًا، ولا تفسر السبب.`,
    },
    id: {
      headline: r.adjustedChange < 0 ? 'Hasil tindak lanjut lebih rendah setelah koreksi efek latihan' : 'Hasil tindak lanjut tidak turun setelah koreksi efek latihan',
      body: `Rata-rata berubah dari ${b} saat baseline menjadi ${f} saat tindak lanjut, dari 10. Setelah memperhitungkan ${g} untuk efek latihan, perubahannya ${a} tugas, dengan interval ilustratif 95% dari ${lo} sampai ${hi}. ${excludesZero ? 'Interval itu berada di satu sisi nol menurut asumsi demo.' : 'Interval itu mencakup nol menurut asumsi demo.'} Ini hasil tugas, bukan diagnosis, dan tidak menjelaskan penyebabnya.`,
    },
  };
}

/** Every number a model may print: the tool's results, the inputs and the scale. */
export function allowedNumbers(r: ChangeResult): Set<string> {
  const values = [
    r.baselineMean, r.followupMean, r.observedChange, r.practiceGain, r.adjustedChange,
    r.se, r.z, r.ci95[0], r.ci95[1],
  ];
  const out = new Set<string>(['10', '95']);
  for (const v of values) {
    for (const dp of [0, 1, 2, 3]) {
      out.add(Math.abs(Number(v.toFixed(dp))).toString());
      out.add(Math.abs(v).toFixed(dp));
    }
  }
  for (const v of r.values) out.add(String(v));
  return out;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Finds every number in a text, including Arabic-Indic digits, without its sign. */
export function numbersIn(text: string): string[] {
  const normal = text.replace(/[٠-٩]/g, (ch) => String(ARABIC_DIGITS.indexOf(ch))).replace(/٫/g, '.');
  return normal.match(/\d+(?:\.\d+)?/g) ?? [];
}

const FORBIDDEN: RegExp[] = [
  /alzheimer/i, /dementia/i, /\bmci\b/i, /you have\b/i, /\bdiagnosed\b/i, /\bprognosis\b/i,
  /\brefer(?:red|ral)?\s+to\b/i, /\bprescrib/i, /\btreatment\b/i,
  /الزهايمر/, /ألزهايمر/, /الخرف/, /خرف/, /تم تشخيص/, /مصاب ب/, /وصف علاج/,
  /demensia/i, /pikun/i, /didiagnosis/i, /anda menderita/i, /\bresep\b/i, /\bpengobatan\b/i,
];

export interface GuardResult { ok: boolean; problems: string[] }

/**
 * Deterministic checks on model output. Any failure discards the model text and
 * the record shows the labelled template instead.
 */
export function checkExplanation(e: unknown, r: ChangeResult): GuardResult {
  const problems: string[] = [];
  const x = e as Partial<Explanation> | null;
  const texts: [Lang, string][] = [];
  for (const lang of EXPLANATION_LANGS) {
    const part = x?.[lang];
    if (!part || typeof part.headline !== 'string' || typeof part.body !== 'string' || !part.headline.trim() || !part.body.trim()) {
      problems.push(`schema: missing ${lang} text`);
    } else {
      texts.push([lang, `${part.headline} ${part.body}`]);
    }
  }
  const allowed = allowedNumbers(r);
  for (const [lang, text] of texts) {
    for (const n of numbersIn(text)) {
      if (!allowed.has(n)) problems.push(`number ${n} in ${lang} text is not in the tool result`);
    }
    for (const rx of FORBIDDEN) {
      if (rx.test(text)) problems.push(`forbidden wording in ${lang} text: ${rx.source}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
