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

type AdminUsersResponse = { users: User[] };

type RepositoryStatus = {
  connected: boolean;
  owner?: string | null;
  name?: string | null;
  status: string;
  has_content: boolean;
  updated_at?: string | null;
};

type RepositoryStatusResponse = {
  shared: RepositoryStatus;
  personal: RepositoryStatus | null;
};

function sharedLabel(status: RepositoryStatus | null): string {
  if (!status?.connected) return "Общая ризома ещё не подключена.";
  if (status.has_content) return "Общая ризома доступна.";
  return "Общая ризома подключена, заметок пока нет.";
}

function personalLabel(status: RepositoryStatus | null): string {
  if (!status?.connected) return "Личный git ещё не связан.";
  if (status.has_content) return `Связан git ${status.owner}/${status.name}.`;
  return `Git ${status.owner}/${status.name} связан, коммитов пока нет.`;
}

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
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [repository, setRepository] = useState<RepositoryStatusResponse | null>(null);

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

    void fetch("/api/repository/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as RepositoryStatusResponse;
      })
      .then(setRepository)
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (user?.role !== "admin") {
      setAdminUsers([]);
      return;
    }

    const controller = new AbortController();
    setAdminLoading(true);
    void fetch("/api/admin/users", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as AdminUsersResponse;
      })
      .then((body) => setAdminUsers(body.users))
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
        }
      })
      .finally(() => setAdminLoading(false));

    return () => controller.abort();
  }, [user?.role]);

  useEffect(() => {
    if (authChecking) return;
    const controller = new AbortController();
    void fetch("/api/repository/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as RepositoryStatusResponse;
      })
      .then(setRepository)
      .catch(() => undefined);
    return () => controller.abort();
  }, [authChecking, user?.id]);

  async function connectShared() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/repository/connect", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      setRepository(await response.json() as RepositoryStatusResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function connectPersonal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setError("");
    const repositoryRef = String(new FormData(formElement).get("repository") || "");
    try {
      const response = await fetch("/api/personal/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: repositoryRef }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setRepository(await response.json() as RepositoryStatusResponse);
      formElement.reset();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

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

  async function updateManagedUser(
    managedUser: User,
    change: { role?: User["role"]; is_active?: boolean },
  ) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${managedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!response.ok) throw new Error(await readError(response));
      const updated = (await response.json()) as User;
      setAdminUsers((users) => users.map((item) => item.id === updated.id ? updated : item));
      if (updated.id === user?.id) {
        setUser(updated.is_active ? updated : null);
      }
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
        <>
          <section className="workspace">
            <div className="workspace__intro">
              <p className="eyebrow">Две ризомы</p>
              <h1>Здравствуйте, {user.display_name}</h1>
              <p className="summary">{sharedLabel(repository?.shared ?? null)}</p>
              <p className="summary">{personalLabel(repository?.personal ?? null)}</p>
              <form className="connect-form" onSubmit={(event) => void connectPersonal(event)}>
                <label>
                  Свой git
                  <input
                    name="repository"
                    placeholder="владелец/имя"
                    maxLength={200}
                    required
                  />
                </label>
                <button className="button button--primary" type="submit" disabled={submitting}>
                  Связать личный git
                </button>
              </form>
              {user.role === "admin" && (
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={() => void connectShared()}
                  disabled={submitting}
                >
                  Подключить общую ризому
                </button>
              )}
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
          {user.role === "admin" && (
            <section className="admin-panel" aria-labelledby="admin-heading">
              <div>
                <p className="eyebrow">Администрирование</p>
                <h2 id="admin-heading">Пользователи</h2>
                <p className="admin-panel__hint">Роли глобальны: editor включает права user, admin — все права.</p>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              {adminLoading ? (
                <p className="admin-panel__hint">Загружаем пользователей…</p>
              ) : (
                <div className="user-list">
                  {adminUsers.map((managedUser) => (
                    <article className="user-row" key={managedUser.id}>
                      <div className="user-row__identity">
                        <strong>{managedUser.display_name}</strong>
                        <span>@{managedUser.username}</span>
                      </div>
                      <label>
                        Роль
                        <select
                          value={managedUser.role}
                          disabled={submitting}
                          onChange={(event) => void updateManagedUser(
                            managedUser,
                            { role: event.target.value as User["role"] },
                          )}
                        >
                          <option value="user">user</option>
                          <option value="editor">editor</option>
                          <option value="admin">admin</option>
                        </select>
                      </label>
                      <button
                        className={managedUser.is_active ? "button button--danger" : "button button--quiet"}
                        disabled={submitting}
                        onClick={() => void updateManagedUser(
                          managedUser,
                          { is_active: !managedUser.is_active },
                        )}
                      >
                        {managedUser.is_active ? "Заблокировать" : "Активировать"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="auth-layout">
          <div className="hero-copy">
            <p className="eyebrow">Связанное знание</p>
            <h1>Собирайте мысли в живую ризому.</h1>
            <p className="summary">
              {sharedLabel(repository?.shared ?? null)} Markdown остаётся в git.
              GraphNotes показывает общую ризому и помогает взять знания себе.
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
