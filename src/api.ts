import type { ClinicalRole } from './engine/types';

/**
 * Client for the FastAPI backend (backend/).
 *
 * Server mode is on when VITE_API_BASE is defined at build time, even as an empty
 * string (same origin). Without it the app keeps everything in this browser,
 * as before, so the demo still works with no server.
 */

const RAW_BASE = import.meta.env.VITE_API_BASE as string | undefined;
export const API_MODE = RAW_BASE !== undefined;
const BASE = (RAW_BASE ?? '').replace(/\/$/, '');

export type RecordKind = 'decision' | 'lab' | 'medicine' | 'instrument' | 'observation' | 'consent' | 'permission' | 'workup' | 'habit';

export interface ServerRecord {
  id: string;
  case_id: string;
  kind: RecordKind;
  key: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  created_by: string;
}

export interface ServerUser { name: string; email: string; role: ClinicalRole; facility: string; demo: boolean }
export interface TokenOut { token: string; expires_at: string; user: ServerUser }

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === 'string' ? detail : `Request failed (${status})`);
  }
}

let token: string | null = null;
let onUnauthorised: (() => void) | null = null;

export const setApiToken = (t: string | null) => { token = t; };
/** Called once when the server says the session is no longer valid. */
export const setUnauthorisedHandler = (fn: (() => void) | null) => { onUnauthorised = fn; };

async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'server_unavailable');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null) as { detail?: unknown } | null;
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorised) onUnauthorised();
    throw new ApiError(res.status, data?.detail ?? null);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  register: (body: { name: string; email: string; password: string; role: ClinicalRole; facility: string }) => call<TokenOut>('POST', '/api/auth/register', body),
  login: (email: string, password: string) => call<TokenOut>('POST', '/api/auth/login', { email, password }),
  demo: (role: ClinicalRole) => call<TokenOut>('POST', '/api/auth/demo', { role }),
  logout: () => call<void>('POST', '/api/auth/logout'),
  records: () => call<Record<string, ServerRecord[]>>('GET', '/api/records'),
  create: (caseId: string, kind: RecordKind, payload: unknown, id?: string) =>
    call<ServerRecord>('POST', `/api/cases/${enc(caseId)}/records/${kind}`, id ? { id, payload } : { payload }),
  remove: (caseId: string, kind: RecordKind, id: string) => call<void>('DELETE', `/api/cases/${enc(caseId)}/records/${kind}/${enc(id)}`),
  removeLatest: (caseId: string, kind: RecordKind, key?: string) =>
    call<void>('DELETE', `/api/cases/${enc(caseId)}/records/${kind}${key ? `?key=${enc(key)}` : ''}`),
};
