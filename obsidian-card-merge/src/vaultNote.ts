import { isWorkCachePath, publishedCardPath, vaultCardPath, type MergeSession } from './apiService';

export interface NoteFile {
  path: string;
  basename?: string;
  name?: string;
}

export interface NoteLeaf {
  openFile?(file: NoteFile, openState?: { active?: boolean }): Promise<void>;
  setViewState?(state: { type: string; active?: boolean; state?: unknown }): Promise<void>;
  view?: { getViewType?: () => string; file?: { path: string } };
}

/** Workspace slice used to open a published card. No Obsidian import — testable. */
export interface NoteWorkspace {
  getLeaf(newLeaf?: boolean | 'tab' | 'split' | 'window'): NoteLeaf;
  createLeafBySplit?(from: NoteLeaf, direction?: 'vertical' | 'horizontal'): NoteLeaf;
  getMostRecentLeaf?(): NoteLeaf | null;
  getActiveFile?(): { path: string } | null;
  setActiveLeaf(leaf: unknown, opts?: { focus?: boolean }): void;
  revealLeaf(leaf: unknown): void;
  getLeavesOfType(viewType: string): { detach(): void; view?: { getViewType?: () => string; file?: { path: string } } }[];
  openLinkText?(linktext: string, sourcePath: string, newLeaf?: boolean | 'tab'): Promise<void>;
  openFile?(file: NoteFile, leaf?: NoteLeaf, openState?: { active?: boolean }): Promise<void>;
}

export interface NoteVault {
  getAbstractFileByPath(path: string): { path: string } | null;
}

export type ResolveTrace = (message: string) => void | Promise<void>;

/**
 * Ordinary vault path of the accepted card.
 * Always the proposal/card path (`Нарциссизм.md`), never `.obsidian/plugins/…/work/`.
 */
export function vaultNotePath(
  sessionOrPath: string | Pick<MergeSession, 'localPath' | 'differPath' | 'proposalId'>,
): string {
  const raw = typeof sessionOrPath === 'string'
    ? sessionOrPath
    : publishedCardPath(sessionOrPath);
  if (isWorkCachePath(raw)) {
    throw new Error(`Кэш слияния не является заметкой vault: ${raw}`);
  }
  const path = vaultCardPath(raw);
  if (isWorkCachePath(path)) {
    throw new Error(`Кэш слияния не является заметкой vault: ${path}`);
  }
  return path;
}

/** Wiki name for `openLinkText` — basename, not the work-cache path. */
export function vaultNoteLinkText(file: NoteFile): string {
  if (file.basename?.trim()) return file.basename;
  const name = (file.name ?? file.path.split('/').pop() ?? file.path).trim();
  return name.replace(/\.md$/i, '');
}

export async function waitForVaultFile(
  vault: NoteVault,
  path: string,
  isFile: (file: { path: string }) => boolean,
  options?: { tries?: number; sleep?: (ms: number) => Promise<void> },
): Promise<{ path: string }> {
  const tries = options?.tries ?? 8;
  const sleep = options?.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let last: { path: string } | null = null;
  for (let i = 0; i < tries; i++) {
    last = vault.getAbstractFileByPath(path);
    if (last && isFile(last)) return last;
    if (i + 1 < tries) await sleep(40);
  }
  throw new Error(`Файл не появился в хранилище: ${path}`);
}

export function isMergeViewLeaf(leaf: NoteLeaf | undefined | null, mergeViewType: string): boolean {
  return Boolean(leaf?.view?.getViewType?.() === mergeViewType);
}

function detachMergeLeaves(workspace: NoteWorkspace, mergeViewType: string): void {
  for (const merge of workspace.getLeavesOfType(mergeViewType)) {
    merge.detach();
  }
}

/**
 * A leaf that is never MERGE_VIEW_TYPE when the workspace can create one.
 * Prefer `createLeafBySplit` / `getLeaf(true)`. Use `getLeaf('tab')` only
 * if that leaf is not the compare view.
 */
export function pickMarkdownLeaf(workspace: NoteWorkspace, mergeViewType: string): NoteLeaf {
  const usable = (leaf: NoteLeaf | undefined | null): NoteLeaf | undefined => {
    if (!leaf || isMergeViewLeaf(leaf, mergeViewType)) return undefined;
    return leaf;
  };

  const recent = workspace.getMostRecentLeaf?.() ?? null;
  if (recent && !isMergeViewLeaf(recent, mergeViewType) && workspace.createLeafBySplit) {
    const split = usable(workspace.createLeafBySplit(recent, 'vertical'));
    if (split) return split;
  }

  const fresh = usable(workspace.getLeaf(true));
  if (fresh) return fresh;

  const tab = usable(workspace.getLeaf('tab'));
  if (tab) return tab;

  if (workspace.createLeafBySplit) {
    const from = recent ?? workspace.getLeaf(true);
    const split = usable(workspace.createLeafBySplit(from, 'vertical'));
    if (split) return split;
  }

  return workspace.getLeaf(true);
}

function leafShowsNote(leaf: NoteLeaf, file: NoteFile, mergeViewType: string): boolean {
  if (isMergeViewLeaf(leaf, mergeViewType)) return false;
  return leaf.view?.file?.path === file.path;
}

function markdownIsActive(workspace: NoteWorkspace, file: NoteFile, mergeViewType: string): boolean {
  const active = workspace.getActiveFile?.();
  if (active?.path === file.path) return true;
  const recent = workspace.getMostRecentLeaf?.();
  if (recent && leafShowsNote(recent, file, mergeViewType)) return true;
  return false;
}

function canConfirmActive(workspace: NoteWorkspace): boolean {
  return typeof workspace.getActiveFile === 'function' || typeof workspace.getMostRecentLeaf === 'function';
}

/**
 * Open the vault note in a brand-new markdown leaf, then detach compare.
 * Never `openFile` on MERGE_VIEW_TYPE. Close compare only after the note
 * is the active view (or after a successful open when the workspace
 * cannot report the active file — tests).
 */
export async function openVaultMarkdownTab(
  workspace: NoteWorkspace,
  file: NoteFile,
  mergeViewType: string,
  trace?: ResolveTrace,
): Promise<void> {
  const path = vaultNotePath(file.path);
  if (isWorkCachePath(file.path)) {
    throw new Error(`Кэш слияния не является заметкой vault: ${file.path}`);
  }

  const log = async (message: string) => {
    await trace?.(message);
  };

  let lastError: unknown;
  const leaf = pickMarkdownLeaf(workspace, mergeViewType);
  const leafType = leaf.view?.getViewType?.() ?? 'unknown';
  await log(`leaf | ${isMergeViewLeaf(leaf, mergeViewType) ? 'FAIL' : 'OK'} | type=${leafType} merge=${isMergeViewLeaf(leaf, mergeViewType)}`);

  if (!isMergeViewLeaf(leaf, mergeViewType) && typeof leaf.openFile === 'function') {
    try {
      await log(`openFile | WAIT | ${path} api=leaf.openFile`);
      await leaf.openFile(file, { active: true });
      workspace.setActiveLeaf(leaf, { focus: true });
      workspace.revealLeaf(leaf);
      await log(`reveal | OK | after leaf.openFile type=${leafType}`);
      const confirmed = !canConfirmActive(workspace) || markdownIsActive(workspace, file, mergeViewType)
        || leafShowsNote(leaf, file, mergeViewType);
      if (confirmed) {
        detachMergeLeaves(workspace, mergeViewType);
        await log('closeMerge | OK | after leaf.openFile');
        return;
      }
      await log('openFile | FAIL | вернулся, но markdown не активен');
    } catch (error) {
      lastError = error;
      await log(`openFile | FAIL | api=leaf.openFile type=${leafType} ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (isMergeViewLeaf(leaf, mergeViewType)) {
    await log(`openFile | SKIP | лист type=${leafType} это MergeView`);
  } else {
    await log(`openFile | SKIP | у листа type=${leafType} нет openFile`);
  }

  if (typeof workspace.openLinkText === 'function') {
    try {
      const link = vaultNoteLinkText(file);
      await log(`openLinkText | WAIT | ${link} ${path} api=openLinkText(tab)`);
      await workspace.openLinkText(link, path, true);
      const recent = workspace.getMostRecentLeaf?.();
      if (recent && !isMergeViewLeaf(recent, mergeViewType)) {
        workspace.setActiveLeaf(recent, { focus: true });
        workspace.revealLeaf(recent);
      }
      const confirmed = !canConfirmActive(workspace) || markdownIsActive(workspace, file, mergeViewType);
      if (confirmed) {
        detachMergeLeaves(workspace, mergeViewType);
        await log('closeMerge | OK | after openLinkText');
        return;
      }
      await log('openLinkText | FAIL | вернулся, но markdown не активен');
    } catch (error) {
      lastError = error;
      await log(`openLinkText | FAIL | ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (typeof workspace.openFile === 'function') {
    try {
      await log(`openFile | WAIT | ${path} api=workspace.openFile`);
      await workspace.openFile(file, leaf, { active: true });
      const confirmed = !canConfirmActive(workspace) || markdownIsActive(workspace, file, mergeViewType);
      if (confirmed) {
        detachMergeLeaves(workspace, mergeViewType);
        await log('closeMerge | OK | after workspace.openFile');
        return;
      }
    } catch (error) {
      lastError = error;
      await log(`openFile | FAIL | api=workspace.openFile ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!isMergeViewLeaf(leaf, mergeViewType) && typeof leaf.setViewState === 'function') {
    try {
      await log(`setViewState | WAIT | markdown ${path}`);
      await leaf.setViewState({ type: 'markdown', active: true, state: { file: path } });
      workspace.setActiveLeaf(leaf, { focus: true });
      workspace.revealLeaf(leaf);
      const confirmed = !canConfirmActive(workspace) || markdownIsActive(workspace, file, mergeViewType)
        || leafShowsNote(leaf, file, mergeViewType);
      if (confirmed) {
        detachMergeLeaves(workspace, mergeViewType);
        await log('closeMerge | OK | after setViewState');
        return;
      }
    } catch (error) {
      lastError = error;
      await log(`setViewState | FAIL | ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const detail = lastError instanceof Error
    ? lastError.message
    : isMergeViewLeaf(leaf, mergeViewType)
      ? 'getLeaf вернул MergeView, openLinkText/openFile нет'
      : typeof leaf.openFile !== 'function'
        ? 'у листа нет openFile, openLinkText нет'
        : 'нет рабочего openFile/openLinkText';
  throw new Error(`Не удалось открыть ${path}: лист type=${leafType}; ${detail}`);
}

/** @deprecated use openVaultMarkdownTab — same contract. */
export async function revealVaultNote(
  workspace: NoteWorkspace,
  file: NoteFile,
  mergeViewType: string,
  trace?: ResolveTrace,
): Promise<void> {
  await openVaultMarkdownTab(workspace, file, mergeViewType, trace);
}
