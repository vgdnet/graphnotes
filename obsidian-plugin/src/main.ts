import { App, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { Api, ApiError, sourcesApplied, type Capabilities } from './api';
import {
  applyResults, changeLabels, classify, connectionKey, eligible, fileKind, safeLink, safePath,
  serverOrigin, sha256, type Change, type Kind, type Operation, type RemoteFile,
} from './core';
import { relatedPaths, usedInLabel, vaultEligible } from './links';
import { cancelTransfer, phaseLabel, runTransfer, SnapshotChangedError, type Phase } from './runner';
import { connectionOf, emptySaved, normalizeSaved, pushHistory } from './store';
import type { SavedData } from './core';
import { VaultSync } from './sync';

interface ReviewItem {
  path: string;
  kind: Kind;
  size: number;
  hash?: string;
  bytes?: Uint8Array;
  remote?: RemoteFile;
  change: Change;
  selected: boolean;
  replace?: boolean;
  expectedVersion?: string | null;
  usedIn: string[];
  error?: string;
}

const WRITE_REASONS: Record<string, string> = {
  author_contract_required: 'Нужен договор автора в настройках GraphNotes.',
  account_inactive: 'Учётная запись неактивна.',
  write_disabled: 'Сервер запретил запись в личное хранилище.',
  insufficient_scope: 'У токена нет права personal:write.',
  token_expired: 'Срок токена истёк. Создайте новый во вкладке Obsidian.',
  invalid_token: 'Токен не принят. Создайте новый во вкладке Obsidian.',
};

export default class GraphNotesPublisherPlugin extends Plugin {
  saved: SavedData = emptySaved();
  abort?: AbortController;
  syncAbort?: AbortController;
  sync = new VaultSync(this);

  get token(): string {
    return this.saved.token;
  }

  set token(value: string) {
    this.saved.token = value.trim();
  }

  async onload(): Promise<void> {
    this.saved = normalizeSaved(await this.loadData());
    this.sync.watch();
    this.addRibbonIcon('paper-plane', 'GraphNotes: отправить все правки', () => this.sync.pushAll(true));
    this.addCommand({ id: 'sync-all', name: 'Отправить все правки в личное хранилище', callback: () => this.sync.pushAll(true) });
    this.addCommand({ id: 'resume', name: 'Проверить / продолжить', callback: () => this.sync.flush('queued', true) });
    this.addCommand({ id: 'conflicts', name: 'Разобрать конфликты с сервером', callback: () => this.openPublish('conflicts') });
    this.addSettingTab(new GraphNotesSettingTab(this.app, this));
  }

  onunload(): void {
    this.abort?.abort();
    this.syncAbort?.abort();
  }

  persist(): Promise<void> {
    return this.saveData(this.saved);
  }

  beginWork(): AbortSignal {
    this.abort?.abort();
    this.abort = new AbortController();
    return this.abort.signal;
  }

  beginSync(): AbortSignal {
    this.syncAbort?.abort();
    this.syncAbort = new AbortController();
    return this.syncAbort.signal;
  }

  lastConflicts: string[] = [];

  onConflicts(paths: string[]): void {
    this.lastConflicts = paths;
    new Notice(`Конфликт с сервером, не отправлено: ${paths.slice(0, 3).join(', ')}${paths.length > 3 ? '…' : ''}`);
    this.openPublish('conflicts');
  }

  openPublish(mode: 'pick' | 'current' | 'resume' | 'conflicts'): void {
    if (!this.token.trim()) {
      new Notice('Введите токен в настройках GraphNotes Publisher.');
      return;
    }
    if (mode === 'current' && !this.currentNote()) {
      new Notice('Откройте заметку, которую нужно отправить.');
      return;
    }
    if (this.sync.busy && mode !== 'resume' && mode !== 'conflicts') {
      new Notice('Сейчас уже идёт передача. Дождитесь конца или нажмите «Проверить / продолжить».');
      return;
    }
    if (mode !== 'conflicts') this.syncAbort?.abort();
    new PublishModal(this.app, this, mode, mode === 'conflicts' ? this.lastConflicts : []).open();
  }

  currentNote(): TFile | null {
    return this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
  }

  connect(signal: AbortSignal): { origin: string; api: Api } {
    const origin = serverOrigin(this.saved.server || 'https://invalid.invalid', this.saved.allowHttp);
    return { origin, api: new Api(origin, this.token, signal) };
  }
}

class GraphNotesSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: GraphNotesPublisherPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const plugin = this.plugin;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'GraphNotes Publisher' });
    containerEl.createEl('p', {
      cls: 'gn-muted',
      text: 'Правки в этом хранилище сами уходят в личное хранилище GraphNotes. В общую ризому — только Differ на сайте. Токен: Настройки → Obsidian. Пароль учётки сюда не вводится.',
    });

    new Setting(containerEl)
      .setName('Адрес сервера')
      .setDesc('Только origin, без /api. Пример теста: http://172.16.13.14:8080')
      .addText(text => {
        text.setPlaceholder('https://example.org').setValue(plugin.saved.server);
        text.onChange(value => {
          const next = value.trim();
          if (next !== plugin.saved.server) plugin.token = '';
          plugin.saved.server = next;
          void plugin.persist();
        });
      });

    new Setting(containerEl)
      .setName('Разрешить HTTP')
      .setDesc('Только для тестовой установки. Проверку TLS отключить нельзя.')
      .addToggle(toggle => {
        toggle.setValue(plugin.saved.allowHttp).onChange((value: boolean) => {
          plugin.saved.allowHttp = value;
          void plugin.persist();
        });
      });

    new Setting(containerEl)
      .setName('Отправлять правки сразу')
      .setDesc('После сохранения заметки или вложения плагин сам отправит изменение. Выбор карточек не нужен.')
      .addToggle(toggle => {
        toggle.setValue(plugin.saved.autoSync).onChange((value: boolean) => {
          plugin.saved.autoSync = value;
          void plugin.persist();
        });
      });

    new Setting(containerEl)
      .setName('Токен интеграции')
      .setDesc('Токен из настроек GraphNotes (gnp_…). Плагин запоминает его.')
      .addText(text => {
        text.inputEl.type = 'password';
        text.setPlaceholder('gnp_…').setValue(plugin.token);
        text.onChange(value => {
          plugin.token = value;
          void plugin.persist();
        });
      });

    new Setting(containerEl)
      .setName('Все правки сейчас')
      .setDesc('Первая заливка уже существующего vault или повторная сверка всех путей. Совпавшие байты не уходят.')
      .addButton(button => {
        button.setButtonText('Отправить всё').onClick(() => plugin.sync.pushAll(true));
      });

    new Setting(containerEl)
      .setName('Конфликты')
      .setDesc('Показать серверный Markdown и явно подтвердить замену. Серверного force=true нет.')
      .addButton(button => {
        button.setButtonText('Разобрать конфликты').onClick(() => plugin.openPublish('conflicts'));
      });

    const status = containerEl.createDiv({ cls: 'gn-muted' });
    new Setting(containerEl)
      .setName('Подключение')
      .addButton(button => {
        button.setButtonText('Проверить подключение').setCta().onClick(async () => {
          status.setText('Проверка…');
          status.removeClass('gn-error');
          try {
            const signal = plugin.beginWork();
            const { origin, api } = plugin.connect(signal);
            const caps = await api.capabilities();
            const reason = caps.write_allowed ? 'запись разрешена' : (WRITE_REASONS[caps.write_block_reason ?? ''] ?? caps.write_block_reason ?? 'запись запрещена');
            const quota = caps.quota?.personal_remaining_bytes != null
              ? ` Осталось места: ${formatBytes(caps.quota.personal_remaining_bytes)}.`
              : '';
            status.setText(
              `${origin} · ${caps.user.display_name || caps.user.username} · ${reason}. `
              + `Форматы: ${caps.supported_extensions.join(', ')}. `
              + `Markdown до ${formatBytes(caps.limits.markdown_max_bytes)}, вложение до ${formatBytes(caps.limits.attachment_max_bytes)}.`
              + quota,
            );
          } catch (error) {
            status.addClass('gn-error');
            status.setText(describeError(error));
          }
        });
      });

    if (plugin.saved.history.length) {
      containerEl.createEl('h3', { text: 'Последние передачи' });
      for (const entry of plugin.saved.history) {
        containerEl.createEl('div', {
          cls: 'gn-muted',
          text: `${entry.at.slice(0, 19).replace('T', ' ')} · ${entry.state} · файлов: ${entry.count}${entry.transferId ? ` · ${entry.transferId}` : ''}`,
        });
      }
    }

    const credit = containerEl.createEl('p', { cls: 'gn-muted' });
    credit.createEl('span', { text: 'Разработчик: ' });
    const site = credit.createEl('a', { text: 'Юрий Ефимов', href: 'https://t.me/guide_psy' });
    site.setAttr('target', '_blank');
  }
}

class PublishModal extends Modal {
  private filter = '';
  private picked = new Set<string>();
  private items: ReviewItem[] = [];
  private warnings: string[] = [];
  private message = '';
  private error = '';
  private working = false;
  private caps?: Capabilities;
  private origin = '';
  private connKey = '';
  private confirmDeletes = false;

  constructor(
    app: App,
    private readonly plugin: GraphNotesPublisherPlugin,
    private readonly mode: 'pick' | 'current' | 'resume' | 'conflicts',
    private readonly focusPaths: string[] = [],
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.addClass('graphnotes-publisher');
    this.setTitle('Отправка в личное хранилище');
    if (this.mode === 'current') {
      const file = this.plugin.currentNote();
      if (file) this.picked.add(file.path);
    }
    void this.boot();
  }

  onClose(): void {
    this.plugin.abort?.abort();
    this.contentEl.empty();
  }

  private async boot(): Promise<void> {
    this.working = true;
    this.render();
    try {
      const signal = this.plugin.beginWork();
      const { origin, api } = this.plugin.connect(signal);
      this.origin = origin;
      this.caps = await api.capabilities();
      this.connKey = connectionKey(origin, this.caps.user.id);
      const conn = connectionOf(this.plugin.saved, this.connKey);
      if (this.mode === 'resume') {
        if (!conn.pending) {
          this.error = 'Нет незавершённой передачи для этого сервера и аккаунта.';
          return;
        }
        await this.continuePending();
        return;
      }
      if (this.mode === 'current' || this.mode === 'conflicts') await this.compare();
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.working = false;
      this.render();
    }
  }

  private files(): TFile[] {
    const list = vaultEligible(this.app);
    const q = this.filter.trim().toLowerCase();
    return q ? list.filter(file => file.path.toLowerCase().includes(q)) : list;
  }

  private toggleFolder(prefix: string, on: boolean): void {
    const start = prefix.endsWith('/') ? prefix : prefix + '/';
    for (const file of vaultEligible(this.app)) {
      if (file.path === prefix || file.path.startsWith(start)) {
        if (on) this.picked.add(file.path);
        else this.picked.delete(file.path);
      }
    }
  }

  private async compare(): Promise<void> {
    if (!this.caps) return;
    this.working = true;
    this.error = '';
    this.message = 'Сверка с сервером…';
    this.render();
    try {
      const signal = this.plugin.beginWork();
      const { api } = this.plugin.connect(signal);
      const remote = new Map((await api.manifest(this.caps.limits.manifest_page_size)).map(file => [file.path, file]));
      const conn = connectionOf(this.plugin.saved, this.connKey);
      const seeds = new Set(this.mode === 'conflicts' ? this.focusPaths : this.picked);
      if (this.mode === 'conflicts') {
        for (const file of vaultEligible(this.app)) seeds.add(file.path);
        for (const path of Object.keys(conn.baseline)) seeds.add(path);
      }
      const usedIn = new Map<string, string[]>();
      const missing: string[] = [];
      const skippedNotes: string[] = [];

      for (const path of [...seeds]) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile) || file.extension !== 'md') continue;
        const related = relatedPaths(this.app, file);
        for (const attach of related.attachments) {
          seeds.add(attach);
          const list = usedIn.get(attach) ?? [];
          list.push(path);
          usedIn.set(attach, list);
        }
        skippedNotes.push(...related.notes);
        missing.push(...related.missing.map(name => `${name} (из ${path})`));
      }

      const prefixes = folderPrefixes(this.picked);
      for (const path of Object.keys(conn.baseline)) {
        if (prefixes.some(prefix => path === prefix || path.startsWith(prefix + '/')) && !this.app.vault.getAbstractFileByPath(path)) {
          seeds.add(path);
        }
      }

      const items: ReviewItem[] = [];
      for (const path of [...seeds].sort((a, b) => a.localeCompare(b, 'ru'))) {
        items.push(await this.itemFromPath(path, remote.get(path), conn.baseline[path], usedIn.get(path) ?? []));
      }
      this.items = this.mode === 'conflicts'
        ? items.filter(item => item.change === 'conflict' || item.change === 'remote' || item.replace)
        : items;
      this.warnings = [];
      if (this.mode === 'conflicts' && !this.items.length) {
        this.message = 'Конфликтов с сервером нет. Совпавшие байты не передаются.';
      }
      if (skippedNotes.length) {
        this.warnings.push('Связанные заметки не выбраны автоматически: ' + unique(skippedNotes).slice(0, 8).join(', '));
      }
      if (missing.length) this.warnings.push('Не найдены материалы: ' + unique(missing).slice(0, 8).join(', '));
      if (items.length > 500) this.warnings.push('Показаны первые 500 путей. Сузьте выбор папкой или фильтром.');
      this.message = `${this.caps.user.username} · ${this.caps.write_allowed ? 'запись разрешена' : WRITE_REASONS[this.caps.write_block_reason ?? ''] ?? 'запись запрещена'}`;
    } catch (error) {
      this.error = describeError(error);
    } finally {
      this.working = false;
      this.render();
    }
  }

  private async itemFromPath(path: string, remote: RemoteFile | undefined, base: { sha256: string; version: string; localHash: string } | undefined, usedIn: string[]): Promise<ReviewItem> {
    const file = this.app.vault.getAbstractFileByPath(path);
    let bytes: Uint8Array | undefined;
    let hash: string | undefined;
    let size = remote?.size ?? 0;
    let kind: Kind = remote?.kind ?? (eligible(path) ? fileKind(path) : 'markdown');
    if (file instanceof TFile) {
      bytes = new Uint8Array(await this.app.vault.readBinary(file));
      hash = sha256(bytes);
      size = bytes.byteLength;
      kind = fileKind(file.path);
    }
    const change = classify(hash, remote, base);
    const selected = change === 'new' || change === 'changed';
    const item: ReviewItem = { path, kind, size, hash, bytes, remote, change, selected, usedIn };
    const limits = this.caps?.limits;
    if (file instanceof TFile && limits) {
      const max = kind === 'markdown' ? limits.markdown_max_bytes : limits.attachment_max_bytes;
      if (size > max) {
        item.selected = false;
        item.error = `Больше лимита ${formatBytes(max)}`;
      }
      if (path.length > limits.path_max_length) {
        item.selected = false;
        item.error = 'Путь длиннее лимита сервера';
      }
      if (limits.path_max_depth && path.split('/').length > limits.path_max_depth) {
        item.selected = false;
        item.error = 'Слишком глубокий путь';
      }
    }
    if (file instanceof TFile && this.caps && !this.caps.supported_extensions.includes(file.extension.toLowerCase()) && !(file.extension.toLowerCase() === 'jpg' && this.caps.supported_extensions.includes('jpeg'))) {
      item.selected = false;
      item.error = 'Сервер не принимает этот формат';
    }
    return item;
  }

  private operations(): Operation[] {
    const ops: Operation[] = [];
    for (const item of this.items) {
      if (!item.selected || item.error) continue;
      if (item.change === 'deleted') {
        const version = item.expectedVersion ?? item.remote?.version;
        if (!version) throw new Error(`Нет версии для удаления ${item.path}`);
        ops.push({ op: 'delete', path: item.path, expected_version: version });
        continue;
      }
      if (!item.hash || !item.bytes) continue;
      const expected = item.replace ? (item.expectedVersion ?? item.remote?.version ?? null) : item.change === 'new' ? null : (item.remote?.version ?? null);
      ops.push({
        op: 'upsert',
        path: safePath(item.path),
        kind: item.kind,
        expected_version: expected,
        sha256: item.hash,
        size: item.size,
      });
    }
    return ops;
  }

  private async send(): Promise<void> {
    if (!this.caps) return;
    const deletes = this.items.filter(item => item.selected && item.change === 'deleted');
    if (deletes.length && !this.confirmDeletes) {
      this.confirmDeletes = true;
      this.error = '';
      this.render();
      return;
    }
    if (!this.caps.write_allowed) {
      this.error = WRITE_REASONS[this.caps.write_block_reason ?? ''] ?? 'Сервер запретил запись.';
      this.render();
      return;
    }
    if (!this.caps.scopes.includes('personal:write')) {
      this.error = WRITE_REASONS.insufficient_scope;
      this.render();
      return;
    }
    if (deletes.length && !this.caps.scopes.includes('personal:delete')) {
      this.error = 'Для удаления нужен scope personal:delete.';
      this.render();
      return;
    }
    let operations: Operation[];
    try { operations = this.operations(); }
    catch (error) {
      this.error = describeError(error);
      this.render();
      return;
    }
    if (!operations.length) {
      this.error = 'Нет выбранных изменений для отправки.';
      this.render();
      return;
    }
    const bytes = operations.filter(op => op.op === 'upsert').reduce((sum, op) => sum + op.size, 0);
    if (operations.length > this.caps.limits.batch_max_operations || bytes > this.caps.limits.batch_max_bytes) {
      this.error = `Пакет больше лимита сервера (${operations.length} операций, ${formatBytes(bytes)}).`;
      this.render();
      return;
    }

    const conn = connectionOf(this.plugin.saved, this.connKey);
    conn.pending = { key: crypto.randomUUID(), createdAt: new Date().toISOString(), operations };
    await this.plugin.persist();
    await this.continuePending();
  }

  private async continuePending(): Promise<void> {
    const conn = connectionOf(this.plugin.saved, this.connKey);
    if (!conn.pending) return;
    this.working = true;
    this.error = '';
    this.message = phaseLabel.prepare;
    this.render();
    const signal = this.plugin.beginWork();
    try {
      const { api } = this.plugin.connect(signal);
      const transfer = await runTransfer({
        api,
        clientId: conn.clientId,
        pending: conn.pending,
        read: async path => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (!(file instanceof TFile)) return undefined;
          return new Uint8Array(await this.app.vault.readBinary(file));
        },
        persist: async pending => {
          conn.pending = pending;
          await this.plugin.persist();
        },
        onProgress: (phase: Phase, detail?: string) => {
          this.message = detail ? `${phaseLabel[phase]} · ${detail}` : phaseLabel[phase];
          this.render();
        },
        signal,
      });

      pushHistory(this.plugin.saved, {
        at: new Date().toISOString(),
        transferId: transfer.transfer_id,
        state: transfer.state,
        count: conn.pending.operations.length,
      });

      if (sourcesApplied(transfer)) {
        try {
          if (conn.pending.operations.length) applyResults(conn.baseline, conn.pending.operations, transfer.results);
        } catch (error) {
          if (!transfer.files_applied && transfer.state !== 'succeeded') throw error;
        }
        this.confirmDeletes = false;
        if (transfer.state === 'succeeded') {
          delete conn.pending;
          this.message = 'Готово. Общая ризома не изменена.';
        } else {
          this.message = transfer.state === 'indexing_failed'
            ? 'Файлы сохранены, обновление графа не завершено. Нажмите «Проверить / продолжить».'
            : 'Файлы сохранены, граф ещё обновляется.';
        }
      } else if (transfer.state === 'conflict') {
        this.error = transferMessage(transfer) || 'Конфликт версий. Пакет не применён.';
        delete conn.pending;
      } else {
        this.error = transferMessage(transfer) || `Передача в состоянии ${transfer.state}.`;
        if (transfer.state === 'cancelled' || transfer.state === 'expired' || transfer.state === 'failed') delete conn.pending;
      }
      await this.plugin.persist();
    } catch (error) {
      if (error instanceof SnapshotChangedError) {
        this.error = error.message;
        try {
          const { api } = this.plugin.connect(signal);
          if (conn.pending) await cancelTransfer(api, conn.pending, signal);
        } catch { /* cancel best-effort */ }
        delete conn.pending;
        await this.plugin.persist();
      } else {
        this.error = describeError(error) + (conn.pending?.transferId ? ' Откройте окно снова и нажмите «Проверить / продолжить».' : '');
      }
    } finally {
      this.working = false;
      this.render();
    }
  }

  private async viewRemote(item: ReviewItem): Promise<void> {
    try {
      const signal = this.plugin.beginWork();
      const { api } = this.plugin.connect(signal);
      const content = await api.content(item.path);
      item.expectedVersion = content.version ?? item.remote?.version;
      const text = item.kind === 'markdown' ? new TextDecoder().decode(content.bytes) : `(${item.kind}, ${formatBytes(content.bytes.byteLength)})`;
      new RemoteViewModal(this.app, item.path, text).open();
    } catch (error) {
      this.error = describeError(error);
      this.render();
    }
  }

  private async replaceMine(item: ReviewItem): Promise<void> {
    try {
      const signal = this.plugin.beginWork();
      const { api } = this.plugin.connect(signal);
      const content = await api.content(item.path);
      item.replace = true;
      item.selected = true;
      item.expectedVersion = content.version ?? item.remote?.version ?? null;
      this.error = '';
      this.render();
    } catch (error) {
      this.error = describeError(error);
      this.render();
    }
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass('graphnotes-publisher');
    if (this.working) el.addClass('gn-working');
    else el.removeClass('gn-working');

    if (this.caps) {
      el.createEl('div', { cls: 'gn-muted', text: this.message || `${this.origin} · ${this.caps.user.username}` });
    } else if (this.message) {
      el.createEl('div', { cls: 'gn-muted', text: this.message });
    }
    if (this.error) el.createEl('div', { cls: 'gn-error', text: this.error });
    for (const warning of this.warnings) el.createEl('div', { cls: 'gn-muted', text: warning });

    if (!this.items.length && this.mode === 'pick') {
      this.renderPicker(el);
      return;
    }
    if (this.items.length) this.renderReview(el);
    this.renderActions(el);
  }

  private renderPicker(el: HTMLElement): void {
    const search = el.createEl('input', { type: 'search', placeholder: 'Фильтр по пути' });
    search.value = this.filter;
    search.addEventListener('input', () => {
      this.filter = search.value;
      this.render();
      const next = this.contentEl.querySelector('input[type=search]') as HTMLInputElement | null;
      next?.focus();
      next?.setSelectionRange(this.filter.length, this.filter.length);
    });
    const list = el.createDiv({ cls: 'gn-file-list' });
    const shown = this.files().slice(0, 500);
    for (const file of shown) {
      const row = list.createDiv({ cls: 'gn-file' });
      const box = row.createEl('input', { type: 'checkbox' });
      box.checked = this.picked.has(file.path);
      box.addEventListener('change', () => {
        if (box.checked) this.picked.add(file.path);
        else this.picked.delete(file.path);
      });
      row.createEl('span', { text: file.path });
      row.createEl('span', { cls: 'gn-muted', text: file.parent && file.parent.path !== '/' ? 'файл' : 'корень' });
    }
    if (!shown.length) list.createEl('div', { cls: 'gn-muted', text: 'Нет подходящих файлов. Скрытые каталоги и .obsidian исключены.' });
    const folders = unique(vaultEligible(this.app).map(file => file.parent?.path ?? '').filter(path => path && path !== '/')).sort((a, b) => a.localeCompare(b, 'ru'));
    if (folders.length) {
      const select = el.createEl('select');
      select.createEl('option', { text: 'Выбрать папку…', value: '' });
      for (const folder of folders) select.createEl('option', { text: folder, value: folder });
      select.addEventListener('change', () => {
        if (select.value) this.toggleFolder(select.value, true);
        this.render();
      });
    }
  }

  private renderReview(el: HTMLElement): void {
    const selected = this.items.filter(item => item.selected);
    const bytes = selected.reduce((sum, item) => sum + (item.change === 'deleted' ? 0 : item.size), 0);
    el.createEl('div', { cls: 'gn-muted', text: `Выбрано ${selected.length} · ${formatBytes(bytes)}` });
    if (this.confirmDeletes) {
      const deletes = this.items.filter(item => item.selected && item.change === 'deleted');
      el.createEl('div', { cls: 'gn-error', text: 'Подтвердите удаление на сервере:' });
      for (const item of deletes) el.createEl('div', { text: item.path });
    }
    const list = el.createDiv({ cls: 'gn-file-list' });
    for (const item of this.items.slice(0, 500)) {
      const row = list.createDiv({ cls: 'gn-file gn-review-row' });
      const box = row.createEl('input', { type: 'checkbox' });
      box.checked = item.selected;
      box.disabled = !!item.error || item.change === 'same' || item.change === 'remote';
      box.addEventListener('change', () => {
        item.selected = box.checked;
        this.confirmDeletes = false;
        this.render();
      });
      const body = row.createDiv();
      body.createEl('div', { text: item.path });
      body.createEl('div', {
        cls: 'gn-muted',
        text: [
          changeLabels[item.change],
          item.kind,
          formatBytes(item.size),
          usedInLabel(item.usedIn),
          item.replace ? 'заменить серверную версию' : '',
          item.error ?? '',
        ].filter(Boolean).join(' · '),
      });
      if (item.change === 'conflict' || item.change === 'remote') {
        const actions = row.createDiv();
        const view = actions.createEl('button', { text: 'Серверная версия' });
        view.addEventListener('click', () => void this.viewRemote(item));
        if (item.change === 'conflict') {
          const replace = actions.createEl('button', { text: 'Заменить серверную версию моей' });
          replace.addEventListener('click', () => void this.replaceMine(item));
        }
      }
    }
  }

  private renderActions(el: HTMLElement): void {
    const actions = el.createDiv({ cls: 'gn-actions' });
    if (this.mode === 'pick' && !this.items.length) {
      const next = actions.createEl('button', { cls: 'mod-cta', text: 'Сверить выбранное' });
      next.addEventListener('click', () => void this.compare());
      return;
    }
    if (this.items.length) {
      const send = actions.createEl('button', {
        cls: 'mod-cta',
        text: this.confirmDeletes ? 'Удалить отмеченное и отправить' : 'Отправить в личное хранилище',
      });
      send.addEventListener('click', () => void this.send());
      const again = actions.createEl('button', { text: 'Повторить сверку' });
      again.addEventListener('click', () => {
        this.confirmDeletes = false;
        void this.compare();
      });
    }
    const resume = actions.createEl('button', { text: 'Проверить / продолжить' });
    resume.addEventListener('click', () => void this.continuePending());
    if (this.caps) {
      try {
        const graph = actions.createEl('a', { cls: 'gn-link', text: 'Личный граф', href: safeLink(this.origin, this.caps.links.personal_graph) });
        graph.setAttr('target', '_blank');
        const differ = actions.createEl('a', { cls: 'gn-link', text: 'Differ', href: safeLink(this.origin, this.caps.links.differ) });
        differ.setAttr('target', '_blank');
      } catch { /* ignore bad links until server is trusted */ }
    }
  }
}

class RemoteViewModal extends Modal {
  constructor(app: App, private readonly path: string, private readonly text: string) {
    super(app);
  }
  onOpen(): void {
    this.setTitle(this.path);
    this.contentEl.addClass('graphnotes-publisher');
    this.contentEl.createEl('p', { cls: 'gn-muted', text: 'Только просмотр. Текст в vault не записывается.' });
    this.contentEl.createEl('pre', { text: this.text.slice(0, 100_000) });
  }
}

function folderPrefixes(paths: Set<string>): string[] {
  const prefixes = new Set<string>();
  for (const path of paths) {
    const parts = path.split('/');
    if (parts.length > 1) prefixes.add(parts.slice(0, -1).join('/'));
    else prefixes.add('');
  }
  return [...prefixes];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
}

function transferMessage(transfer: { errors: { message?: string; path?: string }[] }): string {
  return transfer.errors.map(error => [error.path, error.message].filter(Boolean).join(': ')).filter(Boolean).join('; ');
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return WRITE_REASONS[error.code] ?? error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка.';
}
