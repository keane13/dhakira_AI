import type { ServerRecord } from './api';
import type { HabitWeek } from './engine/habits';
import type { InstrumentResult } from './engine/instruments';
import type { LabResult, MedicineEntry } from './engine/medslabs';
import type { ClinicianDecision, ConsentScope, FunctionReport, Observation } from './engine/types';
import type { WorkupState, WorkupStatus } from './engine/workup';

/** The part of the app state that lives on the server in server mode. */
export interface ServerState {
  decisions: Record<string, ClinicianDecision>;
  extraObservations: Record<string, Observation[]>;
  extraFunction: Record<string, FunctionReport[]>;
  permissionRefused: Record<string, boolean>;
  consentOverrides: Record<string, Partial<Record<ConsentScope, boolean>>>;
  workup: Record<string, WorkupState>;
  habitLogs: Record<string, HabitWeek[]>;
  instruments: Record<string, InstrumentResult>;
  labs: Record<string, LabResult[]>;
  medicines: Record<string, MedicineEntry[]>;
}

export const EMPTY_SERVER_STATE: ServerState = {
  decisions: {}, extraObservations: {}, extraFunction: {}, permissionRefused: {}, consentOverrides: {},
  workup: {}, habitLogs: {}, instruments: {}, labs: {}, medicines: {},
};

/** Null from the server means "absent", which the client types write as undefined. */
function dropNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(dropNulls) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, dropNulls(v)])) as T;
  }
  return value;
}

/** Builds client state from the server's active records, oldest first, so the latest wins. */
export function fromServer(grouped: Record<string, ServerRecord[]>): ServerState {
  const s: ServerState = structuredClone(EMPTY_SERVER_STATE);
  for (const [caseId, records] of Object.entries(grouped)) {
    for (const r of [...records].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const p = r.payload as Record<string, unknown>;
      switch (r.kind) {
        case 'decision': s.decisions[caseId] = p as unknown as ClinicianDecision; break;
        case 'lab': (s.labs[caseId] ??= []).push({ ...(p as unknown as LabResult), id: r.id }); break;
        case 'medicine': (s.medicines[caseId] ??= []).push({ ...(p as unknown as MedicineEntry), id: r.id }); break;
        case 'instrument': s.instruments[caseId] = p as unknown as InstrumentResult; break;
        case 'observation':
          (s.extraObservations[caseId] ??= []).push(dropNulls(p.observation) as Observation);
          (s.extraFunction[caseId] ??= []).push(dropNulls(p.functionReport) as FunctionReport);
          break;
        case 'consent': (s.consentOverrides[caseId] ??= {})[p.scope as ConsentScope] = p.granted as boolean; break;
        case 'permission': s.permissionRefused[caseId] = !(p.granted as boolean); break;
        case 'workup': (s.workup[caseId] ??= {})[p.itemId as string] = { status: p.status as WorkupStatus, note: p.note as string, date: p.date as string }; break;
        // Habit values use null on purpose (not logged), so they are kept as they are.
        case 'habit': (s.habitLogs[caseId] ??= []).push(p as unknown as HabitWeek); break;
        default: break;
      }
    }
  }
  return s;
}
