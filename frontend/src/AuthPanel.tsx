import type { FormEvent } from "react";
import {
  DEFAULT_MAIL_CODE_TTL_MINUTES,
  loginFormPhase,
  remainingMailCodeMs,
  resetFormPhase,
} from "./authMail";

export type AuthMode = "login" | "invite" | "confirm" | "reset";

export function AuthPanel({
  mode,
  mailConfigured,
  mailCodeTtlMinutes = DEFAULT_MAIL_CODE_TTL_MINUTES,
  mailChallengeStartedAt,
  mailChallengeClock,
  resetToken,
  inviteToken,
  inviteEmail,
  inviteInviter,
  loginByMail,
  authNote,
  error,
  submitting,
  onMode,
  onSubmit,
  onExpireReset,
  onLoginByMail,
  onClose,
}: {
  mode: AuthMode;
  mailConfigured: boolean;
  mailCodeTtlMinutes?: number;
  mailChallengeStartedAt: number | null;
  mailChallengeClock: number;
  resetToken: string;
  inviteToken: string;
  inviteEmail: string;
  inviteInviter: string;
  loginByMail: boolean;
  authNote: string;
  error: string;
  submitting: boolean;
  onMode: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onExpireReset: (message: string) => void;
  onLoginByMail: (next: boolean) => void;
  onClose: () => void;
}) {
  const now = mailChallengeClock || Date.now();
  const resetPhase = resetFormPhase(resetToken, mailChallengeStartedAt, mailCodeTtlMinutes, now);
  const loginPhase = loginFormPhase(loginByMail, mailChallengeStartedAt, mailCodeTtlMinutes, now);
  const remainingMin = mailChallengeStartedAt
    ? Math.ceil(remainingMailCodeMs(mailChallengeStartedAt, mailCodeTtlMinutes, now) / 60000)
    : 0;

  function switchMode(next: AuthMode) {
    onLoginByMail(false);
    onMode(next);
  }

  const title =
    mode === "invite"
      ? "Приглашение"
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
          Вход и восстановление пароля. Новая учётка только по ссылке из письма-приглашения.
        </p>
      </div>
      <div className="auth-card">
        {mode !== "invite" && (
        <div className={mailConfigured ? "tabs" : "tabs tabs--single"} role="tablist" aria-label="Авторизация">
          <button
            className={mode === "login" || mode === "confirm" ? "tab tab--active" : "tab"}
            type="button"
            onClick={() => switchMode("login")}
          >
            Вход
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
        )}
        <form onSubmit={onSubmit}>
          {mode === "login" && loginPhase === "password" && (
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
                  <button className="auth-link" type="button" onClick={() => onLoginByMail(true)}>
                    Войти письмом
                  </button>
                </p>
              )}
            </>
          )}
          {mode === "login" && loginPhase === "request" && (
            <>
              <label>
                Логин или почта
                <input name="identifier" minLength={3} maxLength={320} autoComplete="username" required />
              </label>
              <p className="hint">
                Письмо уйдёт на почту учётки, не на случайный адрес. Код и ссылка действуют {mailCodeTtlMinutes} мин.
              </p>
              <p className="hint">
                <button className="auth-link" type="button" onClick={() => onLoginByMail(false)}>
                  Войти паролем
                </button>
              </p>
            </>
          )}
          {mode === "login" && loginPhase === "enter-code" && (
            <>
              <label>
                Логин или почта
                <input name="identifier" minLength={3} maxLength={320} autoComplete="username" required />
              </label>
              <label>
                Код из письма
                <input name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
              </label>
              <p className="hint">
                Код действует {mailCodeTtlMinutes} мин.
                {mailChallengeStartedAt ? ` Осталось ${remainingMin} мин.` : ""} Ссылка из письма тоже входит.
              </p>
              <p className="hint">
                <button className="auth-link" type="button" onClick={() => onExpireReset("Запросите новое письмо.")}>
                  Ссылка не работает? Запросить снова
                </button>
                {" · "}
                <button className="auth-link" type="button" onClick={() => onLoginByMail(false)}>
                  Войти паролем
                </button>
              </p>
            </>
          )}
          {mode === "invite" && (
            <>
              <label>
                Почта
                <input name="email" type="email" value={inviteEmail} readOnly autoComplete="email" />
              </label>
              <label>
                Логин
                <input name="username" minLength={3} maxLength={32} autoComplete="username" required />
              </label>
              <label>
                Как к вам обращаться
                <input name="displayName" maxLength={80} autoComplete="name" required />
              </label>
              <label>
                Пароль
                <input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required />
              </label>
              <input type="hidden" name="inviteToken" value={inviteToken} />
              <p className="hint">
                {inviteInviter
                  ? `Вас пригласил @${inviteInviter}. Задайте логин и пароль — учётка откроется сразу.`
                  : "Откройте ссылку из письма-приглашения."}
                {" "}Минимум 12 символов. Договор автора принимается в настройках.
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
              : mode === "invite"
                ? "Создать учётку"
                : mode === "confirm"
                  ? "Подтвердить"
                  : mode === "reset"
                    ? (resetPhase === "set-password" ? "Сменить пароль" : "Отправить письмо")
                    : loginPhase === "request"
                      ? "Отправить письмо"
                      : loginPhase === "enter-code"
                        ? "Войти по коду"
                        : "Войти"}
          </button>
          {mode !== "login" && (
          <p className="hint auth-switch">
            <button className="auth-link" type="button" onClick={() => switchMode("login")}>Вход</button>
          </p>
          )}
          <button className="button button--quiet" type="button" onClick={onClose}>К графу</button>
        </form>
      </div>
    </section>
  );
}
