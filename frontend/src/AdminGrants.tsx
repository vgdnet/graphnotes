import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { AdminUser } from "./AdminPanel";
import {
  formatAdminRights,
  grantKindLabel,
  type AdminGrantKind,
} from "./adminRights";

type GrantTab = "users" | "cards" | "tags" | "prefixes";

type AccessGrant = {
  id: string;
  user_id: string;
  username: string | null;
  kind: AdminGrantKind;
  value: string;
  created_at: string | null;
};

type CatalogCard = { path: string; title: string };
type Catalog = { paths: string[]; tags: string[]; prefixes: string[]; cards?: CatalogCard[] };

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

function nickMatches(user: AdminUser, needle: string): boolean {
  if (!needle) return true;
  const haystack = `${user.username} ${user.display_name} ${user.email}`.toLowerCase();
  return haystack.includes(needle);
}

export function AdminGrants({
  users,
  submitting,
  onError,
  onSubmitting,
  onChanged,
}: {
  users: AdminUser[];
  submitting: boolean;
  onError: (message: string) => void;
  onSubmitting: (value: boolean) => void;
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState<GrantTab>("users");
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [catalog, setCatalog] = useState<Catalog>({ paths: [], tags: [], prefixes: [], cards: [] });
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedPrefix, setSelectedPrefix] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [draftUser, setDraftUser] = useState("");
  const [draftUserQuery, setDraftUserQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [matchedUsers, setMatchedUsers] = useState<AdminUser[]>(users);
  const [taggedCards, setTaggedCards] = useState<CatalogCard[]>([]);

  async function loadCatalog(query = itemQuery, tag = "") {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (tag.trim()) params.set("tag", tag.trim());
    const response = await fetch(`/api/admin/grants/catalog?${params.toString()}`);
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as Catalog;
    setCatalog(body);
    return body;
  }

  async function loadGrants(params: URLSearchParams) {
    const response = await fetch(`/api/admin/grants?${params.toString()}`);
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { grants: AccessGrant[] };
    setGrants(body.grants);
  }

  async function searchUsers(query: string) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const response = await fetch(`/api/admin/users?${params.toString()}`);
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { users: AdminUser[] };
    setMatchedUsers(body.users);
  }

  useEffect(() => {
    void loadCatalog().catch((error: unknown) => {
      onError(error instanceof Error ? error.message : "Ошибка соединения");
    });
  }, [onError]);

  useEffect(() => {
    setMatchedUsers(users);
  }, [users]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tab === "users" && selectedUser) params.set("user_id", selectedUser);
    if (tab === "cards" && selectedPath) {
      params.set("kind", "path");
      params.set("value", selectedPath);
    }
    if (tab === "tags" && selectedTag) {
      params.set("kind", "tag");
      params.set("value", selectedTag);
    }
    if (tab === "prefixes" && selectedPrefix) {
      params.set("kind", "prefix");
      params.set("value", selectedPrefix);
    }
    if ([...params.keys()].length === 0) {
      setGrants([]);
      return;
    }
    void loadGrants(params).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : "Ошибка соединения");
    });
  }, [tab, selectedUser, selectedPath, selectedTag, selectedPrefix, onError]);

  useEffect(() => {
    if (tab !== "tags" || !selectedTag) {
      setTaggedCards([]);
      return;
    }
    const params = new URLSearchParams();
    params.set("tag", selectedTag);
    void fetch(`/api/admin/grants/catalog?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as Catalog;
      })
      .then((body) => setTaggedCards(body.cards || body.paths.map((path) => ({ path, title: path }))))
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : "Ошибка соединения");
      });
  }, [tab, selectedTag, onError]);

  const visibleUsers = useMemo(() => {
    const needle = userQuery.trim().toLowerCase();
    const source = matchedUsers.length ? matchedUsers : users;
    const filtered = source.filter((user) => nickMatches(user, needle));
    return filtered.slice(0, 80);
  }, [matchedUsers, users, userQuery]);

  const catalogCards = useMemo(() => {
    const cards = catalog.cards?.length
      ? catalog.cards
      : catalog.paths.map((path) => ({ path, title: path }));
    const needle = itemQuery.trim().toLowerCase();
    const filtered = needle
      ? cards.filter((card) => (
        card.path.toLowerCase().includes(needle) || card.title.toLowerCase().includes(needle)
      ))
      : cards;
    return filtered.slice(0, 80);
  }, [catalog, itemQuery]);

  const catalogTags = useMemo(() => {
    const needle = itemQuery.trim().toLowerCase();
    const filtered = needle
      ? catalog.tags.filter((tag) => tag.toLowerCase().includes(needle))
      : catalog.tags;
    return filtered.slice(0, 80);
  }, [catalog.tags, itemQuery]);

  const catalogPrefixes = useMemo(() => {
    const needle = itemQuery.trim().toLowerCase();
    const filtered = needle
      ? catalog.prefixes.filter((prefix) => prefix.toLowerCase().includes(needle))
      : catalog.prefixes;
    return filtered.slice(0, 80);
  }, [catalog.prefixes, itemQuery]);

  const draftUserChoices = useMemo(() => {
    const needle = draftUserQuery.trim().toLowerCase();
    const source = users.length ? users : matchedUsers;
    return source.filter((user) => nickMatches(user, needle)).slice(0, 80);
  }, [users, matchedUsers, draftUserQuery]);

  const selectedAccount = visibleUsers.find((user) => user.id === selectedUser)
    || users.find((user) => user.id === selectedUser)
    || matchedUsers.find((user) => user.id === selectedUser);

  async function addGrant(kind: AdminGrantKind, userId: string, value: string) {
    onSubmitting(true);
    onError("");
    try {
      const response = await fetch("/api/admin/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, kind, value }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setDraftValue("");
      const params = new URLSearchParams();
      if (tab === "users") params.set("user_id", userId);
      if (tab === "cards") {
        params.set("kind", "path");
        params.set("value", value);
      }
      if (tab === "tags") {
        params.set("kind", "tag");
        params.set("value", value);
      }
      if (tab === "prefixes") {
        params.set("kind", "prefix");
        params.set("value", value);
      }
      await loadGrants(params);
      await loadCatalog(itemQuery);
      await searchUsers(userQuery);
      onChanged?.();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Ошибка соединения");
    } finally {
      onSubmitting(false);
    }
  }

  async function removeGrant(id: string) {
    onSubmitting(true);
    onError("");
    try {
      const response = await fetch(`/api/admin/grants/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readError(response));
      setGrants((items) => items.filter((item) => item.id !== id));
      await searchUsers(userQuery);
      onChanged?.();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Ошибка соединения");
    } finally {
      onSubmitting(false);
    }
  }

  function onAddForUser(event: FormEvent) {
    event.preventDefault();
    if (!selectedUser || !draftValue.trim()) return;
    const kind: AdminGrantKind = draftValue.includes("/") && !draftValue.endsWith(".md")
      ? "prefix"
      : draftValue.endsWith(".md")
        ? "path"
        : "tag";
    void addGrant(kind, selectedUser, draftValue.trim());
  }

  function onAddUserToTarget(event: FormEvent, kind: AdminGrantKind, value: string) {
    event.preventDefault();
    if (!draftUser || !value) return;
    void addGrant(kind, draftUser, value);
  }

  function userPicker() {
    return (
      <>
        <label>
          Поиск ника
          <input
            value={draftUserQuery}
            onChange={(event) => setDraftUserQuery(event.target.value)}
            placeholder="ник"
          />
        </label>
        <label>
          Пользователь
          <select value={draftUser} onChange={(event) => setDraftUser(event.target.value)}>
            <option value="">выберите</option>
            {draftUserChoices.map((user) => (
              <option key={user.id} value={user.id}>@{user.username} · {user.role}</option>
            ))}
          </select>
        </label>
      </>
    );
  }

  return (
    <div className="admin-section">
      <p className="admin-panel__hint">
        Поиск: ник пользователя, путь/заголовок карточки или тег. В строке учётки — роль, автор, активность и гранты.
        Write-грант на общую: путь, тег или папка. Пустой список — не вся ризома. Только admin.
      </p>
      <nav className="admin-nav" aria-label="Способы выдачи доступа">
        <button className={tab === "users" ? "tab tab--active" : "tab"} type="button" onClick={() => setTab("users")}>
          По пользователям
        </button>
        <button className={tab === "cards" ? "tab tab--active" : "tab"} type="button" onClick={() => setTab("cards")}>
          По карточкам
        </button>
        <button className={tab === "tags" ? "tab tab--active" : "tab"} type="button" onClick={() => setTab("tags")}>
          По тегам
        </button>
        <button className={tab === "prefixes" ? "tab tab--active" : "tab"} type="button" onClick={() => setTab("prefixes")}>
          По папкам
        </button>
      </nav>

      {tab === "users" && (
        <>
          <form
            className="admin-filters"
            onSubmit={(event) => {
              event.preventDefault();
              void searchUsers(userQuery).catch((error: unknown) => {
                onError(error instanceof Error ? error.message : "Ошибка соединения");
              });
            }}
          >
            <label>
              Поиск по нику
              <input
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="ник, логин, имя"
              />
            </label>
            <button className="button button--quiet" type="submit">Найти</button>
          </form>
          <p className="admin-panel__hint">Найдено учёток: {visibleUsers.length}</p>
          <div className="admin-pick-list" role="listbox" aria-label="Пользователи">
            {visibleUsers.length === 0 && (
              <p className="admin-panel__hint">Никого не нашли. Уточните ник.</p>
            )}
            {visibleUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                className={user.id === selectedUser ? "admin-pick admin-pick--active" : "admin-pick"}
                onClick={() => setSelectedUser(user.id)}
              >
                <strong>@{user.username}</strong>
                <span>{user.display_name}</span>
                <span className="admin-pick__rights">{formatAdminRights(user)}</span>
              </button>
            ))}
          </div>
          {selectedAccount && (
            <>
              <p className="user-row__rights">{formatAdminRights(selectedAccount)}</p>
              <form className="admin-filters" onSubmit={onAddForUser}>
                <label>
                  Путь, тег или папка
                  <input
                    value={draftValue}
                    onChange={(event) => setDraftValue(event.target.value)}
                    placeholder="психология/ или card.md или clinic"
                  />
                </label>
                <button className="button button--quiet" type="submit" disabled={submitting}>Выдать</button>
              </form>
            </>
          )}
        </>
      )}

      {tab === "cards" && (
        <>
          <form
            className="admin-filters"
            onSubmit={(event) => {
              event.preventDefault();
              void loadCatalog(itemQuery).catch((error: unknown) => {
                onError(error instanceof Error ? error.message : "Ошибка соединения");
              });
            }}
          >
            <label>
              Поиск карточки
              <input
                value={itemQuery}
                onChange={(event) => setItemQuery(event.target.value)}
                placeholder="путь или заголовок"
              />
            </label>
            <button className="button button--quiet" type="submit">Найти</button>
          </form>
          <p className="admin-panel__hint">Найдено карточек: {catalogCards.length}</p>
          <div className="admin-pick-list" role="listbox" aria-label="Карточки">
            {catalogCards.length === 0 && (
              <p className="admin-panel__hint">Карточек нет. Уточните путь или заголовок.</p>
            )}
            {catalogCards.map((card) => (
              <button
                key={card.path}
                type="button"
                className={card.path === selectedPath ? "admin-pick admin-pick--active" : "admin-pick"}
                onClick={() => setSelectedPath(card.path)}
              >
                <strong>{card.title}</strong>
                <span>{card.path}</span>
              </button>
            ))}
          </div>
          {selectedPath && (
            <form className="admin-filters" onSubmit={(event) => onAddUserToTarget(event, "path", selectedPath)}>
              {userPicker()}
              <button className="button button--quiet" type="submit" disabled={submitting}>Выдать карточку</button>
            </form>
          )}
        </>
      )}

      {tab === "tags" && (
        <>
          <form
            className="admin-filters"
            onSubmit={(event) => {
              event.preventDefault();
              void loadCatalog(itemQuery).catch((error: unknown) => {
                onError(error instanceof Error ? error.message : "Ошибка соединения");
              });
            }}
          >
            <label>
              Поиск тега
              <input
                value={itemQuery}
                onChange={(event) => setItemQuery(event.target.value)}
                placeholder="имя тега"
              />
            </label>
            <button className="button button--quiet" type="submit">Найти</button>
          </form>
          <p className="admin-panel__hint">Найдено тегов: {catalogTags.length}</p>
          <div className="admin-pick-list" role="listbox" aria-label="Теги">
            {catalogTags.length === 0 && (
              <p className="admin-panel__hint">Тегов нет. Уточните имя.</p>
            )}
            {catalogTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={tag === selectedTag ? "admin-pick admin-pick--active" : "admin-pick"}
                onClick={() => setSelectedTag(tag)}
              >
                <strong>{tag}</strong>
              </button>
            ))}
          </div>
          {selectedTag && (
            <>
              <form className="admin-filters" onSubmit={(event) => onAddUserToTarget(event, "tag", selectedTag)}>
                {userPicker()}
                <button className="button button--quiet" type="submit" disabled={submitting}>Выдать тег</button>
              </form>
              <p className="admin-panel__hint">Карточки с тегом «{selectedTag}»: {taggedCards.length}</p>
              <div className="admin-pick-list" role="list" aria-label="Карточки тега">
                {taggedCards.map((card) => (
                  <article className="admin-pick" key={card.path}>
                    <strong>{card.title}</strong>
                    <span>{card.path}</span>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "prefixes" && (
        <>
          <form
            className="admin-filters"
            onSubmit={(event) => {
              event.preventDefault();
              const prefix = itemQuery.trim() || selectedPrefix;
              if (prefix) setSelectedPrefix(prefix.endsWith("/") ? prefix : `${prefix}/`);
              void loadCatalog(itemQuery).catch((error: unknown) => {
                onError(error instanceof Error ? error.message : "Ошибка соединения");
              });
            }}
          >
            <label>
              Поиск папки
              <input
                value={itemQuery}
                onChange={(event) => setItemQuery(event.target.value)}
                placeholder="психология/"
              />
            </label>
            <button className="button button--quiet" type="submit">Найти</button>
          </form>
          <p className="admin-panel__hint">Найдено папок: {catalogPrefixes.length}</p>
          <div className="admin-pick-list" role="listbox" aria-label="Папки">
            {catalogPrefixes.map((prefix) => (
              <button
                key={prefix}
                type="button"
                className={prefix === selectedPrefix ? "admin-pick admin-pick--active" : "admin-pick"}
                onClick={() => {
                  setSelectedPrefix(prefix);
                  setDraftValue(prefix);
                }}
              >
                <strong>{prefix}</strong>
              </button>
            ))}
          </div>
          <form className="admin-filters" onSubmit={(event) => {
            event.preventDefault();
            const prefix = draftValue.trim() || selectedPrefix;
            if (!draftUser || !prefix) return;
            setSelectedPrefix(prefix.endsWith("/") ? prefix : `${prefix}/`);
            void addGrant("prefix", draftUser, prefix);
          }}>
            <label>
              Префикс
              <input
                value={draftValue}
                onChange={(event) => setDraftValue(event.target.value)}
                placeholder="психология/"
              />
            </label>
            {userPicker()}
            <button className="button button--quiet" type="submit" disabled={submitting}>Выдать папку</button>
          </form>
        </>
      )}

      <div className="user-list">
        {grants.length === 0 && (
          <p className="admin-panel__hint">Нет грантов для этого выбора.</p>
        )}
        {grants.map((grant) => (
          <article className="user-row user-row--admin" key={grant.id}>
            <div className="user-row__identity">
              <strong>@{grant.username || grant.user_id}</strong>
              <span>{grantKindLabel(grant.kind)} · {grant.value}</span>
            </div>
            <div className="user-row__actions">
              <button
                className="button button--danger"
                type="button"
                disabled={submitting}
                onClick={() => void removeGrant(grant.id)}
              >
                Снять
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
