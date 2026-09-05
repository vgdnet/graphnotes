import type { ThemeName } from "./theme";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3.6" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" fill="none">
        <path d="M12 3.2v1.9M12 18.9v1.9M3.2 12h1.9M18.9 12h1.9M5.8 5.8l1.35 1.35M16.85 16.85l1.35 1.35M5.8 18.2l1.35-1.35M16.85 7.15l1.35-1.35" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M14.2 3.4a8.2 8.2 0 1 0 6.4 13.7 6.9 6.9 0 0 1-9.1-9.2A8 8 0 0 0 14.2 3.4z"
      />
    </svg>
  );
}

export function ThemeSwitcher({
  theme,
  onToggle,
}: {
  theme: ThemeName;
  onToggle: () => void;
}) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={dark ? "theme-switcher theme-switcher--dark" : "theme-switcher"}
      role="switch"
      aria-checked={dark}
      aria-label="Тёмная тема"
      title={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      onClick={onToggle}
    >
      <span className="theme-switcher__track">
        <span className="theme-switcher__thumb" aria-hidden="true" />
        <span
          className={`theme-switcher__icon theme-switcher__icon--sun${dark ? "" : " theme-switcher__icon--active"}`}
          aria-hidden="true"
        >
          <SunIcon />
        </span>
        <span
          className={`theme-switcher__icon theme-switcher__icon--moon${dark ? " theme-switcher__icon--active" : ""}`}
          aria-hidden="true"
        >
          <MoonIcon />
        </span>
      </span>
    </button>
  );
}
