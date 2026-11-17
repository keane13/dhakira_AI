import type { ClinicalRole } from './engine/types';
import { API_MODE, ApiError, api, type TokenOut } from './api';

/**
 * Prototype sign-in. Accounts live only in this browser and passwords are stored
 * as salted PBKDF2 hashes, but client-side code cannot be a security boundary.
 * Production would use the facility's single sign-on with server-side sessions.
 */

export interface Session {
  name: string;
  email: string;
  role: ClinicalRole;
  facility: string;
  demo: boolean;
  /** Server mode only: the bearer token for the API. */
  token?: string;
}

interface Account extends Omit<Session, 'demo'> {
  salt: string;
  hash: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const ACCOUNTS_KEY = 'dhakira:accounts';
const SESSION_KEY = 'dhakira:session';
const ITERATIONS = 150_000;

export const DEMO_USERS: Record<ClinicalRole, Session> = {
  doctor: { name: 'Dr Amal (demo)', email: 'demo-doctor', role: 'doctor', facility: 'Demo wellness clinic', demo: true },
  nurse: { name: 'Nurse Sara (demo)', email: 'demo-nurse', role: 'nurse', facility: 'Demo wellness clinic', demo: true },
};

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array((hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITERATIONS },
    key,
    256,
  );
  return toHex(bits);
}

function readAccounts(store: KeyValueStore): Account[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(ACCOUNTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed as Account[] : [];
  } catch {
    return [];
  }
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

export type AuthError =
  | 'name_required' | 'email_invalid' | 'password_short' | 'password_mismatch'
  | 'email_taken' | 'bad_credentials' | 'crypto_unavailable' | 'ack_required'
  | 'rate_limited' | 'server_unavailable' | 'registration_closed';

export interface RegisterInput {
  name: string;
  email: string;
  role: ClinicalRole;
  facility: string;
  password: string;
  confirm: string;
  acknowledged: boolean;
}

export function validateRegistration(input: RegisterInput, store: KeyValueStore): AuthError | null {
  if (!input.name.trim()) return 'name_required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'email_invalid';
  if (input.password.length < 8) return 'password_short';
  if (input.password !== input.confirm) return 'password_mismatch';
  if (!input.acknowledged) return 'ack_required';
  if (readAccounts(store).some((a) => a.email === normaliseEmail(input.email))) return 'email_taken';
  return null;
}

export async function register(input: RegisterInput, store: KeyValueStore): Promise<{ session: Session } | { error: AuthError }> {
  const error = validateRegistration(input, store);
  if (error) return { error };
  if (!globalThis.crypto?.subtle) return { error: 'crypto_unavailable' };
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const account: Account = {
    name: input.name.trim(),
    email: normaliseEmail(input.email),
    role: input.role,
    facility: input.facility.trim(),
    salt,
    hash: await hashPassword(input.password, salt),
  };
  store.setItem(ACCOUNTS_KEY, JSON.stringify([...readAccounts(store), account]));
  return { session: toSession(account) };
}

const toSession = (a: Account): Session => ({ name: a.name, email: a.email, role: a.role, facility: a.facility, demo: false });

/** Says the same thing for an unknown email and a wrong password, so neither can be probed. */
export async function signIn(email: string, password: string, store: KeyValueStore): Promise<{ session: Session } | { error: AuthError }> {
  if (!globalThis.crypto?.subtle) return { error: 'crypto_unavailable' };
  const account = readAccounts(store).find((a) => a.email === normaliseEmail(email));
  if (!account) return { error: 'bad_credentials' };
  const hash = await hashPassword(password, account.salt);
  return hash === account.hash ? { session: toSession(account) } : { error: 'bad_credentials' };
}

export function loadSession(store: KeyValueStore): Session | null {
  try {
    const parsed = JSON.parse(store.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return parsed && (parsed.role === 'doctor' || parsed.role === 'nurse') ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null, store: KeyValueStore) {
  if (session) store.setItem(SESSION_KEY, JSON.stringify(session));
  else store.removeItem(SESSION_KEY);
}

/* ------------------------- Server mode (FastAPI) ------------------------- */

const fromToken = (out: TokenOut): Session => ({ ...out.user, token: out.token });

function serverError(err: unknown): AuthError {
  if (!(err instanceof ApiError)) return 'server_unavailable';
  if (err.status === 409) return 'email_taken';
  if (err.status === 401) return 'bad_credentials';
  if (err.status === 429) return 'rate_limited';
  if (err.status === 403) return 'registration_closed';
  if (err.status === 422) return 'email_invalid';
  return 'server_unavailable';
}

/** Signs in against the server in server mode, otherwise against this browser's accounts. */
export async function signInAny(email: string, password: string, store: KeyValueStore): Promise<{ session: Session } | { error: AuthError }> {
  if (!API_MODE) return signIn(email, password, store);
  try {
    return { session: fromToken(await api.login(email.trim(), password)) };
  } catch (err) {
    return { error: serverError(err) };
  }
}

export async function registerAny(input: RegisterInput, store: KeyValueStore): Promise<{ session: Session } | { error: AuthError }> {
  if (!API_MODE) return register(input, store);
  // The same checks as local mode, except "email taken", which only the server knows.
  const local = validateRegistration(input, { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  if (local) return { error: local };
  try {
    return { session: fromToken(await api.register({ name: input.name.trim(), email: input.email.trim(), password: input.password, role: input.role, facility: input.facility.trim() })) };
  } catch (err) {
    return { error: serverError(err) };
  }
}

export async function demoSession(role: ClinicalRole): Promise<{ session: Session } | { error: AuthError }> {
  if (!API_MODE) return { session: DEMO_USERS[role] };
  try {
    return { session: fromToken(await api.demo(role)) };
  } catch (err) {
    return { error: serverError(err) };
  }
}
