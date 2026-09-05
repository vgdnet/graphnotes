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

export function parseCardRoute(hash: string): CardRoute {
  const value = hash.startsWith("#") ? hash : `#${hash}`;
  if (value === "#/card" || value === "#/card/") return { kind: "search" };
  const prefix = "#/card/";
  if (!value.startsWith(prefix)) return { kind: "none" };
  const rest = value.slice(prefix.length);
  if (!rest) return { kind: "search" };
  try {
    return { kind: "card", path: decodeURIComponent(rest) };
  } catch {
    return { kind: "card", path: rest };
  }
}

export function pathFromCardHash(hash: string): string | null {
  const route = parseCardRoute(hash);
  return route.kind === "card" ? route.path : null;
}

/** Keep `/` unescaped so FastAPI `{note_path:path}` receives nested Markdown paths. */
export function cardApiUrl(path: string): string {
  return `/api/cards/${encodeURI(path)}`;
}
