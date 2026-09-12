import { mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

await rm('.test-build', { recursive: true, force: true });
await mkdir('.test-build', { recursive: true });
await build({
  entryPoints: ['test/plugin.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: '.test-build/plugin.test.mjs',
});
const { run } = await import(pathToFileURL('.test-build/plugin.test.mjs').href);
await run();
