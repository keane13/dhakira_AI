import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { allowRequest, buildServerCase, explain } from '../server/explain';

const GOOD = {
  en: { headline: 'Lower follow-up result', body: 'The average went from 7.67 to 6.00 out of 10. The adjusted change is -1.97. This is not a diagnosis and does not establish a cause.' },
  ar: { headline: 'نتيجة متابعة أقل', body: 'انتقل المتوسط من 7.67 إلى 6.00 من أصل 10. التغيّر المعدّل -1.97. هذا ليس تشخيصًا ولا يحدد سببًا.' },
  id: { headline: 'Hasil tindak lanjut lebih rendah', body: 'Rata-rata berubah dari 7.67 menjadi 6.00 dari 10. Perubahan terkoreksi -1.97. Ini bukan diagnosis dan tidak menentukan penyebab.' },
};

function fakeClient(firstInput: unknown, secondText: string, stops: [string, string] = ['tool_use', 'end_turn']) {
  const create = vi.fn()
    .mockResolvedValueOnce({
      stop_reason: stops[0],
      model: 'test-model',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'calculate_cognitive_change', input: firstInput }],
    })
    .mockResolvedValueOnce({
      stop_reason: stops[1],
      model: 'test-model',
      content: [{ type: 'text', text: secondText }],
    });
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
}

const VALUES = [8, 8, 7, 7, 5];

describe('explain endpoint', () => {
  it('rejects anything but a fixed fictional case ID', async () => {
    expect((await explain({ caseId: 'real-patient' })).status).toBe(400);
    expect((await explain({ caseId: 'SYN-102', extraScores: [11] })).status).toBe(400);
    expect((await explain({ caseId: 'SYN-102', extraScores: ['a note'] })).status).toBe(400);
    expect((await explain(null)).status).toBe(400);
  });

  it('refuses to explain a case held before scoring', async () => {
    expect((await explain({ caseId: 'SYN-104' })).status).toBe(409);
    expect((await explain({ caseId: 'SYN-107' })).status).toBe(409);
  });

  it('uses the labelled template when no credentials exist', async () => {
    const saved = { k: process.env.ANTHROPIC_API_KEY, t: process.env.ANTHROPIC_AUTH_TOKEN };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    const res = await explain({ caseId: 'SYN-102' });
    if (saved.k) process.env.ANTHROPIC_API_KEY = saved.k;
    if (saved.t) process.env.ANTHROPIC_AUTH_TOKEN = saved.t;
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'template' });
  });

  it('accepts a live explanation that passes every check', async () => {
    const { client, create } = fakeClient({ values: VALUES }, JSON.stringify(GOOD));
    const res = await explain({ caseId: 'SYN-102' }, { client });
    expect(res.body).toMatchObject({ source: 'live', model: 'test-model' });
    expect(create).toHaveBeenCalledTimes(2);
    const firstCall = create.mock.calls[0][0];
    expect(firstCall.model).toBe('claude-opus-5-5');
    expect(firstCall.tool_choice.type).toBe('auto');
    expect(firstCall.tools[0].strict).toBe(true);
    expect(create.mock.calls[1][0].output_config.format.type).toBe('json_schema');
  });

  it('rejects a tool call that changes the supplied values', async () => {
    const { client } = fakeClient({ values: [8, 8, 8, 8, 8] }, JSON.stringify(GOOD));
    expect((await explain({ caseId: 'SYN-102' }, { client })).body).toMatchObject({ source: 'template' });
  });

  it('rejects an explanation with an invented number', async () => {
    const bad = { ...GOOD, en: { headline: 'x', body: 'The score fell by 37 points.' } };
    const { client } = fakeClient({ values: VALUES }, JSON.stringify(bad));
    const res = await explain({ caseId: 'SYN-102' }, { client });
    expect(res.body).toMatchObject({ source: 'template' });
    expect((res.body as { reason: string }).reason).toContain('37');
  });

  it('rejects an explanation that names a disease', async () => {
    const bad = { ...GOOD, en: { headline: 'x', body: 'This suggests dementia.' } };
    const { client } = fakeClient({ values: VALUES }, JSON.stringify(bad));
    expect((await explain({ caseId: 'SYN-102' }, { client })).body).toMatchObject({ source: 'template' });
  });

  it('rejects text that is not JSON', async () => {
    const { client } = fakeClient({ values: VALUES }, 'not json');
    expect((await explain({ caseId: 'SYN-102' }, { client })).body).toMatchObject({ source: 'template' });
  });

  it('falls back when the model refuses', async () => {
    const create = vi.fn().mockResolvedValueOnce({ stop_reason: 'refusal', content: [], model: 'm' });
    const client = { beta: { messages: { create } } } as unknown as Anthropic;
    expect((await explain({ caseId: 'SYN-102' }, { client })).body).toMatchObject({ source: 'template' });
  });

  it('appends numeric live scores on the server', () => {
    const built = buildServerCase({ caseId: 'SYN-101', extraScores: [3] });
    expect('c' in built && built.c.observations.at(-1)?.score).toBe(3);
  });

  it('limits requests per key', () => {
    for (let i = 0; i < 3; i += 1) expect(allowRequest('k', 1000, 3)).toBe(true);
    expect(allowRequest('k', 1000, 3)).toBe(false);
    expect(allowRequest('k', 1000 + 3_600_001, 3)).toBe(true);
  });
});
