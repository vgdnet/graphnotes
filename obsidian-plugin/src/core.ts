import { createHash } from 'node:crypto';

export type Kind = 'markdown' | 'png' | 'jpeg' | 'gif' | 'webp' | 'pdf';
export interface RemoteFile { path: string; kind: Kind; sha256: string; version: string; size: number }
export interface Baseline { sha256: string; version: string; localHash: string }
export type Baselines = Record<string, Baseline>;
export type Change = 'new' | 'changed' | 'same' | 'remote' | 'conflict' | 'deleted';
export type Operation = { op: 'upsert'; path: string; kind: Kind; expected_version: string | null; sha256: string; size: number } | { op: 'delete'; path: string; expected_version: string };
export interface Pending {
  key: string; createdAt: string; operations: Operation[]; transferId?: string;
}
export interface ConnectionData { clientId: string; baseline: Baselines; pending?: Pending }
export interface HistoryEntry { at: string; transferId?: string; state: string; count: number }
export interface LastDebug {
  at: string;
  event: string;
  api: 'ok' | 'error';
  origin?: string;
  error?: string;
  writeAllowed?: boolean;
  remote?: number;
  sent?: number;
  same?: number;
  conflicts?: string[];
}
export type AutoMode = 'manual' | 'close' | 'idle' | 'interval';
export const AUTO_MODES: AutoMode[] = ['manual', 'close', 'idle', 'interval'];
export function clampAutoMinutes(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(120, Math.max(1, Math.round(value)));
}
export interface SavedData {
  server: string;
  allowHttp: boolean;
  token: string;
  autoSync: boolean;
  autoMode: AutoMode;
  autoMinutes: number;
  connections: Record<string, ConnectionData>;
  history: HistoryEntry[];
  lastDebug?: LastDebug;
}
export const supported = new Set(['md', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf']);
export function fileKind(path: string): Kind {
  const ext = path.split('.').pop()!.toLowerCase();
  return (ext === 'md' ? 'markdown' : ext === 'jpg' ? 'jpeg' : ext) as Kind;
}
export function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
export function safePath(path: string): string {
  if (!path || path !== path.trim() || path.startsWith('/') || /[\\\u0000-\u001f]/u.test(path) || path.split('/').some(p => !p || p === '..' || p.startsWith('.'))) {
    throw new Error(`Недопустимый путь: ${path}`);
  }
  return path.normalize('NFC');
}
export function eligible(path: string): boolean {
  try { safePath(path); return supported.has(path.split('.').pop()!.toLowerCase()); } catch { return false; }
}
export function serverOrigin(value: string, allowHttp: boolean): string {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Укажите только адрес сервера, без пути, пароля и параметров.');
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw new Error('Нужен HTTPS. Для тестового HTTP включите отдельное разрешение.');
  return url.origin;
}
export function safeLink(origin: string, link: string): string {
  const url = new URL(link, origin);
  if (url.origin !== origin || url.username || url.password) throw new Error('Сервер вернул ссылку на другой адрес.');
  return url.href;
}
export function connectionKey(origin: string, userId: string): string { return JSON.stringify([origin, userId]); }
export function classify(localHash: string | undefined, remote: RemoteFile | undefined, base: Baseline | undefined): Change {
  if (localHash === undefined) {
    if (!base || !remote) return 'same';
    return remote.version === base.version ? 'deleted' : 'conflict';
  }
  if (remote?.sha256 === localHash) return 'same';
  if (!remote) return base ? 'conflict' : 'new';
  if (!base) return 'conflict';
  if (remote.version === base.version) return 'changed';
  return localHash === base.localHash ? 'remote' : 'conflict';
}
export function rememberSame(baseline: Baselines, path: string, remote: RemoteFile, localHash: string): void {
  baseline[path] = { sha256: remote.sha256, version: remote.version, localHash };
}

export function applyResults(baseline: Baselines, operations: Operation[], results: RemoteFile[]): void {
  const byPath = new Map(results.map(r => [r.path, r]));
  // Validate before changing the persisted baseline. Never infer success from a new manifest.
  for (const op of operations) {
    if (op.op === 'upsert') {
      const result = byPath.get(op.path);
      if (!result || result.sha256 !== op.sha256 || !result.version) throw new Error('В результате передачи отсутствуют подтверждённые версии. Нужна проверка API.');
    }
  }
  for (const op of operations) {
    if (op.op === 'delete') delete baseline[op.path];
    else baseline[op.path] = { sha256: op.sha256, localHash: op.sha256, version: byPath.get(op.path)!.version };
  }
}
export const changeLabels: Record<Change, string> = {
  new: 'Новый', changed: 'Изменён локально', same: 'Совпадает', remote: 'Изменён на сервере', conflict: 'Конфликт', deleted: 'Удалён локально'
};

export function deleteOp(
  path: string,
  remote: RemoteFile | undefined,
  base: Baseline | undefined,
): Operation | null {
  const change = classify(undefined, remote, base);
  if (change === 'same') return null;
  if (!remote?.version) return null;
  return { op: 'delete', path, expected_version: remote.version };
}

export function chunkOps(
  operations: Operation[],
  limits: { batch_max_operations: number; batch_max_bytes: number },
): Operation[][] {
  const chunks: Operation[][] = [];
  let current: Operation[] = [];
  let bytes = 0;
  for (const op of operations) {
    const size = op.op === 'upsert' ? op.size : 0;
    if (current.length && (current.length >= limits.batch_max_operations || bytes + size > limits.batch_max_bytes)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(op);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
