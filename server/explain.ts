import Anthropic from '@anthropic-ai/sdk';
import { caseById } from '../src/data/cases';
import { checkExplanation, templateExplanation, type Explanation } from '../src/engine/explain';
import { runPipeline, selectComparable } from '../src/engine/pipeline';
import { calculateChange, calibrationFor, isValidScoreList } from '../src/engine/scoring';
import type { Case, ChangeResult, Observation } from '../src/engine/types';

export const DEFAULT_MODEL = 'claude-opus-5-5';
const TOOL_NAME = 'calculate_cognitive_change';

export interface ExplainRequest { caseId: string; extraScores?: number[] }

export type ExplainResponse =
  | { status: 200; body: { source: 'live'; model: string; explanation: Explanation; toolResult: ChangeResult } }
  | { status: 200; body: { source: 'template'; reason: string; explanation: Explanation; toolResult: ChangeResult } }
  | { status: 400 | 409; body: { error: string } };

const TOOL = {
  name: TOOL_NAME,
  description: 'Runs the versioned change formula on a list of comparable task scores and returns the result. It is the only permitted source of numbers.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['values'],
    properties: {
      values: { type: 'array', items: { type: 'number' }, description: 'Comparable task scores out of 10, oldest first, exactly as supplied.' },
    },
  },
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['en', 'ar', 'id'],
  properties: {
    en: { type: 'object', additionalProperties: false, required: ['headline', 'body'], properties: { headline: { type: 'string' }, body: { type: 'string' } } },
    ar: { type: 'object', additionalProperties: false, required: ['headline', 'body'], properties: { headline: { type: 'string' }, body: { type: 'string' } } },
    id: { type: 'object', additionalProperties: false, required: ['headline', 'body'], properties: { headline: { type: 'string' }, body: { type: 'string' } } },
  },
};

const SYSTEM = `You explain one calculated task result to a clinician, inside a research prototype that uses fictional cases.

First call ${TOOL_NAME} with exactly the values you are given. Then write the explanation from the tool result.

Rules for the explanation:
- Use only numbers that appear in the tool result. Do not calculate anything yourself.
- Describe a task result compared with the person's own baseline. Say that it is not a diagnosis and does not establish a cause.
- Do not name any disease. Do not recommend treatment or referral; the clinician decides those.
- Write plain English, clear Modern Standard Arabic and plain Bahasa Indonesia. Two or three sentences for each language.
- Use Western digits with a dot as the decimal point in every language.`;

/** Rebuilds the case on the server. Free text and real records are not accepted from the client. */
export function buildServerCase(request: unknown): { c: Case } | { error: string } {
  const body = request as Partial<ExplainRequest> | null;
  const base = typeof body?.caseId === 'string' ? caseById(body.caseId) : undefined;
  if (!base) return { error: 'Only the fixed fictional case IDs are accepted.' };
  const extras = body?.extraScores ?? [];
  if (!isValidScoreList(extras) || extras.length > 6 || !extras.every(Number.isInteger)) {
    return { error: 'extraScores must be at most 6 whole numbers from 0 to 10.' };
  }
  const last = base.observations.at(-1) as Observation;
  const appended: Observation[] = extras.map((score, i) => ({
    ...last, visit: base.observations.length + i + 1, score, source: 'live-check',
  }));
  return { c: { ...base, observations: [...base.observations, ...appended] } };
}

export interface ExplainDeps { client?: Anthropic; model?: string }

export async function explain(request: unknown, deps: ExplainDeps = {}): Promise<ExplainResponse> {
  const built = buildServerCase(request);
  if ('error' in built) return { status: 400, body: { error: built.error } };
  const { c } = built;

  const run = runPipeline(c, { evidenceAvailable: true, decision: null });
  if (!run.change) {
    return { status: 409, body: { error: 'This case stopped or was held before scoring, so there is nothing to explain.' } };
  }
  const expected = run.change.values;
  const fallback = (reason: string): ExplainResponse => ({
    status: 200,
    body: { source: 'template', reason, explanation: templateExplanation(run.change as ChangeResult), toolResult: run.change as ChangeResult },
  });

  const hasCredentials = deps.client || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!hasCredentials) return fallback('No model credentials are configured on the server.');

  const client = deps.client ?? new Anthropic();
  const model = deps.model ?? process.env.CLAUDE_MODEL ?? DEFAULT_MODEL;
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{
    role: 'user',
    content: `Fictional case ${c.id}. Comparable task scores out of 10, oldest first: ${JSON.stringify(expected)}.`,
  }];

  try {
    const first = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      messages,
    });
    if (first.stop_reason === 'refusal') return fallback('The model declined the request.');
    const call = first.content.find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
    if (!call || call.type !== 'tool_use') return fallback('The model did not call the scoring tool.');

    const args = (call.input as { values?: unknown }).values;
    if (!isValidScoreList(args) || JSON.stringify(args) !== JSON.stringify(expected)) {
      return fallback('The model changed the supplied values, so its call was rejected.');
    }
    const { comparable, protocol } = selectComparable(c);
    const calibration = protocol ? calibrationFor(protocol.language, c.education) : null;
    const result = calibration && comparable.length ? calculateChange(args, calibration) : null;
    if (!result) return fallback('The scoring tool returned no result.');

    messages.push({ role: 'assistant', content: first.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result) }] });

    const second = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'auto' },
      messages,
    });
    if (second.stop_reason === 'refusal') return fallback('The model declined the request.');
    if (second.stop_reason === 'max_tokens') return fallback('The model response was cut off.');

    const text = second.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fallback('The model response was not valid JSON.');
    }
    const check = checkExplanation(parsed, result);
    if (!check.ok) return fallback(`The model text failed its checks: ${check.problems[0]}`);

    return { status: 200, body: { source: 'live', model: second.model, explanation: parsed as Explanation, toolResult: result } };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return fallback('The model service is rate limited.');
    if (err instanceof Anthropic.AuthenticationError) return fallback('The server credentials were rejected.');
    if (err instanceof Anthropic.APIConnectionError) return fallback('The model service could not be reached.');
    if (err instanceof Anthropic.APIError) return fallback(`The model service returned an error (${err.status}).`);
    throw err;
  }
}

const hits = new Map<string, number[]>();

/** Simple per-instance limit so a public demo link cannot run up a bill. */
export function allowRequest(key: string, now = Date.now(), limit = 20, windowMs = 3_600_000): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
