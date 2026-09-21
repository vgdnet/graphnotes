import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/graphnotes-publisher', { recursive: true });
await build({ entryPoints: ['src/main.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'es2022', charset: 'utf8', external: ['obsidian', 'electron'], outfile: 'dist/graphnotes-publisher/main.js', banner: { js: '/* GraphNotes Publisher — AGPL-3.0-only */' } });
for (const file of ['manifest.json', 'styles.css', 'README.md', 'LICENSE']) {
  await copyFile(file, `dist/graphnotes-publisher/${file}`);
}
