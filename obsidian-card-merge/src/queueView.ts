import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import { Api } from './api';
import {
  CardApiError,
  QUEUE_VIEW_TYPE,
  reviewQueueEmptyMessage,
  type DifferItem,
  type EditorialQueueMode,
  type QueueSnapshot,
} from './apiService';
import {
  OFFER_BUTTON_LABEL,
  OFFER_SELECTED_LABEL,
  describeOfferError,
  offerKindLabel,
  type DifferOffer,
} from './offer';

export { QUEUE_VIEW_TYPE };
export const WRITE_BUTTON_LABEL = 'Передать правки на сервер';

export interface QueueHost {
  settings: { server: string; token: string };
  loadQueue(): Promise<QueueSnapshot>;
  acceptIntoWork(item: DifferItem): Promise<void>;
  openQueuedCard(item: DifferItem): Promise<void>;
  releaseWork(item: DifferItem): Promise<void>;
  sync: { writeNow(notice?: boolean): void };
  personalConnect(signal: AbortSignal): { api: Api };
  beginWork(): AbortSignal;
}

export class CardQueueView extends ItemView {
  private items: DifferItem[] = [];
  private mode: QueueSnapshot['mode'] = 'author';
  private message = '';
  private isError = false;
  private loading = false;
  private accepting = false;
  private listEl?: HTMLElement;
  private statusEl?: HTMLElement;
  private queueEl?: HTMLElement;
  private offerHost?: HTMLElement;
  private selected = new Set<string>();
  private offers: DifferOffer[] = [];
  private queued = new Set<string>();
  private busy = false;
  private canProposeToRhizome = false;
  private editorialQueueMode: EditorialQueueMode | undefined;
  private offerMounted = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: QueueHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return QUEUE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'GraphNotes';
  }

  getIcon(): string {
    return 'paper-plane';
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass('gnm-queue');
    root.addClass('gn-sidebar');
    root.createEl('h4', { text: 'GraphNotes' });
    root.createEl('p', {
      cls: 'gnm-muted',
      text: 'Локальные правки уходят в личное хранилище. Общая ризома с этой кнопки не меняется.',
    });
    const write = root.createEl('button', { cls: 'mod-cta gn-write', text: WRITE_BUTTON_LABEL });
    write.addEventListener('click', () => this.plugin.sync.writeNow(true));

    this.offerHost = root.createDiv({ cls: 'gn-offer-panel' });
    this.queueEl = root.createDiv({ cls: 'gnm-queue-section' });
    await this.reload();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
    this.listEl = undefined;
    this.statusEl = undefined;
    this.queueEl = undefined;
    this.offerHost = undefined;
    this.offerMounted = false;
  }

  async reload(): Promise<void> {
    this.loading = true;
    this.message = '';
    this.isError = false;
    this.renderQueue();
    try {
      const snapshot = await this.plugin.loadQueue();
      this.mode = snapshot.mode;
      this.items = snapshot.items;
      this.canProposeToRhizome = snapshot.canProposeToRhizome;
      this.editorialQueueMode = snapshot.editorialQueueMode;
      this.message = this.mode !== 'review'
        ? ''
        : reviewQueueEmptyMessage(this.editorialQueueMode, this.items.length);
    } catch (error) {
      this.items = [];
      this.isError = true;
      this.message = error instanceof CardApiError || error instanceof Error
        ? error.message
        : 'Не удалось прочитать очередь.';
    } finally {
      this.loading = false;
      this.mountOfferPanel();
      this.renderQueue();
    }
  }

  private mountOfferPanel(): void {
    const host = this.offerHost;
    if (!host) return;
    if (!this.canProposeToRhizome) {
      host.empty();
      this.offerMounted = false;
      this.listEl = undefined;
      this.statusEl = undefined;
      return;
    }
    if (this.offerMounted) return;
    host.empty();
    host.createEl('h5', { text: 'Предложить в ризому' });
    host.createEl('p', {
      cls: 'gnm-muted',
      text: 'Список путей, которых нет в общей или которые отличаются (хеши складов, без тел). Кнопка создаёт заявку в очередь, не пишет в общую.',
    });
    const actions = host.createDiv({ cls: 'gn-offer-actions' });
    const refreshOffers = actions.createEl('button', { text: 'Обновить список' });
    refreshOffers.addEventListener('click', () => void this.reloadOffers());
    const selected = actions.createEl('button', { text: OFFER_SELECTED_LABEL });
    selected.addEventListener('click', () => void this.propose([...this.selected]));
    this.statusEl = host.createEl('p', { cls: 'gnm-muted' });
    this.listEl = host.createDiv({ cls: 'gn-offer-list' });
    this.offerMounted = true;
    void this.reloadOffers();
  }

  private renderQueue(): void {
    const root = this.queueEl;
    if (!root) return;
    root.empty();
    if (this.mode !== 'review' && !this.isError) {
      return;
    }
    root.createEl('h5', { text: 'Очередь правок' });
    root.createEl('p', {
      cls: 'gnm-muted',
      text: 'В работе одна карточка. «Принять в работу» качает её пару на диск. Save & Resolve сначала пишет vault.',
    });
    const refresh = root.createEl('button', { cls: 'gnm-queue-refresh', text: 'Обновить очередь' });
    refresh.addEventListener('click', () => void this.reload());
    if (this.loading) {
      root.createEl('p', { cls: 'gnm-muted', text: 'Загрузка…' });
      return;
    }
    if (this.message) {
      root.createEl('p', { cls: this.isError ? 'gnm-error' : 'gnm-muted', text: this.message });
    }
    if (!this.items.length) return;
    const occupied = this.accepting || this.items.some(item => item.inWork);
    const list = root.createEl('ul', { cls: 'gnm-queue-list' });
    for (const item of this.items) {
      const row = list.createEl('li', { cls: 'gnm-queue-row' });
      row.createEl('strong', { text: item.title });
      row.createEl('small', { text: queueLine(item).join(' · ') });
      const actions = row.createDiv({ cls: 'gnm-queue-actions' });
      if (item.inWork) {
        const open = actions.createEl('button', { cls: 'mod-cta', text: 'Открыть' });
        open.addEventListener('click', () => {
          void this.plugin.openQueuedCard(item).catch(error => {
            new Notice(error instanceof Error ? error.message : 'Не удалось открыть карточку.');
          });
        });
        const cancel = actions.createEl('button', { text: 'Отменить' });
        cancel.addEventListener('click', () => {
          void this.plugin.releaseWork(item).then(() => this.reload()).catch(error => {
            new Notice(error instanceof Error ? error.message : 'Не удалось снять карточку.');
          });
        });
      } else if (this.accepting && !item.inWork) {
        actions.createEl('span', { cls: 'gnm-muted', text: 'Качаю другую…' });
      } else if (occupied) {
        actions.createEl('span', { cls: 'gnm-muted', text: 'Слот занят' });
      } else {
        const accept = actions.createEl('button', { cls: 'mod-cta', text: 'Принять в работу' });
        accept.addEventListener('click', () => {
          if (this.accepting || this.items.some(rowItem => rowItem.inWork)) {
            new Notice('В работе уже одна карточка.');
            return;
          }
          this.accepting = true;
          this.renderQueue();
          void this.plugin.acceptIntoWork(item)
            .catch(error => {
              new Notice(error instanceof Error ? error.message : 'Не удалось скачать карточки.');
            })
            .finally(() => {
              this.accepting = false;
              void this.reload();
            });
        });
      }
    }
  }

  private setStatus(text: string, error = false): void {
    if (!this.statusEl) return;
    this.statusEl.setText(text);
    if (error) this.statusEl.addClass('gnm-error');
    else this.statusEl.removeClass('gnm-error');
  }

  private renderOffers(): void {
    if (!this.listEl) return;
    this.listEl.empty();
    if (!this.offers.length) {
      this.listEl.createEl('p', { cls: 'gnm-muted', text: 'Нет карточек, которых нет в общей или которые отличаются.' });
      return;
    }
    for (const offer of this.offers) {
      const row = this.listEl.createDiv({ cls: 'gn-offer' });
      const check = row.createEl('input', { type: 'checkbox' });
      check.checked = this.selected.has(offer.path);
      check.disabled = this.queued.has(offer.path) || this.busy;
      check.addEventListener('change', () => {
        if (check.checked) this.selected.add(offer.path);
        else this.selected.delete(offer.path);
      });
      const body = row.createDiv({ cls: 'gn-offer-meta' });
      body.createEl('div', { text: offer.title });
      body.createEl('div', {
        cls: 'gnm-muted',
        text: `${offer.path} · ${offerKindLabel(offer.kind)}`,
      });
      if (this.queued.has(offer.path)) {
        row.createEl('span', { cls: 'gnm-muted', text: 'Уже в очереди' });
        continue;
      }
      const button = row.createEl('button', { text: OFFER_BUTTON_LABEL });
      button.disabled = this.busy;
      button.addEventListener('click', () => void this.propose([offer.path]));
    }
  }

  private async reloadOffers(): Promise<void> {
    if (!this.canProposeToRhizome) return;
    if (!this.plugin.settings.server.trim() || !this.plugin.settings.token.trim()) {
      this.offers = [];
      this.queued = new Set();
      this.selected.clear();
      this.setStatus('Укажите адрес сервера и токен в настройках плагина.', true);
      this.renderOffers();
      return;
    }
    this.setStatus('Загрузка списка…');
    try {
      const { api } = this.plugin.personalConnect(this.plugin.beginWork());
      const [offers, queued] = await Promise.all([api.differOffers(), api.queuedOfferPaths()]);
      this.offers = offers;
      this.queued = queued;
      for (const path of this.selected) {
        if (!offers.some(item => item.path === path) || queued.has(path)) this.selected.delete(path);
      }
      const ready = offers.filter(item => !queued.has(item.path)).length;
      this.setStatus(ready
        ? `${ready} ${ready === 1 ? 'карточка' : 'карточек'} можно предложить.`
        : offers.length
          ? 'Отличающиеся карточки уже в очереди.'
          : 'Нет отличий от общей.');
      this.renderOffers();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof Error && error.name === 'AbortError') return;
      this.offers = [];
      this.renderOffers();
      this.setStatus(describeOfferError(error), true);
    }
  }

  private async propose(paths: string[]): Promise<void> {
    if (!this.canProposeToRhizome) return;
    const unique = [...new Set(paths)].filter(path => !this.queued.has(path));
    if (!unique.length) {
      new Notice('Выберите карточку, которой ещё нет в очереди.');
      return;
    }
    this.busy = true;
    this.renderOffers();
    try {
      const { api } = this.plugin.personalConnect(this.plugin.beginWork());
      const created = await api.propose(unique, unique.length === 1 ? unique[0] : `${unique.length} notes`);
      for (const path of created.paths.length ? created.paths : unique) this.queued.add(path);
      for (const path of unique) this.selected.delete(path);
      new Notice(unique.length === 1
        ? `Заявка создана: ${unique[0]}`
        : `Заявка создана: ${unique.length} карточек`);
      await this.reloadOffers();
    } catch (error) {
      this.setStatus(describeOfferError(error), true);
      new Notice(describeOfferError(error));
    } finally {
      this.busy = false;
      this.renderOffers();
    }
  }
}

function queueLine(item: DifferItem): string[] {
  const bits = [
    item.summary && item.summary !== item.path ? item.summary : '',
    item.author ? `@${item.author}` : '',
    item.path,
    kindLabel(item.kind, Boolean(item.proposalId), item.inWork),
    item.updatedAt ? formatStamp(item.updatedAt) : '',
  ];
  return bits.filter(Boolean);
}

function kindLabel(kind: string, review: boolean, inWork?: boolean): string {
  if (inWork) return 'на диске';
  if (review) return 'на ревью';
  if (kind === 'added') return 'нет в общей';
  if (kind === 'changed') return 'отличается';
  return kind;
}

function formatStamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru');
}

