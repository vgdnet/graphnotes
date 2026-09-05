import { useEffect, useState } from "react";
import type { FormEvent } from "react";

export type AdminRole = "user" | "editor" | "admin";

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  display_name: string;
  phone: string | null;
  telegram: string | null;
  role: AdminRole;
  is_active: boolean;
  is_author: boolean;
  email_verified_at: string | null;
  last_login_at: string | null;
  session_count: number;
  created_at?: string;
};

type AdminUsersResponse = { users: AdminUser[]; total: number };
type AuditEventItem = {
  id: string;
  action: string;
  actor_user_id: string | null;
  actor_username: string | null;
  target_user_id: string | null;
  subject_username: string | null;
  details: Record<string, unknown>;
  created_at: string;
};
type AuditEventListResponse = { events: AuditEventItem[]; total: number };
type AdminContributionsResponse = {
  users: {
    user: { id: string };
    stats: { notes: number; added: number; accepted: number; links: number };
    review: { accepted: number; rejected: number; returned: number; rolled_back: number } | null;
  }[];
};
type OperatorStatus = {
  smtp: {
    configured: boolean;
    host?: string | null;
    port?: number | null;
    from_address?: string | null;
    use_tls?: boolean | null;
    public_base_url?: string | null;
  };
  health: { status: string; database: string };
  shared_repository: { connected: boolean; owner?: string; name?: string; status?: string; index_status?: string } | null;
  public_base_url: string | null;
};

type AdminSection = "users" | "journal" | "operator";

const ACTION_LABELS: Record<string, string> = {
  "admin.user_role_changed": "смена роли",
  "admin.user_active_changed": "блокировка / активация",
  "admin.user_password_set": "смена пароля",
  "admin.user_created": "создание учётки",
  "admin.user_sessions_revoked": "сброс сессий",
  "admin.bootstrap_succeeded": "назначение admin",
  "auth.registration_succeeded": "регистрация",
  "auth.registration_failed": "отказ в регистрации",
  "auth.login_succeeded": "вход",
  "auth.login_failed": "отказ во входе",
  "auth.logout": "выход",
  "auth.email_confirmed": "подтверждение почты",
  "mail.confirmation_sent": "письмо подтверждения",
  "mail.code_sent": "письмо со кодом",
  "mail.test_sent": "проверочное письмо",
  "mail.test_failed": "ошибка проверочного письма",
  "index.rebuild": "пересборка индекса",
};

function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((item) => JSON.stringify(item)).join("; ");
  } catch {
    // non-JSON
  }
  return "Не удалось выполнить запрос. Попробуйте ещё раз.";
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru");
}

type AdminPanelProps = {
  currentUserId: string;
  submitting: boolean;
  error: string;
  onError: (message: string) => void;
  onSubmitting: (value: boolean) => void;
  onCurrentUserUpdated: (user: AdminUser) => void;
  onSignedOut: () => void;
  onConnectShared: () => Promise<void>;
};

export function AdminPanel({
  currentUserId,
  submitting,
  error,
  onError,
  onSubmitting,
  onCurrentUserUpdated,
  onSignedOut,
  onConnectShared,
}: AdminPanelProps) {
  const [section, setSection] = useState<AdminSection>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [contributions, setContributions] = useState<AdminContributionsResponse | null>(null);
  const [audit, setAudit] = useState<AuditEventItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [operator, setOperator] = useState<OperatorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | AdminRole>("");
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [auditAction, setAuditAction] = useState("");
  const [auditActor, setAuditActor] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditSince, setAuditSince] = useState("");
  const [auditUntil, setAuditUntil] = useState("");
  const [testTo, setTestTo] = useState("");
  const [mailNote, setMailNote] = useState("");

  async function loadUsers() {
    const params = new URLSearchParams();
    if (userQuery.trim()) params.set("q", userQuery.trim());
    if (roleFilter) params.set("role", roleFilter);
    if (activeFilter) params.set("is_active", activeFilter);
    const response = await fetch(`/api/admin/users?${params.toString()}`);
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as AdminUsersResponse;
    setUsers(body.users);
    setUserTotal(body.total);
  }

  async function loadJournal() {
    const params = new URLSearchParams();
    if (auditAction.trim()) params.set("action", auditAction.trim());
    if (auditActor.trim()) params.set("actor", auditActor.trim());
    if (auditQuery.trim()) params.set("q", auditQuery.trim());
    if (auditSince) params.set("since", new Date(auditSince).toISOString());
    if (auditUntil) params.set("until", new Date(auditUntil).toISOString());
    const response = await fetch(`/api/admin/audit?${params.toString()}`);
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as AuditEventListResponse;
    setAudit(body.events);
    setAuditTotal(body.total);
  }

  async function loadOperator() {
    const response = await fetch("/api/admin/operator");
    if (!response.ok) throw new Error(await readError(response));
    setOperator((await response.json()) as OperatorStatus);
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void Promise.all([
      fetch("/api/admin/contributions", { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as AdminContributionsResponse;
      }),
      loadUsers(),
      loadJournal(),
      loadOperator(),
    ])
      .then(([contrib]) => setContributions(contrib))
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          onError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // first load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateManagedUser(managedUser: AdminUser, change: { role?: AdminRole; is_active?: boolean }) {
    onSubmitting(true);
    onError("");
    try {
      const response = await fetch(`/api/admin/users/${managedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!response.ok) throw new Error(await readError(response));
      const updated = (await response.json()) as AdminUser;
      setUsers((items) => items.map((item) => (
        item.id === updated.id
          ? { ...item, ...updated, session_count: change.is_active === false ? 0 : item.session_count }
          : item
      )));
      if (updated.id === currentUserId) {
        if (!updated.is_active) onSignedOut();
        else onCurrentUserUpdated(updated);
      }
      await loadJournal();
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      onSubmitting(false);
    }
  }

  async function setManagedPassword(managedUser: AdminUser) {
    const password = (passwordDrafts[managedUser.id] || "").trim();
    if (password.length < 12) {
      onError("Новый пароль — минимум 12 символов.");
      return;
    }
    onSubmitting(true);
    onError("");
    try {
      const response = await fetch(`/api/admin/users/${managedUser.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setPasswordDrafts((drafts) => ({ ...drafts, [managedUser.id]: "" }));
      setUsers((items) => items.map((item) => (
        item.id === managedUser.id ? { ...item, session_count: 0 } : item
      )));
      if (managedUser.id === currentUserId) {
        onSignedOut();
        return;
      }
      await loadJournal();
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      onSubmitting(false);
    }
  }

  async function revokeSessions(managedUser: AdminUser) {
    onSubmitting(true);
    onError("");
    try {
      const response = await fetch(`/api/admin/users/${managedUser.id}/sessions/revoke`, { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { revoked: number };
      setUsers((items) => items.map((item) => (
        item.id === managedUser.id ? { ...item, session_count: 0 } : item
      )));
      if (managedUser.id === currentUserId) {
        onSignedOut();
        return;
      }
      await loadJournal();
      onError(body.revoked ? "" : "");
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      onSubmitting(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    onSubmitting(true);
    onError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: data.get("username"),
          display_name: data.get("displayName"),
          email: data.get("email"),
          password: data.get("password"),
          role: data.get("role") || "user",
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      form.reset();
      await loadUsers();
      await loadJournal();
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      onSubmitting(false);
    }
  }

  async function sendTestMail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmitting(true);
    onError("");
    setMailNote("");
    try {
      const response = await fetch("/api/admin/mail/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMailNote("Проверочное письмо отправлено.");
      await loadJournal();
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      onSubmitting(false);
    }
  }

  async function rebuildIndex() {
    onSubmitting(true);
    onError("");
    try {
      const response = await fetch("/api/index/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "shared" }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await loadOperator();
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      onSubmitting(false);
    }
  }

  return (
    <section className="admin-panel admin-panel--app" aria-labelledby="admin-heading">
      <div className="admin-panel__header">
        <div>
          <p className="eyebrow">Администрирование</p>
          <h2 id="admin-heading">Управление инсталляцией</h2>
          <p className="admin-panel__hint">
            Только admin. Роли глобальны: user &lt; editor &lt; admin.
            Журнал — в базе GraphNotes, не лог контейнера. Пароли и SMTP-секреты сюда не попадают.
          </p>
        </div>
        <nav className="admin-nav" aria-label="Разделы администрирования">
          <button className={section === "users" ? "tab tab--active" : "tab"} type="button" onClick={() => setSection("users")}>
            Пользователи
          </button>
          <button className={section === "journal" ? "tab tab--active" : "tab"} type="button" onClick={() => setSection("journal")}>
            Журнал
          </button>
          <button className={section === "operator" ? "tab tab--active" : "tab"} type="button" onClick={() => setSection("operator")}>
            Установка
          </button>
        </nav>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="admin-panel__hint">Загружаем админку…</p>}

      {section === "users" && (
        <div className="admin-section">
          <form
            className="admin-filters"
            onSubmit={(event) => {
              event.preventDefault();
              void loadUsers().catch((requestError: unknown) => {
                onError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
              });
            }}
          >
            <label>
              Поиск
              <input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="логин, почта, имя" />
            </label>
            <label>
              Роль
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "" | AdminRole)}>
                <option value="">все</option>
                <option value="user">user</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label>
              Статус
              <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as "" | "true" | "false")}>
                <option value="">все</option>
                <option value="true">активные</option>
                <option value="false">заблокированные</option>
              </select>
            </label>
            <button className="button button--quiet" type="submit">Найти</button>
          </form>
          <p className="admin-panel__hint">Найдено: {userTotal}</p>

          <form className="admin-create" onSubmit={(event) => void createUser(event)}>
            <h3>Создать учётку</h3>
            <p className="admin-panel__hint">
              Публичная регистрация всегда даёт только user. Здесь admin может сразу назначить роль.
              Пароль в журнал не пишется.
            </p>
            <div className="admin-create__grid">
              <label>Логин <input name="username" minLength={3} maxLength={32} required autoComplete="off" /></label>
              <label>Имя <input name="displayName" maxLength={80} required /></label>
              <label>Почта <input name="email" type="email" maxLength={320} required /></label>
              <label>Пароль <input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" /></label>
              <label>
                Роль
                <select name="role" defaultValue="user">
                  <option value="user">user</option>
                  <option value="editor">editor</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <button className="button button--primary" type="submit" disabled={submitting}>Создать</button>
            </div>
          </form>

          <div className="user-list">
            {users.map((managedUser) => {
              const contribRow = contributions?.users.find((row) => row.user.id === managedUser.id);
              return (
                <article className="user-row user-row--admin" key={managedUser.id}>
                  <div className="user-row__identity">
                    <strong>{managedUser.display_name}</strong>
                    <span>@{managedUser.username} · {managedUser.email}{managedUser.phone ? ` · ${managedUser.phone}` : ""}{managedUser.telegram ? ` · ${managedUser.telegram}` : ""}</span>
                    <span>
                      {managedUser.is_active ? "активен" : "заблокирован"}
                      {managedUser.email_verified_at ? " · почта подтверждена" : " · почта не подтверждена"}
                      {` · вход ${formatWhen(managedUser.last_login_at)}`}
                      {` · сессий ${managedUser.session_count}`}
                    </span>
                  </div>
                  <label>
                    Роль
                    <select
                      value={managedUser.role}
                      disabled={submitting}
                      onChange={(event) => void updateManagedUser(managedUser, { role: event.target.value as AdminRole })}
                    >
                      <option value="user">user</option>
                      <option value="editor">editor</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>
                  <div className="user-row__actions">
                    <button
                      className={managedUser.is_active ? "button button--danger" : "button button--quiet"}
                      disabled={submitting}
                      type="button"
                      onClick={() => void updateManagedUser(managedUser, { is_active: !managedUser.is_active })}
                    >
                      {managedUser.is_active ? "Заблокировать" : "Активировать"}
                    </button>
                    <button
                      className="button button--quiet"
                      disabled={submitting || managedUser.session_count === 0}
                      type="button"
                      onClick={() => void revokeSessions(managedUser)}
                    >
                      Сбросить сессии
                    </button>
                  </div>
                  {contribRow && (
                    <p className="user-row__stats">
                      Карточки {contribRow.stats.notes} · добавлено {contribRow.stats.added} ·
                      принято {contribRow.stats.accepted} · связи {contribRow.stats.links}
                      {contribRow.review
                        ? ` · решения: принял ${contribRow.review.accepted}, отклонил ${contribRow.review.rejected}, вернул ${contribRow.review.returned}, откатил ${contribRow.review.rolled_back}`
                        : ""}
                    </p>
                  )}
                  <form
                    className="user-row__password"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void setManagedPassword(managedUser);
                    }}
                  >
                    <label>
                      Новый пароль
                      <input
                        type="password"
                        minLength={12}
                        maxLength={128}
                        autoComplete="new-password"
                        value={passwordDrafts[managedUser.id] || ""}
                        disabled={submitting}
                        onChange={(event) => setPasswordDrafts((drafts) => ({
                          ...drafts,
                          [managedUser.id]: event.target.value,
                        }))}
                      />
                    </label>
                    <button className="button button--quiet" type="submit" disabled={submitting}>
                      Сменить пароль
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {section === "journal" && (
        <div className="admin-section">
          <h3>Журнал действий</h3>
          <p className="admin-panel__hint">
            Кто, когда, над кем, какое действие. Открытый пароль, cookie и SMTP-секреты в записи не попадают.
          </p>
          <form
            className="admin-filters"
            onSubmit={(event) => {
              event.preventDefault();
              void loadJournal().catch((requestError: unknown) => {
                onError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
              });
            }}
          >
            <label>Действие <input value={auditAction} onChange={(event) => setAuditAction(event.target.value)} placeholder="admin.user_role_changed" /></label>
            <label>Кто <input value={auditActor} onChange={(event) => setAuditActor(event.target.value)} placeholder="логин или почта" /></label>
            <label>Текст <input value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder="кого / действие" /></label>
            <label>С <input type="datetime-local" value={auditSince} onChange={(event) => setAuditSince(event.target.value)} /></label>
            <label>По <input type="datetime-local" value={auditUntil} onChange={(event) => setAuditUntil(event.target.value)} /></label>
            <button className="button button--quiet" type="submit">Отфильтровать</button>
          </form>
          <p className="admin-panel__hint">Записей: {auditTotal}</p>
          {audit.length === 0 ? (
            <p className="admin-panel__hint">Пока нет записей.</p>
          ) : (
            <div className="audit-log">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Когда</th>
                    <th>Кто</th>
                    <th>Действие</th>
                    <th>Кого</th>
                    <th>Детали</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((event) => (
                    <tr key={event.id}>
                      <td>{formatWhen(event.created_at)}</td>
                      <td>{event.actor_username ? `@${event.actor_username}` : "—"}</td>
                      <td>{auditActionLabel(event.action)}</td>
                      <td>{event.subject_username ? `@${event.subject_username}` : "—"}</td>
                      <td>{Object.keys(event.details).length ? JSON.stringify(event.details) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === "operator" && operator && (
        <div className="admin-section">
          <h3>Установка</h3>
          <div className="stat-grid">
            <div className="stat-card">
              <strong>{operator.health.status}</strong>
              <span>приложение</span>
            </div>
            <div className="stat-card">
              <strong>{operator.health.database}</strong>
              <span>база</span>
            </div>
            <div className="stat-card">
              <strong>{operator.smtp.configured ? "SMTP есть" : "SMTP нет"}</strong>
              <span>{operator.smtp.host || "письма не обещаны"}</span>
            </div>
            <div className="stat-card">
              <strong>{operator.shared_repository ? operator.shared_repository.name : "нет"}</strong>
              <span>общая ризома</span>
            </div>
          </div>
          <p className="admin-panel__hint">
            SMTP: {operator.smtp.configured
              ? `${operator.smtp.from_address} через ${operator.smtp.host}:${operator.smtp.port}`
              : "не настроен; вход паролем работает, письма подтверждения и кода нет."}
            {operator.public_base_url ? ` Публичный URL: ${operator.public_base_url}.` : " GRAPHNOTES_PUBLIC_BASE_URL не задан — в письме будет только код."}
          </p>
          <div className="settings-actions">
            <button className="button button--quiet" type="button" onClick={() => void onConnectShared()} disabled={submitting}>
              Подключить общую ризому
            </button>
            <button className="button button--quiet" type="button" onClick={() => void rebuildIndex()} disabled={submitting}>
              Пересобрать индекс
            </button>
          </div>
          <form className="admin-create" onSubmit={(event) => void sendTestMail(event)}>
            <h3>Проверочное письмо</h3>
            <p className="admin-panel__hint">Отправить короткое письмо с ящика инсталляции. Секрет SMTP в ответ не попадает.</p>
            <div className="admin-create__grid">
              <label>Куда <input type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} required /></label>
              <button className="button button--primary" type="submit" disabled={submitting || !operator.smtp.configured}>
                Отправить
              </button>
            </div>
            {mailNote && <p className="admin-panel__hint" role="status">{mailNote}</p>}
          </form>
        </div>
      )}
    </section>
  );
}
