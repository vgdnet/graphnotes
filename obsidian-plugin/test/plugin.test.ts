import { parseCapabilities, parseFileContent, parseTransfer, sourcesApplied } from '../src/api';
import { applyResults, chunkOps, classify, deleteOp, rememberSame, safeLink, safePath, serverOrigin, sha256, type Baselines, type Operation } from '../src/core';
import { canRetry, collectBlobs, SnapshotChangedError } from '../src/runner';
import { normalizeSaved } from '../src/store';
import { ApiError } from '../src/api';
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
  assertEqual(safeLink('http://172.16.13.14:8080', '/#/my_graph'), 'http://172.16.13.14:8080/#/my_graph', 'same origin link');

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
    links: { personal_graph: 'http://172.16.13.14:8080/#/my_graph', differ: 'http://172.16.13.14:8080/#/differ' },
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

  console.log('ok', 34);
}
