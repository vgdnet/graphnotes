interface HTMLElement {
  empty(): void;
  addClass(...cls: string[]): void;
  removeClass(...cls: string[]): void;
  createEl<K extends keyof HTMLElementTagNameMap>(tag: K, o?: string | { text?: string; cls?: string; type?: string; placeholder?: string; href?: string; attr?: Record<string, string>; value?: string }): HTMLElementTagNameMap[K];
  createEl(tag: string, o?: string | { text?: string; cls?: string; type?: string; placeholder?: string; href?: string; attr?: Record<string, string>; value?: string }): HTMLElement;
  createDiv(o?: string | { cls?: string; text?: string }): HTMLDivElement;
  setAttr(name: string, value: string): void;
  setText(text: string): void;
}

declare module 'obsidian' {
  export class App {
    vault: Vault;
    workspace: Workspace;
    metadataCache: MetadataCache;
  }
  export class TAbstractFile {
    path: string;
    name: string;
    parent: TFolder | null;
  }
  export class TFile extends TAbstractFile {
    extension: string;
    stat: { size: number; mtime: number; ctime: number };
  }
  export class TFolder extends TAbstractFile {
    children: TAbstractFile[];
  }
  export class Vault {
    getFiles(): TFile[];
    getAbstractFileByPath(path: string): TAbstractFile | null;
    readBinary(file: TFile): Promise<ArrayBuffer>;
  }
  export class Workspace {
    getActiveViewOfType<T>(type: new (...args: any[]) => T): T | null;
  }
  export class MarkdownView {
    file: TFile | null;
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
    addCommand(command: { id: string; name: string; callback: () => void }): void;
    addSettingTab(tab: PluginSettingTab): void;
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
    addText(cb: (text: { inputEl: HTMLInputElement; setPlaceholder(v: string): any; setValue(v: string): any; onChange(cb: (v: string) => void): any }) => any): this;
    addToggle(cb: (toggle: { setValue(v: boolean): any; onChange(cb: (v: boolean) => void): any }) => any): this;
    addButton(cb: (button: { setButtonText(v: string): any; setCta(): any; onClick(cb: () => void): any }) => any): this;
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
}
