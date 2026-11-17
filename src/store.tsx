import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadSession, saveSession, type Session } from './auth';
import { API_MODE, ApiError, api, setApiToken, setUnauthorisedHandler } from './api';
import { EMPTY_SERVER_STATE, fromServer } from './sync';
import { pick, pickL } from './i18n';
import type { IconName } from './components/icons';
import { CASES, LEAD_CASE_ID, caseById } from './data/cases';
import type { Explanation } from './engine/explain';
import type { HabitWeek } from './engine/habits';
import type { WorkupEntry, WorkupState } from './engine/workup';
import { instrumentItem, type InstrumentResult } from './engine/instruments';
import { mergeContext, type LabResult, type MedicineEntry } from './engine/medslabs';
import { runPipeline } from './engine/pipeline';
import type { Case, ClinicianDecision, ConsentScope, FunctionReport, Lang, Localised, Observation, PipelineRun } from './engine/types';

export type PageId = 'home' | 'how' | 'workspace' | 'check' | 'review' | 'validation' | 'record' | 'monitoring' | 'docs';

export interface NavItem { id: PageId; label: Localised; icon: IconName }
export interface NavGroup { key: 'queue' | 'patient' | 'programme'; label: Localised | null; icon: IconName | null; items: NavItem[] }

/** Short labels: the page title carries the full name, so the menu stays light. */
export const NAV: NavGroup[] = [
  { key: 'queue', label: null, icon: null, items: [{ id: 'home', icon: 'queue', label: { en: 'Patient queue', ar: 'قائمة المرضى', id: 'Antrean pasien' } }] },
  {
    key: 'patient',
    label: { en: 'Patient', ar: 'المريض', id: 'Pasien' },
    icon: 'patient',
    items: [
      { id: 'workspace', icon: 'summary', label: { en: 'Summary', ar: 'الملخص', id: 'Ringkasan' } },
      { id: 'check', icon: 'check', label: { en: 'Check', ar: 'الفحص', id: 'Cek' } },
      { id: 'review', icon: 'signoff', label: { en: 'Sign-off', ar: 'التوقيع', id: 'Tanda tangan' } },
      { id: 'record', icon: 'record', label: { en: 'Record', ar: 'السجل', id: 'Catatan' } },
      { id: 'monitoring', icon: 'monitoring', label: { en: 'Monitoring', ar: 'المتابعة', id: 'Pemantauan' } },
    ],
  },
  {
    key: 'programme',
    label: { en: 'Programme', ar: 'البرنامج', id: 'Program' },
    icon: 'programme',
    items: [
      { id: 'validation', icon: 'validation', label: { en: 'Validation', ar: 'التحقق', id: 'Validasi' } },
      { id: 'how', icon: 'how', label: { en: 'How it works', ar: 'كيف يعمل', id: 'Cara kerja' } },
      { id: 'docs', icon: 'docs', label: { en: 'Docs', ar: 'التوثيق', id: 'Dokumentasi' } },
    ],
  },
];

const PAGE_IDS: PageId[] = NAV.flatMap((g) => g.items.map((i) => i.id));

export interface StudioEntry {
  id: string;
  date: string;
  purpose: 'practice';
  language: string;
  mode: string;
  parts: { recall: number; sequence: number; search: number; switching: number };
}

export interface ExplainState {
  source: 'live' | 'template';
  model?: string;
  reason?: string;
  explanation: Explanation;
}

export interface SavedRecord {
  id: string;
  savedAt: string;
  caseSnapshot: Case;
  run: PipelineRun;
  decision: ClinicianDecision | null;
  explain: ExplainState | null;
}

interface Persisted {
  lang: Lang;
  decisions: Record<string, ClinicianDecision>;
  extraObservations: Record<string, Observation[]>;
  extraFunction: Record<string, FunctionReport[]>;
  permissionRefused: Record<string, boolean>;
  consentOverrides: Record<string, Partial<Record<ConsentScope, boolean>>>;
  acks: Record<string, boolean>;
  records: SavedRecord[];
  studio: StudioEntry[];
  explanations: Record<string, ExplainState>;
  workup: Record<string, WorkupState>;
  habitLogs: Record<string, HabitWeek[]>;
  instruments: Record<string, InstrumentResult>;
  labs: Record<string, LabResult[]>;
  medicines: Record<string, MedicineEntry[]>;
}

const KEY = 'dhakira:v1';
const EMPTY: Persisted = {
  lang: 'en', decisions: {}, extraObservations: {}, extraFunction: {}, permissionRefused: {}, consentOverrides: {},
  acks: {}, records: [], studio: [], explanations: {}, workup: {}, habitLogs: {}, instruments: {}, labs: {}, medicines: {},
};

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Plain English for the sync banner; the banner adds the translated lead-in. */
function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'The server could not be reached.';
    if (typeof err.detail === 'string') return err.detail;
    if (Array.isArray(err.detail)) return (err.detail as { msg?: string }[]).map((d) => d.msg).filter(Boolean).join('; ') || 'The entry was rejected.';
    return `Request failed (${err.status}).`;
  }
  return 'The server could not be reached.';
}

/** New clinical information means a doctor needs to look again, so the earlier sign-off and explanation go. */
function withoutSignOff(s: Persisted, id: string): Persisted {
  const decisions = { ...s.decisions };
  delete decisions[id];
  const explanations = { ...s.explanations };
  delete explanations[id];
  return { ...s, decisions, explanations };
}

interface AppValue extends Persisted {
  session: Session | null;
  setSession: (s: Session | null) => void;
  page: PageId;
  go: (p: PageId) => void;
  caseId: string;
  setCaseId: (id: string) => void;
  currentCase: Case;
  run: PipelineRun;
  decision: ClinicianDecision | null;
  caseFor: (id: string) => Case;
  runFor: (id: string) => PipelineRun;
  evidenceAvailable: boolean;
  setEvidenceAvailable: (v: boolean) => void;
  revealed: number;
  setRevealed: (n: number) => void;
  traceOpen: boolean;
  setTraceOpen: (v: boolean) => void;
  setLang: (l: Lang) => void;
  /** `localOnly` is for the demo walkthrough: it changes the screen, never the server record. */
  setDecision: (id: string, d: ClinicianDecision | null, opts?: { localOnly?: boolean }) => void;
  /** True when records are kept on the FastAPI server rather than in this browser. */
  serverMode: boolean;
  syncState: 'off' | 'loading' | 'ready' | 'error';
  /** The last change the server refused or could not receive. The screen then shows the server's state again. */
  syncError: string | null;
  dismissSyncError: () => void;
  reloadFromServer: () => void;
  setPermission: (id: string, granted: boolean) => void;
  setConsent: (id: string, scope: ConsentScope, granted: boolean) => void;
  addLiveCheck: (id: string, o: Observation, f: FunctionReport) => void;
  ack: (key: string) => void;
  saveRecord: () => SavedRecord;
  addStudio: (e: StudioEntry) => void;
  clearStudio: () => void;
  setExplanation: (id: string, e: ExplainState) => void;
  setWorkupEntry: (caseId: string, itemId: string, entry: WorkupEntry) => void;
  addHabitLog: (caseId: string, week: HabitWeek) => void;
  /** Records a validated instrument result. Like a new check, it clears any earlier sign-off. */
  setInstrument: (caseId: string, r: InstrumentResult) => void;
  /** Lab results and medicines. Each change clears any earlier sign-off, so a doctor sees the new information. */
  addLab: (caseId: string, r: LabResult) => void;
  removeLab: (caseId: string, labId: string) => void;
  addMedicine: (caseId: string, m: MedicineEntry) => void;
  removeMedicine: (caseId: string, medId: string) => void;
  resetAll: () => void;
  /** English, Arabic, and optionally Indonesian. Without it, Indonesian comes from the dictionary. */
  t: (en: string, ar: string, id?: string) => string;
  tx: (l: Localised) => string;
}

const Ctx = createContext<AppValue | null>(null);

function pageFromHash(): PageId {
  const id = window.location.hash.replace('#/', '') as PageId;
  return PAGE_IDS.includes(id) ? id : 'home';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);
  const [session, setSessionRaw] = useState<Session | null>(() => loadSession(localStorage));
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [caseId, setCaseIdRaw] = useState(LEAD_CASE_ID);
  const [evidenceAvailable, setEvidenceRaw] = useState(true);
  // The summary is ready when a clinician opens it. Replay exists to inspect how it was prepared.
  const [revealed, setRevealed] = useState(12);
  const [traceOpen, setTraceOpen] = useState(false);
  const [syncState, setSyncState] = useState<'off' | 'loading' | 'ready' | 'error'>(API_MODE ? 'loading' : 'off');
  const [syncError, setSyncError] = useState<string | null>(null);
  const timers = useRef<Record<string, number>>({});
  const token = session?.token ?? null;

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  // Server mode: the server is the source of truth for clinical records.
  const reloadFromServer = useCallback(async () => {
    if (!API_MODE || !token) return;
    setSyncState('loading');
    try {
      const fresh = fromServer(await api.records());
      setState((s) => ({ ...s, ...fresh }));
      setSyncState('ready');
    } catch (err) {
      setSyncState('error');
      setSyncError(describeApiError(err));
    }
  }, [token]);

  useEffect(() => {
    setApiToken(token);
    if (token) void reloadFromServer();
  }, [token, reloadFromServer]);

  useEffect(() => {
    setUnauthorisedHandler(() => {
      saveSession(null, localStorage);
      setSessionRaw(null);
      window.location.hash = '#/login';
    });
    return () => setUnauthorisedHandler(null);
  }, []);

  /** Sends one change to the server. If it is refused, the error shows and the screen reloads the server's state. */
  const write = (op: () => Promise<unknown>, debounceKey?: string) => {
    if (!API_MODE || !token) return;
    const run = () => op().then(() => undefined, (err: unknown) => {
      setSyncError(describeApiError(err));
      void reloadFromServer();
    });
    if (!debounceKey) { void run(); return; }
    window.clearTimeout(timers.current[debounceKey]);
    timers.current[debounceKey] = window.setTimeout(() => { void run(); }, 700);
  };

  useEffect(() => {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  }, [state.lang]);

  useEffect(() => {
    const onHash = () => { setPage(pageFromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const caseFor = useCallback((id: string): Case => {
    const base = caseById(id) ?? CASES[0];
    const entered = state.instruments[id];
    const withInstrument = entered
      ? [instrumentItem(entered), ...base.context.filter((i) => i.id !== 'screen')]
      : base.context;
    const medicines = state.medicines[id] ?? [];
    const context = mergeContext(withInstrument, state.labs[id] ?? [], medicines);
    return {
      ...base,
      context,
      ...(medicines.length ? { medicines } : {}),
      consent: {
        ...base.consent,
        ...state.consentOverrides[id],
        access: base.consent.access && !state.permissionRefused[id],
      },
      observations: [...base.observations, ...(state.extraObservations[id] ?? [])],
      functionReports: [...base.functionReports, ...(state.extraFunction[id] ?? [])],
    };
  }, [state.extraObservations, state.extraFunction, state.permissionRefused, state.consentOverrides, state.instruments, state.labs, state.medicines]);

  const runFor = useCallback((id: string): PipelineRun => runPipeline(caseFor(id), {
    evidenceAvailable,
    decision: state.decisions[id] ?? null,
  }), [caseFor, evidenceAvailable, state.decisions]);

  const currentCase = useMemo(() => caseFor(caseId), [caseFor, caseId]);
  const run = useMemo(() => runFor(caseId), [runFor, caseId]);

  const value: AppValue = {
    ...state,
    session,
    setSession: (s) => {
      if (!s && API_MODE && token) {
        // Revoke the token on the server and drop server records cached in this browser.
        void api.logout().catch(() => undefined);
        setState((st) => ({ ...st, ...EMPTY_SERVER_STATE }));
      }
      saveSession(s, localStorage);
      setSessionRaw(s);
      // Signing out returns to the landing page; signing in leaves the sign-in route for the queue.
      if (!s) window.location.hash = '#/';
      else if (window.location.hash === '#/login') window.location.hash = '#/home';
    },
    page,
    go: (p) => {
      if (window.location.hash === `#/${p}`) window.scrollTo(0, 0);
      else window.location.hash = `#/${p}`;
    },
    caseId,
    setCaseId: (id) => { setCaseIdRaw(id); setRevealed(12); setTraceOpen(false); },
    currentCase,
    run,
    decision: state.decisions[caseId] ?? null,
    caseFor,
    runFor,
    evidenceAvailable,
    setEvidenceAvailable: setEvidenceRaw,
    revealed,
    setRevealed,
    traceOpen,
    setTraceOpen,
    setLang: (lang) => setState((s) => ({ ...s, lang })),
    setDecision: (id, d, opts) => {
      setState((s) => {
        const decisions = { ...s.decisions };
        if (d) decisions[id] = d; else delete decisions[id];
        return { ...s, decisions };
      });
      if (!opts?.localOnly) write(() => (d ? api.create(id, 'decision', d) : api.removeLatest(id, 'decision')));
    },
    serverMode: API_MODE,
    syncState,
    syncError,
    dismissSyncError: () => setSyncError(null),
    reloadFromServer: () => { void reloadFromServer(); },
    // Permission and consent change what context is used, so like new information they clear the sign-off.
    setPermission: (id, granted) => {
      setState((s) => ({ ...withoutSignOff(s, id), permissionRefused: { ...s.permissionRefused, [id]: !granted } }));
      write(() => api.create(id, 'permission', { granted }));
    },
    setConsent: (id, scope, granted) => {
      setState((s) => ({
        ...withoutSignOff(s, id),
        consentOverrides: { ...s.consentOverrides, [id]: { ...s.consentOverrides[id], [scope]: granted } },
      }));
      write(() => api.create(id, 'consent', { scope, granted }));
    },
    addLiveCheck: (id, o, f) => {
      write(() => api.create(id, 'observation', { observation: o, functionReport: f }));
      setState((s) => {
        const decisions = { ...s.decisions };
        delete decisions[id];
        const explanations = { ...s.explanations };
        delete explanations[id];
        return {
          ...s,
          decisions,
          explanations,
          extraObservations: { ...s.extraObservations, [id]: [...(s.extraObservations[id] ?? []), o] },
          extraFunction: { ...s.extraFunction, [id]: [...(s.extraFunction[id] ?? []), f] },
        };
      });
    },
    ack: (key) => setState((s) => ({ ...s, acks: { ...s.acks, [key]: true } })),
    saveRecord: () => {
      const record: SavedRecord = {
        id: `REC-${caseId}-${Date.now()}`,
        savedAt: new Date().toISOString(),
        caseSnapshot: currentCase,
        run,
        decision: state.decisions[caseId] ?? null,
        explain: state.explanations[caseId] ?? null,
      };
      setState((s) => ({ ...s, records: [record, ...s.records] }));
      return record;
    },
    addStudio: (e) => setState((s) => ({ ...s, studio: [e, ...s.studio] })),
    clearStudio: () => setState((s) => ({ ...s, studio: [] })),
    setExplanation: (id, e) => setState((s) => ({ ...s, explanations: { ...s.explanations, [id]: e } })),
    setWorkupEntry: (caseId, itemId, entry) => {
      setState((s) => ({
        ...s,
        workup: { ...s.workup, [caseId]: { ...s.workup[caseId], [itemId]: entry } },
      }));
      // Notes are typed a key at a time, so the server gets the settled value.
      write(() => api.create(caseId, 'workup', { itemId, ...entry }), `workup|${caseId}|${itemId}`);
    },
    addHabitLog: (caseId, week) => {
      setState((s) => ({
        ...s,
        habitLogs: { ...s.habitLogs, [caseId]: [...(s.habitLogs[caseId] ?? []).filter((w) => w.week !== week.week), week] },
      }));
      write(() => api.create(caseId, 'habit', week));
    },
    setInstrument: (id, r) => {
      setState((s) => ({ ...withoutSignOff(s, id), instruments: { ...s.instruments, [id]: r } }));
      write(() => api.create(id, 'instrument', r));
    },
    addLab: (id, r) => {
      setState((s) => ({ ...withoutSignOff(s, id), labs: { ...s.labs, [id]: [...(s.labs[id] ?? []), r] } }));
      write(() => api.create(id, 'lab', r, r.id));
    },
    removeLab: (id, labId) => {
      setState((s) => ({ ...withoutSignOff(s, id), labs: { ...s.labs, [id]: (s.labs[id] ?? []).filter((r) => r.id !== labId) } }));
      write(() => api.remove(id, 'lab', labId));
    },
    addMedicine: (id, m) => {
      setState((s) => ({ ...withoutSignOff(s, id), medicines: { ...s.medicines, [id]: [...(s.medicines[id] ?? []), m] } }));
      write(() => api.create(id, 'medicine', m, m.id));
    },
    removeMedicine: (id, medId) => {
      setState((s) => ({ ...withoutSignOff(s, id), medicines: { ...s.medicines, [id]: (s.medicines[id] ?? []).filter((m) => m.id !== medId) } }));
      write(() => api.remove(id, 'medicine', medId));
    },
    // In server mode, reset clears only what lives in this browser; server records stay and reload.
    resetAll: () => {
      setRevealed(12);
      setEvidenceRaw(true);
      setState((s) => ({ ...EMPTY, lang: s.lang }));
      if (API_MODE) void reloadFromServer();
    },
    t: (en, ar, id) => pick(state.lang, en, ar, id),
    tx: (l) => pickL(state.lang, l),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
