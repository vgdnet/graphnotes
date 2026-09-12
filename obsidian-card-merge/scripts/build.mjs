import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist/graphnotes-card-merge', { recursive: true });
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  external: ['obsidian', 'electron'],
  outfile: 'dist/graphnotes-card-merge/main.js',
  banner: { js: '/* GraphNotes Card Merge — AGPL-3.0-only */' },
});
for (const file of ['manifest.json', 'styles.css', 'README.md', 'LICENSE']) {
  await copyFile(file, `dist/graphnotes-card-merge/${file}`);
}
