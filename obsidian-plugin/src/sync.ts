import { Notice, TAbstractFile, TFile, type App } from 'obsidian';
import { Api, sourcesApplied, type Capabilities, type Transfer } from './api';
import {
  applyResults, classify, connectionKey, eligible, fileKind, safePath, sha256,
  type Operation, type RemoteFile, type SavedData,
} from './core';
import { vaultEligible } from './links';
import { cancelTransfer, runTransfer, SnapshotChangedError } from './runner';
import { connectionOf, pushHistory } from './store';

const DEBOUNCE_MS = 2500;

export interface SyncPlugin {
  app: App;
  saved: SavedData;
  token: string;
  persist(): Promise<void>;
  connect(signal: AbortSignal): { origin: string; api: Api };
  registerEvent(eventRef: any): any;
  beginSync(): AbortSignal;
  onConflicts(paths: string[]): void;
}

export class VaultSync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queued = new Set<string>();
  private removed = new Set<string>();
  private running = false;
  private again: 'queued' | 'all' | null = null;

  get busy(): boolean {
    return this.running;
  }

  constructor(private readonly plugin: SyncPlugin) {}

  watch(): void {
    const vault = this.plugin.app.vault;
    this.plugin.registerEvent(vault.on('modify', file => this.onFile(file)));
    this.plugin.registerEvent(vault.on('create', file => this.onFile(file)));
    this.plugin.registerEvent(vault.on('delete', file => this.onRemove(file.path)));
    this.plugin.registerEvent(vault.on('rename', (file, oldPath) => {
      this.onRemove(oldPath);
      this.onFile(file);
    }));
  }

  pushAll(notice = true): void {
    this.queued.clear();
    for (const file of vaultEligible(this.plugin.app)) this.queued.add(file.path);
    void this.flush('all', notice);
  }

  private ready(): boolean {
    return !!this.plugin.token.trim() && !!this.plugin.saved.server.trim();
  }

  private onFile(file: TAbstractFile): void {
    if (!(file instanceof TFile) || !eligible(file.path) || !this.plugin.saved.autoSync || !this.ready()) return;
    this.queued.add(file.path);
    this.schedule();
  }

  private onRemove(path: string): void {
    if (!eligible(path) || !this.plugin.saved.autoSync || !this.ready()) return;
    this.queued.delete(path);
    this.removed.add(path);
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush('queued', false);
    }, DEBOUNCE_MS);
  }

  async flush(scope: 'queued' | 'all', notice: boolean): Promise<void> {
    if (this.running) {
      this.again = scope;
      return;
    }
    if (!this.ready()) {
      if (notice) new Notice('Укажите адрес и токен GraphNotes.');
      return;
    }
    this.running = true;
    try {
      await this.send(scope, notice);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Не удалось отправить правки в GraphNotes.');
    } finally {
      this.running = false;
      const next = this.again;
      this.again = null;
      if (next) void this.flush(next, notice);
    }
  }

  private async send(scope: 'queued' | 'all', notice: boolean): Promise<void> {
    const paths = scope === 'all' ? vaultEligible(this.plugin.app).map(file => file.path) : [...this.queued];
    const removed = [...this.removed];
    this.queued.clear();
    this.removed.clear();

    const signal = this.plugin.beginSync();
    const { api } = this.plugin.connect(signal);
    const caps = await api.capabilities();
    if (!caps.write_allowed || !caps.scopes.includes('personal:write')) {
      new Notice('Сервер не разрешил запись в личное хранилище.');
      return;
    }
    const remote = new Map((await api.manifest(caps.limits.manifest_page_size)).map(file => [file.path, file]));
    const conn = connectionOf(this.plugin.saved, connectionKey(api.origin, caps.user.id));
    let resumed = false;
    if (conn.pending) {
      const continued = await this.runPending(api, conn, notice, signal);
      if (!continued) return;
      resumed = true;
    }
    if (!paths.length && !removed.length) {
      if (notice) new Notice(resumed ? 'Передача продолжена.' : 'Нет локальных правок для личного хранилища.');
      return;
    }
    const operations: Operation[] = [];
    const conflicts: string[] = [];

    for (const path of paths) {
      const op = await this.upsertOp(path, remote.get(path), conn.baseline[path], caps);
      if (op === 'conflict') conflicts.push(path);
      else if (op) operations.push(op);
    }
    if (caps.scopes.includes('personal:delete')) {
      const extra = scope === 'all'
        ? Object.keys(conn.baseline).filter(path => !this.plugin.app.vault.getAbstractFileByPath(path))
        : removed;
      for (const path of extra) {
        const op = deleteOp(path, remote.get(path), conn.baseline[path]);
        if (op === 'conflict') conflicts.push(path);
        else if (op) operations.push(op);
      }
    }

    if (!operations.length) {
      if (conflicts.length) this.plugin.onConflicts(conflicts);
      else if (notice) new Notice('Нет локальных правок для личного хранилища.');
      return;
    }

    for (const chunk of chunkOps(operations, caps)) {
      conn.pending = { key: crypto.randomUUID(), createdAt: new Date().toISOString(), operations: chunk };
      await this.plugin.persist();
      let transfer: Transfer | false;
      try {
        transfer = await this.runPending(api, conn, false, signal);
      } catch (error) {
        if (error instanceof SnapshotChangedError) {
          try { if (conn.pending) await cancelTransfer(api, conn.pending, signal); } catch { /* best-effort */ }
          delete conn.pending;
          await this.plugin.persist();
          for (const op of chunk) if (op.op === 'upsert') this.queued.add(op.path);
          this.again = this.again ?? 'queued';
          new Notice(error.message);
          return;
        }
        throw error;
      }
      if (!transfer) return;
      if (transfer.state !== 'succeeded' && transfer.state !== 'indexing' && transfer.state !== 'indexing_failed') {
        return;
      }
    }
    if (notice) new Notice(`В личное хранилище отправлено файлов: ${operations.length}. Общая ризома не изменена.`);
    if (conflicts.length) this.plugin.onConflicts(conflicts);
  }

  private async runPending(
    api: Api,
    conn: ReturnType<typeof connectionOf>,
    notice: boolean,
    signal: AbortSignal,
  ): Promise<Transfer | false> {
    if (!conn.pending) return false;
    const pending = conn.pending;
    const transfer = await runTransfer({
      api,
      clientId: conn.clientId,
      pending,
      read: async path => {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return undefined;
        return new Uint8Array(await this.plugin.app.vault.readBinary(file));
      },
      persist: async next => {
        conn.pending = next;
        await this.plugin.persist();
      },
      onProgress: () => undefined,
      signal,
    });
    pushHistory(this.plugin.saved, {
      at: new Date().toISOString(),
      transferId: transfer.transfer_id,
      state: transfer.state,
      count: pending.operations.length,
    });
    if (sourcesApplied(transfer)) {
      try { applyResults(conn.baseline, pending.operations, transfer.results); }
      catch { /* already applied */ }
      if (transfer.state === 'succeeded') delete conn.pending;
    } else if (transfer.state === 'conflict') {
      const paths = transfer.errors.map(error => error.path).filter((path): path is string => !!path);
      this.plugin.onConflicts(paths.length ? paths : pending.operations.map(op => op.path));
      delete conn.pending;
    } else if (transfer.state === 'cancelled' || transfer.state === 'expired' || transfer.state === 'failed') {
      delete conn.pending;
      if (transfer.errors[0]?.message) new Notice(transfer.errors[0].message);
    }
    await this.plugin.persist();
    if (transfer.state !== 'succeeded' && transfer.state !== 'indexing' && transfer.state !== 'indexing_failed') {
      if (notice && transfer.errors[0]?.message) new Notice(transfer.errors[0].message);
      return false;
    }
    return transfer;
  }

  private async upsertOp(
    path: string,
    remote: RemoteFile | undefined,
    base: { sha256: string; version: string; localHash: string } | undefined,
    caps: Capabilities,
  ): Promise<Operation | 'conflict' | null> {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !eligible(path)) return null;
    const bytes = new Uint8Array(await this.plugin.app.vault.readBinary(file));
    const hash = sha256(bytes);
    const change = classify(hash, remote, base);
    if (change === 'same' || change === 'remote') return null;
    if (change === 'conflict') return 'conflict';
    const kind = fileKind(file.path);
    const max = kind === 'markdown' ? caps.limits.markdown_max_bytes : caps.limits.attachment_max_bytes;
    if (bytes.byteLength > max || path.length > caps.limits.path_max_length) return 'conflict';
    if (caps.limits.path_max_depth && path.split('/').length > caps.limits.path_max_depth) return 'conflict';
    const ext = file.extension.toLowerCase();
    if (!caps.supported_extensions.includes(ext) && !(ext === 'jpg' && caps.supported_extensions.includes('jpeg'))) return null;
    return {
      op: 'upsert',
      path: safePath(path),
      kind,
      expected_version: change === 'new' ? null : (remote?.version ?? null),
      sha256: hash,
      size: bytes.byteLength,
    };
  }
}

function deleteOp(
  path: string,
  remote: RemoteFile | undefined,
  base: { sha256: string; version: string; localHash: string } | undefined,
): Operation | 'conflict' | null {
  const change = classify(undefined, remote, base);
  if (change === 'same') return null;
  if (change !== 'deleted' || !remote?.version) return change === 'conflict' ? 'conflict' : null;
  return { op: 'delete', path, expected_version: remote.version };
}

function chunkOps(operations: Operation[], caps: Capabilities): Operation[][] {
  const chunks: Operation[][] = [];
  let current: Operation[] = [];
  let bytes = 0;
  for (const op of operations) {
    const size = op.op === 'upsert' ? op.size : 0;
    if (current.length && (current.length >= caps.limits.batch_max_operations || bytes + size > caps.limits.batch_max_bytes)) {
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
