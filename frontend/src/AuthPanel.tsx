import type { FormEvent } from "react";
import {
  DEFAULT_MAIL_CODE_TTL_MINUTES,
  remainingMailCodeMs,
  resetFormPhase,
} from "./authMail";

export type AuthMode = "login" | "register" | "confirm" | "reset";

export function AuthPanel({
  mode,
  mailConfigured,
  mailCodeTtlMinutes = DEFAULT_MAIL_CODE_TTL_MINUTES,
  mailChallengeStartedAt,
  mailChallengeClock,
  resetToken,
  authNote,
  error,
  submitting,
  onMode,
  onSubmit,
  onExpireReset,
  onClose,
}: {
  mode: AuthMode;
  mailConfigured: boolean;
  mailCodeTtlMinutes?: number;
  mailChallengeStartedAt: number | null;
  mailChallengeClock: number;
  resetToken: string;
  authNote: string;
  error: string;
  submitting: boolean;
  onMode: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onExpireReset: (message: string) => void;
  onClose: () => void;
}) {
  const now = mailChallengeClock || Date.now();
  const resetPhase = resetFormPhase(resetToken, mailChallengeStartedAt, mailCodeTtlMinutes, now);
  const remainingMin = mailChallengeStartedAt
    ? Math.ceil(remainingMailCodeMs(mailChallengeStartedAt, mailCodeTtlMinutes, now) / 60000)
    : 0;

  function switchMode(next: AuthMode) {
    onMode(next);
  }

  const title =
    mode === "register"
      ? "Регистрация"
      : mode === "reset"
        ? "Не помню пароль"
        : mode === "confirm"
          ? "Подтверждение почты"
          : "Вход";

  return (
    <section className="auth-layout auth-overlay">
      <div className="hero-copy">
        <p className="eyebrow">Аккаунт</p>
        <h1>{title}</h1>
        <p className="summary">
          Один экран: вход, регистрация и восстановление пароля. Письма уходят на почту учётки.
        </p>
      </div>
      <div className="auth-card">
        <div className={mailConfigured ? "tabs tabs--three" : "tabs"} role="tablist" aria-label="Авторизация">
          <button
            className={mode === "login" ? "tab tab--active" : "tab"}
            type="button"
            onClick={() => switchMode("login")}
          >
            Вход
          </button>
          <button
            className={mode === "register" || mode === "confirm" ? "tab tab--active" : "tab"}
            type="button"
            onClick={() => switchMode("register")}
          >
            Регистрация
          </button>
          {mailConfigured && (
            <button
              className={mode === "reset" ? "tab tab--active" : "tab"}
              type="button"
              onClick={() => switchMode("reset")}
            >
              Не помню пароль
            </button>
          )}
        </div>
        <form onSubmit={onSubmit}>
          {mode === "login" && (
            <>
              <label>
                Логин или почта
                <input name="username" minLength={3} maxLength={320} autoComplete="username" required />
              </label>
              <label>
                Пароль
                <input name="password" type="password" minLength={1} maxLength={128} autoComplete="current-password" required />
              </label>
              {mailConfigured && (
                <p className="hint">
                  <button className="auth-link" type="button" onClick={() => switchMode("reset")}>
                    Не помню пароль
                  </button>
                </p>
              )}
            </>
          )}
          {mode === "register" && (
            <>
              <label>
                Логин
                <input name="username" minLength={3} maxLength={32} autoComplete="username" required />
              </label>
              <label>
                Как к вам обращаться
                <input name="displayName" maxLength={80} autoComplete="name" required />
              </label>
              <label>
                Почта
                <input name="email" type="email" maxLength={320} autoComplete="email" required />
              </label>
              <label>
                Пароль
                <input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required />
              </label>
              <p className="hint">
                Минимум 12 символов. Договор автора принимается в настройках.
                {mailConfigured ? " Письмо с ссылкой и кодом уйдёт на эту почту." : ""}
              </p>
            </>
          )}
          {mode === "confirm" && (
            <>
              <label>
                Почта
                <input name="email" type="email" maxLength={320} autoComplete="email" required />
              </label>
              <label>
                Код из письма
                <input name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
              </label>
              <p className="hint">
                Письмо ушло на указанную при регистрации почту. Ссылка из письма тоже подтверждает.
                Код действует {mailCodeTtlMinutes} мин.
              </p>
            </>
          )}
          {mode === "reset" && (
            <>
              {resetPhase === "request" && (
                <>
                  <label>
                    Логин или почта
                    <input name="identifier" minLength={3} maxLength={320} autoComplete="username" required />
                  </label>
                  <p className="hint">
                    Если учётка есть, письмо уйдёт на её почту, не на случайный адрес. Код действует {mailCodeTtlMinutes} мин.
                  </p>
                </>
              )}
              {resetPhase === "set-password" && (
                <>
                  <label>
                    Код из письма
                    <input name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
                  </label>
                  <label>
                    Новый пароль
                    <input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required />
                  </label>
                  <p className="hint">
                    Задайте новый пароль. Код действует {mailCodeTtlMinutes} мин.
                    {mailChallengeStartedAt ? ` Осталось ${remainingMin} мин.` : ""} Код не нужен, если открыли ссылку из письма.
                  </p>
                  <p className="hint">
                    <button className="auth-link" type="button" onClick={() => onExpireReset("Запросите новое письмо.")}>
                      Ссылка не работает? Запросить снова
                    </button>
                  </p>
                </>
              )}
            </>
          )}
          {authNote && <p className="admin-panel__hint" role="status">{authNote}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--primary" type="submit" disabled={submitting}>
            {submitting
              ? "Подождите…"
              : mode === "register"
                ? "Создать учётку"
                : mode === "confirm"
                  ? "Подтвердить"
                  : mode === "reset"
                    ? (resetPhase === "set-password" ? "Сменить пароль" : "Отправить письмо")
                    : "Войти"}
          </button>
          <p className="hint auth-switch">
            {mode === "login" && (
              <button className="auth-link" type="button" onClick={() => switchMode("register")}>Регистрация</button>
            )}
            {mode !== "login" && (
              <button className="auth-link" type="button" onClick={() => switchMode("login")}>Вход</button>
            )}
            {mailConfigured && mode !== "reset" && (
              <>
                {" · "}
                <button className="auth-link" type="button" onClick={() => switchMode("reset")}>Не помню пароль</button>
              </>
            )}
          </p>
          <button className="button button--quiet" type="button" onClick={onClose}>К графу</button>
        </form>
      </div>
    </section>
  );
}
