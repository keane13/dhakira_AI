import { describe, expect, it } from 'vitest';
import { fromServer } from '../src/sync';
import type { ServerRecord } from '../src/api';

const rec = (kind: ServerRecord['kind'], payload: Record<string, unknown>, at: string, id = `${kind}-${at}`, key: string | null = null): ServerRecord =>
  ({ id, case_id: 'SYN-102', kind, key, payload, created_at: at, created_by: 'Dr Test' });

describe('server records to client state', () => {
  it('maps every kind, latest wins for single and keyed kinds', () => {
    const s = fromServer({
      'SYN-102': [
        rec('consent', { scope: 'wearable', granted: false }, '2026-11-17T09:00:00Z', 'c1', 'wearable'),
        rec('consent', { scope: 'wearable', granted: true }, '2026-11-17T10:00:00Z', 'c2', 'wearable'),
        rec('permission', { granted: false }, '2026-11-17T09:00:00Z'),
        rec('lab', { id: 'lab-a', test: 'b12', value: 150, date: '2026-11-10', low: 200, high: 900, enteredBy: 'N' }, '2026-11-17T09:01:00Z', 'lab-a'),
        rec('medicine', { id: 'med-a', name: 'X', dose: '1', source: 'patient', confirmed: true, withoutPrescription: false, anticholinergic: false, cnsActive: false, date: '2026-11-10', enteredBy: 'N' }, '2026-11-17T09:02:00Z', 'med-a'),
        rec('workup', { itemId: 'b12', status: 'ordered', note: 'sent', date: '2026-11-10' }, '2026-11-17T09:03:00Z', 'w1', 'b12'),
        rec('habit', { week: '2026-11-09', sleepHours: null, activeMinutes: 90, socialDays: 3, source: 'reported' }, '2026-11-17T09:04:00Z', 'h1', '2026-11-09'),
        rec('observation', {
          observation: { visit: 6, date: '2026-11-17', score: 7, language: 'ar', mode: 'visual', form: 'C', conditions: {}, source: 'live-check', administration: null, parts: { recall: 2, sequence: 2, search: 1, switching: 2 } },
          functionReport: { date: '2026-11-17', reporter: 'self', level: 0, note: { en: 'No change', ar: 'x', id: null }, source: 'live-check' },
        }, '2026-11-17T09:05:00Z'),
      ],
    });
    expect(s.consentOverrides['SYN-102']).toEqual({ wearable: true });
    expect(s.permissionRefused['SYN-102']).toBe(true);
    expect(s.labs['SYN-102'].map((l) => l.id)).toEqual(['lab-a']);
    expect(s.medicines['SYN-102']).toHaveLength(1);
    expect(s.workup['SYN-102'].b12.status).toBe('ordered');
    // Habit nulls mean "not logged" and must survive.
    expect(s.habitLogs['SYN-102'][0].sleepHours).toBeNull();
    // Observation nulls mean "absent" and become undefined.
    expect(s.extraObservations['SYN-102'][0].administration).toBeUndefined();
    expect('id' in s.extraFunction['SYN-102'][0].note).toBe(false);
  });
});
