import { App, FuzzySuggestModal, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl } from 'obsidian';
import { Api } from './api';
import {
  CardApiError,
  CardApiService,
  DEFAULT_SETTINGS,
  activeWork,
  isAlreadyAcceptedError,
  isSameWork,
  isWorkCachePath,
  keepSingleWork,
  normalizeSettings,
  normalizeToken,
  proposalItems,
  proposalResolveUrl,
  serverOrigin,
  shouldProbeGrantedList,
  shouldUpdateRhizomeStore,
  summarizeHttpBody,
  workKey,
  workPairPaths,
  type DifferItem,
  type MergePluginSettings,
  type QueueSnapshot,
  type SessionUser,
} from './apiService';
import { VaultSync } from './sync';
import { CardMergeView, MERGE_VIEW_TYPE, type MergeHost, type MergeSession } from './diffView';
import { CardQueueView, QUEUE_VIEW_TYPE } from './queueView';
import {
  NOTICE_FAIL_MS,
  NOTICE_OK_MS,
  RESOLVE_HEARTBEAT_MS,
  RESOLVE_TIMEOUT_MS,
  appendPluginDebugLog,
  lastDebugLines,
  pluginDebugLogPath,
  readPluginDebugLog,
  runWithHeartbeat,
  sanitizeDebugText,
} from './debugLog';
import { openVaultMarkdownTab, vaultNotePath, waitForVaultFile, type ResolveTrace } from './vaultNote';
import {
  asProposeMenuFile,
  describeOfferError,
  offerMarkdownPath,
  proposeClickBlock,
  proposeClickNotice,
  proposeOneNotice,
  proposeOnePath,
  registerProposeMenuEvents,
  shouldShowProposeMenu,
  type ProposeMenuWorkspace,
} from './offer';
import { canProposeToRhizome } from './api';

export default class GraphNotesCardMergePlugin extends Plugin implements MergeHost {
  settings: MergePluginSettings = { ...DEFAULT_SETTINGS };
  sync = new VaultSync(this);
  private abort?: AbortController;
  private syncAbort?: AbortController;
  private accepting = false;
  canPropose: boolean | undefined = undefined;
  proposeDenied = false;
  private offerAbort?: AbortController;

  get token(): string {
    return this.settings.token;
  }

  set token(value: string) {
    this.settings.token = value.trim();
  }

  get saved(): MergePluginSettings {
    return this.settings;
  }

  async onload(): Promise<void> {
    this.registerProposeMenus();
    this.settings = normalizeSettings(await this.loadData());
    if (!this.settings.token) await this.adoptPublisherLogin();
    this.sync.watch();
    this.registerView(MERGE_VIEW_TYPE, leaf => new CardMergeView(leaf, this));
    this.registerView(QUEUE_VIEW_TYPE, leaf => new CardQueueView(leaf, this));
    this.addRibbonIcon('paper-plane', 'GraphNotes: записать в личное хранилище', () => this.sync.writeNow(true));
    this.addRibbonIcon('git-compare', 'GraphNotes: панель', () => void this.openQueue(true));
    this.addCommand({ id: 'write', name: 'Записать в личное хранилище', callback: () => this.sync.writeNow(true) });
    this.addCommand({ id: 'sync-all', name: 'Отправить все правки в личное хранилище', callback: () => this.sync.pushAll(true) });
    this.addCommand({ id: 'resume', name: 'Проверить / продолжить', callback: () => this.sync.flush('queued', true) });
    this.addCommand({
      id: 'open-queue',
      name: 'Открыть панель GraphNotes',
      callback: () => void this.openQueue(true),
    });
    this.addCommand({
      id: 'open-merge',
      name: 'Сравнить и слить карточку',
      callback: () => new OpenMergeModal(this.app, this).open(),
    });
    this.addCommand({
      id: 'save-resolve',
      name: 'Save & Resolve',
      checkCallback: checking => {
        const view = this.app.workspace.getActiveViewOfType(CardMergeView);
        if (!view || view.isResolved()) return false;
        if (!checking) void view.saveAndResolve();
        return true;
      },
    });
    this.addCommand({
      id: 'show-debug-log',
      name: 'Показать debug.log',
      callback: () => void this.showDebugLog(),
    });
    this.addSettingTab(new CardMergeSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      void this.openQueue(false);
      void this.sync.pullGranted(false);
      void this.refreshOfferGate();
    });
  }

  private registerProposeMenus(): void {
    registerProposeMenuEvents(
      this.app.workspace as ProposeMenuWorkspace,
      ev => this.registerEvent(ev as Parameters<Plugin['registerEvent']>[0]),
      {
        canPropose: () => this.canPropose,
        onPropose: file => {
          const found = this.resolveMenuFile(file);
          if (found) void this.proposeOneFile(found);
        },
        activeFile: () => this.app.workspace.getActiveFile(),
      },
    );
  }

  private resolveMenuFile(file: { path: string; extension?: string }): TFile | null {
    const mdPath = offerMarkdownPath(file);
    const paths = mdPath && mdPath !== file.path ? [mdPath, file.path] : [file.path];
    for (const path of paths) {
      const found = this.app.vault.getAbstractFileByPath(path);
      if (found && typeof (found as TFile).extension === 'string' && (found as TFile).extension === 'md') {
        return found as TFile;
      }
    }
    const duck = asProposeMenuFile(file);
    return duck && offerMarkdownPath(duck) ? (file as TFile) : null;
  }

  async refreshOfferGate(): Promise<void> {
    if (!this.settings.token.trim() || !this.settings.server.trim()) {
      this.canPropose = undefined;
      this.proposeDenied = false;
      return;
    }
    this.offerAbort?.abort();
    this.offerAbort = new AbortController();
    const signal = this.offerAbort.signal;
    try {
      const { api } = this.personalConnect(signal);
      const caps = await api.capabilities();
      if (signal.aborted) return;
      this.canPropose = canProposeToRhizome(
        typeof caps.user.role === 'string' ? caps.user.role : '',
        caps.can_propose_to_rhizome,
      );
      this.proposeDenied = this.canPropose === false;
    } catch {
      // Keep the last successful gate. A timeout/abort is not "this account cannot propose".
    }
  }

  async proposeOneFile(file: TFile): Promise<void> {
    try {
      const block = proposeClickBlock(
        Boolean(this.settings.token.trim() && this.settings.server.trim()),
        this.proposeDenied,
      );
      if (block) {
        new Notice(proposeClickNotice(block));
        return;
      }
      if (!shouldShowProposeMenu(true, file)) {
        new Notice('Предложить можно только Markdown-заметку.');
        return;
      }
      await this.sync.pushPath(file.path, false);
      const { api } = this.personalConnect(this.beginWork());
      const result = await proposeOnePath(api, file.path);
      new Notice(proposeOneNotice(result));
    } catch (error) {
      new Notice(describeOfferError(error));
    }
  }

  async openQueue(reveal: boolean): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(QUEUE_VIEW_TYPE)[0];
    if (existing) {
      if (existing.view instanceof CardQueueView) await existing.view.reload();
      if (reveal) workspace.revealLeaf(existing);
      return;
    }
    const leaf = await workspace.ensureSideLeaf(QUEUE_VIEW_TYPE, 'right', { reveal, active: reveal });
    if (reveal) workspace.revealLeaf(leaf);
  }

  /** Reload the existing right-sidebar queue. Never reveal — do not steal the markdown leaf. */
  async reloadQueueInPlace(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(QUEUE_VIEW_TYPE)[0];
    if (existing?.view instanceof CardQueueView) await existing.view.reload();
  }

  async loadQueue(): Promise<QueueSnapshot> {
    const { origin, api } = this.connect();
    const signal = this.beginWork();
    const log = (status: 'OK' | 'FAIL' | 'SKIP', detail: string) => appendPluginDebugLog(
      this.app.vault.adapter,
      this.app.vault.configDir,
      `queue | ${status} | ${detail}`,
    );
    try {
      const session = await api.capabilities(signal);
      this.canPropose = session.canProposeToRhizome;
      this.proposeDenied = session.canProposeToRhizome === false;
      await log(
        'OK',
        `capabilities origin=${origin} role=${session.role} canSeeQueue=${session.canSeeQueue} mode=${session.editorialQueueMode ?? 'unset'}`,
      );
      if (!session.canSeeQueue) {
        await log('SKIP', 'queue hidden: no editor access');
        return {
          mode: 'author',
          items: [],
          canProposeToRhizome: session.canProposeToRhizome,
          editorialQueueMode: session.editorialQueueMode,
        };
      }
      const items = proposalItems(await api.listProposals(signal));
      let queueMode = session.editorialQueueMode;
      if (shouldProbeGrantedList(session.role, queueMode, items.length)) {
        try {
          const granted = await api.granted(signal);
          queueMode = granted.length ? 'granted' : 'none';
          await log('OK', `granted fallback count=${granted.length} mode=${queueMode}`);
        } catch (error) {
          await log('FAIL', `granted fallback ${error instanceof Error ? error.message : 'error'}`);
        }
      }
      await this.markSingleWork(items);
      await log('OK', `GET /api/proposals count=${items.length} mode=${queueMode ?? 'unset'}`);
      return {
        mode: 'review',
        items,
        canProposeToRhizome: session.canProposeToRhizome,
        editorialQueueMode: queueMode,
      };
    } catch (error) {
      await log('FAIL', error instanceof Error ? error.message : 'queue load failed');
      throw error;
    }
  }

  async acceptIntoWork(item: DifferItem): Promise<void> {
    if (!item.proposalId) throw new Error('В очереди нет заявки.');
    if (this.accepting) throw new Error('Уже качаю одну карточку.');
    const current = activeWork(this.settings.inWork);
    if (current && !isSameWork(current, item)) {
      throw new Error('В работе уже одна карточка. Сначала Save & Resolve или «Отменить».');
    }
    this.accepting = true;
    try {
      const { api } = this.connect();
      const file = await api.getProposalWorkFile(item.proposalId, item.path, this.beginWork());
      const paths = workPairPaths(this.app.vault.configDir, item.proposalId, item.path);
      await writeWorkPair(this.app.vault.adapter, paths, file.before, file.body);
      this.settings.inWork = {
        [workKey(item.proposalId, item.path)]: { proposalId: item.proposalId, path: item.path },
      };
      await this.persist();
      new Notice(`Скачаны две карточки: ${item.path}`);
      await this.openQueuedCard({ ...item, inWork: true });
    } finally {
      this.accepting = false;
    }
  }

  async releaseWork(item: DifferItem): Promise<void> {
    if (!item.proposalId) return;
    const paths = workPairPaths(this.app.vault.configDir, item.proposalId, item.path);
    await removeWorkPair(this.app.vault.adapter, paths);
    delete this.settings.inWork[workKey(item.proposalId, item.path)];
    this.settings.inWork = keepSingleWork(this.settings.inWork);
    await this.persist();
  }

  private async markSingleWork(items: DifferItem[]): Promise<void> {
    this.settings.inWork = keepSingleWork(this.settings.inWork);
    const current = activeWork(this.settings.inWork);
    let kept = false;
    for (const item of items) {
      const mine = isSameWork(current, item);
      item.inWork = Boolean(mine && item.proposalId && await this.hasWorkFiles(item.proposalId, item.path));
      if (item.inWork) kept = true;
    }
    if (current && !kept) {
      this.settings.inWork = {};
      await this.persist();
    } else if (Object.keys(this.settings.inWork).length !== (current ? 1 : 0)) {
      await this.persist();
    }
  }

  async openQueuedCard(item: DifferItem): Promise<void> {
    if (!item.proposalId) throw new Error('В очереди нет заявки.');
    if (!(await this.hasWorkFiles(item.proposalId, item.path))) {
      throw new Error('Сначала нажмите «Принять в работу».');
    }
    const paths = workPairPaths(this.app.vault.configDir, item.proposalId, item.path);
    await openMergeLeaf(this.app, {
      localPath: paths.current,
      differPath: item.path,
      remotePath: paths.incoming,
      proposalId: item.proposalId,
    });
  }

  async resolveWork(session: MergeSession, source: string, sharedSource = source): Promise<void> {
    if (!session.proposalId) throw new Error('Нет заявки для публикации.');
    const log = (line: string) => this.traceResolve(line);
    const { origin, api } = this.connect();
    const resolveUrl = proposalResolveUrl(origin, session.proposalId);
    await log(`resolveWork | WAIT | id=${session.proposalId} path=${session.differPath}`);
    if (isWorkCachePath(session.localPath)) {
      await this.app.vault.adapter.write(session.localPath, source);
      await log(`work-cache | OK | ${session.localPath}`);
    }
    const notePath = vaultNotePath(session);
    await log(`writeVaultCard | WAIT | ${notePath}`);
    let file: TFile;
    try {
      file = await writeVaultCard(this.app, notePath, source);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await log(`writeVaultCard | FAIL | ${notePath} ${detail}`);
      throw new Error(`Не удалось записать vault ${notePath}: ${detail}`);
    }
    const indexed = this.app.vault.getAbstractFileByPath(file.path);
    await log(`TFile | ${indexed instanceof TFile ? 'OK' : 'FAIL'} | path=${file.path} found=${indexed instanceof TFile}`);
    await log(`writeVaultCard | OK | ${file.path}`);
    await openVaultNoteThenCloseMerge(this.app, file, log);
    delete this.settings.inWork[workKey(session.proposalId, session.differPath)];
    await this.persist();
    const paths = workPairPaths(this.app.vault.configDir, session.proposalId, session.differPath);
    await removeWorkPair(this.app.vault.adapter, paths);
    await log('queueReload | WAIT | in place');
    await this.reloadQueueInPlace();
    await log('queueReload | OK | in place');
    this.sync.enqueue(file.path);
    void this.sync.flush('queued', false);
    if (!shouldUpdateRhizomeStore(source, sharedSource)) {
      await log('POST /resolve | SKIP | local === shared');
      await log('resolveWork | OK | local-first done');
      return;
    }
    await log(`POST /resolve | WAIT | ${resolveUrl}`);
    try {
      await runWithHeartbeat(api.resolveProposal(session.proposalId, [{ path: session.differPath, source }]), {
        timeoutMs: RESOLVE_TIMEOUT_MS,
        everyMs: RESOLVE_HEARTBEAT_MS,
        onTick: async elapsedMs => {
          const seconds = Math.round(elapsedMs / 1000);
          await log(`POST /resolve | WAIT | ${seconds}s без ответа ${resolveUrl}`);
          if (elapsedMs === 30_000) {
            new Notice(
              `Vault уже записан. POST /resolve уже ${seconds} с без ответа. Смотрите debug.log.`,
              NOTICE_OK_MS,
            );
          }
        },
        timeoutError: () => new Error(
          `POST ${resolveUrl} не ответил за ${RESOLVE_TIMEOUT_MS / 1000} с. `
          + 'Карточка в vault уже записана и открыта. Часто это nginx 504 Gateway Time-out. '
          + 'Команда: GraphNotes: показать debug.log',
        ),
      });
      await log('POST /resolve | OK | HTTP 2xx');
      new Notice('Хранилище ризомы обновлено.', NOTICE_OK_MS);
    } catch (error) {
      const detail = formatResolveFailure(error);
      await log(`POST /resolve | FAIL | ${detail}`);
      if (!isAlreadyAcceptedError(error)) {
        new Notice(`Vault записан. Обновление ризомы не удалось: ${detail}`, NOTICE_FAIL_MS);
      } else {
        await log('POST /resolve | SKIP | already-accepted');
      }
    }
    await log('resolveWork | OK | done');
  }

  async finishLocalCard(session: MergeSession, source: string): Promise<void> {
    const log = (line: string) => this.traceResolve(line);
    const notePath = vaultNotePath(session);
    await log(`finishLocalCard | WAIT | path=${notePath}`);
    let file: TFile;
    try {
      file = await writeVaultCard(this.app, notePath, source);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await log(`writeVaultCard | FAIL | ${notePath} ${detail}`);
      throw new Error(`Не удалось записать vault ${notePath}: ${detail}`);
    }
    await log(`writeVaultCard | OK | ${file.path}`);
    await openVaultNoteThenCloseMerge(this.app, file, log);
    this.sync.enqueue(file.path);
    void this.sync.flush('queued', false);
  }

  async traceResolve(line: string): Promise<void> {
    await appendPluginDebugLog(this.app.vault.adapter, this.app.vault.configDir, line);
  }

  async showDebugLog(): Promise<void> {
    const path = pluginDebugLogPath(this.app.vault.configDir);
    try {
      const raw = await readPluginDebugLog(this.app.vault.adapter, this.app.vault.configDir);
      if (!raw.trim()) {
        new Notice(`debug.log пуст: ${path}`, NOTICE_FAIL_MS);
        return;
      }
      const tail = lastDebugLines(raw, 30)
        .split('\n')
        .map(line => sanitizeDebugText(line))
        .join('\n');
      new DebugLogModal(this.app, path, tail).open();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      new Notice(`Не удалось прочитать ${path}: ${detail}`, NOTICE_FAIL_MS);
    }
  }

  async hasWorkFiles(proposalId: string, path: string): Promise<boolean> {
    const paths = workPairPaths(this.app.vault.configDir, proposalId, path);
    const adapter = this.app.vault.adapter;
    return (await adapter.exists(paths.incoming)) && (await adapter.exists(paths.current));
  }

  onunload(): void {
    this.abort?.abort();
    this.syncAbort?.abort();
    this.offerAbort?.abort();
  }

  persist(): Promise<void> {
    return this.saveData(this.settings);
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

  connect(): { origin: string; api: CardApiService } {
    if (!this.settings.token) throw new Error('Введите токен в настройках плагина.');
    const origin = serverOrigin(this.settings.server || 'https://invalid.invalid', this.settings.allowHttp);
    return { origin, api: new CardApiService(origin, this.settings.token, obsidianFetch) };
  }

  personalConnect(signal: AbortSignal): { origin: string; api: Api } {
    const origin = serverOrigin(this.settings.server || 'https://invalid.invalid', this.settings.allowHttp);
    return { origin, api: new Api(origin, this.token, signal) };
  }

  async adoptPublisherLogin(): Promise<boolean> {
    try {
      const raw = await this.app.vault.adapter.read(`${this.app.vault.configDir}/plugins/graphnotes-publisher/data.json`);
      const data = JSON.parse(raw) as { server?: unknown; allowHttp?: unknown; token?: unknown };
      const token = normalizeToken(data.token);
      if (!token) return false;
      this.settings.token = token;
      if (typeof data.server === 'string' && data.server.trim()) this.settings.server = data.server.trim();
      if (data.allowHttp === true) this.settings.allowHttp = true;
      await this.persist();
      return true;
    } catch {
      return false;
    }
  }
}

export async function writeWorkPair(
  adapter: { exists(path: string): Promise<boolean>; mkdir(path: string): Promise<void>; write(path: string, data: string): Promise<void> },
  paths: { dir: string; incoming: string; current: string },
  incoming: string,
  current: string,
): Promise<void> {
  await ensureAdapterDir(adapter, paths.dir);
  await adapter.write(paths.incoming, incoming);
  await adapter.write(paths.current, current);
}

export async function removeWorkPair(
  adapter: { exists(path: string): Promise<boolean>; remove(path: string): Promise<void> },
  paths: { incoming: string; current: string },
): Promise<void> {
  if (await adapter.exists(paths.incoming)) await adapter.remove(paths.incoming);
  if (await adapter.exists(paths.current)) await adapter.remove(paths.current);
}

function formatResolveFailure(error: unknown): string {
  if (error instanceof CardApiError) {
    const snippet = summarizeHttpBody(error.body);
    return snippet && !error.message.includes(snippet)
      ? `${error.message} | тело: ${snippet}`
      : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

async function ensureAdapterDir(
  adapter: { exists(path: string): Promise<boolean>; mkdir(path: string): Promise<void> },
  path: string,
): Promise<void> {
  const parts = path.split('/').filter(Boolean);
  let folder = path.startsWith('/') ? '/' : '';
  for (const part of parts) {
    folder = folder === '/' ? `/${part}` : folder ? `${folder}/${part}` : part;
    if (!(await adapter.exists(folder))) {
      await adapter.mkdir(folder);
    }
  }
}

async function obsidianFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const plain: Record<string, string> = {};
  headers.forEach((value, key) => {
    plain[key] = value;
  });
  let body: string | undefined;
  if (typeof init?.body === 'string') body = init.body;
  else if (init?.body) body = await new Response(init.body).text();
  const result = await requestUrl({
    url: String(input),
    method: init?.method ?? 'GET',
    headers: plain,
    body,
    throw: false,
  });
  return new Response(result.text, { status: result.status });
}

class CardMergeSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: GraphNotesCardMergePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const plugin = this.plugin;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'GraphNotes' });
    containerEl.createEl('p', {
      cls: 'gnm-muted',
      text: 'Один плагин: vault ↔ личное хранилище, как у участника; очередь правок — только если API говорит, что у учётки есть editor-доступ. Токен gnp_… из Настройки GraphNotes → Obsidian.',
    });

    new Setting(containerEl)
      .setName('Адрес сервера')
      .setDesc('Только origin, как у Publisher. Тест: http://172.16.13.14:8080')
      .addText(text => {
        text.setPlaceholder('http://172.16.13.14:8080').setValue(plugin.settings.server);
        text.onChange(value => {
          const next = value.trim();
          if (next !== plugin.settings.server) plugin.settings.token = '';
          plugin.settings.server = next;
          void plugin.persist();
        });
      });

    new Setting(containerEl)
      .setName('Разрешить HTTP')
      .setDesc('Нужно для rhizome-test (http://172.16.13.14:8080). На проде — только HTTPS.')
      .addToggle(toggle => {
        toggle.setValue(plugin.settings.allowHttp).onChange((value: boolean) => {
          plugin.settings.allowHttp = value;
          void plugin.persist();
        });
      });

    new Setting(containerEl)
      .setName('Автозапись')
      .setDesc('Не на каждый символ. Очередь правок локально, сеть — по событию или минутам.')
      .addDropdown(dropdown => {
        dropdown.addOption('manual', 'Только кнопка на панели');
        dropdown.addOption('close', 'Когда закрыл файл');
        dropdown.addOption('idle', 'Через N минут после последней правки');
        dropdown.addOption('interval', 'Каждые N минут, если есть правки');
        dropdown.setValue(plugin.settings.autoMode);
        dropdown.onChange(value => {
          plugin.settings.autoMode = value === 'close' || value === 'idle' || value === 'interval' || value === 'manual' ? value : 'idle';
          plugin.settings.autoSync = plugin.settings.autoMode !== 'manual';
          plugin.sync.reconfigure();
          void plugin.persist();
          this.display();
        });
      });

    if (plugin.settings.autoMode === 'idle' || plugin.settings.autoMode === 'interval') {
      new Setting(containerEl)
        .setName('Минуты')
        .setDesc(plugin.settings.autoMode === 'idle'
          ? 'Пауза после последней правки. Пока печатаете — API не дергаем.'
          : 'Период проверки очереди. Пока правок нет — запроса нет.')
        .addText(text => {
          text.inputEl.type = 'number';
          text.inputEl.min = '1';
          text.inputEl.max = '120';
          text.setValue(String(plugin.settings.autoMinutes));
          text.onChange(value => {
            const minutes = Number(value);
            if (!Number.isFinite(minutes)) return;
            plugin.settings.autoMinutes = Math.min(120, Math.max(1, Math.round(minutes)));
            plugin.sync.reconfigure();
            void plugin.persist();
          });
        });
    }

    new Setting(containerEl)
      .setName('Токен интеграции')
      .setDesc('Токен из настроек GraphNotes (gnp_…). Плагин запоминает его в своём data.json. Нужен personal:read.')
      .addText(text => {
        text.inputEl.type = 'password';
        text.setPlaceholder('gnp_…').setValue(plugin.settings.token);
        text.onChange(value => {
          plugin.settings.token = value.trim();
          void plugin.persist();
        });
      });

    new Setting(containerEl)
      .setName('Токен Publisher')
      .setDesc('Если GraphNotes Publisher уже вошёл в этом vault — взять тот же gnp_… и адрес сервера.')
      .addButton(button => {
        button.setButtonText('Взять из Publisher').onClick(async () => {
          const ok = await plugin.adoptPublisherLogin();
          new Notice(ok ? 'Токен Publisher скопирован.' : 'В этом хранилище нет токена Publisher.');
          this.display();
        });
      });

    const status = containerEl.createDiv({ cls: 'gnm-muted' });
    new Setting(containerEl)
      .setName('Подключение')
      .addButton(button => {
        button.setButtonText('Проверить подключение').setCta().onClick(async () => {
          status.removeClass('gnm-error');
          status.setText('Проверка…');
          try {
            const { origin, api } = plugin.connect();
            const user = await api.capabilities(plugin.beginWork());
            plugin.canPropose = user.canProposeToRhizome;
            plugin.proposeDenied = user.canProposeToRhizome === false;
            status.setText(sessionSummary(origin, user));
          } catch (error) {
            status.addClass('gnm-error');
            status.setText(error instanceof Error ? error.message : 'Не удалось проверить вход.');
          }
        });
      });
  }
}

function sessionSummary(origin: string, user: SessionUser): string {
  const queue = user.canSeeQueue
    ? ' Очередь правок включена.'
    : ' Очередь скрыта: нет editor-доступа.';
  const offer = user.canProposeToRhizome
    ? ' Предложить в ризому включено.'
    : ' Предложить в ризому скрыто.';
  const write = user.writeAllowed ? ' Запись в личное разрешена.' : ' Запись в личное сейчас запрещена.';
  return `${origin} · ${user.displayName} (@${user.username}, ${user.role || 'user'}) · токен принят.`
    + queue
    + offer
    + write;
}

class OpenMergeModal extends Modal {
  private localPath = '';
  private differPath = '';
  private remotePath = '';
  private differItems: { path: string; title: string; kind: string }[] = [];
  private differError = '';

  constructor(
    app: App,
    private readonly plugin: GraphNotesCardMergePlugin,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('Сравнить карточку');
    const active = this.app.workspace.getActiveFile();
    this.localPath = active?.extension === 'md' ? active.path : '';
    this.differPath = this.plugin.settings.lastDifferPath;
    this.remotePath = this.plugin.settings.lastSecondaryPath;
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('gnm-modal');
    contentEl.createEl('p', {
      cls: 'gnm-muted',
      text: 'Слева — опубликованная общая (incoming Differ). Справа — файл vault. Стрелки копируют кусок слева направо. Предложение на сайте.',
    });

    new Setting(contentEl)
      .setName('Локальный файл')
      .setDesc('Правая панель. Будет перезаписан по Save & Resolve.')
      .addText(text => {
        text.setPlaceholder('Inbox/Заметка.md').setValue(this.localPath);
        text.onChange(value => {
          this.localPath = value.trim();
        });
      })
      .addButton(button => {
        button.setButtonText('Выбрать').onClick(() => {
          new MarkdownFileModal(this.app, 'Локальный файл', file => {
            this.localPath = file.path;
            this.render();
          }).open();
        });
      });

    new Setting(contentEl)
      .setName('Путь Differ')
      .setDesc('GET /api/differ/files/{путь} — та же пара, что кнопка «Текст сверки» на /offer.')
      .addText(text => {
        text.setPlaceholder('Inbox/Hello.md').setValue(this.differPath);
        text.onChange(value => {
          this.differPath = value.trim();
        });
      })
      .addButton(button => {
        button.setButtonText('Список Differ').onClick(() => void this.loadDiffer());
      });

    if (this.differError) {
      contentEl.createEl('p', { cls: 'gnm-error', text: this.differError });
    }
    if (this.differItems.length) {
      const list = contentEl.createEl('ul', { cls: 'gnm-differ-list' });
      for (const item of this.differItems) {
        const row = list.createEl('li');
        const pick = row.createEl('button', {
          text: `${item.title} · ${item.path} · ${item.kind}`,
        });
        pick.addEventListener('click', () => {
          this.differPath = item.path;
          if (!this.localPath) this.localPath = item.path;
          this.render();
        });
      }
    }

    new Setting(contentEl)
      .setName('Или второй путь в vault')
      .setDesc('Если задан, API не вызывается. Нужно, чтобы сравнить два локальных файла.')
      .addText(text => {
        text.setPlaceholder('Архив/Старая.md').setValue(this.remotePath);
        text.onChange(value => {
          this.remotePath = value.trim();
        });
      })
      .addButton(button => {
        button.setButtonText('Выбрать').onClick(() => {
          new MarkdownFileModal(this.app, 'Входящий файл', file => {
            this.remotePath = file.path;
            this.render();
          }).open();
        });
      });

    new Setting(contentEl).addButton(button => {
      button.setButtonText('Открыть слияние').setCta().onClick(() => void this.submit());
    });
  }

  private async submit(): Promise<void> {
    if (!this.localPath) {
      new Notice('Укажите локальный Markdown-файл.');
      return;
    }
    if (!this.differPath && !this.remotePath) {
      new Notice('Укажите путь Differ или второй файл.');
      return;
    }
    if (this.remotePath && this.remotePath === this.localPath) {
      new Notice('Локальный и входящий пути совпадают.');
      return;
    }
    this.plugin.settings.lastDifferPath = this.differPath;
    this.plugin.settings.lastSecondaryPath = this.remotePath;
    await this.plugin.persist();
    const session: MergeSession = {
      localPath: this.localPath,
      differPath: this.remotePath ? '' : this.differPath,
      remotePath: this.remotePath,
      proposalId: '',
    };
    this.close();
    await openMergeLeaf(this.app, session);
  }

  private async loadDiffer(): Promise<void> {
    this.differError = '';
    try {
      const { api } = this.plugin.connect();
      this.differItems = await api.listDifferences(this.plugin.beginWork());
      if (!this.differItems.length) this.differError = 'Отличий нет — в общую предлагать нечего.';
    } catch (error) {
      this.differItems = [];
      this.differError = error instanceof Error ? error.message : 'Не удалось прочитать Differ.';
    }
    this.render();
  }
}

class MarkdownFileModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    placeholder: string,
    private readonly onPick: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onPick(file);
  }
}

class DebugLogModal extends Modal {
  constructor(
    app: App,
    private readonly logPath: string,
    private readonly tail: string,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('GraphNotes debug.log');
    const { contentEl } = this;
    contentEl.createEl('p', {
      cls: 'gnm-muted',
      text: `Последние 30 строк. Файл: ${this.logPath}`,
    });
    const area = contentEl.createEl('textarea', { cls: 'gnm-debug-log' });
    area.value = this.tail;
    area.readOnly = true;
    area.rows = 18;
    new Setting(contentEl).addButton(button => {
      button.setButtonText('Копировать').setCta().onClick(() => {
        void navigator.clipboard.writeText(this.tail).then(
          () => new Notice('debug.log скопирован.', NOTICE_OK_MS),
          () => {
            area.select();
            new Notice('Выделите текст в окне и скопируйте Ctrl+C.', NOTICE_FAIL_MS);
          },
        );
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export async function openMergeLeaf(app: App, session: MergeSession): Promise<void> {
  const existing = app.workspace.getLeavesOfType(MERGE_VIEW_TYPE)[0];
  const leaf = existing ?? app.workspace.getLeaf('tab');
  await leaf.setViewState({ type: MERGE_VIEW_TYPE, active: true, state: session });
  app.workspace.revealLeaf(leaf);
}

export function closeMergeLeaves(app: App): void {
  for (const leaf of app.workspace.getLeavesOfType(MERGE_VIEW_TYPE)) {
    leaf.detach();
  }
}

export async function writeVaultCard(app: App, path: string, source: string): Promise<TFile> {
  const notePath = vaultNotePath(path);
  const existing = app.vault.getAbstractFileByPath(notePath);
  if (existing && !(existing instanceof TFile)) {
    throw new Error(`Путь занят папкой: ${notePath}`);
  }
  if (existing instanceof TFile) {
    await app.vault.modify(existing, source);
    return existing;
  }
  const slash = notePath.lastIndexOf('/');
  if (slash > 0) await ensureVaultFolder(app, notePath.slice(0, slash));
  try {
    const created = await app.vault.create(notePath, source);
    return await waitForVaultTFile(app, notePath).catch(() => created);
  } catch (error) {
    const raced = await waitForVaultTFile(app, notePath).catch(() => null);
    if (raced) {
      await app.vault.modify(raced, source);
      return raced;
    }
    try {
      await app.vault.adapter.write(notePath, source);
      return await waitForVaultTFile(app, notePath);
    } catch {
      throw error instanceof Error ? error : new Error(`Не удалось создать ${notePath}`);
    }
  }
}

export async function openLocalMarkdown(app: App, file: TFile): Promise<void> {
  await openVaultMarkdownTab(app.workspace, file, MERGE_VIEW_TYPE);
}

/** Open a new markdown leaf, then detach MergeView. Leave compare open if reveal fails. */
export async function openVaultNoteThenCloseMerge(
  app: App,
  file: TFile,
  trace?: ResolveTrace,
): Promise<void> {
  const path = vaultNotePath(file.path);
  new Notice(`Открываю: ${path}`, NOTICE_OK_MS);
  await trace?.(`open | WAIT | ${path}`);
  try {
    const indexed = await waitForVaultTFile(app, path).catch(() => null);
    const found = indexed ?? app.vault.getAbstractFileByPath(path);
    const ready = found instanceof TFile ? found : file;
    await trace?.(`TFile | ${ready instanceof TFile ? 'OK' : 'FAIL'} | open ${ready.path}`);
    await openVaultMarkdownTab(app.workspace, ready, MERGE_VIEW_TYPE, trace);
    new Notice(`Карточка открыта: ${path}`, NOTICE_OK_MS);
    await trace?.(`open | OK | ${path}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    new Notice(`Карточка не открылась (${path}): ${message}`, NOTICE_FAIL_MS);
    console.error('graphnotes-card-merge: open local card failed', error);
    await trace?.(`open | FAIL | ${path} ${message}`);
  }
}

async function waitForVaultTFile(app: App, path: string): Promise<TFile> {
  const found = await waitForVaultFile(app.vault, path, candidate => candidate instanceof TFile);
  if (found instanceof TFile) return found;
  throw new Error(`Файл не появился в хранилище: ${path}`);
}

async function ensureVaultFolder(app: App, folder: string): Promise<void> {
  if (!folder || app.vault.getAbstractFileByPath(folder)) return;
  const parent = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '';
  if (parent) await ensureVaultFolder(app, parent);
  try {
    await app.vault.createFolder(folder);
  } catch {
    if (!app.vault.getAbstractFileByPath(folder)) throw new Error(`Не удалось создать папку: ${folder}`);
  }
}
