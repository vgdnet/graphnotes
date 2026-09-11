import type { App, TFile } from 'obsidian';
import { eligible } from './core';

export interface Related {
  attachments: string[];
  notes: string[];
  missing: string[];
}

export function vaultEligible(app: App): TFile[] {
  return app.vault.getFiles().filter(file => eligible(file.path));
}

export function relatedPaths(app: App, file: TFile): Related {
  const attachments: string[] = [];
  const notes: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  const add = (path: string, kind: 'attachment' | 'note') => {
    if (path === file.path || seen.has(path)) return;
    seen.add(path);
    if (kind === 'note') notes.push(path);
    else attachments.push(path);
  };

  const resolved = app.metadataCache.resolvedLinks[file.path] ?? {};
  for (const dest of Object.keys(resolved)) {
    if (!eligible(dest) && !dest.toLowerCase().endsWith('.md')) continue;
    add(dest, dest.toLowerCase().endsWith('.md') ? 'note' : 'attachment');
  }

  const cache = app.metadataCache.getFileCache(file);
  for (const embed of cache?.embeds ?? []) {
    const dest = app.metadataCache.getFirstLinkpathDest(embed.link.split('#')[0], file.path);
    if (dest) add(dest.path, dest.extension === 'md' ? 'note' : 'attachment');
    else if (embed.link) missing.push(embed.link.split('#')[0]);
  }
  for (const link of cache?.links ?? []) {
    const dest = app.metadataCache.getFirstLinkpathDest(link.link.split('#')[0], file.path);
    if (dest) add(dest.path, dest.extension === 'md' ? 'note' : 'attachment');
    else if (link.link) missing.push(link.link.split('#')[0]);
  }

  const unresolved = app.metadataCache.unresolvedLinks[file.path] ?? {};
  for (const name of Object.keys(unresolved)) {
    if (!missing.includes(name)) missing.push(name);
  }
  return { attachments, notes, missing };
}

export function usedInLabel(usedIn: string[]): string {
  if (!usedIn.length) return '';
  const shown = usedIn.slice(0, 3).join(', ');
  return usedIn.length > 3 ? `Используется в ${shown} и ещё ${usedIn.length - 3}` : `Используется в ${shown}`;
}
