import { Notice, TAbstractFile, TFile, type App } from 'obsidian';
import { Api, sourcesApplied, type Capabilities, type Transfer } from './api';
import {
  applyResults, classify, chunkOps, connectionKey, deleteOp, eligible, fileKind, rememberSame, safePath, sha256,
  type LastDebug, type Operation, type RemoteFile, type SavedData,
} from './core';
import { vaultEligible } from './links';
import { cancelTransfer, runTransfer, SnapshotChangedError } from './runner';
import { connectionOf, pushHistory } from './store';

const STRUCTURAL_MS = 1500;

export interface SyncPlugin {
  app: App;
  saved: SavedData;
  token: string;
  persist(): Promise<void>;
  personalConnect(signal: AbortSignal): { origin: string; api: Api };
  registerEvent(eventRef: unknown): unknown;
  registerInterval(id: number): number;
  beginSync(): AbortSignal;
}

export class VaultSync {
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private structuralTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalId: number | null = null;
  private queued = new Set<string>();
  private removed = new Set<string>();
  private running = false;
  private again: 'queued' | 'all' | null = null;
  private openPath: string | null = null;

  get busy(): boolean {
    return this.running;
  }

  constructor(private readonly plugin: SyncPlugin) {}

  watch(): void {
    const vault = this.plugin.app.vault;
    const workspace = this.plugin.app.workspace;
    this.plugin.registerEvent(vault.on('modify', file => this.onFile(file)));
    this.plugin.registerEvent(vault.on('create', file => this.onFile(file)));
    this.plugin.registerEvent(vault.on('delete', file => this.onRemove(file.path)));
    this.plugin.registerEvent(vault.on('rename', (file, oldPath) => {
      this.onRemove(oldPath);
      this.onFile(file);
    }));
    this.plugin.registerEvent(workspace.on('file-open', file => this.onOpen(file)));
    this.plugin.registerEvent(workspace.on('active-leaf-change', () => this.onOpen(workspace.getActiveFile())));
    this.openPath = workspace.getActiveFile()?.path ?? null;
    this.reconfigure();
  }

  reconfigure(): void {
    this.clearIdle();
    if (this.intervalId != null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.plugin.saved.autoMode === 'interval' && this.plugin.saved.autoSync) {
      const ms = this.plugin.saved.autoMinutes * 60_000;
      this.intervalId = window.setInterval(() => this.flushIfPending(), ms);
      this.plugin.registerInterval(this.intervalId);
    }
  }

  writeNow(notice = true): void {
    void this.pullGranted(false).finally(() => {
      if (this.queued.size || this.removed.size) void this.flush('queued', notice);
      else this.pushAll(notice);
    });
  }

  enqueue(path: string): void {
    if (!eligible(path) || !this.ready()) return;
    this.queued.add(path);
  }

  /** Upload one vault path to personal store. Does not scan the rest of the vault. */
  async pushPath(path: string, notice = false): Promise<void> {
    if (this.running) {
      throw new Error('Сейчас уже идёт передача. Дождитесь конца или нажмите «Проверить / продолжить».');
    }
    if (!this.ready()) {
      throw new Error('Укажите адрес и токен GraphNotes.');
    }
    if (!eligible(path)) {
      throw new Error('Этот файл нельзя передать в личное хранилище.');
    }
    this.running = true;
    try {
      const granted = await this.pullGranted(false);
      await this.sendListed([path], [], 'queued', notice, granted);
      this.queued.delete(path);
    } finally {
      this.running = false;
      const next = this.again;
      this.again = null;
      if (next) void this.flush(next, false);
    }
  }

  pushAll(notice = true): void {
    this.queued.clear();
    for (const file of vaultEligible(this.plugin.app)) this.queued.add(file.path);
    void this.flush('all', notice);
  }

  private ready(): boolean {
    return !!this.plugin.token.trim() && !!this.plugin.saved.server.trim();
  }

  private onOpen(file: TFile | null): void {
    const next = file?.path ?? null;
    const prev = this.openPath;
    this.openPath = next;
    if (this.plugin.saved.autoMode !== 'close' || !this.plugin.saved.autoSync || !this.ready()) return;
    if (prev && prev !== next && (this.queued.has(prev) || this.removed.has(prev))) {
      void this.flush('queued', false);
    }
  }

  private onFile(file: TAbstractFile): void {
    if (!(file instanceof TFile) || !eligible(file.path) || !this.ready()) return;
    this.queued.add(file.path);
    this.afterQueue('edit');
  }

  private onRemove(path: string): void {
    if (!eligible(path) || !this.ready()) return;
    this.queued.delete(path);
    this.removed.add(path);
    this.afterQueue('structural');
  }

  private afterQueue(kind: 'edit' | 'structural'): void {
    if (!this.plugin.saved.autoSync) return;
    const mode = this.plugin.saved.autoMode;
    if (mode === 'idle') this.scheduleIdle();
    if (mode === 'close' && kind === 'structural') this.scheduleStructural();
  }

  private scheduleIdle(): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      void this.flush('queued', false);
    }, this.plugin.saved.autoMinutes * 60_000);
  }

  private scheduleStructural(): void {
    if (this.structuralTimer) clearTimeout(this.structuralTimer);
    this.structuralTimer = setTimeout(() => {
      this.structuralTimer = null;
      void this.flush('queued', false);
    }, STRUCTURAL_MS);
  }

  private clearIdle(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private flushIfPending(): void {
    if (this.queued.size || this.removed.size) void this.flush('queued', false);
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
      const granted = await this.pullGranted(false);
      await this.send(scope, notice, granted);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить правки в GraphNotes.';
      await this.debug({
        at: new Date().toISOString(),
        event: `flush:${scope}`,
        api: 'error',
        error: message,
      });
      new Notice(message);
    } finally {
      this.running = false;
      const next = this.again;
      this.again = null;
      if (next) void this.flush(next, notice);
    }
  }

  async replaceWithLocal(paths: string[]): Promise<void> {
    if (this.running) {
      new Notice('Сейчас уже идёт передача. Дождитесь конца или нажмите «Проверить / продолжить».');
      return;
    }
    if (!this.ready()) {
      new Notice('Укажите адрес и токен GraphNotes.');
      return;
    }
    this.running = true;
    try {
      const signal = this.plugin.beginSync();
      const { api } = this.plugin.personalConnect(signal);
      const caps = await api.capabilities();
      if (!caps.write_allowed || !caps.scopes.includes('personal:write')) {
        new Notice('Сервер не разрешил запись в личное хранилище.');
        return;
      }
      const conn = connectionOf(this.plugin.saved, connectionKey(api.origin, caps.user.id));
      if (conn.pending) {
        const continued = await this.runPending(api, conn, true, signal);
        if (!continued) return;
      }
      const operations: Operation[] = [];
      for (const path of paths) {
        const op = await this.replaceOp(path, api, caps);
        if (op) operations.push(op);
      }
      if (!operations.length) {
        new Notice('Нет локальных файлов для замены серверной версии.');
        return;
      }
      await this.commitOps(api, conn, caps, operations, true, signal);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : 'Не удалось заменить серверную версию.');
    } finally {
      this.running = false;
      const next = this.again;
      this.again = null;
      if (next) void this.flush(next, false);
    }
  }

  async pullGranted(notice: boolean): Promise<Set<string>> {
    const granted = new Set<string>();
    if (!this.ready()) return granted;
    try {
      const signal = this.plugin.beginSync();
      const { api } = this.plugin.personalConnect(signal);
      const items = await api.granted();
      let downloaded = 0;
      let synced = 0;
      for (const item of items) {
        granted.add(item.path);
        const existing = this.plugin.app.vault.getAbstractFileByPath(item.path);
        if (!(existing instanceof TFile)) {
          const content = await api.grantedContent(item.path);
          await this.writeLocal(item.path, content.bytes);
          downloaded += 1;
          continue;
        }
        const bytes = new Uint8Array(await this.plugin.app.vault.readBinary(existing));
        if (sha256(bytes) === item.sha256) continue;
        await api.putGranted(item.path, bytes);
        synced += 1;
      }
      if (notice && (downloaded || synced)) {
        new Notice(`Выданные карточки: скачано ${downloaded}, синхронизировано ${synced}.`);
      }
    } catch (error) {
      if (notice) {
        new Notice(error instanceof Error ? error.message : 'Не удалось получить выданные карточки.');
      }
    }
    return granted;
  }

  private async writeLocal(path: string, bytes: Uint8Array): Promise<void> {
    const slash = path.lastIndexOf('/');
    if (slash > 0) {
      const folder = path.slice(0, slash);
      if (!this.plugin.app.vault.getAbstractFileByPath(folder)) {
        await this.plugin.app.vault.createFolder(folder).catch(() => undefined);
      }
    }
    const text = new TextDecoder().decode(bytes);
    const existing = this.plugin.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.plugin.app.vault.modify(existing, text);
      return;
    }
    await this.plugin.app.vault.create(path, text);
  }

  private async send(scope: 'queued' | 'all', notice: boolean, grantedPaths = new Set<string>()): Promise<void> {
    const paths = scope === 'all' ? vaultEligible(this.plugin.app).map(file => file.path) : [...this.queued];
    const removed = [...this.removed];
    this.queued.clear();
    this.removed.clear();
    await this.sendListed(paths, removed, scope, notice, grantedPaths);
  }

  private async sendListed(
    paths: string[],
    removed: string[],
    scope: 'queued' | 'all',
    notice: boolean,
    grantedPaths: Set<string>,
  ): Promise<void> {
    const signal = this.plugin.beginSync();
    const { api } = this.plugin.personalConnect(signal);
    const caps = await api.capabilities();
    if (!caps.write_allowed || !caps.scopes.includes('personal:write')) {
      await this.debug({
        at: new Date().toISOString(),
        event: `send:${scope}`,
        api: 'ok',
        origin: api.origin,
        writeAllowed: false,
        error: caps.write_block_reason ?? 'write_not_allowed',
      });
      throw new Error('Сервер не разрешил запись в личное хранилище.');
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
    let same = 0;

    for (const path of paths) {
      if (grantedPaths.has(path)) continue;
      const op = await this.upsertOp(path, remote.get(path), conn.baseline, caps);
      if (op === 'same') same += 1;
      else if (op) operations.push(op);
    }
    if (caps.scopes.includes('personal:delete')) {
      const extra = scope === 'all'
        ? Object.keys(conn.baseline).filter(path => !this.plugin.app.vault.getAbstractFileByPath(path))
        : removed;
      for (const path of extra) {
        if (grantedPaths.has(path)) continue;
        const op = deleteOp(path, remote.get(path), conn.baseline[path]);
        if (op) operations.push(op);
      }
    }

    if (same) await this.plugin.persist();
    await this.debug({
      at: new Date().toISOString(),
      event: `send:${scope}`,
      api: 'ok',
      origin: api.origin,
      writeAllowed: caps.write_allowed,
      remote: remote.size,
      sent: operations.length,
      same,
    });

    if (!operations.length) {
      if (notice) new Notice('Нет локальных правок для личного хранилища.');
      return;
    }

    await this.commitOps(api, conn, caps, operations, notice, signal);
  }

  private async debug(entry: LastDebug): Promise<void> {
    this.plugin.saved.lastDebug = entry;
    await this.plugin.persist();
  }

  private async commitOps(
    api: Api,
    conn: ReturnType<typeof connectionOf>,
    caps: Capabilities,
    operations: Operation[],
    notice: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    for (const chunk of chunkOps(operations, caps.limits)) {
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
  }

  private async runPending(
    api: Api,
    conn: ReturnType<typeof connectionOf>,
    notice: boolean,
    signal: AbortSignal,
    retried = false,
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
      delete conn.pending;
      if (retried) {
        await this.plugin.persist();
        return false;
      }
      const paths = transfer.errors.map(error => error.path).filter((path): path is string => !!path);
      const retry = paths.length ? paths : pending.operations.map(op => op.path);
      const caps = await api.capabilities();
      const operations: Operation[] = [];
      for (const path of retry) {
        const op = await this.replaceOp(path, api, caps);
        if (op) operations.push(op);
      }
      if (!operations.length) {
        await this.plugin.persist();
        return false;
      }
      conn.pending = { key: crypto.randomUUID(), createdAt: new Date().toISOString(), operations };
      await this.plugin.persist();
      return this.runPending(api, conn, notice, signal, true);
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

  private async replaceOp(path: string, api: Api, caps: Capabilities): Promise<Operation | null> {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !eligible(path)) return null;
    const bytes = new Uint8Array(await this.plugin.app.vault.readBinary(file));
    const kind = fileKind(file.path);
    const max = kind === 'markdown' ? caps.limits.markdown_max_bytes : caps.limits.attachment_max_bytes;
    if (bytes.byteLength > max || path.length > caps.limits.path_max_length) return null;
    if (caps.limits.path_max_depth && path.split('/').length > caps.limits.path_max_depth) return null;
    const content = await api.content(path);
    return {
      op: 'upsert',
      path: safePath(path),
      kind,
      expected_version: content.version ?? null,
      sha256: sha256(bytes),
      size: bytes.byteLength,
    };
  }

  private async upsertOp(
    path: string,
    remote: RemoteFile | undefined,
    baseline: { [path: string]: { sha256: string; version: string; localHash: string } },
    caps: Capabilities,
  ): Promise<Operation | 'same' | null> {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !eligible(path)) return null;
    const bytes = new Uint8Array(await this.plugin.app.vault.readBinary(file));
    const hash = sha256(bytes);
    const change = classify(hash, remote, baseline[path]);
    if (change === 'same') {
      if (remote) rememberSame(baseline, path, remote, hash);
      return 'same';
    }
    if (change === 'remote') return null;
    const kind = fileKind(file.path);
    const max = kind === 'markdown' ? caps.limits.markdown_max_bytes : caps.limits.attachment_max_bytes;
    if (bytes.byteLength > max || path.length > caps.limits.path_max_length) return null;
    if (caps.limits.path_max_depth && path.split('/').length > caps.limits.path_max_depth) return null;
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
