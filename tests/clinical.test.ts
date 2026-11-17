import { describe, expect, it } from 'vitest';
import { hashPassword, loadSession, register, saveSession, signIn, type KeyValueStore, type RegisterInput } from '../src/auth';
import { CASES, caseById } from '../src/data/cases';
import { actionFor, buildQueue, groupFor } from '../src/engine/queue';
import { auc } from '../src/engine/metrics';
import { evaluateCohort, generateCohort, NO_FILTER } from '../src/engine/cohort';
import { runPipeline } from '../src/engine/pipeline';
import { exampleDecision } from '../src/engine/plan';
import type { Case, ClinicianDecision, PipelineOptions } from '../src/engine/types';

const OPTIONS: PipelineOptions = { evidenceAvailable: true, decision: null };
const get = (id: string) => caseById(id) as Case;

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
}

const VALID: RegisterInput = {
  name: 'Test Clinician', email: 'Test@Example.com', role: 'nurse', facility: 'Clinic',
  password: 'correct-horse', confirm: 'correct-horse', acknowledged: true,
};

describe('prototype sign-in', () => {
  it('registers, then signs in with the same password', async () => {
    const store = memoryStore();
    const created = await register(VALID, store);
    expect('session' in created && created.session.role).toBe('nurse');
    const back = await signIn('test@example.com', 'correct-horse', store);
    expect('session' in back && back.session.email).toBe('test@example.com');
  });

  it('never stores the password itself', async () => {
    const store = memoryStore();
    await register(VALID, store);
    expect(store.getItem('dhakira:accounts')).not.toContain('correct-horse');
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const store = memoryStore();
    await register(VALID, store);
    expect(await signIn('test@example.com', 'wrong-password', store)).toEqual({ error: 'bad_credentials' });
    expect(await signIn('nobody@example.com', 'correct-horse', store)).toEqual({ error: 'bad_credentials' });
  });

  it('rejects each invalid registration with its own reason', async () => {
    const store = memoryStore();
    expect(await register({ ...VALID, name: ' ' }, store)).toEqual({ error: 'name_required' });
    expect(await register({ ...VALID, email: 'not-an-email' }, store)).toEqual({ error: 'email_invalid' });
    expect(await register({ ...VALID, password: 'short', confirm: 'short' }, store)).toEqual({ error: 'password_short' });
    expect(await register({ ...VALID, confirm: 'different-one' }, store)).toEqual({ error: 'password_mismatch' });
    expect(await register({ ...VALID, acknowledged: false }, store)).toEqual({ error: 'ack_required' });
    await register(VALID, store);
    expect(await register(VALID, store)).toEqual({ error: 'email_taken' });
  });

  it('salts hashes, so the same password hashes differently', async () => {
    const a = await hashPassword('same-password', '00112233445566778899aabbccddeeff');
    const b = await hashPassword('same-password', 'ffeeddccbbaa99887766554433221100');
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });

  it('survives a corrupted session value', () => {
    const store = memoryStore();
    store.setItem('dhakira:session', '{not json');
    expect(loadSession(store)).toBeNull();
    store.setItem('dhakira:session', JSON.stringify({ role: 'admin' }));
    expect(loadSession(store)).toBeNull();
    saveSession(null, store);
    expect(loadSession(store)).toBeNull();
  });
});

describe('nurse and doctor handover', () => {
  const c = get('SYN-102');
  const base = runPipeline(c, OPTIONS);
  const prepared: ClinicianDecision = {
    ...exampleDecision(c, base, '2026-11-06'), status: 'prepared', reviewer: 'Nurse Sara', reviewerRole: 'nurse',
  };

  it('keeps a nurse handover waiting and releases nothing', () => {
    const r = runPipeline(c, { evidenceAvailable: true, decision: prepared });
    expect(r.stages[9].status).toBe('waiting');
    expect(r.stages[9].message.en).toContain('Nurse Sara');
    expect(r.stages[10].status).toBe('pending');
    expect(groupFor(r, prepared)).toBe('signoff');
  });

  it('gives each role its own next action', () => {
    expect(actionFor('signoff', 'doctor', null).page).toBe('review');
    expect(actionFor('signoff', 'nurse', null).label.en).toBe('Prepare for the doctor');
    expect(actionFor('signoff', 'nurse', prepared).label.en).toBe('With the doctor for sign-off');
    expect(actionFor('repeat', 'nurse', null).page).toBe('check');
    expect(actionFor('repeat', 'doctor', null).page).toBe('review');
  });
});

describe('patient queue', () => {
  const queue = buildQueue(CASES, (id) => runPipeline(get(id), OPTIONS), () => null, 'doctor');

  it('puts the urgent case first and keeps every case', () => {
    expect(queue[0].c.id).toBe('SYN-107');
    expect(queue).toHaveLength(CASES.length);
  });

  it('orders sign-off before repeat, holds and routine', () => {
    const groups = queue.map((q) => q.group);
    expect(groups.lastIndexOf('signoff')).toBeLessThan(groups.indexOf('repeat'));
    expect(groups.indexOf('repeat')).toBeLessThan(groups.indexOf('held'));
    expect(groups.lastIndexOf('held')).toBeLessThan(groups.indexOf('routine'));
  });

  it('moves a signed-off case out of the sign-off group', () => {
    const c = get('SYN-102');
    const d = exampleDecision(c, runPipeline(c, OPTIONS), '2026-11-06');
    expect(groupFor(runPipeline(c, { evidenceAvailable: true, decision: d }), d)).toBe('done');
  });
});

describe('gaps closed against the challenge outcomes', () => {
  it('a positive mood screen reaches review even when the numbers are stable', () => {
    const r = runPipeline(get('SYN-108'), OPTIONS);
    expect(r.change?.numericFlag).toBe('none');
    expect(r.outcome.route).toBe('qualified_review');
    expect(r.outcome.reason.en).toContain('high-risk');
    expect(r.suggestedServices).toContain('mental_health');
  });

  it('a borderline result flagged again on repeat goes to review', () => {
    const c = get('SYN-103');
    expect(runPipeline(c, OPTIONS).outcome.route).toBe('repeat');
    const last = c.observations[4];
    const repeat: Case = { ...c, observations: [...c.observations, { ...last, visit: 6, score: 9, source: 'live-check' }] };
    const r = runPipeline(repeat, OPTIONS);
    expect(r.change?.numericFlag).toBe('repeat');
    expect(r.outcome.route).toBe('qualified_review');
    expect(r.outcome.reason.en).toContain('flagged again');
  });

  it('a first borderline result stays a repeat', () => {
    const r = runPipeline(get('SYN-103'), OPTIONS);
    expect(r.outcome.nextStep.en).toContain('Repeat in 2 to 4 weeks');
  });

  it('notes a paper check beside the result without changing the number', () => {
    const c = get('SYN-101');
    const paper: Case = { ...c, observations: [...c.observations, { ...c.observations[4], visit: 6, score: 7, administration: 'staff-paper', source: 'live-check' }] };
    const r = runPipeline(paper, OPTIONS);
    expect(r.interpretationNotes.some((n) => n.en.includes('on paper'))).toBe(true);
    expect(r.change?.values.at(-1)).toBe(7);
  });

  it('auc handles separation, ties and empty groups', () => {
    expect(auc([3, 2], [1, 0])).toBe(1);
    expect(auc([0, 1], [2, 3])).toBe(0);
    expect(auc([1], [1])).toBe(0.5);
    expect(auc([], [1])).toBeNull();
  });

  it('reports change discrimination, and null where nothing is calibrated', () => {
    const records = generateCohort();
    expect(evaluateCohort(records).changeAuc).toBeGreaterThan(0.5);
    expect(evaluateCohort(records, { ...NO_FILTER, language: 'ur' }).changeAuc).toBeNull();
  });

  it('every case has eight fictional paths covered', () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(8);
    const routes = new Set(CASES.map((c) => runPipeline(c, OPTIONS).outcome.route));
    for (const route of ['routine', 'repeat', 'qualified_review', 'urgent', 'held'] as const) expect(routes.has(route)).toBe(true);
  });
});
