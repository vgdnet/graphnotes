import { Api, ApiError, sourcesApplied, type Transfer } from './api';
import { sha256, type Operation, type Pending } from './core';

export type Phase = 'prepare' | 'upload' | 'apply' | 'index' | 'done';
export const phaseLabel: Record<Phase, string> = {
  prepare: 'Подготовка',
  upload: 'Передача',
  apply: 'Применение',
  index: 'Обновление графа',
  done: 'Готово',
};

export class SnapshotChangedError extends Error {
  constructor(readonly paths: string[]) {
    super('Локальные файлы изменились после подготовки. Отмените план и подготовьте новый.');
  }
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Отменено.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function backoff(attempt: number): number {
  return 400 * (2 ** attempt) + Math.floor(Math.random() * 200);
}

export function canRetry(error: unknown): boolean {
  if (error instanceof SnapshotChangedError) return false;
  if (error instanceof ApiError) {
    return error.status === 429 || error.status === 503 || error.code === 'rate_limited' || error.code === 'temporarily_unavailable';
  }
  if (error && typeof error === 'object' && 'code' in error) {
    return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE'].includes(String((error as { code?: string }).code));
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('перенаправление')) return false;
    return message.includes('не ответил') || message.includes('socket') || message.includes('timeout') || message.includes('econn');
  }
  return false;
}

export async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (signal?.aborted) throw signal.reason ?? new Error('Отменено.');
    try { return await fn(); }
    catch (error) {
      last = error;
      if (!canRetry(error) || attempt === 4) throw error;
      const wait = error instanceof ApiError && error.retryAfter > 0 ? error.retryAfter : backoff(attempt);
      await sleep(wait, signal);
    }
  }
  throw last;
}

export async function collectBlobs(
  operations: Operation[],
  read: (path: string) => Promise<Uint8Array | undefined>,
): Promise<Map<string, Uint8Array>> {
  const blobs = new Map<string, Uint8Array>();
  const changed: string[] = [];
  for (const op of operations) {
    if (op.op !== 'upsert' || blobs.has(op.sha256)) continue;
    const bytes = await read(op.path);
    if (!bytes || bytes.byteLength !== op.size || sha256(bytes) !== op.sha256) changed.push(op.path);
    else blobs.set(op.sha256, bytes);
  }
  if (changed.length) throw new SnapshotChangedError(changed);
  return blobs;
}

async function mapPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(Math.max(n, 1), queue.length) || 0 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) return;
      await fn(item);
    }
  }));
}

export interface RunOptions {
  api: Api;
  clientId: string;
  pending: Pending;
  read: (path: string) => Promise<Uint8Array | undefined>;
  persist: (pending: Pending) => Promise<void>;
  onProgress: (phase: Phase, detail?: string) => void;
  signal: AbortSignal;
}

const FINISHED = new Set(['succeeded', 'indexing_failed', 'conflict', 'failed', 'cancelled', 'expired']);

async function waitFinished(api: Api, id: string, onProgress: RunOptions['onProgress'], signal: AbortSignal): Promise<Transfer> {
  for (;;) {
    if (signal.aborted) throw signal.reason ?? new Error('Отменено.');
    const transfer = await withRetry(() => api.status(id), signal);
    if (FINISHED.has(transfer.state)) {
      onProgress(transfer.state === 'succeeded' ? 'done' : transfer.state === 'indexing_failed' ? 'index' : 'apply');
      return transfer;
    }
    if (transfer.state === 'awaiting_upload' || transfer.state === 'ready') return transfer;
    onProgress(transfer.state === 'indexing' ? 'index' : 'apply');
    await sleep(1000, signal);
  }
}

export async function runTransfer(opts: RunOptions): Promise<Transfer> {
  const { api, clientId, pending, read, persist, onProgress, signal } = opts;
  onProgress('prepare');
  let transfer: Transfer | undefined;

  if (pending.transferId) {
    transfer = await withRetry(() => api.status(pending.transferId!), signal);
    if (transfer.state === 'succeeded') {
      onProgress('done');
      return transfer;
    }
    if (transfer.state === 'indexing') {
      onProgress('index');
      transfer = await waitFinished(api, transfer.transfer_id, onProgress, signal);
    }
    if (transfer.state === 'indexing_failed') {
      onProgress('index');
      transfer = await withRetry(() => api.commit(transfer!.transfer_id), signal);
      if (transfer.state === 'applying' || transfer.state === 'indexing') {
        transfer = await waitFinished(api, transfer.transfer_id, onProgress, signal);
      }
      return transfer;
    }
    if (FINISHED.has(transfer.state)) return transfer;
    if (transfer.state === 'applying') {
      onProgress('apply');
      return waitFinished(api, transfer.transfer_id, onProgress, signal);
    }
  }

  const blobs = await collectBlobs(pending.operations, read);
  if (!transfer) {
    transfer = await withRetry(() => api.create(clientId, pending.operations, pending.key), signal);
    pending.transferId = transfer.transfer_id;
    await persist(pending);
  }
  if (sourcesApplied(transfer)) {
    onProgress(transfer.state === 'succeeded' ? 'done' : 'index');
    return transfer;
  }

  if (transfer.state === 'awaiting_upload') {
    onProgress('upload');
    await mapPool(transfer.required_blobs, 3, async blob => {
      const bytes = blobs.get(blob.sha256);
      if (!bytes) throw new SnapshotChangedError(['(хеш ' + blob.sha256.slice(0, 8) + '…)']);
      await withRetry(() => api.upload(transfer!.transfer_id, blob.sha256, bytes), signal);
    });
  }

  onProgress('apply');
  transfer = await withRetry(() => api.commit(transfer!.transfer_id), signal);
  if (transfer.state === 'applying' || transfer.state === 'indexing') {
    onProgress(transfer.state === 'indexing' ? 'index' : 'apply');
    transfer = await waitFinished(api, transfer.transfer_id, onProgress, signal);
  }
  onProgress(transfer.state === 'succeeded' ? 'done' : transfer.state === 'indexing' || transfer.state === 'indexing_failed' ? 'index' : 'apply');
  return transfer;
}

export async function cancelTransfer(api: Api, pending: Pending, signal?: AbortSignal): Promise<void> {
  if (!pending.transferId) return;
  try { await withRetry(() => api.cancel(pending.transferId!), signal); }
  catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.code === 'invalid_state')) return;
    throw error;
  }
}
