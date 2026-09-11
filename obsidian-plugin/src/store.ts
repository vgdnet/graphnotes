import type { ConnectionData, HistoryEntry, Pending, SavedData } from './core';

export function emptySaved(): SavedData {
  return { server: '', allowHttp: false, token: '', autoSync: true, connections: {}, history: [] };
}

export function normalizeSaved(raw: unknown): SavedData {
  const saved = emptySaved();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return saved;
  const data = raw as Record<string, unknown>;
  if (typeof data.server === 'string') saved.server = data.server;
  saved.allowHttp = data.allowHttp === true;
  if (typeof data.token === 'string' && data.token.startsWith('gnp_') && data.token.length <= 200) {
    saved.token = data.token.trim();
  }
  saved.autoSync = data.autoSync !== false;
  if (data.connections && typeof data.connections === 'object' && !Array.isArray(data.connections)) {
    for (const [key, value] of Object.entries(data.connections as Record<string, unknown>)) {
      const conn = normalizeConnection(value);
      if (conn) saved.connections[key] = conn;
    }
  }
  if (Array.isArray(data.history)) {
    saved.history = data.history.map(normalizeHistory).filter((e): e is HistoryEntry => !!e).slice(0, 20);
  }
  return saved;
}

function normalizeConnection(value: unknown): ConnectionData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, any>;
  if (typeof data.clientId !== 'string' || !data.clientId) return null;
  const baseline = data.baseline && typeof data.baseline === 'object' && !Array.isArray(data.baseline) ? data.baseline : {};
  const conn: ConnectionData = { clientId: data.clientId, baseline };
  const pending = normalizePending(data.pending);
  if (pending) conn.pending = pending;
  return conn;
}

function normalizePending(value: unknown): Pending | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const data = value as Record<string, any>;
  if (typeof data.key !== 'string' || !data.key || typeof data.createdAt !== 'string' || !Array.isArray(data.operations)) return undefined;
  const pending: Pending = { key: data.key, createdAt: data.createdAt, operations: data.operations };
  if (typeof data.transferId === 'string' && data.transferId) pending.transferId = data.transferId;
  return pending;
}

function normalizeHistory(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, any>;
  if (typeof data.at !== 'string' || typeof data.state !== 'string' || !Number.isSafeInteger(data.count)) return null;
  const entry: HistoryEntry = { at: data.at, state: data.state, count: data.count };
  if (typeof data.transferId === 'string') entry.transferId = data.transferId;
  return entry;
}

export function connectionOf(saved: SavedData, key: string): ConnectionData {
  if (!saved.connections[key]) saved.connections[key] = { clientId: crypto.randomUUID(), baseline: {} };
  return saved.connections[key];
}

export function pushHistory(saved: SavedData, entry: HistoryEntry): void {
  saved.history = [entry, ...saved.history].slice(0, 20);
}
