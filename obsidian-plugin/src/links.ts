import type { App, TFile } from 'obsidian';
import { eligible } from './core';

export function vaultEligible(app: App): TFile[] {
  return app.vault.getFiles().filter(file => eligible(file.path));
}
