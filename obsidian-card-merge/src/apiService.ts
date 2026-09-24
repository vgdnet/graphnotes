import { AUTO_MODES, clampAutoMinutes, type AutoMode, type SavedData } from './core';
import { normalizeSaved } from './store';

/** Distinct from GraphNotes Publisher (`graphnotes-publisher`). */
export const PLUGIN_ID = 'graphnotes-card-merge';
/** Distinct from Publisher sidebar `graphnotes-publisher-sync`. */
export const MERGE_VIEW_TYPE = 'graphnotes-card-merge';
export const QUEUE_VIEW_TYPE = 'graphnotes-card-merge-queue';

export interface MergeSession {
  localPath: string;
  differPath: string;
  remotePath: string;
  proposalId: string;
  resolved?: boolean;
  publishedIncoming?: string;
  publishedMerged?: string;
}

export interface WorkJob {
  proposalId: string;
  path: string;
}

export function parseMergeSession(raw: unknown): MergeSession | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const localPath = typeof rec.localPath === 'string' ? rec.localPath.trim() : '';
  if (!localPath) return null;
  const differPath = typeof rec.differPath === 'string'
    ? rec.differPath.trim()
    : typeof rec.remoteCardId === 'string'
      ? rec.remoteCardId.trim()
      : '';
  return {
    localPath,
    differPath,
    remotePath: typeof rec.remotePath === 'string' ? rec.remotePath.trim() : '',
    proposalId: typeof rec.proposalId === 'string' ? rec.proposalId.trim() : '',
    resolved: rec.resolved === true,
    publishedIncoming: typeof rec.publishedIncoming === 'string' ? rec.publishedIncoming : undefined,
    publishedMerged: typeof rec.publishedMerged === 'string' ? rec.publishedMerged : undefined,
  };
}

export interface MergePluginSettings extends SavedData {
  /** Origin only, no path. Same as Publisher: frontend on rhizome-test, not FastAPI. */
  lastDifferPath: string;
  lastSecondaryPath: string;
  showDebug: boolean;
  inWork: Record<string, WorkJob>;
}

export const DEFAULT_SETTINGS: MergePluginSettings = {
  server: 'http://172.16.13.14:8080',
  allowHttp: true,
  token: '',
  autoSync: true,
  autoMode: 'idle',
  autoMinutes: 5,
  connections: {},
  history: [],
  lastDifferPath: '',
  lastSecondaryPath: '',
  showDebug: true,
  inWork: {},
};

export interface QueueDebug {
  origin: string;
  username: string;
  differCount: number;
  vaultCount: number;
  queuedCount: number;
  lastError: string;
}

export function formatQueueDebug(debug: QueueDebug): string {
  const who = debug.username ? `@${debug.username}` : 'токен без пользователя';
  return [
    `${debug.origin} · ${who}`,
    `GET /api/differ: ${debug.differCount}`,
    `файлов в vault: ${debug.vaultCount}`,
    `в очереди: ${debug.queuedCount}`,
    debug.lastError ? `ошибка: ${debug.lastError}` : '',
  ].filter(Boolean).join('\n');
}

export interface DifferItem {
  path: string;
  title: string;
  kind: string;
  updatedAt: string;
  proposalId?: string;
  author?: string;
  summary?: string;
  inWork?: boolean;
}

export type EditorialQueueMode = 'all' | 'granted' | 'none';

export const NO_GRANTS_QUEUE_MESSAGE = 'Нет грантов';
export const NO_PROPOSALS_QUEUE_MESSAGE = 'Нет новых предложений';

export interface QueueSnapshot {
  mode: 'review' | 'author';
  items: DifferItem[];
  canProposeToRhizome: boolean;
  editorialQueueMode?: EditorialQueueMode;
}

/** Admin bypasses grants. Missing API field: admin → all, editor unknown (probe /granted). */
export function editorialQueueModeFromCaps(role: string, raw?: unknown): EditorialQueueMode | undefined {
  if (raw === 'all' || raw === 'granted' || raw === 'none') return raw;
  if (role === 'admin') return 'all';
  return undefined;
}

export function reviewQueueEmptyMessage(mode: EditorialQueueMode | undefined, itemCount: number): string {
  if (itemCount) return '';
  if (mode === 'none') return NO_GRANTS_QUEUE_MESSAGE;
  return NO_PROPOSALS_QUEUE_MESSAGE;
}

/** Production may lack editorial_queue_mode: empty editor queue then means grants or no proposals. */
export function shouldProbeGrantedList(
  role: string,
  mode: EditorialQueueMode | undefined,
  itemCount: number,
): boolean {
  return role === 'editor' && itemCount === 0 && mode === undefined;
}

export interface ProposalListItem {
  id: string;
  status: string;
  summary: string;
  paths: string[];
  author: string;
  updatedAt: string;
}

export interface ProposalFile {
  path: string;
  body: string;
  before: string;
}

export interface ProposalDetail extends ProposalListItem {
  files: ProposalFile[];
}

export interface DifferSide {
  layer: string;
  path: string;
  body: string;
  author: string;
  timestamp: string;
}

export interface DifferFile {
  path: string;
  title: string;
  kind: string;
  incoming: DifferSide;
  current: DifferSide;
}

export interface RemoteCard {
  id: string;
  path: string;
  content: string;
  author: string;
  timestamp: string;
}

export class CardApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body = '',
  ) {
    super(message);
    this.name = 'CardApiError';
  }
}

/** Path only — never the Bearer token. */
export function requestPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Pull `<title>` / `<h1>` from nginx HTML, else a short plain-text slice. */
export function summarizeHttpBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  const title = trimmed.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()
    || trimmed.match(/<h1>([^<]+)<\/h1>/i)?.[1]?.trim();
  if (title) return title.replace(/\s+/g, ' ');
  return trimmed.replace(/\s+/g, ' ').slice(0, 240);
}

export function formatHttpFailure(method: string, url: string, status: number, message: string): string {
  const path = requestPath(url);
  const statusText = status > 0 ? `HTTP ${status}` : 'сеть';
  const detail = message.replace(/\s+/g, ' ').trim().slice(0, 280) || 'нет тела ответа';
  return `${method} ${path} → ${statusText}: ${detail}`;
}

export function normalizeToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  const token = value.trim();
  return token.startsWith('gnp_') && token.length <= 200 ? token : '';
}

export function normalizeSettings(raw: unknown): MergePluginSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const legacyCard = typeof src.lastCardId === 'string' ? src.lastCardId : '';
  const saved = normalizeSaved(raw);
  const autoMode: AutoMode = AUTO_MODES.includes(saved.autoMode) ? saved.autoMode : DEFAULT_SETTINGS.autoMode;
  return {
    server: typeof src.server === 'string' && src.server.trim() ? src.server.trim() : DEFAULT_SETTINGS.server,
    allowHttp: src.allowHttp !== false,
    token: normalizeToken(src.token) || saved.token,
    autoSync: autoMode !== 'manual',
    autoMode,
    autoMinutes: clampAutoMinutes(saved.autoMinutes),
    connections: saved.connections,
    history: saved.history,
    lastDebug: saved.lastDebug,
    lastDifferPath: typeof src.lastDifferPath === 'string' && src.lastDifferPath
      ? src.lastDifferPath
      : legacyCard,
    lastSecondaryPath: typeof src.lastSecondaryPath === 'string' ? src.lastSecondaryPath : '',
    showDebug: src.showDebug !== false,
    inWork: parseInWork(src.inWork),
  };
}

function parseInWork(value: unknown): Record<string, WorkJob> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: Record<string, WorkJob> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const proposalId = typeof rec.proposalId === 'string' ? rec.proposalId.trim() : '';
    const path = typeof rec.path === 'string' ? rec.path.trim() : '';
    if (proposalId && path) next[key] = { proposalId, path };
  }
  return keepSingleWork(next);
}

export function keepSingleWork(inWork: Record<string, WorkJob>): Record<string, WorkJob> {
  const first = Object.entries(inWork)[0];
  return first ? { [first[0]]: first[1] } : {};
}

export function activeWork(inWork: Record<string, WorkJob>): WorkJob | undefined {
  return Object.values(inWork)[0];
}

export function isSameWork(job: WorkJob | undefined, item: DifferItem): boolean {
  return Boolean(job && item.proposalId && job.proposalId === item.proposalId && job.path === item.path);
}

export function workKey(proposalId: string, path: string): string {
  return `${proposalId.trim()}:${path.trim()}`;
}

export function workPairPaths(configDir: string, proposalId: string, path: string): { dir: string; incoming: string; current: string } {
  const safe = path.trim().replace(/[\\/]/g, '__');
  const dir = `${configDir}/plugins/${PLUGIN_ID}/work/${proposalId.trim()}/${safe}`;
  return { dir, incoming: `${dir}/incoming.md`, current: `${dir}/current.md` };
}

export function isWorkCachePath(path: string): boolean {
  return path.includes(`/plugins/${PLUGIN_ID}/work/`);
}

/** Vault-relative Markdown path for the published local card. Not `.obsidian` cache. */
export function vaultCardPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = trimmed.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '.' || part === '..' || part === '.obsidian')) {
    throw new Error('Нельзя записать карточку по этому пути.');
  }
  const joined = parts.join('/');
  return joined.toLowerCase().endsWith('.md') ? joined : `${joined}.md`;
}

export function publishedCardPath(session: Pick<MergeSession, 'localPath' | 'differPath' | 'proposalId'>): string {
  if (session.differPath && (session.proposalId || isWorkCachePath(session.localPath))) {
    return vaultCardPath(session.differPath);
  }
  if (session.localPath && !isWorkCachePath(session.localPath)) {
    return vaultCardPath(session.localPath);
  }
  throw new Error('Нет пути для локальной карточки.');
}

export function serverOrigin(value: string, allowHttp: boolean): string {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Укажите только адрес сервера, без пути, пароля и параметров.');
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new Error('Нужен HTTPS. Для локального HTTP включите отдельное разрешение.');
  }
  return url.origin;
}

export function encodeNotePath(path: string): string {
  const id = path.trim();
  if (!id) throw new Error('Укажите путь карточки Differ.');
  if (id.includes('..') || id.includes('\\') || id.includes('\0')) {
    throw new Error('Недопустимый путь карточки.');
  }
  return id.split('/').map(encodeURIComponent).join('/');
}

/** Same route the website `/offer` uses. Browser prefix `/api` is stripped by Nginx. */
export function differUrl(origin: string): string {
  return `${origin}/api/differ`;
}

export function differFileUrl(origin: string, path: string): string {
  return `${origin}/api/differ/files/${encodeNotePath(path)}`;
}

/** Same identity check as GraphNotes Publisher. */
export function capabilitiesUrl(origin: string): string {
  return `${origin}/api/integrations/obsidian/v1/capabilities`;
}

export function grantedUrl(origin: string): string {
  return `${origin}/api/integrations/obsidian/v1/granted`;
}

export function proposalsUrl(origin: string): string {
  return `${origin}/api/proposals`;
}

export function proposalUrl(origin: string, id: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error('Укажите заявку очереди.');
  return `${origin}/api/proposals/${encodeURIComponent(trimmed)}`;
}

export function proposalFileUrl(origin: string, id: string, path: string): string {
  return `${proposalUrl(origin, id)}/files/${encodeNotePath(path)}`;
}

export function proposalResolveUrl(origin: string, id: string): string {
  return `${proposalUrl(origin, id)}/resolve`;
}

export function isReviewerRole(role: string): boolean {
  return role === 'editor' || role === 'admin';
}

/** Second TZ 3.25 op: update the rhizome store only when the vault file differs. */
export function shouldUpdateRhizomeStore(localSource: string, sharedSource: string): boolean {
  return localSource !== sharedSource;
}

export function canSeeQueue(role: string, flag?: boolean): boolean {
  if (flag === true) return true;
  if (flag === false) return false;
  return isReviewerRole(role);
}

/** Context-menu / offer: show for `user`, explicit true, or unknown. Hide only known editor/admin. */
export function canProposeToRhizome(role: string, flag?: boolean): boolean {
  if (flag === true) return true;
  const known = role.trim().toLowerCase();
  if (known === 'user') return true;
  if (known === 'editor' || known === 'admin') return false;
  return true;
}

/** Same statuses as website `#/queue` tab «Новые». */
export function isNewQueueStatus(status: string): boolean {
  return status === 'open' || status === 'conflicted' || status === 'failed';
}

export interface SessionUser {
  username: string;
  displayName: string;
  role: string;
  writeAllowed: boolean;
  canSeeQueue: boolean;
  canProposeToRhizome: boolean;
  editorialQueueMode?: EditorialQueueMode;
  hasEditorialGrants?: boolean;
}

export const TOKEN_ERRORS: Record<string, string> = {
  author_contract_required: 'Нужен договор автора в настройках GraphNotes.',
  account_inactive: 'Учётная запись неактивна.',
  write_disabled: 'Сервер запретил запись в личное хранилище.',
  insufficient_scope: 'У токена нет права personal:read.',
  token_expired: 'Срок токена истёк. Создайте новый во вкладке Obsidian.',
  invalid_token: 'Токен не принят. Создайте новый во вкладке Obsidian.',
};

export const DECISION_ERRORS: Record<string, string> = {
  'this proposal cannot be accepted now':
    'Эту заявку уже приняли.',
  'you cannot decide on your own proposal': 'Свою заявку принять нельзя.',
  'this proposal conflicts with the current shared rhizome':
    'Заявка конфликтует с текущей общей. Разберите на сайте /queue.',
};

export function isAlreadyAcceptedError(error: unknown): boolean {
  if (!(error instanceof CardApiError) || error.status !== 409) return false;
  return (
    error.message.includes('уже приняли')
    || error.message.includes('cannot be accepted')
  );
}

export function parseCapabilities(value: unknown): SessionUser {
  const rec = asRecord(value);
  const user = rec.user && typeof rec.user === 'object' && !Array.isArray(rec.user)
    ? rec.user as Record<string, unknown>
    : {};
  const username = typeof user.username === 'string' ? user.username.trim() : '';
  if (!username) throw new CardApiError(0, 'invalid_payload', 'Сервер не вернул пользователя токена.');
  const scopes = Array.isArray(rec.scopes) ? rec.scopes.filter((item): item is string => typeof item === 'string') : [];
  if (scopes.length && !scopes.includes('personal:read')) {
    throw new CardApiError(403, 'insufficient_scope', TOKEN_ERRORS.insufficient_scope);
  }
  const role = typeof user.role === 'string' ? user.role.trim() : '';
  return {
    username,
    displayName: typeof user.display_name === 'string' && user.display_name.trim() ? user.display_name.trim() : username,
    role,
    writeAllowed: rec.write_allowed === true,
    canSeeQueue: canSeeQueue(role, typeof rec.can_see_queue === 'boolean' ? rec.can_see_queue : undefined),
    canProposeToRhizome: canProposeToRhizome(
      role,
      typeof rec.can_propose_to_rhizome === 'boolean' ? rec.can_propose_to_rhizome : undefined,
    ),
    editorialQueueMode: editorialQueueModeFromCaps(role, rec.editorial_queue_mode),
    hasEditorialGrants: typeof rec.has_editorial_grants === 'boolean' ? rec.has_editorial_grants : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CardApiError(0, 'invalid_payload', 'Ответ API не является объектом.');
  }
  return value as Record<string, unknown>;
}

function textField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function authorField(value: unknown): string {
  const direct = textField(value)?.trim();
  if (direct) return direct;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const rec = value as Record<string, unknown>;
  return textField(rec.display_name)?.trim() || textField(rec.username)?.trim() || '';
}

function timestampField(value: unknown): string {
  return textField(value)?.trim() ?? '';
}

export function parseDifferItem(value: unknown): DifferItem {
  const rec = asRecord(value);
  const path = textField(rec.path)?.trim();
  if (!path) throw new CardApiError(0, 'invalid_payload', 'В Differ нет пути.');
  return {
    path,
    title: textField(rec.title)?.trim() || path,
    kind: textField(rec.kind)?.trim() || 'changed',
    updatedAt: timestampField(rec.updated_at),
  };
}

export function parseProposalList(value: unknown): ProposalListItem[] {
  const rec = asRecord(value);
  if (!Array.isArray(rec.proposals)) {
    throw new CardApiError(0, 'invalid_payload', 'GET /api/proposals не вернул proposals.');
  }
  return rec.proposals.map(parseProposalListItem);
}

export function parseProposalListItem(value: unknown): ProposalListItem {
  const rec = asRecord(value);
  const id = textField(rec.id)?.trim();
  if (!id) throw new CardApiError(0, 'invalid_payload', 'В заявке нет id.');
  const paths = Array.isArray(rec.paths)
    ? rec.paths.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
  return {
    id,
    status: textField(rec.status)?.trim() || 'open',
    summary: textField(rec.summary)?.trim() || paths[0] || id,
    paths,
    author: authorField(rec.author),
    updatedAt: timestampField(rec.updated_at) || timestampField(rec.created_at),
  };
}

export function parseProposalFile(value: unknown): ProposalFile {
  const rec = asRecord(value);
  const path = textField(rec.path)?.trim();
  if (!path) throw new CardApiError(0, 'invalid_payload', 'В файле заявки нет пути.');
  return {
    path,
    body: textField(rec.body) ?? '',
    before: textField(rec.before) ?? '',
  };
}

export function parseProposalDetail(value: unknown): ProposalDetail {
  const listed = parseProposalListItem(value);
  const rec = asRecord(value);
  const files = Array.isArray(rec.diff) ? rec.diff.map(parseProposalFile) : [];
  return { ...listed, files };
}

export function proposalItems(proposals: ProposalListItem[]): DifferItem[] {
  const items: DifferItem[] = [];
  for (const proposal of proposals) {
    if (!isNewQueueStatus(proposal.status)) continue;
    for (const path of proposal.paths) {
      items.push({
        path,
        title: path,
        kind: 'changed',
        updatedAt: proposal.updatedAt,
        proposalId: proposal.id,
        author: proposal.author,
        summary: proposal.summary,
      });
    }
  }
  return items;
}

export function parseDifferList(value: unknown): DifferItem[] {
  const rec = asRecord(value);
  if (!Array.isArray(rec.differences)) {
    throw new CardApiError(0, 'invalid_payload', 'GET /api/differ не вернул differences.');
  }
  return rec.differences.map(parseDifferItem);
}

export function parseDifferSide(value: unknown, fallbackPath: string): DifferSide {
  const rec = asRecord(value);
  const body = textField(rec.body) ?? textField(rec.content) ?? textField(rec.source);
  if (body == null) {
    throw new CardApiError(0, 'invalid_payload', 'В стороне Differ нет текста (body).');
  }
  return {
    layer: textField(rec.layer)?.trim() || '',
    path: textField(rec.path)?.trim() || fallbackPath,
    body,
    author: authorField(rec.author),
    timestamp: timestampField(rec.updated_at) || timestampField(rec.timestamp),
  };
}

/** Right-pane seed when the vault has no file yet: personal copy, else shared. */
export function bodyToMaterialize(file: DifferFile): string {
  return file.current.body || file.incoming.body;
}

/** Vault file belongs in the queue if it is not the published shared text. */
export function shouldQueueVaultFile(file: DifferFile, localBody: string): boolean {
  if (localBody !== file.incoming.body) return true;
  return file.kind === 'added' || file.kind === 'changed';
}

export function parseDifferFile(value: unknown, fallbackPath: string): DifferFile {
  const rec = asRecord(value);
  const path = textField(rec.path)?.trim() || fallbackPath;
  return {
    path,
    title: textField(rec.title)?.trim() || path,
    kind: textField(rec.kind)?.trim() || 'changed',
    incoming: parseDifferSide(rec.incoming, path),
    current: parseDifferSide(rec.current, path),
  };
}

export function remoteCardFromIncoming(file: DifferFile): RemoteCard {
  return {
    id: file.path,
    path: file.path,
    content: file.incoming.body,
    author: file.incoming.author || file.current.author,
    timestamp: file.incoming.timestamp || file.current.timestamp,
  };
}

export class CardApiService {
  constructor(
    private readonly origin: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async listDifferences(signal?: AbortSignal): Promise<DifferItem[]> {
    return parseDifferList(await this.getJson(differUrl(this.origin), signal));
  }

  async getDifferFile(path: string, signal?: AbortSignal): Promise<DifferFile> {
    return parseDifferFile(await this.getJson(differFileUrl(this.origin, path), signal), path);
  }

  async getCard(path: string, signal?: AbortSignal): Promise<RemoteCard> {
    const file = await this.getDifferFile(path, signal);
    return remoteCardFromIncoming(file);
  }

  async listProposals(signal?: AbortSignal): Promise<ProposalListItem[]> {
    return parseProposalList(await this.getJson(proposalsUrl(this.origin), signal));
  }

  async granted(signal?: AbortSignal): Promise<string[]> {
    const rec = asRecord(await this.getJson(grantedUrl(this.origin), signal));
    if (!Array.isArray(rec.items)) {
      throw new CardApiError(0, 'invalid_payload', 'GET /granted не вернул items.');
    }
    return rec.items.flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const path = (item as Record<string, unknown>).path;
      return typeof path === 'string' && path.trim() ? [path.trim()] : [];
    });
  }

  async getProposal(id: string, signal?: AbortSignal): Promise<ProposalDetail> {
    return parseProposalDetail(await this.requestJson('GET', proposalUrl(this.origin, id), undefined, signal));
  }

  async getProposalWorkFile(id: string, path: string, signal?: AbortSignal): Promise<ProposalFile> {
    try {
      return parseProposalFile(await this.requestJson('GET', proposalFileUrl(this.origin, id, path), undefined, signal));
    } catch (error) {
      if (!isMissingRoute(error)) throw error;
      const detail = await this.getProposal(id, signal);
      const file = detail.files.find(entry => entry.path === path);
      if (!file) throw new CardApiError(404, 'not_found', `В заявке нет файла ${path}.`);
      return file;
    }
  }

  async resolveProposal(
    id: string,
    files: { path: string; source: string }[],
    reason = '',
    signal?: AbortSignal,
  ): Promise<void> {
    await this.requestJson('POST', proposalResolveUrl(this.origin, id), { files, reason }, signal);
  }

  async capabilities(signal?: AbortSignal): Promise<SessionUser> {
    return parseCapabilities(await this.requestJson('GET', capabilitiesUrl(this.origin), undefined, signal));
  }

  private async getJson(url: string, signal?: AbortSignal): Promise<unknown> {
    return this.requestJson('GET', url, undefined, signal);
  }

  private async requestJson(
    method: string,
    url: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!this.token.trim()) throw new Error('Введите токен в настройках плагина.');
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      const message = error instanceof Error ? error.message : 'Сеть недоступна.';
      throw new CardApiError(0, 'network', formatHttpFailure(method, url, 0, `Не удалось запросить GraphNotes: ${message}`));
    }
    const text = await response.text();
    if (!response.ok) {
      const parsed = parseApiFailure(text, response.status);
      throw new CardApiError(
        response.status,
        parsed.code,
        formatHttpFailure(method, url, response.status, TOKEN_ERRORS[parsed.code] ?? parsed.message),
        text.slice(0, 500),
      );
    }
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new CardApiError(0, 'invalid_payload', formatHttpFailure(method, url, response.status, 'Ответ API не JSON.'), text.slice(0, 500));
    }
  }
}

function isMissingRoute(error: unknown): boolean {
  return error instanceof CardApiError && error.status === 404;
}

function parseApiFailure(body: string, status: number): { code: string; message: string } {
  if (!body) return { code: 'http_error', message: `Сервер ответил ${status}.` };
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; error?: { message?: unknown; code?: unknown }; message?: unknown };
    let code = typeof parsed.error?.code === 'string' ? parsed.error.code : status === 401 ? 'invalid_token' : 'http_error';
    if (typeof parsed.detail === 'string' && parsed.detail.includes('author contract')) {
      code = 'author_contract_required';
    }
    if (typeof parsed.detail === 'string') {
      return { code, message: DECISION_ERRORS[parsed.detail] ?? TOKEN_ERRORS[parsed.detail] ?? parsed.detail };
    }
    if (typeof parsed.error?.message === 'string') return { code, message: parsed.error.message };
    if (typeof parsed.message === 'string') return { code, message: parsed.message };
    return { code, message: `Сервер ответил ${status}.` };
  } catch {
    return { code: 'http_error', message: summarizeHttpBody(body) || `Сервер ответил ${status}.` };
  }
}
