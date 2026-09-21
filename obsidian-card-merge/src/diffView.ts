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
  isAlreadyAcceptedError,
  isWorkCachePath,
  parseMergeSession,
  type MergePluginSettings,
  type MergeSession,
  type RemoteCard,
} from './apiService';
import { NOTICE_FAIL_MS, NOTICE_OK_MS } from './debugLog';

export { MERGE_VIEW_TYPE, parseMergeSession, type MergeSession };

export interface MergeHost {
  settings: MergePluginSettings;
  persist(): Promise<void>;
  beginWork(): AbortSignal;
  connect(): { origin: string; api: CardApiService };
  resolveWork(session: MergeSession, source: string, sharedSource?: string): Promise<void>;
  finishLocalCard(session: MergeSession, source: string): Promise<void>;
  openQueue(reveal: boolean): Promise<void>;
  traceResolve(line: string): Promise<void>;
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
export function attachMergeView(
  parent: HTMLElement,
  remoteDoc: string,
  localDoc: string,
  options?: { resolved?: boolean },
): MergeView {
  const resolved = options?.resolved === true;
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
  const readOnly = [
    ...markdownHighlight,
    EditorView.editable.of(false),
    EditorState.readOnly.of(true),
  ];

  return new MergeView({
    a: {
      doc: remoteDoc,
      extensions: readOnly,
    },
    b: {
      doc: localDoc,
      extensions: resolved
        ? readOnly
        : [
          ...markdownHighlight,
          history(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        ],
    },
    parent,
    highlightChanges: true,
    gutter: true,
    revertControls: resolved ? undefined : 'a-to-b',
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
  private resolving = false;
  private resolved = false;

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
    if (!this.session) return {};
    return { ...this.session, resolved: this.resolved };
  }

  isResolved(): boolean {
    return this.resolved;
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    this.session = parseMergeSession(state);
    this.resolved = this.session?.resolved === true;
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
    if (this.resolved) return;
    if (this.resolving) {
      new Notice(
        'Уже записываю эту карточку в vault. Команда: GraphNotes: показать debug.log',
        NOTICE_OK_MS,
      );
      return;
    }
    if (!this.session || !this.merge) {
      new Notice('Нет открытого слияния.', NOTICE_FAIL_MS);
      return;
    }
    const merged = this.merge.b.state.doc.toString();
    const shared = this.merge.a.state.doc.toString();
    this.resolving = true;
    new Notice(
      'Save & Resolve: пишу карточку в vault. POST /resolve не блокирует открытие. Лог: .obsidian/plugins/graphnotes-card-merge/debug.log',
      NOTICE_OK_MS,
    );
    await this.plugin.traceResolve(
      `Save&Resolve | WAIT | click proposal=${this.session.proposalId || '-'} differ=${this.session.differPath} local=${this.session.localPath}`,
    );
    try {
      if (this.session.proposalId) {
        await this.plugin.resolveWork(this.session, merged, shared);
        return;
      }
      await this.plugin.finishLocalCard(this.session, merged);
    } catch (error) {
      if (isAlreadyAcceptedError(error) && this.session.proposalId) {
        await this.plugin.traceResolve('Save&Resolve | WAIT | already-accepted → resolveWork again');
        await this.plugin.resolveWork(this.session, merged, shared);
        return;
      }
      const message = error instanceof CardApiError || error instanceof Error
        ? error.message
        : 'Не удалось сохранить слияние.';
      await this.plugin.traceResolve(`Save&Resolve | FAIL | ${message}`);
      new Notice(`Save & Resolve не удался: ${message}`, NOTICE_FAIL_MS);
    } finally {
      this.resolving = false;
    }
  }

  private renderToolbar(): void {
    const bar = this.toolbarEl;
    if (!bar) return;
    bar.empty();
    bar.createEl('div', {
      cls: 'gnm-title',
      text: this.resolved
        ? 'Опубликовано в общую'
        : 'Входящая (слева, только чтение) → локальная (справа, правка)',
    });
    if (this.resolved) return;
    const actions = bar.createDiv({ cls: 'gnm-actions' });
    const save = actions.createEl('button', { cls: 'mod-cta', text: 'Save & Resolve' });
    save.addEventListener('click', () => void this.saveAndResolve());
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
    if (this.resolved && this.session.publishedMerged != null) {
      this.merge = attachMergeView(
        this.hostEl,
        this.session.publishedIncoming ?? '',
        this.session.publishedMerged,
        { resolved: true },
      );
      this.renderMeta('Опубликовано в общую.');
      return;
    }
    try {
      const [localText, incoming] = await Promise.all([
        this.readLocal(this.session.localPath),
        this.loadIncoming(this.session),
      ]);
      this.remote = incoming.card;
      this.merge = attachMergeView(this.hostEl, incoming.text, localText, { resolved: this.resolved });
      this.renderMeta(this.resolved ? 'Опубликовано в общую.' : formatIncomingMeta(this.session, incoming));
    } catch (error) {
      const message = error instanceof CardApiError || error instanceof Error
        ? error.message
        : 'Не удалось открыть слияние.';
      this.renderMeta(message, true);
      new Notice(message);
    }
  }

  private async readLocal(path: string): Promise<string> {
    if (isWorkCachePath(path) || await this.app.vault.adapter.exists(path)) {
      try {
        return await this.app.vault.adapter.read(path);
      } catch {
        if (isWorkCachePath(path)) throw new Error('Локальная карточка не найдена. Снова нажмите «Принять в работу».');
      }
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return '';
    if (!(file instanceof TFile) || file.extension !== 'md') {
      throw new Error(`Локальный путь должен быть Markdown-файлом: ${path}`);
    }
    return this.app.vault.read(file);
  }

  private async loadIncoming(session: MergeSession): Promise<{ text: string; card?: RemoteCard }> {
    if (session.remotePath) {
      try {
        return { text: await this.app.vault.adapter.read(session.remotePath) };
      } catch {
        const file = this.app.vault.getAbstractFileByPath(session.remotePath);
        if (!(file instanceof TFile)) {
          throw new Error(`Входящий файл не найден: ${session.remotePath}`);
        }
        return { text: await this.app.vault.read(file) };
      }
    }
    if (session.proposalId) {
      throw new Error('Сначала нажмите «Принять в работу».');
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
  if (session.proposalId) {
    return `Слева — общая с диска. Справа — предложение с диска (${session.differPath}). Save & Resolve сначала пишет vault.`;
  }
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
