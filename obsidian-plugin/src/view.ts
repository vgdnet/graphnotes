import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { SIDEBAR_VIEW_TYPE, WRITE_BUTTON_LABEL } from './sidebar';

export { SIDEBAR_VIEW_TYPE, WRITE_BUTTON_LABEL };

export interface SidebarHost {
  sync: { writeNow(notice?: boolean): void };
}

export class GraphNotesSyncView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly plugin: SidebarHost) {
    super(leaf);
  }

  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
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
    root.addClass('gn-sidebar');
    root.createEl('h4', { text: 'GraphNotes' });
    root.createEl('p', {
      cls: 'gn-muted',
      text: 'Локальные правки уходят в личное хранилище. Общая ризома не меняется.',
    });
    const button = root.createEl('button', { cls: 'mod-cta gn-write', text: WRITE_BUTTON_LABEL });
    button.addEventListener('click', () => this.plugin.sync.writeNow(true));
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }
}
