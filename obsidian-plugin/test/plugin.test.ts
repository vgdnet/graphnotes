import { Api, parseCapabilities, parseFileContent, parseTransfer, sourcesApplied, canProposeToRhizome } from '../src/api';
import type { Transport } from '../src/transport';
import { applyResults, chunkOps, classify, deleteOp, rememberSame, safeLink, safePath, serverOrigin, sha256, type Baselines, type Operation } from '../src/core';
import { canRetry, collectBlobs, SnapshotChangedError } from '../src/runner';
import { normalizeSaved } from '../src/store';
import { ApiError } from '../src/api';
import {
  OFFER_BUTTON_LABEL,
  OFFER_KIND_ADDED,
  OFFER_KIND_CHANGED,
  OFFER_SELECTED_LABEL,
  ACCOUNT_CANNOT_PROPOSE_NOTICE,
  TOKEN_REQUIRED_NOTICE,
  addProposeMenuItem,
  registerProposeMenuEvents,
  parseCreatedProposal,
  parseDifferOffers,
  parseOpenProposalPaths,
  proposeClickBlock,
  proposeClickNotice,
  proposeOneNotice,
  proposeOnePath,
  shouldShowProposeMenu,
} from '../src/offer';
import { SIDEBAR_VIEW_TYPE, WRITE_BUTTON_LABEL } from '../src/sidebar';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
}

const hashA = sha256(new TextEncoder().encode('alpha'));
const hashB = sha256(new TextEncoder().encode('beta'));
const remote = { path: 'Темы/Память.md', kind: 'markdown' as const, sha256: hashA, version: 'v1', size: 5 };

export async function run(): Promise<void> {
  assertEqual(safePath('Темы/Память.md'), 'Темы/Память.md', 'safe path');
  let failed = false;
  try { safePath('../secret.md'); } catch { failed = true; }
  assert(failed, 'reject parent path');
  failed = false;
  try { safePath('.obsidian/app.json'); } catch { failed = true; }
  assert(failed, 'reject hidden segment');

  assertEqual(classify(hashA, undefined, undefined), 'new', 'new file');
  assertEqual(classify(hashB, remote, undefined), 'conflict', 'first send clash');
  assertEqual(classify(hashB, remote, { sha256: hashA, version: 'v1', localHash: hashA }), 'changed', 'local change');
  assertEqual(classify(hashA, { ...remote, sha256: hashB, version: 'v2' }, { sha256: hashA, version: 'v1', localHash: hashA }), 'remote', 'remote change');
  assertEqual(classify(hashB, { ...remote, sha256: hashA, version: 'v2' }, { sha256: hashA, version: 'v1', localHash: hashA }), 'conflict', 'both changed');
  assertEqual(classify(undefined, remote, { sha256: hashA, version: 'v1', localHash: hashA }), 'deleted', 'local delete');
  assertEqual(classify(hashA, remote, { sha256: hashA, version: 'v1', localHash: hashA }), 'same', 'same');

  const baseline: Baselines = { 'a.md': { sha256: hashA, version: 'v1', localHash: hashA } };
  const ops: Operation[] = [
    { op: 'upsert', path: 'b.md', kind: 'markdown', expected_version: null, sha256: hashB, size: 4 },
    { op: 'delete', path: 'a.md', expected_version: 'v1' },
  ];
  applyResults(baseline, ops, [{ path: 'b.md', kind: 'markdown', sha256: hashB, version: 'v9', size: 4 }]);
  assert(!baseline['a.md'], 'delete baseline');
  assertEqual(baseline['b.md']?.version, 'v9', 'upsert version');

  assertEqual(serverOrigin('http://172.16.13.14:8080', true), 'http://172.16.13.14:8080', 'test http');
  failed = false;
  try { serverOrigin('http://172.16.13.14:8080', false); } catch { failed = true; }
  assert(failed, 'http requires flag');
  assertEqual(safeLink('http://172.16.13.14:8080', '/#/graph'), 'http://172.16.13.14:8080/#/graph', 'same origin link');

  const caps = parseCapabilities({
    protocol_version: '1.0',
    user: { id: 'u1', username: 'alice', display_name: 'Alice' },
    write_allowed: true,
    write_block_reason: null,
    scopes: ['personal:read', 'personal:write'],
    formats: ['md', 'png', 'jpeg', 'gif', 'webp', 'pdf'],
    limits: {
      markdown_max_bytes: 1048576,
      attachment_max_bytes: 26214400,
      batch_max_operations: 500,
      batch_max_bytes: 104857600,
      manifest_page_max: 200,
      path_max_length: 180,
      path_max_depth: 8,
    },
    links: { personal_graph: 'http://172.16.13.14:8080/#/graph', differ: 'http://172.16.13.14:8080/#/offer' },
  });
  assert(caps.supported_extensions.includes('jpg'), 'jpeg alias jpg');
  assertEqual(caps.limits.manifest_page_size, 200, 'manifest_page_max alias');

  const transfer = parseTransfer({
    transfer_id: 't1',
    state: 'awaiting_upload',
    files_applied: false,
    remaining_blobs: [{ sha256: hashA, size: 5 }],
    results: [],
    errors: [],
  });
  assertEqual(transfer.required_blobs[0]?.sha256, hashA, 'remaining_blobs alias');
  assert(!sourcesApplied(transfer), 'not applied');
  assert(sourcesApplied(parseTransfer({
    transfer_id: 't2', state: 'indexing_failed', files_applied: true, required_blobs: [], results: [], errors: [],
  })), 'index failed still applied');

  const content = parseFileContent('Темы/Память.md', {
    status: 200,
    headers: {
      'x-graphnotes-path': encodeURIComponent('Темы/Память.md'),
      'x-graphnotes-kind': 'markdown',
      'x-graphnotes-sha256': hashA,
      'x-graphnotes-version': 'v18',
      'x-graphnotes-size': '5',
    },
    bytes: new TextEncoder().encode('alpha'),
  });
  assertEqual(content.version, 'v18', 'content version header');
  assertEqual(content.path, 'Темы/Память.md', 'content path header');

  assert(canRetry(new ApiError(429, 'rate_limited', 'wait', 1000)), 'retry 429');
  assert(!canRetry(new ApiError(409, 'version_conflict', 'no')), 'no retry conflict');
  assert(!canRetry(new SnapshotChangedError(['a.md'])), 'no retry snapshot');

  const blobs = await collectBlobs(
    [{ op: 'upsert', path: 'a.md', kind: 'markdown', expected_version: null, sha256: hashA, size: 5 }],
    async () => new TextEncoder().encode('alpha'),
  );
  assertEqual(blobs.get(hashA)?.byteLength, 5, 'blob snapshot');
  failed = false;
  try {
    await collectBlobs(
      [{ op: 'upsert', path: 'a.md', kind: 'markdown', expected_version: null, sha256: hashA, size: 5 }],
      async () => new TextEncoder().encode('changed'),
    );
  } catch (error) {
    failed = error instanceof SnapshotChangedError;
  }
  assert(failed, 'changed bytes invalidate plan');

  const saved = normalizeSaved({
    server: 'http://172.16.13.14:8080',
    allowHttp: true,
    token: 'gnp_secret',
    connections: { k: { clientId: 'c1', baseline: {} } },
    history: [{ at: '2026-09-11T00:00:00Z', state: 'succeeded', count: 1 }],
  });
  assertEqual(saved.server, 'http://172.16.13.14:8080', 'saved server');
  assertEqual(saved.token, 'gnp_secret', 'token kept in plugin data');
  assertEqual(saved.autoSync, true, 'auto sync default');
  assertEqual(saved.autoMode, 'idle', 'idle default');
  assertEqual(saved.autoMinutes, 5, 'five minutes default');
  assertEqual(normalizeSaved({ server: 'https://x', token: 'gnp_x', autoSync: false }).autoMode, 'manual', 'old autoSync off');
  assertEqual(normalizeSaved({ server: 'https://x', token: 'gnp_x', autoMode: 'close' }).autoMode, 'close', 'close mode kept');
  assertEqual(normalizeSaved({ server: 'https://x', token: 'not-a-gnp' }).token, '', 'rejects non-gnp token');

  const deleted = deleteOp('a.md', remote, { sha256: hashA, version: 'v1', localHash: hashA });
  assert(deleted !== null && deleted.op === 'delete', 'delete when local gone');
  const moved = deleteOp('a.md', remote, { sha256: hashA, version: 'v0', localHash: hashA });
  assert(moved !== null && moved.op === 'delete' && moved.expected_version === 'v1', 'delete uses current remote version');
  assertEqual(deleteOp('missing.md', undefined, undefined), null, 'delete unknown path');

  const chunks = chunkOps([
    { op: 'upsert', path: 'a.md', kind: 'markdown', expected_version: null, sha256: hashA, size: 4 },
    { op: 'upsert', path: 'b.md', kind: 'markdown', expected_version: null, sha256: hashB, size: 4 },
    { op: 'delete', path: 'c.md', expected_version: 'v1' },
  ], { ...caps.limits, batch_max_operations: 2, batch_max_bytes: 100 });
  assertEqual(chunks.length, 2, 'chunk by operations');
  assertEqual(chunks[0]?.length, 2, 'first chunk full');
  assertEqual(chunks[1]?.length, 1, 'delete fits next chunk');

  const adopted: Baselines = {};
  rememberSame(adopted, remote.path, remote, hashA);
  assertEqual(classify(hashB, remote, adopted[remote.path]), 'changed', 'edit after same is change not conflict');
  assertEqual(normalizeSaved({ server: 'https://x', token: 'gnp_x', lastDebug: { at: '2026-09-12T00:00:00Z', event: 'send:all', api: 'ok', remote: 3 } }).lastDebug?.remote, 3, 'debug kept');

  assertEqual(SIDEBAR_VIEW_TYPE, 'graphnotes-publisher-sync', 'sidebar view type');
  assertEqual(WRITE_BUTTON_LABEL, 'Передать правки на сервер', 'sidebar write label');
  assertEqual(OFFER_BUTTON_LABEL, 'Предложить в ризому', 'sidebar offer label');
  assertEqual(OFFER_SELECTED_LABEL, 'Предложить выбранные', 'sidebar selected offer label');
  assert(canProposeToRhizome('user'), 'user can propose');
  assert(!canProposeToRhizome('editor'), 'editor cannot propose');
  assert(!canProposeToRhizome('admin'), 'admin cannot propose');
  assert(canProposeToRhizome('editor', true), 'flag true wins');
  assert(canProposeToRhizome('user', false), 'user role still shows');
  assert(canProposeToRhizome(''), 'unknown role shows');

  const offers = parseDifferOffers({
    differences: [
      { path: 'fresh.md', title: 'Fresh', kind: 'added' },
      { path: 'card.md', title: 'Card', kind: 'changed' },
      { path: 'same.md', title: 'Same', kind: 'same' },
      { path: 'inbound.md', title: 'Inbound', kind: 'inbound' },
    ],
    inbound: [{ path: 'watch.md', title: 'Watch', kind: 'changed' }],
  });
  assertEqual(offers.length, 2, 'only added/changed outbound');
  assertEqual(offers[0]?.kind === 'added' ? OFFER_KIND_ADDED : '', 'нет в общей', 'added label');
  assertEqual(offers[1]?.kind === 'changed' ? OFFER_KIND_CHANGED : '', 'отличается', 'changed label');

  const queued = parseOpenProposalPaths({
    proposals: [
      { id: 'p1', status: 'open', paths: ['fresh.md'] },
      { id: 'p2', status: 'accepted', paths: ['card.md'] },
    ],
  });
  assert(queued.has('fresh.md'), 'open proposal path queued');
  assert(!queued.has('card.md'), 'accepted proposal not queued');
  assertEqual(parseCreatedProposal({ id: 'p9', paths: ['fresh.md'] }).id, 'p9', 'created proposal id');

  const calls: string[] = [];
  const fake: Transport = async (url, method) => {
    calls.push(`${method} ${url}`);
    if (url.includes('/api/differ') && !url.includes('/files')) {
      return { status: 200, headers: {}, bytes: new TextEncoder().encode(JSON.stringify({ differences: [{ path: 'a.md', kind: 'added', title: 'A' }] })) };
    }
    if (url.endsWith('/api/proposals') && method === 'POST') {
      return { status: 200, headers: {}, bytes: new TextEncoder().encode(JSON.stringify({ id: 'p1', paths: ['a.md'] })) };
    }
    if (url.endsWith('/api/proposals')) {
      return { status: 200, headers: {}, bytes: new TextEncoder().encode(JSON.stringify({ proposals: [] })) };
    }
    return { status: 200, headers: {}, bytes: new TextEncoder().encode('{}') };
  };
  const site = new Api('http://172.16.13.14:8080', 'gnp_x', new AbortController().signal, fake);
  assertEqual((await site.differOffers())[0]?.path, 'a.md', 'differ offer path');
  assert(calls[0]?.includes('/api/differ?include_inbound=false') && !calls[0]?.includes('/integrations/obsidian'), 'site differ URL');
  assertEqual((await site.propose(['a.md'])).id, 'p1', 'propose id');
  assert(calls.some(item => item.startsWith('POST http://172.16.13.14:8080/api/proposals')), 'site propose URL');

  assert(shouldShowProposeMenu(true, { extension: 'md', path: 'Темы/Память.md' }), 'user md file shows menu');
  assert(shouldShowProposeMenu(undefined, { extension: 'md', path: 'Темы/Память.md' }), 'unknown caps show menu');
  assert(!shouldShowProposeMenu(false, { extension: 'md', path: 'Темы/Память.md' }), 'editor hides menu');
  assert(!shouldShowProposeMenu(true, { extension: 'png', path: 'pic.png' }), 'non-md hidden');
  const titles: string[] = [];
  const clicks: string[] = [];
  const menu = {
    addItem(cb: (item: { setTitle(title: string): typeof item; setIcon(icon: string): typeof item; onClick(fn: () => void): typeof item }) => void) {
      const item = {
        setTitle(title: string) { titles.push(title); return item; },
        setIcon(_icon: string) { return item; },
        onClick(fn: () => void) { fn(); return item; },
      };
      cb(item);
    },
  };
  assert(addProposeMenuItem(menu, true, { extension: 'md', path: 'note.md' }, () => clicks.push('note.md')), 'menu item added');
  assertEqual(titles[0], OFFER_BUTTON_LABEL, 'file-menu label');
  assertEqual(clicks[0], 'note.md', 'file-menu click');
  assert(!addProposeMenuItem(menu, false, { extension: 'md', path: 'note.md' }, () => clicks.push('nope')), 'editor menu skipped');
  assert(addProposeMenuItem(menu, undefined, { extension: 'md', path: 'tag_детство.md' }, () => clicks.push('tag')), 'unknown caps add item');

  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const registered = registerProposeMenuEvents(
    { on(name, cb) { handlers[name] = cb; return name; } },
    () => undefined,
    {
      canPropose: () => undefined,
      onPropose: file => clicks.push(file.path),
    },
  );
  assert(registered.includes('file-menu'), 'file-menu registered');
  assert(registered.includes('editor-menu'), 'editor-menu registered');
  assert(typeof handlers['file-menu'] === 'function', 'file-menu handler');
  const unknownTitles: string[] = [];
  const unknownMenu = {
    addItem(cb: (item: { setTitle(title: string): typeof item; setIcon(icon: string): typeof item; onClick(fn: () => void): typeof item }) => void) {
      const item = {
        setTitle(title: string) { unknownTitles.push(title); return item; },
        setIcon(_icon: string) { return item; },
        onClick(fn: () => void) { fn(); return item; },
      };
      cb(item);
    },
  };
  handlers['file-menu']?.(unknownMenu, { extension: 'md', path: 'tag_детство.md' });
  assertEqual(unknownTitles[0], OFFER_BUTTON_LABEL, 'file-menu fires for unknown caps');

  const alreadyQueued = await proposeOnePath({
    async queuedOfferPaths() { return new Set(['fresh.md']); },
    async propose(): Promise<{ id: string; paths: string[] }> { throw new Error('should not POST'); },
  }, 'fresh.md');
  assertEqual(alreadyQueued.status, 'already_queued', 'pending path does not POST');
  assertEqual(proposeOneNotice(alreadyQueued), 'Эта карточка уже в очереди.', 'queued notice');

  const created = await proposeOnePath({
    async queuedOfferPaths() { return new Set<string>(); },
    async propose(paths: string[]) { return { id: 'p9', paths }; },
  }, 'fresh.md');
  assertEqual(created.status, 'created', 'new path posts');
  assertEqual(proposeOneNotice(created), 'Заявка создана: fresh.md', 'created notice');

  const inSync = await proposeOnePath({
    async queuedOfferPaths() { return new Set<string>(); },
    async propose(): Promise<{ id: string; paths: string[] }> {
      throw Object.assign(new Error('those notes already match the shared rhizome'), {
        code: 'those notes already match the shared rhizome',
      });
    },
  }, 'same.md');
  assertEqual(inSync.status, 'already_in_sync', 'API already-match is in-sync');
  assertEqual(proposeOneNotice(inSync), 'Карточка уже совпадает с общей.', 'in-sync notice');

  assertEqual(proposeClickBlock(false, false), 'need_token', 'no token blocks click');
  assertEqual(proposeClickNotice('need_token'), TOKEN_REQUIRED_NOTICE, 'token notice');
  assertEqual(proposeClickBlock(true, true), 'denied', 'editor explicit deny');
  assertEqual(proposeClickNotice('denied'), ACCOUNT_CANNOT_PROPOSE_NOTICE, 'denied notice');
  assertEqual(proposeClickBlock(true, false), null, 'user token may POST');
  const listedFail = await proposeOnePath({
    async queuedOfferPaths(): Promise<Set<string>> { throw new Error('timeout'); },
    async propose(paths: string[]) { return { id: 'p-timeout', paths }; },
  }, 'fresh.md');
  assertEqual(listedFail.status, 'created', 'GET /proposals timeout still POSTs');

  console.log('ok', 67);
}
