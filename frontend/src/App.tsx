import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { GraphView } from "./GraphView";
import type { GraphResponse } from "./GraphView";

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
  index_status?: string;
  updated_at?: string | null;
};

type RepositoryStatusResponse = {
  shared: RepositoryStatus;
  personal: RepositoryStatus | null;
};

type NoteProjection = {
  path: string;
  title: string;
  tags: string[];
  aliases: string[];
  links: string[];
  unresolved_links: string[];
  warnings: string[];
};

type NoteDetail = NoteProjection & { body: string; content_hash: string };

type NoteListResponse = {
  notes: NoteProjection[];
  revision: string | null;
};

type IngestReport = {
  accepted: string[];
  rejected: { path: string; reason: string }[];
  skipped: string[];
  conflicted: string[];
  warnings: string[];
  revision: string | null;
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
  const [sharedNotes, setSharedNotes] = useState<NoteProjection[]>([]);
  const [personalNotes, setPersonalNotes] = useState<NoteProjection[]>([]);
  const [personalRevision, setPersonalRevision] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [openNote, setOpenNote] = useState<NoteDetail | null>(null);
  const [report, setReport] = useState<IngestReport | null>(null);
  const [sharedGraph, setSharedGraph] = useState<GraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphCenter, setGraphCenter] = useState<string | null>(null);

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

  useEffect(() => {
    if (!repository?.shared.connected) {
      setSharedNotes([]);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/shared/notes", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as NoteListResponse;
      })
      .then((body) => setSharedNotes(body.notes))
      .catch(() => undefined);
    return () => controller.abort();
  }, [repository?.shared.connected, repository?.shared.updated_at]);

  useEffect(() => {
    if (!user || !repository?.personal?.connected) {
      setPersonalNotes([]);
      setPersonalRevision(null);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/personal/notes", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as NoteListResponse;
      })
      .then((body) => {
        setPersonalNotes(body.notes);
        setPersonalRevision(body.revision);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [user, repository?.personal?.connected, repository?.personal?.updated_at]);

  useEffect(() => {
    if (!repository?.shared.connected) {
      setSharedGraph(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "50", depth: "1" });
    if (graphCenter) params.set("center", graphCenter);
    const path = user && repository.personal?.connected
      ? `/api/graph/personal-overlay?${params}`
      : `/api/graph/shared?${params}`;
    setGraphLoading(true);
    void fetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as GraphResponse;
      })
      .then(setSharedGraph)
      .catch(() => undefined)
      .finally(() => setGraphLoading(false));
    return () => controller.abort();
  }, [
    user,
    repository?.shared.connected,
    repository?.shared.updated_at,
    repository?.shared.index_status,
    repository?.personal?.connected,
    repository?.personal?.updated_at,
    report?.revision,
    graphCenter,
  ]);

  async function openGraphNote(path: string, origin: string) {
    if (path.startsWith("unresolved:")) return;
    const filePath = path.startsWith("personal:") ? path.slice("personal:".length) : path;
    const endpoint = origin === "personal"
      ? `/api/personal/notes/${encodeURI(filePath)}`
      : `/api/shared/notes/${encodeURI(filePath)}`;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(await readError(response));
      setOpenNote((await response.json()) as NoteDetail);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }
  async function rebuildSharedIndex() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/index/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "shared" }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setSharedGraph((await response.json()) as GraphResponse);
      setGraphCenter(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

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

  async function takeSelected() {
    if (selectedPaths.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/personal/take-from-shared", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: selectedPaths, expected_sha: personalRevision }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as IngestReport;
      setReport(body);
      setPersonalRevision(body.revision);
      setSelectedPaths([]);
      const notes = await fetch("/api/personal/notes");
      if (notes.ok) {
        const listed = (await notes.json()) as NoteListResponse;
        setPersonalNotes(listed.notes);
        setPersonalRevision(listed.revision);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function importFallback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const file = (new FormData(formElement).get("file") as File | null);
    if (!file) return;
    setSubmitting(true);
    setError("");
    const payload = new FormData();
    payload.set("file", file);
    if (personalRevision) payload.set("expected_sha", personalRevision);
    try {
      const response = await fetch("/api/personal/import-md", { method: "POST", body: payload });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as IngestReport;
      setReport(body);
      formElement.reset();
      const notes = await fetch("/api/personal/notes");
      if (notes.ok) {
        const listed = (await notes.json()) as NoteListResponse;
        setPersonalNotes(listed.notes);
        setPersonalRevision(listed.revision);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function openPersonalNote(path: string) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/personal/notes/${encodeURI(path)}`);
      if (!response.ok) throw new Error(await readError(response));
      setOpenNote((await response.json()) as NoteDetail);
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
              {error && <p className="form-error" role="alert">{error}</p>}
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
          {repository?.shared.connected && repository.personal?.connected && (
            <section className="notes-panel" aria-labelledby="notes-heading">
              <div>
                <p className="eyebrow">Знания</p>
                <h2 id="notes-heading">Взять себе</h2>
                <p className="admin-panel__hint">
                  Выберите заметки общей ризомы. GraphNotes запишет их в ваш git, не перезаписывая уже существующие файлы.
                </p>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              {report && (
                <p className="ingest-report" role="status">
                  Принято: {report.accepted.length}. Пропущено: {report.skipped.length}. Конфликт: {report.conflicted.length}.
                  {report.conflicted.length > 0 ? " Существующие файлы не тронуты." : ""}
                </p>
              )}
              <div className="notes-grid">
                <div>
                  <h3>Общая ризома</h3>
                  <ul className="note-list">
                    {sharedNotes.map((note) => (
                      <li key={note.path}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedPaths.includes(note.path)}
                            onChange={(event) => {
                              setSelectedPaths((current) => (
                                event.target.checked
                                  ? [...current, note.path]
                                  : current.filter((path) => path !== note.path)
                              ));
                            }}
                          />
                          <span>
                            <strong>{note.title}</strong>
                            <small>{note.path}</small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={submitting || selectedPaths.length === 0}
                    onClick={() => void takeSelected()}
                  >
                    Взять себе
                  </button>
                </div>
                <div>
                  <h3>Ваш git</h3>
                  <ul className="note-list">
                    {personalNotes.map((note) => (
                      <li key={note.path}>
                        <button className="note-link" type="button" onClick={() => void openPersonalNote(note.path)}>
                          <strong>{note.title}</strong>
                          <small>{note.path}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <form className="connect-form" onSubmit={(event) => void importFallback(event)}>
                    <label>
                      Запасной импорт (.md или ZIP)
                      <input name="file" type="file" accept=".md,.zip,text/markdown,application/zip" required />
                    </label>
                    <button className="button button--quiet" type="submit" disabled={submitting}>
                      Загрузить в git
                    </button>
                  </form>
                </div>
              </div>
              {openNote && (
                <article className="note-read">
                  <h3>{openNote.title}</h3>
                  <pre>{openNote.body}</pre>
                </article>
              )}
            </section>
          )}
          {repository?.shared.connected && (
            <section className="notes-panel" aria-labelledby="graph-heading">
              <div>
                <p className="eyebrow">Граф</p>
                <h2 id="graph-heading">Общая ризома</h2>
                <p className="admin-panel__hint">
                  Живой граф собирается из git. После пуша из Obsidian обновите страницу.
                  Координаты раскладки — только отображение, не знание.
                </p>
              </div>
              <div className="graph-actions">
                {graphCenter && (
                  <button className="button button--quiet" type="button" onClick={() => setGraphCenter(null)}>
                    Вся страница
                  </button>
                )}
                {user.role === "admin" && (
                  <button className="button button--quiet" type="button" disabled={submitting} onClick={() => void rebuildSharedIndex()}>
                    Пересобрать индекс
                  </button>
                )}
              </div>
              <GraphView
                graph={sharedGraph}
                loading={graphLoading}
                onOpen={(path, origin) => void openGraphNote(path, origin)}
                onExpand={setGraphCenter}
              />
              {openNote && (
                <article className="note-read">
                  <h3>{openNote.title}</h3>
                  <pre>{openNote.body}</pre>
                </article>
              )}
            </section>
          )}
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
        <>
        <section className="auth-layout">
          <div className="hero-copy">
            <p className="eyebrow">Связанное знание</p>
            <h1>Собирайте мысли в живую ризому.</h1>
            <p className="summary">
              {sharedLabel(repository?.shared ?? null)} Markdown остаётся в git.
              GraphNotes показывает общую ризому и помогает взять знания себе.
            </p>
            {sharedGraph && sharedGraph.nodes.length > 0 && (
              <p className="summary">
                В общей ризоме {sharedGraph.nodes.filter((node) => !node.unresolved).length} заметок
                и {sharedGraph.edges.filter((edge) => !edge.unresolved).length} связей на этой странице.
              </p>
            )}
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
        {repository?.shared.connected && (
          <section className="notes-panel" aria-labelledby="public-graph-heading">
            <div>
              <p className="eyebrow">Граф</p>
              <h2 id="public-graph-heading">Общая ризома</h2>
              <p className="admin-panel__hint">
                Читать общую ризому можно без входа. Чтобы видеть связи своего git, войдите и свяжите репозиторий.
              </p>
            </div>
            <GraphView
              graph={sharedGraph}
              loading={graphLoading}
              onOpen={(path, origin) => void openGraphNote(path, origin)}
              onExpand={setGraphCenter}
            />
            {openNote && (
              <article className="note-read">
                <h3>{openNote.title}</h3>
                <pre>{openNote.body}</pre>
              </article>
            )}
          </section>
        )}
        </>
      )}
    </main>
  );
}
