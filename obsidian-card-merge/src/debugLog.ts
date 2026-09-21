import { PLUGIN_ID } from './apiService';

export type DebugStatus = 'OK' | 'FAIL' | 'WAIT' | 'SKIP';

export const NOTICE_FAIL_MS = 20_000;
export const NOTICE_OK_MS = 15_000;
export const RESOLVE_TIMEOUT_MS = 75_000;
export const RESOLVE_HEARTBEAT_MS = 10_000;

/** Vault-relative path of the persistent Save & Resolve trace. */
export function pluginDebugLogPath(configDir: string): string {
  return `${configDir}/plugins/${PLUGIN_ID}/debug.log`;
}

/** Never write tokens / Bearer headers into debug.log. */
export function sanitizeDebugText(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/gnp_[A-Za-z0-9_-]+/g, 'gnp_***')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatDebugLine(now: Date, message: string): string {
  return `${now.toISOString()} | ${sanitizeDebugText(message)}\n`;
}

export function formatDebugStep(
  now: Date,
  step: string,
  status: DebugStatus,
  detail = '',
): string {
  const extra = sanitizeDebugText(detail);
  const body = extra ? `${step} | ${status} | ${extra}` : `${step} | ${status}`;
  return formatDebugLine(now, body);
}

export function lastDebugLines(text: string, n: number): string {
  const lines = text.split(/\r?\n/).map(line => line.trimEnd()).filter(Boolean);
  return lines.slice(-Math.max(1, n)).join('\n');
}

export interface DebugAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
}

/** Append one timestamped line. Never throws — open/resolve must not die on logging. */
export async function appendPluginDebugLog(
  adapter: DebugAdapter,
  configDir: string,
  message: string,
  now: Date = new Date(),
): Promise<void> {
  const path = pluginDebugLogPath(configDir);
  const line = formatDebugLine(now, message);
  try {
    const prev = (await adapter.exists(path)) ? await adapter.read(path) : '';
    await adapter.write(path, prev + line);
  } catch (error) {
    console.error('graphnotes-card-merge: debug.log write failed', error);
  }
}

export async function appendPluginDebugStep(
  adapter: DebugAdapter,
  configDir: string,
  step: string,
  status: DebugStatus,
  detail = '',
  now: Date = new Date(),
): Promise<void> {
  await appendPluginDebugLog(adapter, configDir, `${step} | ${status}${detail ? ` | ${detail}` : ''}`, now);
}

export async function readPluginDebugLog(adapter: DebugAdapter, configDir: string): Promise<string> {
  const path = pluginDebugLogPath(configDir);
  if (!(await adapter.exists(path))) return '';
  return adapter.read(path);
}

/**
 * Race `work` against a timeout, logging a WAIT tick every `everyMs`.
 * The underlying promise is not cancelled — only the waiter gives up.
 */
export async function runWithHeartbeat<T>(
  work: Promise<T>,
  options: {
    timeoutMs: number;
    everyMs: number;
    onTick: (elapsedMs: number) => void | Promise<void>;
    timeoutError: () => Error;
  },
): Promise<T> {
  let elapsed = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let timedOut = false;
  const heartbeat = new Promise<T>((_, reject) => {
    timer = setInterval(() => {
      elapsed += options.everyMs;
      void options.onTick(elapsed);
      if (elapsed >= options.timeoutMs) {
        timedOut = true;
        reject(options.timeoutError());
      }
    }, options.everyMs);
  });
  try {
    return await Promise.race([work, heartbeat]);
  } finally {
    if (timer) clearInterval(timer);
    if (timedOut) {
      void work.catch(() => undefined);
    }
  }
}
