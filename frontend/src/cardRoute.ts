export type CardRoute =
  | { kind: "none" }
  | { kind: "search" }
  | { kind: "card"; path: string };

export function cardHash(path: string): string {
  return `#/card/${encodeURIComponent(path)}`;
}

export function cardSearchHash(): string {
  return "#/search";
}

export function startCardHash(): string {
  return "#/card";
}

/** TZ 2.58: own personal hits open `/card/{git-path}` with no layer in the URL. */
export function canonicalCardHash(path: string): string {
  const normalized = normalizeCardPath(path);
  if (normalized.startsWith("proposal:") || isForeignPersonalCard(normalized)) {
    return cardHash(normalized);
  }
  return cardHash(cardFilePath(normalized));
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
  if (value === "#/search") return { kind: "search" };
  if (value === "#/card/") return { kind: "search" };
  if (value === "#/card") return { kind: "none" };
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
  if (!path) return false;
  const normalized = normalizeCardPath(path);
  return normalized.startsWith("personal:") && !isOwnPersonalCard(normalized);
}

/** View-first: the edit button is own personal + accepted author contract only. */
export function canShowCardEditButton(path: string | null | undefined, isAuthor: boolean): boolean {
  return Boolean(isAuthor) && isOwnPersonalCard(path);
}

export function pathFromCardHash(hash: string): string | null {
  const route = parseCardRoute(hash);
  return route.kind === "card" ? route.path : null;
}

/** Git path without `personal:` / `proposal:` / foreign-owner prefix. */
export function cardFilePath(path: string): string {
  const normalized = normalizeCardPath(path);
  if (normalized.startsWith("proposal:")) {
    const rest = normalized.slice("proposal:".length);
    const cut = rest.indexOf(":");
    return cut >= 0 ? rest.slice(cut + 1) : rest;
  }
  if (normalized.startsWith("personal:")) {
    const rest = normalized.slice("personal:".length);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/i.test(rest)) {
      return rest.slice(rest.indexOf(":") + 1);
    }
    return rest;
  }
  return normalized;
}

/**
 * Wikilinks inherit the layer of the page you are on.
 * Do not collapse personal and shared: the same file path can exist in both.
 */
export function qualifyCardPath(sourceCardPath: string | undefined, targetPath: string): string {
  const target = normalizeCardPath(targetPath);
  if (
    !target
    || target.startsWith("personal:")
    || target.startsWith("proposal:")
    || target.startsWith("locked:")
    || target.startsWith("unresolved:")
  ) {
    return target;
  }
  const source = sourceCardPath ? normalizeCardPath(sourceCardPath) : "";
  if (isOwnPersonalCard(source)) {
    return `personal:${cardFilePath(target)}`;
  }
  if (isForeignPersonalCard(source)) {
    const owner = source.slice("personal:".length).split(":", 1)[0];
    return `personal:${owner}:${cardFilePath(target)}`;
  }
  if (source.startsWith("proposal:")) {
    const id = source.slice("proposal:".length).split(":", 1)[0];
    return `proposal:${id}:${cardFilePath(target)}`;
  }
  return target;
}

export function wikiCardHash(sourceCardPath: string | undefined, targetPath: string): string {
  return cardHash(qualifyCardPath(sourceCardPath, targetPath));
}

/** Wikilink / unresolved graph node → Markdown path for a missing card. */
export function missingNotePath(raw: string): string {
  let text = normalizeCardPath(raw).replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (text.startsWith("unresolved:")) text = text.slice("unresolved:".length);
  if (text.startsWith("locked:")) text = text.slice("locked:".length);
  text = cardFilePath(text);
  if (!text) return "";
  if (!text.toLowerCase().endsWith(".md")) text = `${text}.md`;
  return text;
}

export function missingNoteTitle(path: string): string {
  const file = missingNotePath(path);
  const name = file.split("/").pop() || file;
  return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

/** Keep `/` unescaped so FastAPI `{note_path:path}` receives nested Markdown paths. */
export function cardApiUrl(path: string): string {
  return `/api/cards/${encodeURI(path)}`;
}
