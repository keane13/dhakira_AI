import { allowRequest, explain } from '../../server/explain';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only.' });
  const ip = req.headers.get('x-nf-client-connection-ip') ?? 'unknown';
  if (!allowRequest(ip)) return json(429, { error: 'Too many requests. Try again later.' });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON.' });
  }
  const res = await explain(body);
  return json(res.status, res.body);
};

export const config = { path: '/api/explain' };
