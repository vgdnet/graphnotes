export type CardRoute =
  | { kind: "none" }
  | { kind: "search" }
  | { kind: "card"; path: string };

export function cardHash(path: string): string {
  return `#/card/${encodeURIComponent(path)}`;
}

export function cardSearchHash(): string {
  return "#/card/";
}

/** Hash encodes `:` as `%3A`; the card path must still be `personal:{file}`. */
export function normalizeCardPath(path: string): string {
  let value = path;
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      value = path;
    }
  }
  if (/^personal%3A/i.test(value)) {
    value = `personal:${value.slice("personal%3A".length)}`;
  }
  return value;
}

export function parseCardRoute(hash: string): CardRoute {
  const value = hash.startsWith("#") ? hash : `#${hash}`;
  if (value === "#/card" || value === "#/card/") return { kind: "search" };
  const prefix = "#/card/";
  if (!value.startsWith(prefix)) return { kind: "none" };
  const rest = value.slice(prefix.length);
  if (!rest) return { kind: "search" };
  return { kind: "card", path: normalizeCardPath(rest) };
}

export function isOwnPersonalCard(path: string | null | undefined): boolean {
  if (!path) return false;
  const normalized = normalizeCardPath(path);
  if (!normalized.startsWith("personal:")) return false;
  return !/^personal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/i.test(normalized);
}

export function isForeignPersonalCard(path: string | null | undefined): boolean {
  return Boolean(path?.startsWith("personal:")) && !isOwnPersonalCard(path);
}

/** View-first: the edit button is own personal + accepted author contract only. */
export function canShowCardEditButton(path: string | null | undefined, isAuthor: boolean): boolean {
  return Boolean(isAuthor) && isOwnPersonalCard(path);
}

export function pathFromCardHash(hash: string): string | null {
  const route = parseCardRoute(hash);
  return route.kind === "card" ? route.path : null;
}

/** Keep `/` unescaped so FastAPI `{note_path:path}` receives nested Markdown paths. */
export function cardApiUrl(path: string): string {
  return `/api/cards/${encodeURI(path)}`;
}
