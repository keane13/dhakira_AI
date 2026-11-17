import { describe, expect, it } from 'vitest';
import { caseById } from '../src/data/cases';
import { runPipeline } from '../src/engine/pipeline';
import { summariseWorkup, workupRows, WORKUP_ITEMS } from '../src/engine/workup';
import { authoredHabits, habitSignals, validLog, visibleHabits, type HabitWeek } from '../src/engine/habits';
import { buildIcs, foldLine } from '../src/engine/calendar';
import type { Case, PipelineOptions } from '../src/engine/types';

const OPTIONS: PipelineOptions = { evidenceAvailable: true, decision: null };
const get = (id: string) => caseById(id) as Case;

describe('reversible-cause work-up', () => {
  it('puts items suggested by the patient context first', () => {
    const rows = workupRows(runPipeline(get('SYN-102'), OPTIONS), undefined);
    const firstUnsuggested = rows.findIndex((r) => !r.suggested);
    expect(rows.slice(0, firstUnsuggested).map((r) => r.id)).toEqual(expect.arrayContaining(['meds', 'sleep', 'b12']));
    expect(rows.slice(firstUnsuggested).every((r) => !r.suggested)).toBe(true);
    expect(rows).toHaveLength(WORKUP_ITEMS.length);
  });

  it('counts what is open, ruled out and found, without naming a cause', () => {
    const run = runPipeline(get('SYN-102'), OPTIONS);
    const rows = workupRows(run, {
      meds: { status: 'abnormal', note: 'Sleep aid stopped with GP', date: '2026-11-10' },
      b12: { status: 'normal', note: '', date: '2026-11-10' },
      sleep: { status: 'ordered', note: '', date: '2026-11-10' },
    });
    const s = summariseWorkup(rows);
    expect(s.needsFollowUp).toBe(1);
    expect(s.ruledOut).toBe(1);
    expect(s.open).toBeGreaterThanOrEqual(1);
    expect(Object.keys(s)).not.toContain('cause');
  });

  it('never changes the route', () => {
    const c = get('SYN-101');
    const before = runPipeline(c, OPTIONS).outcome.route;
    workupRows(runPipeline(c, OPTIONS), { mood: { status: 'abnormal', note: '', date: '2026-11-10' } });
    expect(runPipeline(c, OPTIONS).outcome.route).toBe(before);
  });
});

describe('brain-health habits', () => {
  it('builds 12 weeks ending at the latest visit', () => {
    const weeks = authoredHabits(get('SYN-102'));
    expect(weeks).toHaveLength(12);
    expect(weeks.at(-1)!.week).toBe(get('SYN-102').observations.at(-1)!.date);
    expect(authoredHabits(get('SYN-102'))).toEqual(weeks);
  });

  it('hides wearable values without wearable consent, leaving reported ones', () => {
    const c = get('SYN-104');
    expect(c.consent.wearable).toBe(false);
    const weeks = visibleHabits(c, []);
    expect(weeks.every((w) => w.sleepHours === null && w.activeMinutes === null)).toBe(true);
    expect(weeks.some((w) => w.socialDays !== null)).toBe(true);
  });

  it('flags sleep below the reference for three weeks', () => {
    const signals = habitSignals(visibleHabits(get('SYN-102'), []));
    expect(signals.map((s) => s.key)).toContain('sleepHours');
    expect(signals[0].text.id).toBeTruthy();
  });

  it('flags a fall of a third even with no reference line', () => {
    const weeks: HabitWeek[] = Array.from({ length: 8 }, (_, i) => ({
      week: `2026-0${(i % 9) + 1}-01`, sleepHours: null, activeMinutes: null, socialDays: i < 4 ? 6 : 2, source: 'reported',
    }));
    expect(habitSignals(weeks).map((s) => s.key)).toEqual(['socialDays']);
  });

  it('gives no signal for a stable patient', () => {
    expect(habitSignals(visibleHabits(get('SYN-101'), [])).filter((s) => s.key !== 'activeMinutes')).toEqual([]);
  });

  it('rejects impossible logged values', () => {
    expect(validLog({ week: '2026-11-10', sleepHours: 7, activeMinutes: 100, socialDays: 3, source: 'reported' })).toBe(true);
    expect(validLog({ week: '2026-11-10', sleepHours: 30, activeMinutes: 100, socialDays: 3 })).toBe(false);
    expect(validLog({ week: '2026-11-10', sleepHours: 7, activeMinutes: 100, socialDays: 9 })).toBe(false);
    expect(validLog({ week: 'next week', sleepHours: 7, activeMinutes: 1, socialDays: 1 })).toBe(false);
  });
});

describe('calendar export', () => {
  const ics = buildIcs([{ uid: 'SYN-102-followup', caseId: 'SYN-102', title: 'Dhakira follow-up', due: '2026-11-20' }], new Date('2026-11-17T08:00:00Z'));

  it('is a valid all-day iCalendar event with CRLF line endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261120\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261121\r\n');
    expect(ics).toContain('DTSTAMP:20261117T080000Z\r\n');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it('carries only the pseudonymous ID, never the name or a clinical detail', () => {
    expect(ics).toContain('SYN-102');
    expect(ics).not.toContain('Khalid');
    expect(ics).not.toMatch(/dementia|review threshold|z -/i);
  });

  it('folds long lines and escapes separators', () => {
    const folded = foldLine(`SUMMARY:${'x'.repeat(200)}`);
    expect(folded.split('\r\n ').every((part) => part.length <= 75)).toBe(true);
    const escaped = buildIcs([{ uid: 'u', caseId: 'SYN-1', title: 'A, B; C', due: '2026-01-01' }], new Date(0));
    expect(escaped).toContain('SUMMARY:A\\, B\\; C (SYN-1)');
  });
});
