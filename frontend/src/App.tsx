import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { GraphView } from "./GraphView";
import type { GraphResponse } from "./GraphView";
import { GraphDiffView } from "./GraphDiffView";
import type { GraphDiffResponse } from "./GraphDiffView";

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

type ProposalAuthor = { id: string; username: string; display_name: string };

type Proposal = {
  id: string;
  status: string;
  summary: string;
  paths: string[];
  added: string[];
  changed: string[];
  author: ProposalAuthor;
  reason: string | null;
  created_at: string;
  updated_at: string;
  diff: { path: string; diff: string }[];
};

type DifferItem = {
  path: string;
  title: string;
  kind: "added" | "changed" | string;
};

type DifferResponse = { differences: DifferItem[] };
type ProposalListResponse = { proposals: Proposal[] };

function differKindLabel(kind: string): string {
  if (kind === "added") return "нет в общей";
  if (kind === "changed") return "отличается";
  return kind;
}

function proposalStatusLabel(status: string): string {
  switch (status) {
    case "open":
      return "открыто";
    case "accepted_pending_merge":
    case "merged_indexing":
      return "принимается";
    case "published":
      return "в общей ризоме";
    case "rejected":
      return "отклонено";
    case "changes_requested":
      return "нужны правки";
    case "conflicted":
      return "конфликт";
    case "failed":
      return "ошибка";
    default:
      return status;
  }
}

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
  const [differences, setDifferences] = useState<DifferItem[]>([]);
  const [proposedPaths, setProposedPaths] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [openProposal, setOpenProposal] = useState<Proposal | null>(null);
  const [proposalDiff, setProposalDiff] = useState<GraphDiffResponse | null>(null);
  const [proposalDiffLoading, setProposalDiffLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
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
    if (!user || !repository?.shared.connected || !repository.personal?.connected) {
      setDifferences([]);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/differ", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as DifferResponse;
      })
      .then((body) => setDifferences(body.differences))
      .catch(() => undefined);
    return () => controller.abort();
  }, [
    user,
    repository?.shared.connected,
    repository?.shared.updated_at,
    repository?.shared.index_status,
    repository?.personal?.connected,
    repository?.personal?.updated_at,
  ]);

  useEffect(() => {
    if (!user) {
      setProposals([]);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/proposals", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as ProposalListResponse;
      })
      .then((body) => setProposals(body.proposals))
      .catch(() => undefined);
    return () => controller.abort();
  }, [user, repository?.shared.updated_at]);

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

  async function proposeSelected() {
    if (proposedPaths.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths: proposedPaths,
          expected_sha: personalRevision,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setProposedPaths([]);
      const listed = await fetch("/api/proposals");
      if (listed.ok) {
        setProposals(((await listed.json()) as ProposalListResponse).proposals);
      }
      const differ = await fetch("/api/differ");
      if (differ.ok) {
        setDifferences(((await differ.json()) as DifferResponse).differences);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadProposalGraphDiff(id: string) {
    setProposalDiffLoading(true);
    try {
      const response = await fetch(`/api/graph/diff?proposal_id=${encodeURIComponent(id)}`);
      if (!response.ok) {
        setProposalDiff(null);
        return;
      }
      setProposalDiff((await response.json()) as GraphDiffResponse);
    } catch {
      setProposalDiff(null);
    } finally {
      setProposalDiffLoading(false);
    }
  }

  async function openProposalDetail(id: string) {
    setSubmitting(true);
    setError("");
    setProposalDiff(null);
    try {
      const response = await fetch(`/api/proposals/${id}`);
      if (!response.ok) throw new Error(await readError(response));
      setOpenProposal((await response.json()) as Proposal);
      await loadProposalGraphDiff(id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function decideProposal(id: string, action: "approve" | "reject" | "request-changes" | "rollback") {
    if (action !== "approve" && decisionReason.trim().length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/proposals/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: decisionReason.trim() }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const updated = (await response.json()) as Proposal;
      setOpenProposal(updated);
      setDecisionReason("");
      await loadProposalGraphDiff(id);
      const listed = await fetch("/api/proposals");
      if (listed.ok) {
        setProposals(((await listed.json()) as ProposalListResponse).proposals);
      }
      const status = await fetch("/api/repository/status");
      if (status.ok) {
        setRepository((await status.json()) as RepositoryStatusResponse);
      }
      const differ = await fetch("/api/differ");
      if (differ.ok) {
        setDifferences(((await differ.json()) as DifferResponse).differences);
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
      setProposals([]);
      setOpenProposal(null);
      setProposalDiff(null);
      setProposedPaths([]);
      setDifferences([]);
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

  const canReview = user?.role === "editor" || user?.role === "admin";

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
            <section className="notes-panel" aria-labelledby="differ-heading">
              <div>
                <p className="eyebrow">Отличия</p>
                <h2 id="differ-heading">Differ</h2>
                <p className="admin-panel__hint">
                  Сравнение вашего git с опубликованной общей ризомой в одну сторону:
                  чего в общей ещё нет или что отличается. Отметьте и предложите в очередь.
                  Личный git не меняется.
                </p>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              {differences.length === 0 ? (
                <p className="admin-panel__hint">Отличий нет — в общую предлагать нечего.</p>
              ) : (
                <ul className="note-list">
                  {differences.map((item) => (
                    <li key={item.path}>
                      <div className="note-pick">
                        <input
                          type="checkbox"
                          checked={proposedPaths.includes(item.path)}
                          onChange={(event) => {
                            setProposedPaths((current) => (
                              event.target.checked
                                ? [...current, item.path]
                                : current.filter((path) => path !== item.path)
                            ));
                          }}
                          aria-label={`Предложить ${item.title}`}
                        />
                        <button className="note-link" type="button" onClick={() => void openPersonalNote(item.path)}>
                          <strong>{item.title}</strong>
                          <small>{item.path} · {differKindLabel(item.kind)}</small>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="button button--primary"
                type="button"
                disabled={submitting || proposedPaths.length === 0}
                onClick={() => void proposeSelected()}
              >
                Предложить в общую
              </button>
              <form className="connect-form" onSubmit={(event) => void importFallback(event)}>
                <label>
                  Запасной импорт (.md или ZIP)
                  <input name="file" type="file" accept=".md,.zip,text/markdown,application/zip" required />
                </label>
                <button className="button button--quiet" type="submit" disabled={submitting}>
                  Загрузить в git
                </button>
              </form>
              {report && (
                <p className="ingest-report" role="status">
                  Принято: {report.accepted.length}. Пропущено: {report.skipped.length}. Конфликт: {report.conflicted.length}.
                </p>
              )}
              {openNote && (
                <article className="note-read">
                  <h3>{openNote.title}</h3>
                  <pre>{openNote.body}</pre>
                </article>
              )}
            </section>
          )}
          <section className="notes-panel" aria-labelledby="proposals-heading">
            <div>
              <p className="eyebrow">Публикация</p>
              <h2 id="proposals-heading">{canReview ? "Очередь предложений" : "Ваши предложения"}</h2>
              <p className="admin-panel__hint">
                Предложение берёт отмеченные отличия Differ. Личный git не меняется.
                Читатели видят общую ризому только целиком, после принятия.
              </p>
            </div>
            {proposals.length === 0 ? (
              <p className="admin-panel__hint">Пока нет предложений.</p>
            ) : (
              <ul className="proposal-list">
                {proposals.map((item) => (
                  <li key={item.id}>
                    <button className="proposal-row" type="button" onClick={() => void openProposalDetail(item.id)}>
                      <strong>{item.summary}</strong>
                      <span>{item.author.display_name} · {proposalStatusLabel(item.status)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {openProposal && (
              <article className="proposal-detail">
                <h3>{openProposal.summary}</h3>
                <p className="admin-panel__hint">
                  {openProposal.author.display_name} · {proposalStatusLabel(openProposal.status)}
                  {openProposal.reason ? ` · ${openProposal.reason}` : ""}
                </p>
                <GraphDiffView diff={proposalDiff} loading={proposalDiffLoading} />
                {openProposal.diff.map((item) => (
                  <pre key={item.path} className="proposal-diff">{item.diff || item.path}</pre>
                ))}
                {canReview && openProposal.author.id !== user.id && (
                  <div className="proposal-actions">
                    <label>
                      Причина
                      <input
                        value={decisionReason}
                        onChange={(event) => setDecisionReason(event.target.value)}
                        maxLength={255}
                      />
                    </label>
                    {(openProposal.status === "open" || openProposal.status === "conflicted" || openProposal.status === "failed" || openProposal.status === "changes_requested") && (
                      <>
                        <button className="button button--primary" type="button" disabled={submitting} onClick={() => void decideProposal(openProposal.id, "approve")}>
                          Принять
                        </button>
                        <button className="button button--danger" type="button" disabled={submitting || decisionReason.trim().length === 0} onClick={() => void decideProposal(openProposal.id, "reject")}>
                          Отклонить
                        </button>
                        <button className="button button--quiet" type="button" disabled={submitting || decisionReason.trim().length === 0} onClick={() => void decideProposal(openProposal.id, "request-changes")}>
                          Вернуть
                        </button>
                      </>
                    )}
                    {openProposal.status === "published" && (
                      <button className="button button--danger" type="button" disabled={submitting || decisionReason.trim().length === 0} onClick={() => void decideProposal(openProposal.id, "rollback")}>
                        Откатить
                      </button>
                    )}
                  </div>
                )}
              </article>
            )}
          </section>
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
              <p className="admin-panel__hint">
                <a className="note-link" href="/api/shared/archive">Скачать общую ризому (ZIP)</a>
              </p>
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
              GraphNotes показывает общую ризому. Скачайте ZIP актуальных заметок или предложите свои отличия.
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
            <p className="admin-panel__hint">
              <a className="note-link" href="/api/shared/archive">Скачать общую ризому (ZIP)</a>
            </p>
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
