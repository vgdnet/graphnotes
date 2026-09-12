import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import { CardApiError, QUEUE_VIEW_TYPE, type DifferItem } from './apiService';

export { QUEUE_VIEW_TYPE };

export interface QueueHost {
  loadQueue(): Promise<DifferItem[]>;
  openQueuedCard(path: string): Promise<void>;
}

export class CardQueueView extends ItemView {
  private items: DifferItem[] = [];
  private message = '';
  private isError = false;
  private loading = false;

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
    return 'Очередь правок';
  }

  getIcon(): string {
    return 'git-compare';
  }

  async onOpen(): Promise<void> {
    await this.reload();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  async reload(): Promise<void> {
    this.loading = true;
    this.message = '';
    this.isError = false;
    this.render();
    try {
      this.items = await this.plugin.loadQueue();
      this.message = this.items.length ? '' : 'Отличий нет — править нечего.';
    } catch (error) {
      this.items = [];
      this.isError = true;
      this.message = error instanceof CardApiError || error instanceof Error
        ? error.message
        : 'Не удалось прочитать очередь.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('gnm-queue');
    root.createEl('h4', { text: 'Очередь правок' });
    root.createEl('p', {
      cls: 'gnm-muted',
      text: 'Тот же Differ, что на сайте /offer. Не очередь editor’а /queue.',
    });
    const refresh = root.createEl('button', { cls: 'gnm-queue-refresh', text: 'Обновить' });
    refresh.addEventListener('click', () => void this.reload());
    if (this.loading) {
      root.createEl('p', { cls: 'gnm-muted', text: 'Загрузка…' });
      return;
    }
    if (this.message) {
      root.createEl('p', { cls: this.isError ? 'gnm-error' : 'gnm-muted', text: this.message });
    }
    if (!this.items.length) return;
    const list = root.createEl('ul', { cls: 'gnm-queue-list' });
    for (const item of this.items) {
      const row = list.createEl('li');
      const button = row.createEl('button', { cls: 'gnm-queue-item' });
      button.createEl('strong', { text: item.title });
      button.createEl('small', {
        text: [item.path, kindLabel(item.kind), item.updatedAt ? formatStamp(item.updatedAt) : '']
          .filter(Boolean)
          .join(' · '),
      });
      button.addEventListener('click', () => {
        void this.plugin.openQueuedCard(item.path).catch(error => {
          new Notice(error instanceof Error ? error.message : 'Не удалось открыть карточку.');
        });
      });
    }
  }
}

function kindLabel(kind: string): string {
  if (kind === 'added') return 'нет в общей';
  if (kind === 'changed') return 'отличается';
  return kind;
}

function formatStamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru');
}
