import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type HealthState = "checking" | "online" | "offline";
type AuthMode = "login" | "register";

type User = {
  id: string;
  username: string;
  email: string | null;
  display_name: string;
  role: "user" | "editor" | "admin";
  is_active: boolean;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Fall back to a user-safe message below.
  }
  return "Не удалось выполнить запрос. Попробуйте ещё раз.";
}

export function App() {
  const [health, setHealth] = useState<HealthState>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [mode, setMode] = useState<AuthMode>("login");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/health", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("health check failed");
        return response.json() as Promise<{ status: string }>;
      })
      .then((body) => setHealth(body.status === "ok" ? "online" : "offline"))
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setHealth("offline");
        }
      });

    void fetch("/api/users/me", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as User;
      })
      .then(setUser)
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
        }
      })
      .finally(() => setAuthChecking(false));

    return () => controller.abort();
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setError("");

    const form = new FormData(formElement);
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload = mode === "register"
      ? {
          username: form.get("username"),
          password: form.get("password"),
          display_name: form.get("displayName"),
          email: form.get("email") || null,
        }
      : {
          username: form.get("username"),
          password: form.get("password"),
        };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await readError(response));
      setUser((await response.json()) as User);
      formElement.reset();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      setUser(null);
      setMode("login");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="GraphNotes">
          <span className="brand__mark" aria-hidden="true">G</span>
          <span>GraphNotes</span>
        </a>
        <div className={`status status--${health}`} role="status">
          <span className="status__dot" aria-hidden="true" />
          {health === "online" ? "Система доступна" : health === "checking" ? "Проверка" : "Нет связи"}
        </div>
      </header>

      {authChecking ? (
        <section className="loading" aria-live="polite">Загружаем вашу ризому…</section>
      ) : user ? (
        <section className="workspace">
          <div className="workspace__intro">
            <p className="eyebrow">Личная ризома</p>
            <h1>Здравствуйте, {user.display_name}</h1>
            <p className="summary">
              Ваше пространство готово. Следующим шагом здесь появятся Markdown-заметки
              и связи между ними.
            </p>
          </div>
          <aside className="profile-card">
            <div className="avatar" aria-hidden="true">
              {user.display_name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{user.display_name}</strong>
              <span>@{user.username} · {user.role}</span>
            </div>
            <button className="button button--quiet" onClick={() => void logout()} disabled={submitting}>
              Выйти
            </button>
          </aside>
        </section>
      ) : (
        <section className="auth-layout">
          <div className="hero-copy">
            <p className="eyebrow">Связанное знание</p>
            <h1>Собирайте мысли в живую ризому.</h1>
            <p className="summary">
              Markdown остаётся вашим. GraphNotes помогает увидеть связи, развивать
              личную базу и готовить знания для общей ризомы.
            </p>
            <div className="connection-line" aria-hidden="true"><span /><span /><span /></div>
          </div>

          <div className="auth-card">
            <div className="tabs" role="tablist" aria-label="Авторизация">
              <button className={mode === "login" ? "tab tab--active" : "tab"} onClick={() => { setMode("login"); setError(""); }}>Вход</button>
              <button className={mode === "register" ? "tab tab--active" : "tab"} onClick={() => { setMode("register"); setError(""); }}>Регистрация</button>
            </div>

            <form onSubmit={(event) => void submitAuth(event)}>
              <label>
                Логин
                <input name="username" minLength={3} maxLength={32} autoComplete="username" required />
              </label>
              {mode === "register" && (
                <>
                  <label>
                    Как к вам обращаться
                    <input name="displayName" maxLength={80} autoComplete="name" required />
                  </label>
                  <label>
                    Email <span className="optional">необязательно</span>
                    <input name="email" type="email" maxLength={320} autoComplete="email" />
                  </label>
                </>
              )}
              <label>
                Пароль
                <input
                  name="password"
                  type="password"
                  minLength={mode === "register" ? 12 : 1}
                  maxLength={128}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                />
              </label>
              {mode === "register" && <p className="hint">Минимум 12 символов.</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button--primary" type="submit" disabled={submitting}>
                {submitting ? "Подождите…" : mode === "register" ? "Создать личную ризому" : "Войти"}
              </button>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}
