import {
  CardApiError,
  CardApiService,
  bodyToMaterialize,
  differFileUrl,
  differUrl,
  editorialQueueModeFromCaps,
  formatHttpFailure,
  grantedUrl,
  MERGE_VIEW_TYPE,
  NO_GRANTS_QUEUE_MESSAGE,
  NO_PROPOSALS_QUEUE_MESSAGE,
  QUEUE_VIEW_TYPE,
  normalizeSettings,
  isAlreadyAcceptedError,
  isNewQueueStatus,
  isReviewerRole,
  parseCapabilities,
  parseDifferFile,
  parseDifferList,
  parseMergeSession,
  parseProposalList,
  PLUGIN_ID,
  proposalItems,
  proposalFileUrl,
  proposalResolveUrl,
  proposalUrl,
  proposalsUrl,
  reviewQueueEmptyMessage,
  serverOrigin,
  shouldProbeGrantedList,
  shouldQueueVaultFile,
  shouldUpdateRhizomeStore,
  canSeeQueue,
  canProposeToRhizome,
  summarizeHttpBody,
  keepSingleWork,
  publishedCardPath,
  vaultCardPath,
  workKey,
  workPairPaths,
} from '../src/apiService';
import {
  appendPluginDebugLog,
  formatDebugLine,
  formatDebugStep,
  lastDebugLines,
  pluginDebugLogPath,
  runWithHeartbeat,
  sanitizeDebugText,
} from '../src/debugLog';
import { openVaultMarkdownTab, pickMarkdownLeaf, vaultNotePath, waitForVaultFile } from '../src/vaultNote';
import { Api, parseFile } from '../src/api';
import {
  OFFER_KIND_ADDED,
  OFFER_KIND_CHANGED,
  OFFER_BUTTON_LABEL,
  ACCOUNT_CANNOT_PROPOSE_NOTICE,
  TOKEN_REQUIRED_NOTICE,
  addProposeMenuItem,
  offerMarkdownPath,
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
import type { Transport } from '../src/transport';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
}

export async function run(): Promise<void> {
  const publisherPluginId: string = 'graphnotes-publisher';
  const publisherViewType: string = 'graphnotes-publisher-sync';
  assertEqual(PLUGIN_ID, 'graphnotes-card-merge', 'plugin id');
  assert(PLUGIN_ID !== publisherPluginId, 'must not reuse Publisher plugin id');
  assertEqual(MERGE_VIEW_TYPE, 'graphnotes-card-merge', 'view type');
  assert(MERGE_VIEW_TYPE !== publisherViewType, 'must not reuse Publisher sidebar view');
  assertEqual(QUEUE_VIEW_TYPE, 'graphnotes-card-merge-queue', 'queue view');
  assert(QUEUE_VIEW_TYPE !== publisherViewType, 'queue view ≠ Publisher');

  const settings = normalizeSettings({
    server: ' http://172.16.13.14:8080 ',
    allowHttp: true,
    token: ' gnp_secret ',
    lastCardId: 'Inbox/Hello.md',
  });
  assertEqual(settings.server, 'http://172.16.13.14:8080', 'trim server');
  assertEqual(settings.token, 'gnp_secret', 'keep gnp token');
  assertEqual(normalizeSettings({ token: 'not-a-plugin-token' }).token, '', 'reject non-gnp');
  assertEqual(settings.lastDifferPath, 'Inbox/Hello.md', 'legacy lastCardId');
  assertEqual(JSON.stringify(settings.inWork), '{}', 'empty work cache');
  assertEqual(workKey('p-1', 'Inbox/Hello.md'), 'p-1:Inbox/Hello.md', 'work key');
  assertEqual(
    Object.keys(keepSingleWork({
      'p-1:a.md': { proposalId: 'p-1', path: 'a.md' },
      'p-2:b.md': { proposalId: 'p-2', path: 'b.md' },
    })).length,
    1,
    'one card in work',
  );
  assertEqual(
    workPairPaths('.obsidian', 'p-1', 'Inbox/Hello.md').current,
    '.obsidian/plugins/graphnotes-card-merge/work/p-1/Inbox__Hello.md/current.md',
    'work current path',
  );
  assertEqual(
    proposalFileUrl('http://172.16.13.14:8080', 'p-1', 'Inbox/Hello.md'),
    'http://172.16.13.14:8080/api/proposals/p-1/files/Inbox/Hello.md',
    'work file url',
  );
  assertEqual(
    proposalResolveUrl('http://172.16.13.14:8080', 'p-1'),
    'http://172.16.13.14:8080/api/proposals/p-1/resolve',
    'resolve url',
  );

  assertEqual(serverOrigin('http://172.16.13.14:8080', true), 'http://172.16.13.14:8080', 'test http');
  assertEqual(differUrl('http://172.16.13.14:8080'), 'http://172.16.13.14:8080/api/differ', 'differ list');
  assertEqual(
    differFileUrl('http://172.16.13.14:8080', 'Темы/Память.md'),
    'http://172.16.13.14:8080/api/differ/files/%D0%A2%D0%B5%D0%BC%D1%8B/%D0%9F%D0%B0%D0%BC%D1%8F%D1%82%D1%8C.md',
    'differ file encodes path',
  );
  assertEqual(proposalsUrl('http://172.16.13.14:8080'), 'http://172.16.13.14:8080/api/proposals', 'proposals list');
  assertEqual(
    grantedUrl('http://172.16.13.14:8080'),
    'http://172.16.13.14:8080/api/integrations/obsidian/v1/granted',
    'granted list',
  );
  assertEqual(
    proposalUrl('http://172.16.13.14:8080', 'p-1'),
    'http://172.16.13.14:8080/api/proposals/p-1',
    'proposal detail',
  );
  assert(isReviewerRole('editor'), 'editor reviews queue');
  assert(isReviewerRole('admin'), 'admin reviews queue');
  assert(!isReviewerRole('user'), 'author is not a reviewer');
  assert(isNewQueueStatus('open'), 'open is New');
  assert(!isNewQueueStatus('published'), 'published stays off New');

  const listed = parseDifferList({
    differences: [{ path: 'fresh.md', title: 'fresh', kind: 'added', updated_at: '2026-09-12T02:00:00Z' }],
  });
  assertEqual(listed[0]?.path, 'fresh.md', 'list path');
  assertEqual(listed[0]?.updatedAt, '2026-09-12T02:00:00Z', 'queue stamp');

  const pair = parseDifferFile({
    path: 'fresh.md',
    title: 'fresh',
    kind: 'added',
    incoming: { layer: 'shared', path: 'fresh.md', body: '', author: null, updated_at: null },
    current: {
      layer: 'personal',
      path: 'fresh.md',
      body: '# Fresh\n',
      author: { username: 'alice', display_name: 'Alice' },
      updated_at: '2026-09-12T02:00:00Z',
    },
  }, 'fresh.md');
  assertEqual(pair.incoming.body, '', 'incoming empty when added');
  assertEqual(pair.current.body, '# Fresh\n', 'personal body');
  assertEqual(pair.current.author, 'Alice', 'author display_name');
  assertEqual(bodyToMaterialize(pair), '# Fresh\n', 'download personal when vault empty');
  assertEqual(shouldQueueVaultFile(pair, '# Fresh\n'), true, 'vault ≠ empty shared');
  assertEqual(
    shouldQueueVaultFile({
      ...pair,
      kind: 'same',
      incoming: { ...pair.incoming, body: '# Fresh\n' },
    }, '# Fresh\n'),
    false,
    'same as shared stays out',
  );

  const session = parseMergeSession({
    localPath: ' Inbox/Hello.md ',
    remoteCardId: ' card-1 ',
    remotePath: '',
  });
  assert(session, 'session parsed');
  assertEqual(session.differPath, 'card-1', 'legacy remoteCardId');
  assertEqual(session.proposalId, '', 'no proposal on Differ session');
  assertEqual(session.resolved, false, 'fresh session not published');
  const published = parseMergeSession({
    localPath: 'a.md',
    resolved: true,
    publishedIncoming: '# old\n',
    publishedMerged: '# saved\n',
  });
  assert(published, 'published session');
  assertEqual(published.resolved, true, 'keeps published flag');
  assertEqual(published.publishedMerged, '# saved\n', 'keeps merged text');
  assert(
    isAlreadyAcceptedError(new CardApiError(409, 'http_error', 'Эту заявку уже приняли.')),
    '409 already accepted',
  );
  assert(!isAlreadyAcceptedError(new CardApiError(409, 'http_error', 'conflict')), 'other 409 stays an error');
  assertEqual(vaultCardPath('Inbox/Hello.md'), 'Inbox/Hello.md', 'vault card path');
  assertEqual(vaultCardPath('Hello'), 'Hello.md', 'adds md');
  assertEqual(
    publishedCardPath({
      localPath: '.obsidian/plugins/graphnotes-card-merge/work/p-1/Inbox__Hello.md/current.md',
      differPath: 'Inbox/Hello.md',
      proposalId: 'p-1',
    }),
    'Inbox/Hello.md',
    'published path is the proposal file, not work cache',
  );
  assertEqual(
    vaultNotePath({
      localPath: '.obsidian/plugins/graphnotes-card-merge/work/p-1/Нарциссизм.md/current.md',
      differPath: 'Нарциссизм.md',
      proposalId: 'p-1',
    }),
    'Нарциссизм.md',
    'vaultNotePath is the proposal path, not work cache',
  );
  assertEqual(vaultNotePath('Нарциссизм.md'), 'Нарциссизм.md', 'vaultNotePath from card path');
  let rejected = false;
  try {
    vaultCardPath('../secret.md');
  } catch {
    rejected = true;
  }
  assert(rejected, 'reject parent path');
  let rejectedWork = false;
  try {
    vaultNotePath('.obsidian/plugins/graphnotes-card-merge/work/p-1/current.md');
  } catch {
    rejectedWork = true;
  }
  assert(rejectedWork, 'vaultNotePath rejects work cache');

  const queued = proposalItems(parseProposalList({
    proposals: [
      {
        id: 'p-open',
        status: 'open',
        summary: '6 notes',
        paths: ['a.md', 'b.md'],
        author: { username: 'efimov', display_name: 'Efimov' },
        created_at: '2026-09-12T02:00:00Z',
        updated_at: '2026-09-12T03:00:00Z',
      },
      {
        id: 'p-done',
        status: 'published',
        summary: 'old',
        paths: ['c.md'],
        author: { username: 'nadrshina' },
      },
    ],
  }));
  assertEqual(queued.length, 2, 'New tab files only');
  assertEqual(queued[0]?.proposalId, 'p-open', 'keeps proposal id');
  assertEqual(queued[0]?.author, 'Efimov', 'author display');
  assertEqual(queued[1]?.path, 'b.md', 'flattens files');
  assert(!queued.some(item => item.path === 'c.md'), 'published stays out');

  const afterOne = proposalItems(parseProposalList({
    proposals: [{
      id: 'p-open',
      status: 'open',
      summary: '6 notes',
      paths: ['b.md'],
      author: { username: 'efimov', display_name: 'Efimov' },
      updated_at: '2026-09-12T03:00:00Z',
    }],
  }));
  assertEqual(afterOne.length, 1, 'sibling stays after one card publish');
  assertEqual(afterOne[0]?.path, 'b.md', 'remaining path listed');
  assertEqual(afterOne[0]?.proposalId, 'p-open', 'same proposal');

  const fetched = await new CardApiService('http://172.16.13.14:8080', 'gnp_tok', async (input, init) => {
    assertEqual(String(input), 'http://172.16.13.14:8080/api/differ/files/fresh.md', 'fetch url');
    assertEqual((init?.headers as Record<string, string>).Authorization, 'Bearer gnp_tok', 'bearer');
    return new Response(JSON.stringify({
      path: 'fresh.md',
      title: 'fresh',
      kind: 'added',
      incoming: { layer: 'shared', path: 'fresh.md', body: '' },
      current: { layer: 'personal', path: 'fresh.md', body: 'remote', author: { username: 'bob' } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }).getCard('fresh.md');
  assertEqual(fetched.content, '', 'incoming is the left / shared side');
  assertEqual(fetched.author, 'bob', 'fallback author from current');

  try {
    await new CardApiService('http://172.16.13.14:8080', '', async () => new Response('{"detail":"missing"}', { status: 404 })).getCard('nope.md');
    assert(false, 'empty token should throw');
  } catch (error) {
    assert(error instanceof Error, 'Error');
    assertEqual(error.message, 'Введите токен в настройках плагина.', 'require token');
  }

  const user = parseCapabilities({
    protocol_version: '1.0',
    user: { id: 'u1', username: 'alice', display_name: 'Alice', role: 'editor' },
    write_allowed: true,
    scopes: ['personal:read', 'personal:write'],
  });
  assertEqual(user.username, 'alice', 'capabilities user');
  assertEqual(user.displayName, 'Alice', 'capabilities name');
  assertEqual(user.role, 'editor', 'capabilities role');
  assertEqual(user.canSeeQueue, true, 'editor sees queue from role');
  assertEqual(user.canProposeToRhizome, false, 'editor offer hidden from role');
  assertEqual(user.editorialQueueMode, undefined, 'old API has no queue mode');
  assert(canSeeQueue('editor'), 'canSeeQueue editor');
  assert(canSeeQueue('admin'), 'canSeeQueue admin');
  assert(!canSeeQueue('user'), 'canSeeQueue user off');
  assert(canSeeQueue('user', true), 'can_see_queue flag wins');
  assert(!canSeeQueue('editor', false), 'explicit false hides queue');
  assert(canProposeToRhizome('user'), 'user can propose');
  assert(!canProposeToRhizome('editor'), 'editor cannot propose');
  assert(!canProposeToRhizome('admin'), 'admin cannot propose');
  assert(canProposeToRhizome('editor', true), 'can_propose_to_rhizome flag wins');
  assert(canProposeToRhizome('user', false), 'user role still shows');
  assert(canProposeToRhizome(''), 'unknown role shows');
  assertEqual(editorialQueueModeFromCaps('admin'), 'all', 'admin bypass without API field');
  assertEqual(editorialQueueModeFromCaps('editor'), undefined, 'editor probes granted if field missing');
  assertEqual(editorialQueueModeFromCaps('editor', 'none'), 'none', 'empty grants');
  assertEqual(editorialQueueModeFromCaps('editor', 'granted'), 'granted', 'scoped grants');
  assertEqual(reviewQueueEmptyMessage('none', 0), NO_GRANTS_QUEUE_MESSAGE, 'empty grants copy');
  assertEqual(reviewQueueEmptyMessage('granted', 0), NO_PROPOSALS_QUEUE_MESSAGE, 'grants but no pending');
  assertEqual(reviewQueueEmptyMessage('all', 0), NO_PROPOSALS_QUEUE_MESSAGE, 'admin empty is no proposals');
  assertEqual(reviewQueueEmptyMessage('none', 2), '', 'items hide empty copy');
  assert(shouldProbeGrantedList('editor', undefined, 0), 'old production probes /granted');
  assert(!shouldProbeGrantedList('editor', 'none', 0), 'new API skips probe');
  assert(!shouldProbeGrantedList('admin', undefined, 0), 'admin does not probe');
  const scoped = parseCapabilities({
    protocol_version: '1.0',
    user: { id: 'u1', username: 'alice', role: 'editor' },
    write_allowed: true,
    can_see_queue: true,
    editorial_queue_mode: 'none',
    has_editorial_grants: false,
    scopes: ['personal:read'],
  });
  assertEqual(scoped.editorialQueueMode, 'none', 'capabilities none grants');
  assertEqual(scoped.hasEditorialGrants, false, 'capabilities has_editorial_grants');
  const adminCaps = parseCapabilities({
    protocol_version: '1.0',
    user: { id: 'u2', username: 'root', role: 'admin' },
    write_allowed: true,
    can_see_queue: true,
    editorial_queue_mode: 'all',
    scopes: ['personal:read'],
  });
  assertEqual(adminCaps.editorialQueueMode, 'all', 'admin queue mode');
  const grantedPaths = await new CardApiService('http://172.16.13.14:8080', 'gnp_tok', async (input) => {
    assertEqual(String(input), 'http://172.16.13.14:8080/api/integrations/obsidian/v1/granted', 'granted url');
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }).granted();
  assertEqual(grantedPaths.length, 0, 'empty granted list');
  const grantedItem = parseFile({
    path: 'психология/note.md',
    kind: 'markdown',
    sha256: 'a'.repeat(64),
    version: 'v1',
    size: 12,
  });
  assertEqual(grantedItem.path, 'психология/note.md', 'granted shared path');
  assert(shouldUpdateRhizomeStore('# merged\n', '# shared\n'), 'second op when vault ≠ store');
  assert(!shouldUpdateRhizomeStore('# same\n', '# same\n'), 'skip store update when equal');
  const authorCaps = parseCapabilities({
    protocol_version: '1.0',
    user: { id: 'u2', username: 'bob', display_name: 'Bob', role: 'user' },
    write_allowed: true,
    can_see_queue: false,
    can_propose_to_rhizome: true,
    scopes: ['personal:read', 'personal:write'],
  });
  assertEqual(authorCaps.canSeeQueue, false, 'author queue gated');
  assertEqual(authorCaps.canProposeToRhizome, true, 'author offer on');
  assertEqual(settings.autoMode, 'idle', 'ported auto-sync default');

  try {
    await new CardApiService('http://172.16.13.14:8080', 'gnp_tok', async () => new Response(JSON.stringify({
      error: { code: 'invalid_token', message: 'токен недействителен' },
    }), { status: 401 })).capabilities();
    assert(false, '401 should throw');
  } catch (error) {
    assert(error instanceof CardApiError, 'CardApiError');
    assert(error.message.includes('HTTP 401'), '401 status in message');
    assert(error.message.includes('Токен не принят'), 'token message kept');
  }

  const fallback = await new CardApiService('http://172.16.13.14:8080', 'gnp_tok', async (input) => {
    const url = String(input);
    if (url.endsWith('/files/о%20папке.md') || url.endsWith('/files/%D0%BE%20%D0%BF%D0%B0%D0%BF%D0%BA%D0%B5.md')) {
      return new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 });
    }
    if (url.endsWith('/api/proposals/p-open')) {
      return new Response(JSON.stringify({
        id: 'p-open',
        status: 'open',
        summary: 'note',
        paths: ['о папке.md'],
        author: { username: 'alice' },
        diff: [{ path: 'о папке.md', before: '# Shared\n', body: '# Proposed\n' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('unexpected', { status: 500 });
  }).getProposalWorkFile('p-open', 'о папке.md');
  assertEqual(fallback.before, '# Shared\n', 'fallback shared side');
  assertEqual(fallback.body, '# Proposed\n', 'fallback proposed side');

  let resolveBody = '';
  await new CardApiService('http://172.16.13.14:8080', 'gnp_tok', async (input, init) => {
    assertEqual(String(input), 'http://172.16.13.14:8080/api/proposals/p-1/resolve', 'resolve url');
    assertEqual(init?.method, 'POST', 'resolve post');
    resolveBody = String(init?.body ?? '');
    return new Response('{"id":"p-1","status":"published"}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }).resolveProposal('p-1', [{ path: 'card.md', source: '# Merged\n' }]);
  assert(resolveBody.includes('# Merged'), 'sends merged card');

  try {
    await new CardApiService('http://172.16.13.14:8080', 'gnp_tok', async () => new Response(
      '<html><head><title>504 Gateway Time-out</title></head><body><h1>504 Gateway Time-out</h1></body></html>',
      { status: 504 },
    )).resolveProposal('p-1', [{ path: 'card.md', source: '# Merged\n' }]);
    assert(false, '504 should throw');
  } catch (error) {
    assert(error instanceof CardApiError, '504 CardApiError');
    assertEqual(error.status, 504, '504 status');
    assert(error.message.includes('HTTP 504'), '504 in Notice text');
    assert(error.message.includes('504 Gateway Time-out'), 'nginx title, not raw HTML');
    assert(!error.message.includes('<html>'), 'do not dump HTML into Notice');
    assert(error.message.includes('/api/proposals/p-1/resolve'), 'resolve path in error');
  }
  assertEqual(summarizeHttpBody('<html><title>504 Gateway Time-out</title></html>'), '504 Gateway Time-out', 'html title');
  assertEqual(
    formatHttpFailure('POST', 'https://rhizome.vsepsy.ru/api/proposals/p-1/resolve', 504, '504 Gateway Time-out'),
    'POST /api/proposals/p-1/resolve → HTTP 504: 504 Gateway Time-out',
    'http failure one-liner',
  );

  const workCacheSession = {
    localPath: '.obsidian/plugins/graphnotes-card-merge/work/p-1/Нарциссизм.md/current.md',
    differPath: 'Нарциссизм.md',
    proposalId: 'p-1',
  };
  assertEqual(vaultNotePath(workCacheSession), 'Нарциссизм.md', "vaultNotePath('work cache session') === Нарциссизм.md");

  const events: string[] = [];
  const mergeLeaf = {
    detach() { events.push('detach'); },
    view: { getViewType: () => MERGE_VIEW_TYPE },
    async openFile() { throw new Error('MergeView cannot openFile'); },
  };
  const newLeaf = {
    view: { getViewType: () => 'markdown', file: { path: 'Нарциссизм.md' } },
    async openFile(file: { path: string }) {
      assert(!file.path.includes('/work/'), 'open helper gets TFile vault path, not work cache');
      events.push(`leaf:${file.path}`);
    },
  };
  await openVaultMarkdownTab({
    getLeaf(kind?: unknown) {
      assertEqual(kind, true, 'always getLeaf(true), never getLeaf(false) or getLeaf(tab)');
      return newLeaf;
    },
    setActiveLeaf() { events.push('active'); },
    revealLeaf() { events.push('reveal'); },
    getLeavesOfType(type: string) {
      return type === MERGE_VIEW_TYPE ? [mergeLeaf] : [];
    },
  }, { path: vaultNotePath(workCacheSession), basename: 'Нарциссизм' }, MERGE_VIEW_TYPE);
  assertEqual(events.join(','), 'leaf:Нарциссизм.md,active,reveal,detach', 'openFile on getLeaf(true), then close compare');

  const picked = pickMarkdownLeaf({
    getLeaf(kind?: unknown) {
      assertEqual(kind, true, 'pickMarkdownLeaf uses getLeaf(true) when it is not MergeView');
      return newLeaf;
    },
    setActiveLeaf() {},
    revealLeaf() {},
    getLeavesOfType() { return []; },
  }, MERGE_VIEW_TYPE);
  assert(picked === newLeaf, 'new leaf');

  const splitEvents: string[] = [];
  const mergeOnly = {
    detach() { splitEvents.push('detach'); },
    view: { getViewType: () => MERGE_VIEW_TYPE },
    async openFile() { throw new Error('MergeView cannot openFile'); },
  };
  const splitLeaf = {
    view: { getViewType: () => 'markdown', file: { path: 'Нарциссизм.md' } },
    async openFile(file: { path: string }) {
      splitEvents.push(`split:${file.path}`);
    },
  };
  await openVaultMarkdownTab({
    getLeaf() { return mergeOnly; },
    createLeafBySplit() { return splitLeaf; },
    getMostRecentLeaf() { return mergeOnly; },
    getActiveFile() { return { path: 'Нарциссизм.md' }; },
    setActiveLeaf() { splitEvents.push('active'); },
    revealLeaf() { splitEvents.push('reveal'); },
    getLeavesOfType(type: string) {
      return type === MERGE_VIEW_TYPE ? [mergeOnly] : [];
    },
  }, { path: 'Нарциссизм.md', basename: 'Нарциссизм' }, MERGE_VIEW_TYPE);
  assertEqual(splitEvents.join(','), 'split:Нарциссизм.md,active,reveal,detach', 'createLeafBySplit when getLeaf is MergeView');

  const linkEvents: string[] = [];
  const mergeAsNew = {
    detach() { linkEvents.push('detach'); },
    view: { getViewType: () => MERGE_VIEW_TYPE },
    async openFile() { throw new Error('MergeView cannot openFile'); },
  };
  await openVaultMarkdownTab({
    getLeaf(kind?: unknown) {
      assert(kind === true || kind === 'tab', 'fallback getLeaf(true) then getLeaf(tab)');
      return mergeAsNew;
    },
    setActiveLeaf() { linkEvents.push('active'); },
    revealLeaf() { linkEvents.push('reveal'); },
    getLeavesOfType(type: string) {
      return type === MERGE_VIEW_TYPE ? [mergeAsNew] : [];
    },
    async openLinkText(linktext: string, sourcePath: string, newLeaf?: boolean) {
      assertEqual(linktext, 'Нарциссизм', 'openLinkText wiki basename');
      assertEqual(sourcePath, 'Нарциссизм.md', 'openLinkText source is the vault file path');
      assertEqual(newLeaf, true, 'openLinkText new leaf');
      linkEvents.push(`link:${linktext}`);
    },
  }, { path: 'Нарциссизм.md', basename: 'Нарциссизм' }, MERGE_VIEW_TYPE);
  assertEqual(linkEvents.join(','), 'link:Нарциссизм,detach', 'skip MergeView openFile → openLinkText(basename, path, true), then close compare');
  assert(!linkEvents.includes('reveal'), 'do not revealLeaf the failed MergeView leaf');

  assertEqual(
    pluginDebugLogPath('.obsidian'),
    '.obsidian/plugins/graphnotes-card-merge/debug.log',
    'debug.log lives next to data.json',
  );
  assertEqual(
    formatDebugLine(new Date('2026-09-13T11:51:00.000Z'), 'POST /resolve | OK | HTTP 2xx'),
    '2026-09-13T11:51:00.000Z | POST /resolve | OK | HTTP 2xx\n',
    'debug line is ISO | STEP | OK/FAIL | detail',
  );
  assertEqual(
    formatDebugStep(new Date('2026-09-13T11:51:00.000Z'), 'writeVaultCard', 'FAIL', 'tag_сознание.md EACCES'),
    '2026-09-13T11:51:00.000Z | writeVaultCard | FAIL | tag_сознание.md EACCES\n',
    'debug step one-liner',
  );
  assertEqual(sanitizeDebugText('Authorization: Bearer gnp_secretTOKEN extra'), 'Authorization: Bearer *** extra', 'never log Bearer');
  assertEqual(sanitizeDebugText('token=gnp_abc123 rest'), 'token=gnp_*** rest', 'never log gnp_');
  assertEqual(
    lastDebugLines('a\nb\nc\n', 2),
    'b\nc',
    'last 30 helper keeps tail',
  );
  let heartbeatTicks = 0;
  try {
    await runWithHeartbeat(new Promise<void>(() => undefined), {
      timeoutMs: 30,
      everyMs: 10,
      onTick: () => { heartbeatTicks += 1; },
      timeoutError: () => new Error('timed out'),
    });
    assert(false, 'heartbeat timeout must reject');
  } catch (error) {
    assert(error instanceof Error && error.message === 'timed out', 'timeout error');
  }
  assert(heartbeatTicks >= 2, 'WAIT ticks while POST hangs');
  let logged = '';
  await appendPluginDebugLog(
    {
      async exists() { return false; },
      async read() { return ''; },
      async write(_path: string, data: string) { logged = data; },
    },
    '.obsidian',
    'writeVaultCard ok tag_сознание.md',
    new Date('2026-09-13T11:51:00.000Z'),
  );
  assert(logged.includes('writeVaultCard ok tag_сознание.md'), 'appendPluginDebugLog writes the step');

  let seen: { path: string } | null = null;
  let probes = 0;
  const waited = await waitForVaultFile(
    {
      getAbstractFileByPath(path: string) {
        probes += 1;
        if (probes < 3) return null;
        seen = { path };
        return seen;
      },
    },
    'Нарциссизм.md',
    file => Boolean(file?.path),
    { sleep: async () => undefined },
  );
  assertEqual(waited.path, 'Нарциссизм.md', 'wait until vault sees TFile');
  assertEqual(probes, 3, 'retries after create race');

  let failedOpen = false;
  const stuckMerge = {
    detach() { failedOpen = true; },
    view: { getViewType: () => MERGE_VIEW_TYPE },
    async openFile() { throw new Error('MergeView cannot openFile'); },
  };
  try {
    await openVaultMarkdownTab({
      getLeaf(kind?: unknown) {
        assertEqual(kind, true, 'failure path still getLeaf(true)');
        return {
          view: { getViewType: () => 'empty' },
          async openFile() { throw new Error('EACCES'); },
        };
      },
      setActiveLeaf() {},
      revealLeaf() {},
      getLeavesOfType(type: string) {
        return type === MERGE_VIEW_TYPE ? [stuckMerge] : [];
      },
    }, { path: 'Нарциссизм.md' }, MERGE_VIEW_TYPE);
    assert(false, 'open failure must throw');
  } catch (error) {
    assert(error instanceof Error && error.message.includes('EACCES'), 'open error bubbles');
    assert(error instanceof Error && error.message.includes('Нарциссизм.md'), 'failure names the vault path');
  }
  assert(!failedOpen, 'do not close MergeView if open failed');

  let openedCache = false;
  try {
    await openVaultMarkdownTab({
      getLeaf() {
        openedCache = true;
        return { async openFile() { openedCache = true; } };
      },
      setActiveLeaf() {},
      revealLeaf() {},
      getLeavesOfType() { return []; },
    }, { path: '.obsidian/plugins/graphnotes-card-merge/work/p-1/current.md' }, MERGE_VIEW_TYPE);
    assert(false, 'work cache path must not open');
  } catch (error) {
    assert(error instanceof Error && error.message.includes('Кэш слияния'), 'reject work cache open');
  }
  assert(!openedCache, 'open helper never sees work cache path');

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
  const queuedOffers = parseOpenProposalPaths({
    proposals: [
      { id: 'p1', status: 'open', paths: ['fresh.md'] },
      { id: 'p2', status: 'accepted', paths: ['card.md'] },
    ],
  });
  assert(queuedOffers.has('fresh.md'), 'open proposal path queued');
  assert(!queuedOffers.has('card.md'), 'accepted proposal not queued');
  assertEqual(parseCreatedProposal({ id: 'p9', paths: ['fresh.md'] }).id, 'p9', 'created proposal id');

  const calls: string[] = [];
  const fake: Transport = async (url, method) => {
    calls.push(`${method} ${url}`);
    if (url.includes('/api/differ') && !url.includes('/files')) {
      return {
        status: 200,
        headers: {},
        bytes: new TextEncoder().encode(JSON.stringify({
          differences: [{ path: 'a.md', kind: 'added', title: 'A' }],
        })),
      };
    }
    if (url.endsWith('/api/proposals') && method === 'POST') {
      return {
        status: 200,
        headers: {},
        bytes: new TextEncoder().encode(JSON.stringify({ id: 'p1', paths: ['a.md'] })),
      };
    }
    if (url.endsWith('/api/proposals')) {
      return {
        status: 200,
        headers: {},
        bytes: new TextEncoder().encode(JSON.stringify({ proposals: [] })),
      };
    }
    return { status: 200, headers: {}, bytes: new TextEncoder().encode('{}') };
  };
  const site = new Api('http://172.16.13.14:8080', 'gnp_x', new AbortController().signal, fake);
  assertEqual((await site.differOffers())[0]?.path, 'a.md', 'differ offer path');
  assert(
    calls[0]?.includes('/api/differ?include_inbound=false') && !calls[0]?.includes('/integrations/obsidian'),
    'site differ URL',
  );
  assertEqual((await site.propose(['a.md'])).id, 'p1', 'propose id');
  assert(calls.some(item => item.startsWith('POST http://172.16.13.14:8080/api/proposals')), 'site propose URL');

  assert(shouldShowProposeMenu(true, { extension: 'md', path: 'Темы/Память.md' }), 'user md file shows menu');
  assert(shouldShowProposeMenu(undefined, { extension: 'md', path: 'Темы/Память.md' }), 'unknown caps show menu');
  assert(shouldShowProposeMenu(undefined, { extension: 'md', path: 'tag_детство' }), 'explorer title without .md');
  assertEqual(offerMarkdownPath({ extension: 'md', path: 'tag_детство' }), 'tag_детство.md', 'normalize md path');
  assert(!shouldShowProposeMenu(false, { extension: 'md', path: 'Темы/Память.md' }), 'editor hides menu');
  assert(!shouldShowProposeMenu(true, { extension: 'png', path: 'pic.png' }), 'non-md hidden');
  assert(!shouldShowProposeMenu(true, { extension: 'md', path: '.obsidian/app.md' }), 'hidden path skipped');
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
  handlers['file-menu']?.(unknownMenu, { extension: 'md', path: 'tag_детство' });
  assertEqual(unknownTitles[0], OFFER_BUTTON_LABEL, 'file-menu fires for unknown caps');

  const queuedApi = {
    async queuedOfferPaths() { return new Set(['fresh.md']); },
    async propose(): Promise<{ id: string; paths: string[] }> { throw new Error('should not POST'); },
  };
  const alreadyQueued = await proposeOnePath(queuedApi, 'fresh.md');
  assertEqual(alreadyQueued.status, 'already_queued', 'pending path does not POST');
  assertEqual(proposeOneNotice(alreadyQueued), 'Эта карточка уже в очереди.', 'queued notice');

  const createdApi = {
    async queuedOfferPaths() { return new Set<string>(); },
    async propose(paths: string[]) { return { id: 'p9', paths }; },
  };
  const created = await proposeOnePath(createdApi, 'fresh.md');
  assertEqual(created.status, 'created', 'new path posts');
  if (created.status === 'created') assertEqual(created.id, 'p9', 'created id');
  assertEqual(proposeOneNotice(created), 'Заявка создана: fresh.md', 'created notice');

  const syncApi = {
    async queuedOfferPaths() { return new Set<string>(); },
    async propose(): Promise<{ id: string; paths: string[] }> {
      throw Object.assign(new Error('those notes already match the shared rhizome'), { code: 'those notes already match the shared rhizome' });
    },
  };
  const inSync = await proposeOnePath(syncApi, 'same.md');
  assertEqual(inSync.status, 'already_in_sync', 'API already-match is in-sync');
  assertEqual(proposeOneNotice(inSync), 'Карточка уже совпадает с общей.', 'in-sync notice');

  assertEqual(proposeClickBlock(false, false), 'need_token', 'no token blocks click');
  assertEqual(proposeClickNotice('need_token'), TOKEN_REQUIRED_NOTICE, 'token notice');
  assertEqual(proposeClickBlock(true, true), 'denied', 'editor explicit deny');
  assertEqual(proposeClickNotice('denied'), ACCOUNT_CANNOT_PROPOSE_NOTICE, 'denied notice');
  assertEqual(proposeClickBlock(true, false), null, 'user token may POST');
  const listFailApi = {
    async queuedOfferPaths(): Promise<Set<string>> { throw new Error('timeout'); },
    async propose(paths: string[]) { return { id: 'p-timeout', paths }; },
  };
  const listedFail = await proposeOnePath(listFailApi, 'fresh.md');
  assertEqual(listedFail.status, 'created', 'GET /proposals timeout still POSTs');
}
