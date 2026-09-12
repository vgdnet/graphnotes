import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { Api, ApiError, type Capabilities } from './api';
import { safeLink, serverOrigin } from './core';
import type { SavedData } from './core';
import { emptySaved, normalizeSaved } from './store';
import { VaultSync } from './sync';
import { SIDEBAR_VIEW_TYPE } from './sidebar';
import { GraphNotesSyncView } from './view';

const WRITE_REASONS: Record<string, string> = {
  author_contract_required: 'Нужен договор автора в настройках GraphNotes.',
  account_inactive: 'Учётная запись неактивна.',
  write_disabled: 'Сервер запретил запись в личное хранилище.',
  insufficient_scope: 'У токена нет права personal:write.',
  token_expired: 'Срок токена истёк. Создайте новый во вкладке Obsidian.',
  invalid_token: 'Токен не принят. Создайте новый во вкладке Obsidian.',
};

const ABOUT = 'https://rhizome.vsepsy.ru/#/about';

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
    this.registerView(SIDEBAR_VIEW_TYPE, leaf => new GraphNotesSyncView(leaf, this));
    this.addRibbonIcon('paper-plane', 'GraphNotes: записать в личное хранилище', () => this.sync.writeNow(true));
    this.addCommand({ id: 'write', name: 'Записать в личное хранилище', callback: () => this.sync.writeNow(true) });
    this.addCommand({ id: 'sync-all', name: 'Отправить все правки в личное хранилище', callback: () => this.sync.pushAll(true) });
    this.addCommand({ id: 'resume', name: 'Проверить / продолжить', callback: () => this.sync.flush('queued', true) });
    this.addCommand({ id: 'open-sidebar', name: 'Открыть панель передачи', callback: () => void this.openSidebar(true) });
    this.addSettingTab(new GraphNotesSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => void this.openSidebar(false));
  }

  async openSidebar(reveal: boolean): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
    if (existing) {
      if (reveal) workspace.revealLeaf(existing);
      return;
    }
    const leaf = await workspace.ensureSideLeaf(SIDEBAR_VIEW_TYPE, 'right', { reveal, active: reveal });
    if (reveal) workspace.revealLeaf(leaf);
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
      text: 'Локальный граф копируется в личное хранилище GraphNotes. Это бесплатно. В общую — только Differ на сайте. Кнопка «Передать правки на сервер» — в виде боковой панели. Иконка самолётика слева тоже пишет. Токен: Настройки → Obsidian.',
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
      .setName('Автозапись')
      .setDesc('Не на каждый символ. Как у Obsidian Git: очередь правок локально, сеть — по событию или минутам. Закрытие Obsidian сеть не запускает.')
      .addDropdown(dropdown => {
        dropdown.addOption('manual', 'Только кнопка на панели');
        dropdown.addOption('close', 'Когда закрыл файл');
        dropdown.addOption('idle', 'Через N минут после последней правки');
        dropdown.addOption('interval', 'Каждые N минут, если есть правки');
        dropdown.setValue(plugin.saved.autoMode);
        dropdown.onChange(value => {
          plugin.saved.autoMode = value === 'close' || value === 'idle' || value === 'interval' || value === 'manual' ? value : 'idle';
          plugin.saved.autoSync = plugin.saved.autoMode !== 'manual';
          plugin.sync.reconfigure();
          void plugin.persist();
          this.display();
        });
      });

    if (plugin.saved.autoMode === 'idle' || plugin.saved.autoMode === 'interval') {
      new Setting(containerEl)
        .setName('Минуты')
        .setDesc(plugin.saved.autoMode === 'idle'
          ? 'Пауза после последней правки. Пока печатаете — API не дергаем.'
          : 'Период проверки очереди. Пока правок нет — запроса нет.')
        .addText(text => {
          text.inputEl.type = 'number';
          text.inputEl.min = '1';
          text.inputEl.max = '120';
          text.setValue(String(plugin.saved.autoMinutes));
          text.onChange(value => {
            const minutes = Number(value);
            if (!Number.isFinite(minutes)) return;
            plugin.saved.autoMinutes = Math.min(120, Math.max(1, Math.round(minutes)));
            plugin.sync.reconfigure();
            void plugin.persist();
          });
        });
    }

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
            status.empty();
            status.createEl('div', { text: connectionSummary(origin, caps) });
            addSiteLinks(status, origin, caps);
          } catch (error) {
            status.addClass('gn-error');
            status.setText(describeError(error));
          }
        });
      });

    if (plugin.saved.lastDebug) {
      const debug = plugin.saved.lastDebug;
      containerEl.createEl('h3', { text: 'Последняя отладка' });
      containerEl.createEl('div', {
        cls: 'gn-muted',
        text: [
          debug.at.slice(0, 19).replace('T', ' '),
          debug.event,
          debug.api,
          debug.origin,
          debug.writeAllowed === false ? 'запись запрещена' : '',
          debug.remote != null ? `на сервере: ${debug.remote}` : '',
          debug.same != null ? `совпало: ${debug.same}` : '',
          debug.sent != null ? `отправка: ${debug.sent}` : '',
          debug.error ?? '',
        ].filter(Boolean).join(' · '),
      });
    }

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
    const site = credit.createEl('a', { text: 'GraphNotes', href: ABOUT });
    site.setAttr('target', '_blank');
  }
}

function connectionSummary(origin: string, caps: Capabilities): string {
  const reason = caps.write_allowed ? 'запись разрешена' : (WRITE_REASONS[caps.write_block_reason ?? ''] ?? caps.write_block_reason ?? 'запись запрещена');
  const quota = caps.quota?.personal_remaining_bytes != null
    ? ` Осталось места: ${formatBytes(caps.quota.personal_remaining_bytes)}.`
    : '';
  return `${origin} · ${caps.user.display_name || caps.user.username} · ${reason}. `
    + `Форматы: ${caps.supported_extensions.join(', ')}. `
    + `Markdown до ${formatBytes(caps.limits.markdown_max_bytes)}, вложение до ${formatBytes(caps.limits.attachment_max_bytes)}.`
    + quota;
}

function addSiteLinks(el: HTMLElement, origin: string, caps: Capabilities): void {
  try {
    const row = el.createDiv({ cls: 'gn-actions' });
    const graph = row.createEl('a', { cls: 'gn-link', text: 'Личный граф', href: safeLink(origin, caps.links.personal_graph) });
    graph.setAttr('target', '_blank');
    const differ = row.createEl('a', { cls: 'gn-link', text: 'Differ', href: safeLink(origin, caps.links.differ) });
    differ.setAttr('target', '_blank');
  } catch { /* ignore bad links until server is trusted */ }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return WRITE_REASONS[error.code] ?? error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка.';
}
