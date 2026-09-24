import type { Operation, RemoteFile } from './core';
import { safePath } from './core';
import {
  parseCreatedProposal,
  parseDifferOffers,
  parseOpenProposalPaths,
  type DifferOffer,
} from './offer';
import { transport, type Transport, type WireResponse } from './transport';

export interface Limits {
  markdown_max_bytes: number;
  attachment_max_bytes: number;
  batch_max_bytes: number;
  batch_max_operations: number;
  manifest_page_size: number;
  path_max_length: number;
  path_max_depth?: number;
}
export interface Capabilities {
  protocol_version: string;
  user: { id: string; username: string; display_name?: string; role?: string };
  write_allowed: boolean;
  write_block_reason: string | null;
  can_see_queue?: boolean;
  can_propose_to_rhizome?: boolean;
  scopes: string[];
  supported_extensions: string[];
  limits: Limits;
  quota?: { personal_max_bytes?: number; personal_used_bytes?: number; personal_remaining_bytes?: number };
  links: { personal_graph: string; differ: string };
}

/** Context-menu / offer: show for `user`, explicit true, or unknown. Hide only known editor/admin. */
export function canProposeToRhizome(role: string, flag?: boolean): boolean {
  if (flag === true) return true;
  const known = role.trim().toLowerCase();
  if (known === 'user') return true;
  if (known === 'editor' || known === 'admin') return false;
  return true;
}
export interface Transfer {
  transfer_id: string;
  state: string;
  files_applied: boolean;
  required_blobs: { sha256: string; size: number }[];
  results: RemoteFile[];
  errors: { code?: string; message?: string; path?: string }[];
  expires_at?: string;
  index_revision?: string;
}
export interface FileContent {
  bytes: Uint8Array;
  path: string;
  kind?: string;
  sha256?: string;
  version?: string;
  size?: number;
}
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfter = 0) {
    super(message);
  }
}

export const TRANSFER_STATES = [
  'awaiting_upload', 'ready', 'applying', 'indexing', 'succeeded',
  'conflict', 'failed', 'cancelled', 'expired', 'indexing_failed',
] as const;

export function sourcesApplied(transfer: Transfer): boolean {
  return transfer.files_applied || transfer.state === 'succeeded' || transfer.state === 'indexing' || transfer.state === 'indexing_failed';
}

const obj = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Неверный формат ответа API.');
  return value as Record<string, any>;
};

function header(headers: WireResponse['headers'], name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export function parseFile(value: unknown): RemoteFile {
  const file = obj(value);
  if (
    typeof file.path !== 'string' || safePath(file.path) !== file.path
    || !/^[a-f0-9]{64}$/.test(file.sha256)
    || typeof file.version !== 'string' || !file.version
    || !Number.isSafeInteger(file.size) || file.size < 0
    || !['markdown', 'png', 'jpeg', 'gif', 'webp', 'pdf'].includes(file.kind)
  ) throw new Error('Неверный элемент манифеста API.');
  return file as RemoteFile;
}

export function parseCapabilities(value: unknown): Capabilities {
  const data = obj(value);
  if (!['1', '1.0'].includes(String(data.protocol_version))) throw new Error('Неподдерживаемая версия API. Нужен протокол 1.');
  data.supported_extensions ??= data.formats;
  if (Array.isArray(data.supported_extensions) && data.supported_extensions.includes('jpeg') && !data.supported_extensions.includes('jpg')) {
    data.supported_extensions = [...data.supported_extensions, 'jpg'];
  }
  if (data.limits) data.limits.manifest_page_size ??= data.limits.manifest_page_max;
  if (
    !data.user || typeof data.user.id !== 'string' || typeof data.user.username !== 'string'
    || typeof data.write_allowed !== 'boolean' || !Array.isArray(data.scopes) || !Array.isArray(data.supported_extensions)
  ) throw new Error('Capabilities не соответствует контракту. См. docs/deployment/OBSIDIAN_PLUGIN_API.md.');
  const limits = obj(data.limits);
  for (const key of ['markdown_max_bytes', 'attachment_max_bytes', 'batch_max_bytes', 'batch_max_operations', 'manifest_page_size', 'path_max_length']) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0) throw new Error(`API не сообщил допустимый лимит ${key}.`);
  }
  if (limits.path_max_depth != null && (!Number.isSafeInteger(limits.path_max_depth) || limits.path_max_depth <= 0)) {
    throw new Error('API не сообщил допустимый лимит path_max_depth.');
  }
  if (!data.links || typeof data.links.personal_graph !== 'string' || typeof data.links.differ !== 'string') {
    throw new Error('API не сообщил ссылки на личный граф и Differ.');
  }
  return data as Capabilities;
}

export function parseTransfer(value: unknown): Transfer {
  const data = obj(value);
  if (typeof data.transfer_id !== 'string' || !data.transfer_id || !TRANSFER_STATES.includes(data.state)) {
    throw new Error('Неизвестный ответ состояния передачи.');
  }
  if (data.files_applied !== undefined && typeof data.files_applied !== 'boolean') throw new Error('Неверный признак files_applied.');
  data.files_applied = data.files_applied === true;
  data.required_blobs = data.remaining_blobs ?? data.required_blobs ?? [];
  data.results ??= [];
  data.errors ??= [];
  if (![data.required_blobs, data.results, data.errors].every(Array.isArray)) throw new Error('Неверный список в статусе передачи.');
  for (const blob of data.required_blobs) {
    if (!/^[a-f0-9]{64}$/.test(blob.sha256) || !Number.isSafeInteger(blob.size) || blob.size < 0) {
      throw new Error('Неверный запрос загрузки файла.');
    }
  }
  data.results = data.results.filter((r: any) => r.op !== 'delete').map(parseFile);
  return data as Transfer;
}

export function parseFileContent(path: string, response: WireResponse): FileContent {
  const encoded = header(response.headers, 'x-graphnotes-path');
  let remotePath = path;
  if (encoded) {
    try { remotePath = safePath(decodeURIComponent(encoded)); } catch { remotePath = path; }
  }
  const sizeRaw = header(response.headers, 'x-graphnotes-size');
  const size = sizeRaw != null ? Number(sizeRaw) : response.bytes.byteLength;
  return {
    bytes: response.bytes,
    path: remotePath,
    kind: header(response.headers, 'x-graphnotes-kind'),
    sha256: header(response.headers, 'x-graphnotes-sha256'),
    version: header(response.headers, 'x-graphnotes-version'),
    size: Number.isSafeInteger(size) ? size : response.bytes.byteLength,
  };
}

export class Api {
  constructor(readonly origin: string, private readonly token: string, private readonly signal: AbortSignal, private readonly send: Transport = transport) {}

  private async exchange(path: string, method = 'GET', json?: unknown, bytes?: Uint8Array, key?: string): Promise<WireResponse> {
    return this.exchangeAt(`/api/integrations/obsidian/v1${path}`, method, json, bytes, key);
  }

  private async exchangeAt(
    urlPath: string,
    method = 'GET',
    json?: unknown,
    bytes?: Uint8Array,
    key?: string,
  ): Promise<WireResponse> {
    if (!this.token.trim()) throw new Error('Введите токен в настройках плагина.');
    const body = bytes ?? (json === undefined ? undefined : new TextEncoder().encode(JSON.stringify(json)));
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, Accept: 'application/json' };
    if (body) {
      headers['Content-Type'] = bytes ? 'application/octet-stream' : 'application/json';
      headers['Content-Length'] = String(body.byteLength);
    }
    if (key) headers['Idempotency-Key'] = key;
    const response = await this.send(`${this.origin}${urlPath}`, method, headers, body, this.signal);
    if (response.status < 200 || response.status >= 300) {
      let code = 'http_error', message = `Ошибка API (${response.status}).`;
      try {
        const parsed = JSON.parse(new TextDecoder().decode(response.bytes));
        code = parsed.error?.code ?? (typeof parsed.detail === 'string' ? parsed.detail : code);
        message = parsed.error?.message ?? (typeof parsed.detail === 'string' ? parsed.detail : message);
      } catch { /* Do not expose raw server pages. */ }
      const raw = header(response.headers, 'retry-after');
      const seconds = Number(raw);
      const retryAfter = Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(String(raw)) - Date.now());
      throw new ApiError(response.status, String(code), String(message), Number.isFinite(retryAfter) ? retryAfter : 0);
    }
    return response;
  }

  private async request(path: string, method = 'GET', json?: unknown, bytes?: Uint8Array, key?: string): Promise<Uint8Array> {
    return (await this.exchange(path, method, json, bytes, key)).bytes;
  }

  private async json(path: string, method = 'GET', body?: unknown, key?: string): Promise<unknown> {
    const bytes = await this.request(path, method, body, undefined, key);
    if (!bytes.byteLength) return {};
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error('API вернул не JSON. Проверьте адрес сервера.'); }
  }

  private async siteJson(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const bytes = (await this.exchangeAt(`/api${path}`, method, body)).bytes;
    if (!bytes.byteLength) return {};
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error('API вернул не JSON. Проверьте адрес сервера.'); }
  }

  async capabilities(): Promise<Capabilities> { return parseCapabilities(await this.json('/capabilities')); }

  async differOffers(): Promise<DifferOffer[]> {
    return parseDifferOffers(await this.siteJson('/differ?include_inbound=false'));
  }

  async queuedOfferPaths(): Promise<Set<string>> {
    return parseOpenProposalPaths(await this.siteJson('/proposals'));
  }

  async propose(paths: string[], summary = ''): Promise<{ id: string; paths: string[] }> {
    if (!paths.length) throw new Error('Выберите карточку, чтобы предложить её в ризому.');
    return parseCreatedProposal(await this.siteJson('/proposals', 'POST', { paths, summary }));
  }

  async manifest(limit = 200): Promise<RemoteFile[]> {
    let cursor: string | null = null;
    let snapshot: string | undefined;
    const files: RemoteFile[] = [];
    const seenCursors = new Set<string>();
    const seenPaths = new Set<string>();
    do {
      const data = obj(await this.json(`/manifest?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
      if (typeof data.snapshot_id !== 'string' || !Array.isArray(data.items) || (snapshot && snapshot !== data.snapshot_id)) {
        throw new Error('Манифест изменился между страницами. Повторите сверку.');
      }
      snapshot = data.snapshot_id;
      for (const value of data.items) {
        const file = parseFile(value);
        if (seenPaths.has(file.path)) throw new Error('API вернул повторяющийся путь.');
        seenPaths.add(file.path);
        files.push(file);
      }
      cursor = data.next_cursor ?? null;
      if (cursor !== null && (typeof cursor !== 'string' || seenCursors.has(cursor))) throw new Error('API вернул неверный cursor.');
      if (cursor) seenCursors.add(cursor);
      if (seenCursors.size > 1000) throw new Error('Слишком много страниц манифеста.');
    } while (cursor);
    return files;
  }

  async content(path: string): Promise<FileContent> {
    return parseFileContent(path, await this.exchange(`/files/content?path=${encodeURIComponent(path)}`));
  }

  async create(clientId: string, operations: Operation[], key: string): Promise<Transfer> {
    return parseTransfer(await this.json('/transfers', 'POST', { client_id: clientId, operations }, key));
  }
  async upload(id: string, hash: string, bytes: Uint8Array): Promise<void> {
    await this.request(`/transfers/${encodeURIComponent(id)}/blobs/${hash}`, 'PUT', undefined, bytes);
  }
  async commit(id: string): Promise<Transfer> { return parseTransfer(await this.json(`/transfers/${encodeURIComponent(id)}/commit`, 'POST')); }
  async status(id: string): Promise<Transfer> { return parseTransfer(await this.json(`/transfers/${encodeURIComponent(id)}`)); }
  async cancel(id: string): Promise<void> { await this.request(`/transfers/${encodeURIComponent(id)}`, 'DELETE'); }
}
