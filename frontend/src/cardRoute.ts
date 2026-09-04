export function cardHash(path: string): string {
  return `#/card/${encodeURIComponent(path)}`;
}

export function pathFromCardHash(hash: string): string | null {
  const value = hash.startsWith("#") ? hash : `#${hash}`;
  const prefix = "#/card/";
  if (!value.startsWith(prefix)) return null;
  const rest = value.slice(prefix.length);
  if (!rest) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/** Keep `/` unescaped so FastAPI `{note_path:path}` receives nested Markdown paths. */
export function cardApiUrl(path: string): string {
  return `/api/cards/${encodeURI(path)}`;
}
