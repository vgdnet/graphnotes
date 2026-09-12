import {
  CardApiError,
  CardApiService,
  differFileUrl,
  differUrl,
  MERGE_VIEW_TYPE,
  QUEUE_VIEW_TYPE,
  normalizeSettings,
  parseCapabilities,
  parseDifferFile,
  parseDifferList,
  parseMergeSession,
  PLUGIN_ID,
  serverOrigin,
} from '../src/apiService';

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

  assertEqual(serverOrigin('http://172.16.13.14:8080', true), 'http://172.16.13.14:8080', 'test http');
  assertEqual(differUrl('http://172.16.13.14:8080'), 'http://172.16.13.14:8080/api/differ', 'differ list');
  assertEqual(
    differFileUrl('http://172.16.13.14:8080', 'Темы/Память.md'),
    'http://172.16.13.14:8080/api/differ/files/%D0%A2%D0%B5%D0%BC%D1%8B/%D0%9F%D0%B0%D0%BC%D1%8F%D1%82%D1%8C.md',
    'differ file encodes path',
  );

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

  const session = parseMergeSession({
    localPath: ' Inbox/Hello.md ',
    remoteCardId: ' card-1 ',
    remotePath: '',
  });
  assert(session, 'session parsed');
  assertEqual(session.differPath, 'card-1', 'legacy remoteCardId');

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
    user: { id: 'u1', username: 'alice', display_name: 'Alice' },
    write_allowed: true,
    scopes: ['personal:read', 'personal:write'],
  });
  assertEqual(user.username, 'alice', 'capabilities user');
  assertEqual(user.displayName, 'Alice', 'capabilities name');

  try {
    await new CardApiService('http://172.16.13.14:8080', 'gnp_tok', async () => new Response(JSON.stringify({
      error: { code: 'invalid_token', message: 'токен недействителен' },
    }), { status: 401 })).capabilities();
    assert(false, '401 should throw');
  } catch (error) {
    assert(error instanceof CardApiError, 'CardApiError');
    assertEqual(error.message, 'Токен не принят. Создайте новый во вкладке Obsidian.', 'token message');
  }
}
