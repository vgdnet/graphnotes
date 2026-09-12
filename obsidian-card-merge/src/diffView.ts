import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { ItemView, Notice, TFile, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import {
  CardApiError,
  CardApiService,
  MERGE_VIEW_TYPE,
  parseMergeSession,
  type MergePluginSettings,
  type MergeSession,
  type RemoteCard,
} from './apiService';

export { MERGE_VIEW_TYPE, parseMergeSession, type MergeSession };

export interface MergeHost {
  settings: MergePluginSettings;
  persist(): Promise<void>;
  beginWork(): AbortSignal;
  connect(): { origin: string; api: CardApiService };
}

/**
 * Build a two-pane CodeMirror 6 MergeView.
 *
 * Attachment order (do not invert a/b):
 * 1. Shared Markdown language + highlighting go into both panes.
 * 2. Pane A (left) gets `EditorState.readOnly` + `EditorView.editable.of(false)`.
 * 3. Pane B (right) gets history + keymaps so the editor can type.
 * 4. `MergeView` itself owns the diff highlighter, change gutters, and
 *    `revertControls: "a-to-b"` arrows that copy a chunk from left → right.
 */
export function attachMergeView(parent: HTMLElement, remoteDoc: string, localDoc: string): MergeView {
  const markdownHighlight = [
    markdown(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    lineNumbers(),
    EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-text)' },
    }),
  ];

  return new MergeView({
    a: {
      doc: remoteDoc,
      extensions: [
        ...markdownHighlight,
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
      ],
    },
    b: {
      doc: localDoc,
      extensions: [
        ...markdownHighlight,
        history(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      ],
    },
    parent,
    highlightChanges: true,
    gutter: true,
    revertControls: 'a-to-b',
    collapseUnchanged: { margin: 3, minSize: 8 },
  });
}

export class CardMergeView extends ItemView {
  private session: MergeSession | null = null;
  private merge: MergeView | undefined;
  private remote: RemoteCard | undefined;
  private toolbarEl: HTMLElement | undefined;
  private hostEl: HTMLElement | undefined;
  private metaEl: HTMLElement | undefined;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: MergeHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return MERGE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.session?.localPath ? `Слияние: ${this.session.localPath}` : 'Слияние карточки';
  }

  getIcon(): string {
    return 'git-compare';
  }

  getState(): MergeSession | Record<string, never> {
    return this.session ?? {};
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    this.session = parseMergeSession(state);
    await this.reload();
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass('gnm-view');
    this.toolbarEl = root.createDiv({ cls: 'gnm-toolbar' });
    this.metaEl = root.createDiv({ cls: 'gnm-meta' });
    this.hostEl = root.createDiv({ cls: 'gnm-merge-host' });
    this.renderToolbar();
    this.renderMeta('Выберите локальный файл и входящую карточку.');
  }

  async onClose(): Promise<void> {
    this.destroyMerge();
  }

  async saveAndResolve(): Promise<void> {
    if (!this.session || !this.merge) {
      new Notice('Нет открытого слияния.');
      return;
    }
    const merged = this.merge.b.state.doc.toString();
    const existing = this.app.vault.getAbstractFileByPath(this.session.localPath);
    if (existing && !(existing instanceof TFile)) {
      new Notice(`Путь занят папкой: ${this.session.localPath}`);
      return;
    }
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, merged);
    } else {
      await this.app.vault.create(this.session.localPath, merged);
    }
    new Notice(`Сохранено: ${this.session.localPath}`);
    this.leaf.detach();
  }

  private renderToolbar(): void {
    const bar = this.toolbarEl;
    if (!bar) return;
    bar.empty();
    bar.createEl('div', { cls: 'gnm-title', text: 'Входящая (слева, только чтение) → локальная (справа, правка)' });
    const actions = bar.createDiv({ cls: 'gnm-actions' });
    const save = actions.createEl('button', { cls: 'mod-cta', text: 'Save & Resolve' });
    save.addEventListener('click', () => void this.saveAndResolve());
    const reload = actions.createEl('button', { text: 'Обновить' });
    reload.addEventListener('click', () => void this.reload());
  }

  private renderMeta(text: string, isError = false): void {
    if (!this.metaEl) return;
    this.metaEl.empty();
    this.metaEl.toggleClass('gnm-error', isError);
    this.metaEl.setText(text);
  }

  private destroyMerge(): void {
    this.merge?.destroy();
    this.merge = undefined;
    this.hostEl?.empty();
  }

  private async reload(): Promise<void> {
    this.destroyMerge();
    if (!this.session || !this.hostEl) {
      this.renderMeta('Нет сессии слияния.');
      return;
    }
    this.renderToolbar();
    this.renderMeta('Загрузка…');
    try {
      const [localText, incoming] = await Promise.all([
        this.readLocal(this.session.localPath),
        this.loadIncoming(this.session),
      ]);
      this.remote = incoming.card;
      this.merge = attachMergeView(this.hostEl, incoming.text, localText);
      this.renderMeta(formatIncomingMeta(this.session, incoming));
    } catch (error) {
      const message = error instanceof CardApiError || error instanceof Error
        ? error.message
        : 'Не удалось открыть слияние.';
      this.renderMeta(message, true);
      new Notice(message);
    }
  }

  private async readLocal(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return '';
    if (!(file instanceof TFile) || file.extension !== 'md') {
      throw new Error(`Локальный путь должен быть Markdown-файлом: ${path}`);
    }
    return this.app.vault.read(file);
  }

  private async loadIncoming(session: MergeSession): Promise<{ text: string; card?: RemoteCard }> {
    if (session.remotePath) {
      const file = this.app.vault.getAbstractFileByPath(session.remotePath);
      if (!(file instanceof TFile)) {
        throw new Error(`Входящий файл не найден: ${session.remotePath}`);
      }
      return { text: await this.app.vault.read(file) };
    }
    if (!session.differPath) {
      throw new Error('Укажите путь Differ или второй файл в хранилище.');
    }
    const { api } = this.plugin.connect();
    const card = await api.getCard(session.differPath, this.plugin.beginWork());
    return { text: card.content, card };
  }
}

function formatIncomingMeta(session: MergeSession, incoming: { text: string; card?: RemoteCard }): string {
  if (session.remotePath) {
    return `Входящая: локальный путь ${session.remotePath}. Локальная: ${session.localPath}.`;
  }
  const card = incoming.card;
  const bits = [
    'GET /api/differ/files',
    card?.path || session.differPath,
    card?.author ? `автор ${card.author}` : '',
    card?.timestamp ? card.timestamp : '',
  ].filter(Boolean);
  return `В общей (слева): ${bits.join(' · ')}. Справа — vault ${session.localPath}.`;
}
