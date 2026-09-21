interface HTMLElement {
  empty(): void;
  addClass(...cls: string[]): void;
  removeClass(...cls: string[]): void;
  toggleClass(cls: string, value: boolean): void;
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: string | { text?: string; cls?: string; type?: string; placeholder?: string; href?: string; attr?: Record<string, string>; value?: string },
  ): HTMLElementTagNameMap[K];
  createEl(
    tag: string,
    o?: string | { text?: string; cls?: string; type?: string; placeholder?: string; href?: string; attr?: Record<string, string>; value?: string },
  ): HTMLElement;
  createDiv(o?: string | { cls?: string; text?: string }): HTMLDivElement;
  createSpan(o?: string | { cls?: string; text?: string }): HTMLSpanElement;
  setAttr(name: string, value: string): void;
  setText(text: string): void;
}

declare module 'obsidian' {
  export class App {
    vault: Vault;
    workspace: Workspace;
    metadataCache: MetadataCache;
  }
  export function requestUrl(options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    throw?: boolean;
  }): Promise<{ status: number; text: string }>;
  export class TAbstractFile {
    path: string;
    name: string;
    parent: TFolder | null;
  }
  export class TFile extends TAbstractFile {
    basename: string;
    extension: string;
    stat: { size: number; mtime: number; ctime: number };
  }
  export class TFolder extends TAbstractFile {
    children: TAbstractFile[];
  }
  export class Vault {
    configDir: string;
    adapter: {
      read(path: string): Promise<string>;
      write(path: string, data: string): Promise<void>;
      exists(normalizedPath: string): Promise<boolean>;
      mkdir(normalizedPath: string): Promise<void>;
      remove(normalizedPath: string): Promise<void>;
    };
    getFiles(): TFile[];
    getMarkdownFiles(): TFile[];
    getAbstractFileByPath(path: string): TAbstractFile | null;
    read(file: TFile): Promise<string>;
    readBinary(file: TFile): Promise<ArrayBuffer>;
    modify(file: TFile, data: string): Promise<void>;
    create(path: string, data: string): Promise<TFile>;
    createFolder(path: string): Promise<TFolder>;
    on(name: 'modify' | 'create' | 'delete', cb: (file: TAbstractFile) => any): any;
    on(name: 'rename', cb: (file: TAbstractFile, oldPath: string) => any): any;
  }
  export class WorkspaceLeaf {
    view: View;
    setViewState(state: { type: string; active?: boolean; state?: unknown }): Promise<void>;
    /** Official desktop API: open a file in this leaf. */
    openFile(file: TFile, openState?: { active?: boolean }): Promise<void>;
    detach(): void;
  }
  export interface ViewStateResult {
    history: boolean;
  }
  export class View {
    app: App;
    leaf: WorkspaceLeaf;
    containerEl: HTMLElement;
    contentEl: HTMLElement;
    constructor(leaf: WorkspaceLeaf);
    getViewType(): string;
    getDisplayText(): string;
    getIcon(): string;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
    getState(): unknown;
    setState(state: unknown, result: ViewStateResult): Promise<void>;
  }
  export class ItemView extends View {}
  export class Workspace {
    getActiveFile(): TFile | null;
    getActiveViewOfType<T>(type: new (...args: any[]) => T): T | null;
    getLeavesOfType(viewType: string): WorkspaceLeaf[];
    /**
     * `getLeaf(true)` should create a new leaf. After Save & Resolve the
     * active leaf can still be MergeView — never `openFile` on that type.
     * Prefer `createLeafBySplit` or `getLeaf(true)` only if the result is
     * not MERGE_VIEW_TYPE; `getLeaf('tab')` only when that leaf is not merge.
     */
    getLeaf(newLeaf?: boolean | 'tab' | 'split' | 'window'): WorkspaceLeaf;
    createLeafBySplit(from: WorkspaceLeaf, direction?: 'vertical' | 'horizontal', before?: boolean): WorkspaceLeaf;
    getMostRecentLeaf(): WorkspaceLeaf | null;
    openLinkText(linktext: string, sourcePath: string, newLeaf?: boolean | 'tab'): Promise<void>;
    /** Last-resort desktop helper when present. */
    openFile?(file: TFile, leaf?: WorkspaceLeaf, openState?: { active?: boolean }): Promise<void>;
    setActiveLeaf(leaf: WorkspaceLeaf, opts?: { focus?: boolean }): void;
    revealLeaf(leaf: WorkspaceLeaf): void;
    onLayoutReady(callback: () => any): void;
    ensureSideLeaf(type: string, side: 'left' | 'right', options?: { active?: boolean; split?: boolean; reveal?: boolean }): Promise<WorkspaceLeaf>;
    on(name: 'file-open', cb: (file: TFile | null) => any): any;
    on(name: 'active-leaf-change', cb: (leaf: unknown) => any): any;
    on(name: 'file-menu', cb: (menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => any): any;
    on(name: 'editor-menu', cb: (menu: Menu, editor: unknown, info: MarkdownView) => any): any;
  }
  export interface CachedMetadata {
    embeds?: { link: string }[];
    links?: { link: string }[];
  }
  export class MetadataCache {
    resolvedLinks: Record<string, Record<string, number>>;
    unresolvedLinks: Record<string, Record<string, number>>;
    getFileCache(file: TFile): CachedMetadata | null;
    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
  }
  export class MarkdownView {
    file: TFile | null;
  }
  export class Menu {
    addItem(cb: (item: MenuItem) => any): this;
  }
  export class MenuItem {
    setTitle(title: string): this;
    setIcon(icon: string): this;
    onClick(cb: (evt?: MouseEvent | KeyboardEvent) => any): this;
  }
  export class Notice {
    constructor(message: string, timeout?: number);
  }
  export class Plugin {
    app: App;
    constructor(app: App, manifest: unknown);
    onload(): Promise<void> | void;
    onunload(): void;
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
    addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement;
    addCommand(command: {
      id: string;
      name: string;
      callback?: () => void;
      checkCallback?: (checking: boolean) => boolean;
    }): void;
    addSettingTab(tab: PluginSettingTab): void;
    registerView(type: string, creator: (leaf: WorkspaceLeaf) => View): void;
    registerEvent(eventRef: any): any;
    registerInterval(id: number): number;
  }
  export class PluginSettingTab {
    app: App;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    display(): void;
  }
  export class Setting {
    constructor(containerEl: HTMLElement);
    setName(name: string): this;
    setDesc(desc: string): this;
    addText(cb: (text: {
      inputEl: HTMLInputElement;
      setPlaceholder(v: string): any;
      setValue(v: string): any;
      onChange(cb: (v: string) => void): any;
    }) => any): this;
    addToggle(cb: (toggle: { setValue(v: boolean): any; onChange(cb: (v: boolean) => void): any }) => any): this;
    addButton(cb: (button: { setButtonText(v: string): any; setCta(): any; onClick(cb: () => void): any }) => any): this;
    addDropdown(cb: (dropdown: { addOption(value: string, display: string): any; setValue(v: string): any; onChange(cb: (v: string) => any): any }) => any): this;
  }
  export class Modal {
    app: App;
    contentEl: HTMLElement;
    constructor(app: App);
    open(): void;
    close(): void;
    onOpen(): void;
    onClose(): void;
    setTitle(title: string): this;
  }
  export class FuzzySuggestModal<T> extends Modal {
    constructor(app: App);
    getItems(): T[];
    getItemText(item: T): string;
    onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;
    setPlaceholder(placeholder: string): void;
  }
}
