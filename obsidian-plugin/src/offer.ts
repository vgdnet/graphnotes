import { eligible } from './core';

export const OFFER_BUTTON_LABEL = 'Предложить в ризому';
export const OFFER_SELECTED_LABEL = 'Предложить выбранные';
export const OFFER_KIND_ADDED = 'нет в общей';
export const OFFER_KIND_CHANGED = 'отличается';
export const ALREADY_IN_SYNC_DETAIL = 'those notes already match the shared rhizome';
export const ALREADY_QUEUED_NOTICE = 'Эта карточка уже в очереди.';
export const IN_SYNC_NOTICE = 'Карточка уже совпадает с общей.';
export const TOKEN_REQUIRED_NOTICE =
  'Нужен токен GraphNotes (gnp_…). Логин и пароль в плагине не нужны.';
export const ACCOUNT_CANNOT_PROPOSE_NOTICE = 'Эта учётка не создаёт заявку в очередь.';

export type OfferKind = 'added' | 'changed';

export interface DifferOffer {
  path: string;
  title: string;
  kind: OfferKind;
}

export interface OpenProposal {
  id: string;
  status: string;
  paths: string[];
}

const OPEN_STATUSES = new Set(['open', 'conflicted', 'failed']);

export function isOfferKind(kind: string): kind is OfferKind {
  return kind === 'added' || kind === 'changed';
}

export function offerKindLabel(kind: OfferKind): string {
  return kind === 'added' ? OFFER_KIND_ADDED : OFFER_KIND_CHANGED;
}

export function parseDifferOffers(value: unknown): DifferOffer[] {
  const data = asRecord(value);
  if (!Array.isArray(data.differences)) throw new Error('GET /api/differ не вернул differences.');
  const offers: DifferOffer[] = [];
  const seen = new Set<string>();
  for (const item of data.differences) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const path = typeof rec.path === 'string' ? rec.path.trim() : '';
    const kind = typeof rec.kind === 'string' ? rec.kind.trim() : '';
    if (!path || !isOfferKind(kind) || seen.has(path)) continue;
    seen.add(path);
    offers.push({
      path,
      title: typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : path,
      kind,
    });
  }
  return offers;
}

export function parseOpenProposalPaths(value: unknown): Set<string> {
  const queued = new Set<string>();
  for (const proposal of parseOpenProposals(value)) {
    for (const path of proposal.paths) queued.add(path);
  }
  return queued;
}

export function parseOpenProposals(value: unknown): OpenProposal[] {
  const data = asRecord(value);
  if (!Array.isArray(data.proposals)) throw new Error('GET /api/proposals не вернул proposals.');
  const listed: OpenProposal[] = [];
  for (const item of data.proposals) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const status = typeof rec.status === 'string' ? rec.status.trim() : '';
    if (!id || !OPEN_STATUSES.has(status)) continue;
    const paths = Array.isArray(rec.paths)
      ? rec.paths.filter((path): path is string => typeof path === 'string' && Boolean(path.trim()))
      : [];
    listed.push({ id, status, paths });
  }
  return listed;
}

export function parseCreatedProposal(value: unknown): { id: string; paths: string[] } {
  const data = asRecord(value);
  const id = typeof data.id === 'string' ? data.id.trim() : '';
  if (!id) throw new Error('POST /api/proposals не вернул id заявки.');
  const paths = Array.isArray(data.paths)
    ? data.paths.filter((path): path is string => typeof path === 'string' && Boolean(path.trim()))
    : [];
  return { id, paths };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Ответ API не является объектом.');
  }
  return value as Record<string, unknown>;
}

export type FileMenuLike = {
  addItem(cb: (item: FileMenuItemLike) => void): unknown;
};

export type FileMenuItemLike = {
  setTitle(title: string): FileMenuItemLike;
  setIcon?(icon: string): FileMenuItemLike;
  onClick(cb: () => unknown): FileMenuItemLike;
};

export type ProposeOneApi = {
  queuedOfferPaths(): Promise<Set<string>>;
  propose(paths: string[], summary?: string): Promise<{ id: string; paths: string[] }>;
};

export type ProposeOneResult =
  | { status: 'created'; id: string; path: string }
  | { status: 'already_queued'; path: string }
  | { status: 'already_in_sync'; path: string }
  | { status: 'error'; message: string };

const SITE_ERRORS: Record<string, string> = {
  'the shared rhizome is not connected': 'Общая ризома не подключена.',
  [ALREADY_IN_SYNC_DETAIL]: IN_SYNC_NOTICE,
  'note was not found': 'Карточки нет в личном складе. Сначала передайте правки на сервер.',
  'closed notes cannot be proposed': 'Закрытую карточку предложить нельзя.',
  'this account cannot propose to the shared rhizome':
    'Эта учётка не создаёт заявку в очередь. Правка идёт в ризому без предложения.',
  'authentication required': 'Нужна авторизация. Проверьте токен.',
  'GitHub rate limit reached': 'Сверка на GraphNotes не ответила. Повторите позже.',
  rate_limited: 'Сверка временно недоступна. Повторите позже.',
  insufficient_scope: 'У токена нет права personal:read.',
  author_contract_required: 'Нужен договор автора в настройках GraphNotes.',
};

export function isOfferMarkdownFile(file: { extension?: string; path?: string } | null | undefined): boolean {
  return Boolean(file?.extension === 'md' && file.path && eligible(file.path));
}

export function shouldShowProposeMenu(
  canPropose: boolean | undefined,
  file: { extension?: string; path?: string } | null | undefined,
): boolean {
  if (canPropose === false) return false;
  return isOfferMarkdownFile(file);
}

export function asProposeMenuFile(file: unknown): { extension?: string; path?: string } | null {
  if (!file || typeof file !== 'object') return null;
  const rec = file as { extension?: unknown; path?: unknown };
  if (typeof rec.path !== 'string') return null;
  return {
    path: rec.path,
    extension: typeof rec.extension === 'string' ? rec.extension : undefined,
  };
}

export type ProposeMenuWorkspace = {
  on(name: string, cb: (...args: unknown[]) => unknown): unknown;
};

export function registerProposeMenuEvents(
  workspace: ProposeMenuWorkspace,
  registerEvent: (ev: unknown) => void,
  opts: {
    canPropose: () => boolean | undefined;
    onPropose: (file: { extension?: string; path: string }) => void;
    activeFile?: () => { extension?: string; path?: string } | null;
  },
): string[] {
  registerEvent(workspace.on('file-menu', (menu, file) => {
    const tfile = asProposeMenuFile(file);
    addProposeMenuItem(menu as FileMenuLike, opts.canPropose(), tfile, () => {
      if (tfile?.path) opts.onPropose({ extension: tfile.extension, path: tfile.path });
    });
  }));
  registerEvent(workspace.on('editor-menu', (menu, _editor, view) => {
    const rec = view && typeof view === 'object' ? (view as { file?: unknown }).file : undefined;
    const file = asProposeMenuFile(rec) ?? opts.activeFile?.() ?? null;
    addProposeMenuItem(menu as FileMenuLike, opts.canPropose(), file, () => {
      if (file?.path) opts.onPropose({ extension: file.extension, path: file.path });
    });
  }));
  return ['file-menu', 'editor-menu'];
}

export function addProposeMenuItem(
  menu: FileMenuLike,
  canPropose: boolean | undefined,
  file: { extension?: string; path?: string } | null | undefined,
  onClick: () => unknown,
): boolean {
  if (!shouldShowProposeMenu(canPropose, file)) return false;
  menu.addItem(item => {
    item.setTitle(OFFER_BUTTON_LABEL);
    item.setIcon?.('paper-plane');
    item.onClick(onClick);
  });
  return true;
}

export function isAlreadyInSyncError(error: unknown): boolean {
  return offerErrorKey(error) === ALREADY_IN_SYNC_DETAIL;
}

export function describeOfferError(error: unknown): string {
  const key = offerErrorKey(error);
  if (key && SITE_ERRORS[key]) return SITE_ERRORS[key];
  if (error instanceof Error && error.message) return SITE_ERRORS[error.message] ?? error.message;
  return 'Неизвестная ошибка.';
}

export function proposeOneNotice(result: ProposeOneResult): string {
  if (result.status === 'created') return `Заявка создана: ${result.path}`;
  if (result.status === 'already_queued') return ALREADY_QUEUED_NOTICE;
  if (result.status === 'already_in_sync') return IN_SYNC_NOTICE;
  return result.message;
}

export function proposeClickBlock(
  hasToken: boolean,
  explicitDeny: boolean,
): 'need_token' | 'denied' | null {
  if (!hasToken) return 'need_token';
  if (explicitDeny) return 'denied';
  return null;
}

export function proposeClickNotice(block: 'need_token' | 'denied'): string {
  return block === 'need_token' ? TOKEN_REQUIRED_NOTICE : ACCOUNT_CANNOT_PROPOSE_NOTICE;
}

export async function proposeOnePath(api: ProposeOneApi, path: string): Promise<ProposeOneResult> {
  try {
    const queued = await api.queuedOfferPaths();
    if (queued.has(path)) return { status: 'already_queued', path };
  } catch {
    // GET /proposals only marks already-queued. A timeout must not block POST.
  }
  try {
    const created = await api.propose([path], path);
    return { status: 'created', id: created.id, path };
  } catch (error) {
    if (isAlreadyInSyncError(error)) return { status: 'already_in_sync', path };
    return { status: 'error', message: describeOfferError(error) };
  }
}

function offerErrorKey(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const rec = error as { message?: unknown; code?: unknown };
  if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim();
  if (typeof rec.code === 'string' && rec.code.trim()) return rec.code.trim();
  return '';
}
