/** Distinct from GraphNotes Publisher (`graphnotes-publisher`). */
export const PLUGIN_ID = 'graphnotes-card-merge';
/** Distinct from Publisher sidebar `graphnotes-publisher-sync`. */
export const MERGE_VIEW_TYPE = 'graphnotes-card-merge';
export const QUEUE_VIEW_TYPE = 'graphnotes-card-merge-queue';

export interface MergeSession {
  localPath: string;
  differPath: string;
  remotePath: string;
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
  };
}

export interface MergePluginSettings {
  /** Origin only, no path. Same as Publisher: frontend on rhizome-test, not FastAPI. */
  server: string;
  allowHttp: boolean;
  token: string;
  lastDifferPath: string;
  lastSecondaryPath: string;
}

export const DEFAULT_SETTINGS: MergePluginSettings = {
  server: 'http://172.16.13.14:8080',
  allowHttp: true,
  token: '',
  lastDifferPath: '',
  lastSecondaryPath: '',
};

export interface DifferItem {
  path: string;
  title: string;
  kind: string;
  updatedAt: string;
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
  ) {
    super(message);
    this.name = 'CardApiError';
  }
}

export function normalizeToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  const token = value.trim();
  return token.startsWith('gnp_') && token.length <= 200 ? token : '';
}

export function normalizeSettings(raw: unknown): MergePluginSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const legacyCard = typeof src.lastCardId === 'string' ? src.lastCardId : '';
  return {
    server: typeof src.server === 'string' && src.server.trim() ? src.server.trim() : DEFAULT_SETTINGS.server,
    allowHttp: src.allowHttp !== false,
    token: normalizeToken(src.token),
    lastDifferPath: typeof src.lastDifferPath === 'string' && src.lastDifferPath
      ? src.lastDifferPath
      : legacyCard,
    lastSecondaryPath: typeof src.lastSecondaryPath === 'string' ? src.lastSecondaryPath : '',
  };
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

export interface SessionUser {
  username: string;
  displayName: string;
  writeAllowed: boolean;
}

export const TOKEN_ERRORS: Record<string, string> = {
  author_contract_required: 'Нужен договор автора в настройках GraphNotes.',
  account_inactive: 'Учётная запись неактивна.',
  write_disabled: 'Сервер запретил запись в личное хранилище.',
  insufficient_scope: 'У токена нет права personal:read.',
  token_expired: 'Срок токена истёк. Создайте новый во вкладке Obsidian.',
  invalid_token: 'Токен не принят. Создайте новый во вкладке Obsidian.',
};

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
  return {
    username,
    displayName: typeof user.display_name === 'string' && user.display_name.trim() ? user.display_name.trim() : username,
    writeAllowed: rec.write_allowed === true,
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

  async capabilities(signal?: AbortSignal): Promise<SessionUser> {
    return parseCapabilities(await this.getJson(capabilitiesUrl(this.origin), signal));
  }

  private async getJson(url: string, signal?: AbortSignal): Promise<unknown> {
    if (!this.token.trim()) throw new Error('Введите токен в настройках плагина.');
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        redirect: 'error',
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      const message = error instanceof Error ? error.message : 'Сеть недоступна.';
      throw new CardApiError(0, 'network', `Не удалось запросить GraphNotes: ${message}`);
    }
    const text = await response.text();
    if (!response.ok) {
      const parsed = parseApiFailure(text, response.status);
      throw new CardApiError(response.status, parsed.code, TOKEN_ERRORS[parsed.code] ?? parsed.message);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new CardApiError(0, 'invalid_payload', 'Ответ Differ не JSON.');
    }
  }
}

function parseApiFailure(body: string, status: number): { code: string; message: string } {
  if (!body) return { code: 'http_error', message: `Сервер ответил ${status}.` };
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; error?: { message?: unknown; code?: unknown }; message?: unknown };
    let code = typeof parsed.error?.code === 'string' ? parsed.error.code : status === 401 ? 'invalid_token' : 'http_error';
    if (typeof parsed.detail === 'string' && parsed.detail.includes('author contract')) {
      code = 'author_contract_required';
    }
    if (typeof parsed.detail === 'string') return { code, message: parsed.detail };
    if (typeof parsed.error?.message === 'string') return { code, message: parsed.error.message };
    if (typeof parsed.message === 'string') return { code, message: parsed.message };
    return { code, message: `Сервер ответил ${status}.` };
  } catch {
    return { code: 'http_error', message: body.slice(0, 280) };
  }
}
