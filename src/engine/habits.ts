import { L, type Case, type Localised } from './types';

/**
 * Brain-health habits over time. Weekly values come from an authorised wearable
 * (sleep, activity) or from what the patient reports to a nurse (social contact).
 * Habits add context. They never change the route.
 */

export interface HabitWeek {
  week: string;
  sleepHours: number | null;
  activeMinutes: number | null;
  socialDays: number | null;
  source: 'wearable' | 'reported';
}

export type HabitKey = 'sleepHours' | 'activeMinutes' | 'socialDays';

export interface HabitDef {
  key: HabitKey;
  label: Localised;
  unit: Localised;
  /** A published reference line. Null when no defensible single number exists. */
  reference: { value: number; text: Localised; source: string } | null;
  max: number;
  needsWearable: boolean;
}

export const HABITS: HabitDef[] = [
  {
    key: 'sleepHours',
    label: L('Sleep per night', 'النوم في الليلة', 'Tidur per malam'),
    unit: L('hours, weekly average', 'ساعات، متوسط أسبوعي', 'jam, rata-rata mingguan'),
    reference: { value: 7, text: L('7 hours, adult consensus', '7 ساعات، توافق للبالغين', '7 jam, konsensus dewasa'), source: 'S16' },
    max: 10,
    needsWearable: true,
  },
  {
    key: 'activeMinutes',
    label: L('Moderate activity', 'النشاط المعتدل', 'Aktivitas sedang'),
    unit: L('minutes a week', 'دقيقة في الأسبوع', 'menit per minggu'),
    reference: { value: 150, text: L('150 minutes, WHO lower bound', '150 دقيقة، الحد الأدنى لمنظمة الصحة العالمية', '150 menit, batas bawah WHO'), source: 'S15' },
    max: 320,
    needsWearable: true,
  },
  {
    key: 'socialDays',
    label: L('Days with social contact', 'أيام التواصل الاجتماعي', 'Hari dengan kontak sosial'),
    unit: L('days a week, reported', 'أيام في الأسبوع، مُبلّغ عنها', 'hari per minggu, dilaporkan'),
    reference: null,
    max: 7,
    needsWearable: false,
  },
];

interface Profile { sleep: [number, number]; active: [number, number]; social: [number, number] }

/** Start and end values for 12 authored weeks. Values are fictional and match each case's context. */
const PROFILES: Record<string, Profile> = {
  'SYN-102': { sleep: [6.9, 5.1], active: [110, 60], social: [5, 3] },
  'SYN-101': { sleep: [7.1, 7.0], active: [70, 95], social: [6, 6] },
  'SYN-103': { sleep: [7.2, 6.4], active: [210, 200], social: [5, 5] },
  'SYN-104': { sleep: [7.0, 6.8], active: [140, 130], social: [4, 2] },
  'SYN-105': { sleep: [6.6, 6.5], active: [90, 80], social: [2, 1] },
  'SYN-106': { sleep: [6.8, 6.9], active: [160, 170], social: [4, 4] },
  'SYN-107': { sleep: [6.5, 6.0], active: [40, 30], social: [6, 6] },
  'SYN-108': { sleep: [7.0, 5.5], active: [150, 70], social: [5, 1] },
};

const weekStart = (end: string, back: number) => {
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back * 7);
  return d.toISOString().slice(0, 10);
};

/** Deterministic, so the same patient always shows the same history. */
export function authoredHabits(c: Case): HabitWeek[] {
  const p = PROFILES[c.id];
  const end = c.observations.at(-1)?.date;
  if (!p || !end) return [];
  const wobble = [0, 0.15, -0.1, 0.05, -0.15, 0.1, 0, -0.05, 0.1, -0.1, 0.05, 0];
  return Array.from({ length: 12 }, (_, i) => {
    const f = i / 11;
    const lerp = ([a, b]: [number, number]) => a + (b - a) * f;
    return {
      week: weekStart(end, 11 - i),
      sleepHours: Math.round((lerp(p.sleep) + wobble[i] * 0.6) * 10) / 10,
      activeMinutes: Math.max(0, Math.round(lerp(p.active) + wobble[i] * 40)),
      socialDays: Math.max(0, Math.min(7, Math.round(lerp(p.social) + wobble[i] * 2))),
      source: 'wearable',
    };
  });
}

/** Without wearable consent, wearable values are removed rather than shown as zero. */
export function visibleHabits(c: Case, logged: HabitWeek[]): HabitWeek[] {
  const wearable = c.consent.wearable;
  const authored = authoredHabits(c).map((w) => (wearable ? w : { ...w, sleepHours: null, activeMinutes: null }));
  return [...authored, ...logged].sort((a, b) => a.week.localeCompare(b.week));
}

export interface HabitSignal { key: HabitKey; text: Localised }

/**
 * A habit signal is a pattern worth discussing: the last three weeks below the
 * reference, or a fall of a third or more from the first four weeks.
 */
export function habitSignals(weeks: HabitWeek[]): HabitSignal[] {
  const out: HabitSignal[] = [];
  for (const h of HABITS) {
    const vals = weeks.map((w) => w[h.key]).filter((v): v is number => v !== null);
    if (vals.length < 6) continue;
    const last3 = vals.slice(-3);
    if (h.reference && last3.every((v) => v < (h.reference as { value: number }).value)) {
      out.push({ key: h.key, text: L(`${h.label.en}: below the reference for the last 3 weeks`, `${h.label.ar}: دون المرجع في آخر 3 أسابيع`, `${h.label.id}: di bawah rujukan selama 3 minggu terakhir`) });
      continue;
    }
    const first = vals.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
    const recent = last3.reduce((a, b) => a + b, 0) / 3;
    if (first > 0 && recent <= first * (2 / 3)) {
      out.push({ key: h.key, text: L(`${h.label.en}: down by a third or more since the start`, `${h.label.ar}: انخفض بمقدار الثلث أو أكثر منذ البداية`, `${h.label.id}: turun sepertiga atau lebih sejak awal`) });
    }
  }
  return out;
}

export function validLog(w: Partial<HabitWeek>): w is HabitWeek {
  const inRange = (v: unknown, max: number) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max);
  return typeof w.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.week)
    && inRange(w.sleepHours ?? null, 16) && inRange(w.activeMinutes ?? null, 2000) && inRange(w.socialDays ?? null, 7);
}
