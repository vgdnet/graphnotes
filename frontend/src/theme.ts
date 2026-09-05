export type ThemeName = "light" | "dark";

export const THEME_STORAGE_KEY = "graphnotes-theme";

export function isThemeName(value: string | null | undefined): value is ThemeName {
  return value === "light" || value === "dark";
}

export function systemTheme(): ThemeName {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function storedTheme(): ThemeName | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(value) ? value : null;
  } catch {
    return null;
  }
}

export function resolveTheme(): ThemeName {
  return storedTheme() ?? systemTheme();
}

export function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function persistTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode can block storage; the session still switches.
  }
  applyTheme(theme);
}

export function cssToken(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
