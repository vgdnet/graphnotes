import { App, FuzzySuggestModal, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl } from 'obsidian';
import {
  CardApiService,
  DEFAULT_SETTINGS,
  bodyToMaterialize,
  normalizeSettings,
  normalizeToken,
  serverOrigin,
  shouldQueueVaultFile,
  type DifferItem,
  type DifferFile,
  type MergePluginSettings,
  type SessionUser,
} from './apiService';
import { CardMergeView, MERGE_VIEW_TYPE, type MergeHost, type MergeSession } from './diffView';
import { CardQueueView, QUEUE_VIEW_TYPE } from './queueView';

export default class GraphNotesCardMergePlugin extends Plugin implements MergeHost {
  settings: MergePluginSettings = { ...DEFAULT_SETTINGS };
  private abort?: AbortController;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    if (!this.settings.token) await this.adoptPublisherLogin();
    this.registerView(MERGE_VIEW_TYPE, leaf => new CardMergeView(leaf, this));
    this.registerView(QUEUE_VIEW_TYPE, leaf => new CardQueueView(leaf, this));
    this.addRibbonIcon('git-compare', 'GraphNotes: очередь правок', () => void this.openQueue(true));
    this.addCommand({
      id: 'open-queue',
      name: 'Открыть очередь правок',
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
        if (!view) return false;
        if (!checking) void view.saveAndResolve();
        return true;
      },
    });
    this.addSettingTab(new CardMergeSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => void this.openQueue(false));
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

  async loadQueue(): Promise<DifferItem[]> {
    const { api } = this.connect();
    const signal = this.beginWork();
    const listed = await api.listDifferences(signal);
    const items: DifferItem[] = [];
    const seen = new Set<string>();
    for (const item of listed) {
      seen.add(item.path);
      try {
        const pair = await api.getDifferFile(item.path, signal);
        await writeVaultIfMissing(this.app, item.path, bodyToMaterialize(pair));
      } catch {
        /* listed row still belongs in the queue */
      }
      items.push(item);
    }
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (seen.has(file.path)) continue;
      let pair: DifferFile;
      try {
        pair = await api.getDifferFile(file.path, signal);
      } catch {
        continue;
      }
      const local = await this.app.vault.read(file);
      if (!shouldQueueVaultFile(pair, local)) continue;
      items.push({
        path: pair.path,
        title: pair.title,
        kind: pair.kind === 'same' ? 'changed' : pair.kind,
        updatedAt: pair.current.timestamp || pair.incoming.timestamp,
      });
      seen.add(file.path);
    }
    return items;
  }

  async openQueuedCard(path: string): Promise<void> {
    const { api } = this.connect();
    const pair = await api.getDifferFile(path, this.beginWork());
    await writeVaultIfMissing(this.app, path, bodyToMaterialize(pair));
    const local = this.app.vault.getAbstractFileByPath(path);
    const localPath = local?.path ?? path;
    this.settings.lastDifferPath = path;
    await this.persist();
    await openMergeLeaf(this.app, { localPath, differPath: path, remotePath: '' });
  }

  onunload(): void {
    this.abort?.abort();
  }

  persist(): Promise<void> {
    return this.saveData(this.settings);
  }

  beginWork(): AbortSignal {
    this.abort?.abort();
    this.abort = new AbortController();
    return this.abort.signal;
  }

  connect(): { origin: string; api: CardApiService } {
    if (!this.settings.token) throw new Error('Введите токен в настройках плагина.');
    const origin = serverOrigin(this.settings.server || 'https://invalid.invalid', this.settings.allowHttp);
    return { origin, api: new CardApiService(origin, this.settings.token, obsidianFetch) };
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

export async function writeVaultIfMissing(app: App, path: string, body: string): Promise<void> {
  if (!body || app.vault.getAbstractFileByPath(path)) return;
  const parts = path.split('/');
  if (parts.length > 1) {
    let folder = '';
    for (const part of parts.slice(0, -1)) {
      folder = folder ? `${folder}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(folder)) {
        await app.vault.createFolder(folder);
      }
    }
  }
  await app.vault.create(path, body);
}

async function obsidianFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const plain: Record<string, string> = {};
  headers.forEach((value, key) => {
    plain[key] = value;
  });
  const result = await requestUrl({
    url: String(input),
    method: init?.method ?? 'GET',
    headers: plain,
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
    containerEl.createEl('h2', { text: 'GraphNotes Card Merge' });
    containerEl.createEl('p', {
      cls: 'gnm-muted',
      text: 'Вход как у Publisher: тот же токен gnp_… из Настройки GraphNotes → Obsidian. Пароль учётки сюда не вводится. Differ — GET /api/differ и /api/differ/files/{путь}.',
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
  return `${origin} · ${user.displayName} (@${user.username}) · токен принят.`
    + (user.writeAllowed ? ' Запись в личное разрешена Publisher’у.' : ' Запись в личное сейчас запрещена — на Differ это не влияет.');
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

export async function openMergeLeaf(app: App, session: MergeSession): Promise<void> {
  const existing = app.workspace.getLeavesOfType(MERGE_VIEW_TYPE)[0];
  const leaf = existing ?? app.workspace.getLeaf('tab');
  await leaf.setViewState({ type: MERGE_VIEW_TYPE, active: true, state: session });
  app.workspace.revealLeaf(leaf);
}
