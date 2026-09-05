import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { GraphView } from "./GraphView";
import type { FilterKind, GraphResponse } from "./GraphView";
import { GraphDiffView } from "./GraphDiffView";
import type { GraphDiffResponse } from "./GraphDiffView";
import { MarkdownBody } from "./MarkdownBody";
import { CardSearch } from "./CardSearch";
import { cardApiUrl, cardHash, cardSearchHash, parseCardRoute } from "./cardRoute";
import { ThemeSwitcher } from "./ThemeSwitcher";
import {
  applyTheme,
  persistTheme,
  resolveTheme,
  storedTheme,
  systemTheme,
  type ThemeName,
} from "./theme";

type HealthState = "checking" | "online" | "offline";
type AuthMode = "login" | "register";
type ShellView = "graph" | "settings" | "differ" | "queue" | "admin" | "card" | "search";
type SettingsBlock = "profile" | "git" | "contract";

type User = {
  id: string;
  username: string;
  email: string;
  display_name: string;
  phone: string | null;
  telegram: string | null;
  phone_public: boolean;
  telegram_public: boolean;
  website: string | null;
  role: "user" | "editor" | "admin";
  is_active: boolean;
  is_author: boolean;
  author_contract_version: string | null;
  author_contract_accepted_at: string | null;
  author_contract_withdrawn_at: string | null;
};

type AuthorContract = {
  version: string;
  title: string;
  responsibility: string;
  deposit: string;
  withdraw: string;
};

type AdminUsersResponse = { users: User[] };
type AuditEventItem = {
  id: string;
  action: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  subject_username: string | null;
  details: Record<string, unknown>;
  created_at: string;
};
type AuditEventListResponse = { events: AuditEventItem[] };

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
  locked_links?: string[];
  warnings: string[];
  locked?: boolean;
  closed?: boolean;
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

type ContributionState = "personal" | "proposed" | "accepted";
type ContributionNode = {
  path: string;
  title: string;
  tags: string[];
  state: ContributionState;
};
type ContributionEdge = {
  source: string;
  target: string;
  type: string;
  state: ContributionState;
  unresolved: boolean;
};
type ContributionProposal = { id: string; status: string; summary: string; paths: string[] };
type ContributionStats = {
  notes: number;
  added: number;
  accepted: number;
  links: number;
  links_accepted: number;
};
type ReviewDecision = {
  proposal_id: string;
  action: "approved" | "rejected" | "returned" | "rolled_back" | string;
  status: string;
  summary: string;
  paths: string[];
  links: { source: string; target: string }[];
};
type ReviewStats = {
  accepted: number;
  rejected: number;
  returned: number;
  rolled_back: number;
  decisions: ReviewDecision[];
};
type ContributionsResponse = {
  notes: ContributionNode[];
  edges?: ContributionEdge[];
  proposals: ContributionProposal[];
  stats: ContributionStats;
  review: ReviewStats | null;
};
type ContributionUserRef = { id: string; username: string; display_name: string; role: string };
type NoteFeedEvent = {
  id: string;
  kind: string;
  path: string;
  other_path: string | null;
  proposal_id: string | null;
  created_at: string;
  actor: { id: string; username: string; display_name: string } | null;
};
type NoteCommentItem = {
  id: string;
  path: string;
  body: string;
  status: string;
  created_at: string;
  author: { id: string; username: string; display_name: string };
};
type UserCard = {
  user: {
    id: string;
    username: string;
    display_name: string;
    role: string;
    is_author: boolean;
    website?: string | null;
    phone?: string | null;
    telegram?: string | null;
  };
  self: boolean;
  stats: ContributionStats;
  notes: { path: string; title: string; state: ContributionState }[];
  review: ReviewStats | null;
  closed_count: number | null;
};
type AdminContributionsResponse = {
  users: {
    user: ContributionUserRef;
    stats: ContributionStats;
    review: ReviewStats | null;
    notes: ContributionNode[];
    links: ContributionEdge[];
  }[];
};
type UploadEventItem = { path: string; content_hash: string; created_at: string };
type UploadHistoryResponse = { events: UploadEventItem[] };

function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "admin.user_role_changed": "смена роли",
    "admin.user_active_changed": "блокировка / активация",
    "admin.user_password_set": "смена пароля",
    "admin.bootstrap_succeeded": "назначение admin",
    "auth.registration_succeeded": "регистрация",
    "auth.registration_failed": "отказ в регистрации",
    "auth.login_succeeded": "вход",
    "auth.login_failed": "отказ во входе",
    "auth.logout": "выход",
    "index.rebuild": "пересборка индекса",
  };
  return labels[action] || action;
}

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

function contributionStateLabel(state: string): string {
  if (state === "personal") return "только в личном слое";
  if (state === "proposed") return "предложено";
  if (state === "accepted") return "принято в общую";
  return state;
}

function reviewActionLabel(action: string): string {
  switch (action) {
    case "approved":
      return "принял";
    case "rejected":
      return "отклонил";
    case "returned":
      return "вернул";
    case "rolled_back":
      return "откатил";
    default:
      return action;
  }
}

function sharedLabel(status: RepositoryStatus | null): string {
  if (!status?.connected) return "Общая ризома ещё не подключена.";
  if (status.has_content) return "Общая ризома доступна.";
  return "Общая ризома подключена, заметок пока нет.";
}

function personalLabel(status: RepositoryStatus | null): string {
  if (!status?.connected) return "Личный git не связан — можно загрузить .md в личный слой без git.";
  if (status.has_content) return `Связан git ${status.owner}/${status.name}.`;
  return `Git ${status.owner}/${status.name} связан, коммитов пока нет.`;
}

function AuthorContractCopy({ contract }: { contract: AuthorContract | null }) {
  if (!contract) {
    return (
      <div className="contract-copy">
        <p>Автор отвечает за содержание своих заметок и связанных связей.</p>
        <p>Принятие фиксирует авторство вклада: кто и когда принял договор.</p>
        <p>Статус автора можно отозвать; новые вклады блокируются до повторного принятия.</p>
      </div>
    );
  }
  return (
    <div className="contract-copy">
      <p><strong>{contract.title}</strong> · версия {contract.version}</p>
      <p>{contract.responsibility}</p>
      <p>{contract.deposit}</p>
      <p>{contract.withdraw}</p>
    </div>
  );
}

function formatDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string" && item.trim()) return item;
        if (item && typeof item === "object" && "msg" in item) {
          const message = (item as { msg: unknown }).msg;
          if (typeof message === "string" && message.trim()) return message;
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join("; ") : null;
  }
  if (detail && typeof detail === "object" && "msg" in detail) {
    const message = (detail as { msg: unknown }).msg;
    if (typeof message === "string" && message.trim()) return message;
  }
  return null;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    const formatted = formatDetail(body.detail);
    if (formatted) return formatted;
  } catch {
    // HTML 413 from nginx, plaintext 500, or a non-object body.
  }
  if (response.status === 413) return "Файл слишком большой. ZIP — до 2 МиБ.";
  return "Не удалось выполнить запрос. Попробуйте ещё раз.";
}

export function App() {
  const [health, setHealth] = useState<HealthState>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [view, setView] = useState<ShellView>(() => {
    const route = parseCardRoute(window.location.hash);
    if (route.kind === "card") return "card";
    if (route.kind === "search") return "search";
    return "graph";
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsBlock, setSettingsBlock] = useState<SettingsBlock>("profile");
  const [mode, setMode] = useState<AuthMode>("login");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminContributions, setAdminContributions] = useState<AdminContributionsResponse | null>(null);
  const [adminAudit, setAdminAudit] = useState<AuditEventItem[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [repository, setRepository] = useState<RepositoryStatusResponse | null>(null);
  const [sharedNotes, setSharedNotes] = useState<NoteProjection[]>([]);
  const [personalNotes, setPersonalNotes] = useState<NoteProjection[]>([]);
  const [personalRevision, setPersonalRevision] = useState<string | null>(null);
  const [differences, setDifferences] = useState<DifferItem[]>([]);
  const [differLoading, setDifferLoading] = useState(false);
  const [proposedPaths, setProposedPaths] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [openProposal, setOpenProposal] = useState<Proposal | null>(null);
  const [proposalDiff, setProposalDiff] = useState<GraphDiffResponse | null>(null);
  const [proposalDiffLoading, setProposalDiffLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [openNote, setOpenNote] = useState<NoteDetail | null>(null);
  const [report, setReport] = useState<IngestReport | null>(null);
  const [uploadStamp, setUploadStamp] = useState(0);
  const [contributions, setContributions] = useState<ContributionsResponse | null>(null);
  const [uploadEvents, setUploadEvents] = useState<UploadEventItem[]>([]);
  const [sharedGraph, setSharedGraph] = useState<GraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphCenter, setGraphCenter] = useState<string | null>(null);
  const [graphLayer, setGraphLayer] = useState<FilterKind>("all");
  const [authorContract, setAuthorContract] = useState<AuthorContract | null>(null);
  const [userCard, setUserCard] = useState<UserCard | null>(null);
  const [noteFeed, setNoteFeed] = useState<NoteFeedEvent[]>([]);
  const [noteComments, setNoteComments] = useState<NoteCommentItem[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [locationHash, setLocationHash] = useState(() => window.location.hash);
  const [selectedCardPath, setSelectedCardPath] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>(() => resolveTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (storedTheme() == null) setTheme(systemTheme());
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function toggleTheme() {
    const next: ThemeName = theme === "dark" ? "light" : "dark";
    persistTheme(next);
    setTheme(next);
  }

  useEffect(() => {
    const onHash = () => setLocationHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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

    void fetch("/api/author/contract", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as AuthorContract;
      })
      .then(setAuthorContract)
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (user?.role !== "admin") {
      setAdminUsers([]);
      setAdminContributions(null);
      setAdminAudit([]);
      return;
    }

    const controller = new AbortController();
    setAdminLoading(true);
    void Promise.all([
      fetch("/api/admin/users", { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as AdminUsersResponse;
      }),
      fetch("/api/admin/contributions", { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as AdminContributionsResponse;
      }),
      fetch("/api/admin/audit", { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as AuditEventListResponse;
      }),
    ])
      .then(([usersBody, contribBody, auditBody]) => {
        setAdminUsers(usersBody.users);
        setAdminContributions(contribBody);
        setAdminAudit(auditBody.events);
      })
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
  }, [authChecking, user?.id, view === "differ"]);

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
    if (!user) {
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
  }, [user, repository?.personal?.connected, repository?.personal?.updated_at, uploadStamp]);

  useEffect(() => {
    if (!user?.is_author || !repository?.shared.connected || view !== "differ") {
      if (!user?.is_author || !repository?.shared.connected) setDifferences([]);
      setDifferLoading(false);
      return;
    }
    const controller = new AbortController();
    setDifferLoading(true);
    void fetch("/api/differ", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as DifferResponse;
      })
      .then((body) => setDifferences(body.differences))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setDifferences([]);
        setError(requestError instanceof Error ? requestError.message : "Не удалось сравнить с общей");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDifferLoading(false);
      });
    return () => controller.abort();
  }, [
    user?.is_author,
    repository?.shared.connected,
    repository?.shared.updated_at,
    repository?.shared.index_status,
    repository?.personal?.connected,
    repository?.personal?.updated_at,
    uploadStamp,
    view,
  ]);

  useEffect(() => {
    if (!user) {
      setUserCard(null);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/users/${user.id}/card`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as UserCard;
      })
      .then(setUserCard)
      .catch(() => undefined);
    return () => controller.abort();
  }, [user, uploadStamp, repository?.shared.updated_at]);

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
    if (!user) {
      setContributions(null);
      setUploadEvents([]);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/contributions/me", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as ContributionsResponse;
      })
      .then((body) => setContributions(body))
      .catch(() => undefined);
    void fetch("/api/personal/uploads", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as UploadHistoryResponse;
      })
      .then((body) => setUploadEvents(body.events))
      .catch(() => undefined);
    return () => controller.abort();
  }, [
    user,
    uploadStamp,
    repository?.shared.updated_at,
    repository?.personal?.updated_at,
  ]);

  useEffect(() => {
    if (!repository?.shared.connected) {
      setSharedGraph(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "50", depth: "1" });
    if (graphCenter) {
      const center = graphCenter.startsWith("personal:")
        ? graphCenter.slice("personal:".length)
        : graphCenter;
      params.set("center", center);
    }
    const path = !user
      ? `/api/graph/shared?${params}`
      : graphLayer === "personal"
        ? `/api/graph/personal?${params}`
        : `/api/graph/personal-overlay?${params}`;
    setGraphLoading(true);
    setSharedGraph(null);
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
    graphLayer,
  ]);

  async function openGraphNote(path: string, origin: string) {
    if (path.startsWith("unresolved:")) return;
    if (path.startsWith("locked:")) {
      const title = path.slice("locked:".length);
      setNoteFeed([]);
      setNoteComments([]);
      setOpenNote({
        path,
        title,
        tags: [],
        aliases: [],
        links: [],
        unresolved_links: [],
        locked_links: [],
        warnings: [],
        locked: true,
        closed: false,
        body: "",
        content_hash: "",
      });
      return;
    }
    const filePath = path.startsWith("personal:") ? path.slice("personal:".length) : path;
    const originKind = origin === "personal" || path.startsWith("personal:") ? "personal" : "shared";
    const endpoint = cardApiUrl(path);
    setSubmitting(true);
    setError("");
    setOpenNote(null);
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(await readError(response));
      const detail = (await response.json()) as NoteDetail;
      setOpenNote(detail);
      setSelectedCardPath(path.startsWith("personal:") ? path : detail.path);
      if (!detail.locked) {
        const [feed, comments] = await Promise.all([
          originKind === "personal"
            ? Promise.resolve(null)
            : fetch(`/api/shared/notes/${encodeURI(filePath)}/feed`),
          fetch(`/api/shared/notes/${encodeURI(filePath)}/comments`),
        ]);
        if (feed && feed.ok) setNoteFeed(((await feed.json()) as { events: NoteFeedEvent[] }).events);
        else setNoteFeed([]);
        if (comments.ok) setNoteComments(((await comments.json()) as { comments: NoteCommentItem[] }).comments);
        else setNoteComments([]);
      } else {
        setNoteFeed([]);
        setNoteComments([]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  const cardRoute = parseCardRoute(locationHash);
  const cardPath = cardRoute.kind === "card" ? cardRoute.path : null;
  const loadedCardRef = useRef<string | null>(null);
  useEffect(() => {
    if (authChecking) return;
    if (cardRoute.kind === "search") {
      loadedCardRef.current = null;
      setView("search");
      return;
    }
    if (!cardPath) {
      loadedCardRef.current = null;
      setView((current) => (current === "card" || current === "search" ? "graph" : current));
      return;
    }
    setView("card");
    if (!user) {
      loadedCardRef.current = null;
      setAuthOpen(true);
      setOpenNote(null);
      setError("");
      return;
    }
    if (loadedCardRef.current === cardPath) return;
    loadedCardRef.current = cardPath;
    void openGraphNote(cardPath, cardPath.startsWith("personal:") ? "personal" : "shared");
  }, [authChecking, user, cardPath, cardRoute.kind]);

  function openCardSearch() {
    if (window.location.hash === cardSearchHash() || window.location.hash === "#/card") {
      setView("search");
      return;
    }
    window.location.hash = cardSearchHash();
  }

  function backToGraph() {
    const path = openNote && !openNote.path.startsWith("locked:") ? openNote.path : selectedCardPath;
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      setLocationHash("");
    }
    setView("graph");
    if (path) {
      setSelectedCardPath(path);
      setGraphCenter(path.startsWith("personal:") ? graphCenter : path);
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
      const message = requestError instanceof Error ? requestError.message : "Ошибка соединения";
      setError(message);
      if (message.toLowerCase().includes("author")) {
        setView("settings");
        setSettingsBlock("contract");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function disconnectPersonal() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/personal/connect", { method: "DELETE" });
      if (!response.ok) throw new Error(await readError(response));
      setRepository((await response.json()) as RepositoryStatusResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: form.get("displayName"),
          email: form.get("email"),
          phone: form.get("phone") || null,
          telegram: form.get("telegram") || null,
          website: form.get("website") || null,
          phone_public: form.get("phonePublic") === "on",
          telegram_public: form.get("telegramPublic") === "on",
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setUser((await response.json()) as User);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  function openDiffer() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!user.is_author) {
      setView("settings");
      setSettingsBlock("contract");
      setError("Чтобы предлагать в общую, примите договор автора в настройках.");
      return;
    }
    setError("");
    setView("differ");
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
      setUploadStamp((value) => value + 1);
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
        setError(await readError(response));
        return;
      }
      setProposalDiff((await response.json()) as GraphDiffResponse);
    } catch {
      setProposalDiff(null);
      setError("Не удалось посчитать Graph Diff. Текстовый diff предложения ниже — не считайте граф пустым.");
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
      const mine = await fetch("/api/contributions/me");
      if (mine.ok) {
        setContributions((await mine.json()) as ContributionsResponse);
      }
      if (user?.role === "admin") {
        const all = await fetch("/api/admin/contributions");
        if (all.ok) {
          setAdminContributions((await all.json()) as AdminContributionsResponse);
        }
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
      setUploadStamp((value) => value + 1);
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
      setNoteFeed([]);
      setNoteComments([]);
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
          email: form.get("email"),
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
      setAuthOpen(false);
      const route = parseCardRoute(window.location.hash);
      if (route.kind === "none") setView("graph");
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
      setView("graph");
      setAuthOpen(false);
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
      const contrib = await fetch("/api/admin/contributions");
      if (contrib.ok) {
        setAdminContributions((await contrib.json()) as AdminContributionsResponse);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function setManagedPassword(managedUser: User) {
    const password = (passwordDrafts[managedUser.id] || "").trim();
    if (password.length < 12) {
      setError("Новый пароль — минимум 12 символов.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${managedUser.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setPasswordDrafts((drafts) => ({ ...drafts, [managedUser.id]: "" }));
      if (managedUser.id === user?.id) {
        setUser(null);
        setAuthOpen(true);
        return;
      }
      const audit = await fetch("/api/admin/audit");
      if (audit.ok) setAdminAudit(((await audit.json()) as AuditEventListResponse).events);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function acceptAuthorContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accepted = new FormData(event.currentTarget).get("acceptAuthorContract") === "on";
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/users/me/author-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setUser((await response.json()) as User);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleClosedPath(path: string, closed: boolean) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        closed ? `/api/personal/closed-paths/${encodeURI(path)}` : "/api/personal/closed-paths",
        closed
          ? { method: "DELETE" }
          : {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path }),
            },
      );
      if (!response.ok) throw new Error(await readError(response));
      setUploadStamp((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function withdrawAuthorContract() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/users/me/author-contract/withdraw", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      setUser((await response.json()) as User);
      setDifferences([]);
      setProposedPaths([]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitComment(path: string) {
    if (!commentDraft.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/shared/notes/${encodeURI(path)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentDraft }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setCommentDraft("");
      const listed = await fetch(`/api/shared/notes/${encodeURI(path)}/comments`);
      if (listed.ok) setNoteComments(((await listed.json()) as { comments: NoteCommentItem[] }).comments);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function moderateComment(id: string, status: "approved" | "rejected", path: string) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/comments/${id}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const listed = await fetch(`/api/shared/notes/${encodeURI(path)}/comments`);
      if (listed.ok) setNoteComments(((await listed.json()) as { comments: NoteCommentItem[] }).comments);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function openUserCard(userId: string) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/users/${userId}/card`);
      if (!response.ok) throw new Error(await readError(response));
      setUserCard((await response.json()) as UserCard);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  const canReview = user?.role === "editor" || user?.role === "admin";

  function openSettings(block: SettingsBlock = "profile") {
    backToGraph();
    setView("settings");
    setSettingsBlock(block);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          aria-label="GraphNotes"
          onClick={(event) => {
            event.preventDefault();
            backToGraph();
          }}
        >
          <span className="brand__mark" aria-hidden="true">G</span>
          <span>GraphNotes</span>
        </a>
        <nav className="topnav" aria-label="Разделы">
          <button className={view === "graph" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => backToGraph()}>
            Граф
          </button>
          <button
            className={view === "card" || view === "search" ? "button button--quiet tab--active" : "button button--quiet"}
            type="button"
            onClick={() => openCardSearch()}
            aria-current={view === "card" || view === "search" ? "page" : undefined}
          >
            Карточки
          </button>
          {user && (
            <button className={view === "differ" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => { backToGraph(); openDiffer(); }}>
              Differ
            </button>
          )}
          {user && (
            <button className={view === "queue" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => { backToGraph(); setView("queue"); }}>
              {canReview ? "Очередь" : "Предложения"}
            </button>
          )}
          {user?.role === "admin" && (
            <button className={view === "admin" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => { backToGraph(); setView("admin"); }}>
              Администрирование
            </button>
          )}
        </nav>
        <div className="topbar__end">
          <ThemeSwitcher theme={theme} onToggle={toggleTheme} />
          {user ? (
            <button
              className={view === "settings" ? "whoami whoami--active" : "whoami"}
              type="button"
              onClick={() => openSettings("profile")}
              aria-current={view === "settings" ? "page" : undefined}
              aria-label={`Настройки, ${user.display_name}`}
            >
              <span className="whoami__name">{user.display_name}</span>
              <span className="whoami__meta">@{user.username}</span>
            </button>
          ) : (
            <button className="button button--primary" type="button" onClick={() => setAuthOpen(true)}>
              Войти
            </button>
          )}
          <div className={`status status--${health}`} role="status">
            <span className="status__dot" aria-hidden="true" />
            {health === "online" ? "Система доступна" : health === "checking" ? "Проверка" : "Нет связи"}
          </div>
        </div>
      </header>

      {authChecking ? (
        <section className="loading" aria-live="polite">Загружаем вашу ризому…</section>
      ) : user ? (
        <>
          {view === "search" && (
            <CardSearch
              canReadNotes
              layer={graphLayer === "personal" ? "personal" : "overlay"}
              onNeedAuth={() => setAuthOpen(true)}
            />
          )}
          {view === "card" && (
          <section className="notes-panel notes-panel--card" aria-labelledby="card-heading">
            <div>
              <p className="eyebrow">Карточка</p>
              <h2 id="card-heading">{openNote?.title || "Карточка ризомы"}</h2>
              <p className="admin-panel__hint">
                Отрисованный Markdown на чтение. Правки текста здесь нет — авторство в git.
              </p>
            </div>
            <div className="graph-actions">
            <button className="button button--quiet" type="button" onClick={() => openCardSearch()}>
              К поиску
            </button>
            <button className="button button--quiet" type="button" onClick={() => backToGraph()}>
              К графу
            </button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {openNote?.locked ? (
              <p className="admin-panel__hint">Закрытая заметка. Тело не показывается.</p>
            ) : openNote ? (
              <article className="note-read">
                <MarkdownBody body={openNote.body} note={openNote} nodes={sharedGraph?.nodes ?? []} />
                {noteFeed.length > 0 && (
                  <div>
                    <p className="admin-panel__hint">Кто трогал карточку (не git log и не тела в PostgreSQL).</p>
                    <ul className="note-list">
                      {noteFeed.map((item) => (
                        <li key={item.id}>
                          <span className="note-link">
                            <strong>{item.actor?.display_name || "автор"}</strong>
                            <small>{item.kind}{item.other_path ? ` · ${item.other_path}` : ""}</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="admin-panel__hint">Комментарии: любой вошедший; editor принимает.</p>
                  <ul className="note-list">
                    {noteComments.map((item) => (
                      <li key={item.id}>
                        <span className="note-link">
                          <strong>{item.author.display_name}</strong>
                          <small>{item.status} · {item.body}</small>
                        </span>
                        {canReview && item.status === "pending" && (
                          <button className="button button--quiet" type="button" onClick={() => void moderateComment(item.id, "approved", openNote.path)}>
                            Принять
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <form className="connect-form" onSubmit={(event) => { event.preventDefault(); void submitComment(openNote.path); }}>
                    <label>
                      Комментарий
                      <input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={2000} required />
                    </label>
                    <button className="button button--quiet" type="submit" disabled={submitting}>Отправить</button>
                  </form>
                </div>
              </article>
            ) : error ? (
              <p className="admin-panel__hint" role="status">Карточка не загрузилась.</p>
            ) : (
              <p className="admin-panel__hint" role="status">Загружаем карточку…</p>
            )}
          </section>
          )}
          {view === "settings" && (
          <section className="notes-panel" aria-labelledby="settings-heading">
            <div>
              <p className="eyebrow">Аккаунт</p>
              <h2 id="settings-heading">Настройки</h2>
              <p className="settings-login">
                <span>Логин</span>
                <strong>{user.username}</strong>
              </p>
              <p className="admin-panel__hint">
                Здесь имя, почта, контакты, свой git и договор автора. Это не граф и не очередь.
              </p>
            </div>
            <div className="appearance-row">
              <p className="admin-panel__hint">Оформление: {theme === "dark" ? "тёмная" : "светлая"} тема. Выбор хранится в этом браузере.</p>
              <ThemeSwitcher theme={theme} onToggle={toggleTheme} />
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="tabs tabs--three" role="tablist" aria-label="Блоки настроек">
              <button className={settingsBlock === "profile" ? "tab tab--active" : "tab"} type="button" onClick={() => setSettingsBlock("profile")}>Личные данные</button>
              <button className={settingsBlock === "git" ? "tab tab--active" : "tab"} type="button" onClick={() => setSettingsBlock("git")}>Свой git</button>
              <button className={settingsBlock === "contract" ? "tab tab--active" : "tab"} type="button" onClick={() => setSettingsBlock("contract")}>Договор автора</button>
            </div>
            {settingsBlock === "profile" && (
              <form className="connect-form" onSubmit={(event) => void saveProfile(event)}>
                <label>
                  Логин <span className="optional">вход в GraphNotes</span>
                  <input value={user.username} readOnly autoComplete="username" />
                </label>
                <label>
                  Отображаемое имя
                  <input name="displayName" defaultValue={user.display_name} maxLength={80} required />
                </label>
                <label>
                  Почта
                  <input name="email" type="email" defaultValue={user.email} maxLength={320} required />
                </label>
                <label>
                  Телефон <span className="optional">необязательно</span>
                  <input name="phone" defaultValue={user.phone ?? ""} maxLength={32} />
                </label>
                <label className="contract-check">
                  <input name="phonePublic" type="checkbox" defaultChecked={user.phone_public} />
                  <span>Показать телефон на карточке</span>
                </label>
                <label>
                  Telegram <span className="optional">контакт, не вход</span>
                  <input name="telegram" defaultValue={user.telegram ?? ""} maxLength={64} />
                </label>
                <label className="contract-check">
                  <input name="telegramPublic" type="checkbox" defaultChecked={user.telegram_public} />
                  <span>Показать Telegram на карточке</span>
                </label>
                <label>
                  Сайт <span className="optional">необязательно</span>
                  <input name="website" defaultValue={user.website ?? ""} maxLength={300} />
                </label>
                <button className="button button--primary" type="submit" disabled={submitting}>Сохранить</button>
              </form>
            )}
            {settingsBlock === "git" && (
              <div className="settings-stack">
                <p className="admin-panel__hint">{personalLabel(repository?.personal ?? null)}</p>
                {user.is_author ? (
                  <form className="connect-form" onSubmit={(event) => void connectPersonal(event)}>
                    <label>
                      Свой git
                      <input name="repository" placeholder="владелец/имя" maxLength={200} required />
                    </label>
                    <div className="settings-actions">
                      <button className="button button--primary" type="submit" disabled={submitting}>Связать личный git</button>
                      {repository?.personal?.connected && (
                        <button className="button button--danger" type="button" disabled={submitting} onClick={() => void disconnectPersonal()}>
                          Отключить git
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  <p className="admin-panel__hint">Подключение git как вклад требует договор автора.</p>
                )}
                {!user.is_author && repository?.personal?.connected && (
                  <div className="settings-actions">
                    <button className="button button--danger" type="button" disabled={submitting} onClick={() => void disconnectPersonal()}>
                      Отключить git
                    </button>
                  </div>
                )}
                {user.role === "admin" && (
                  <div className="settings-actions">
                    <button className="button button--quiet" type="button" onClick={() => void connectShared()} disabled={submitting}>
                      Подключить общую ризому
                    </button>
                  </div>
                )}
              </div>
            )}
            {settingsBlock === "contract" && (
              user.is_author ? (
                <div className="settings-stack">
                  <p className="admin-panel__hint">
                    Договор принят{user.author_contract_version ? `, версия ${user.author_contract_version}` : ""}
                    {user.author_contract_accepted_at ? ` · ${new Date(user.author_contract_accepted_at).toLocaleString("ru")}` : ""}.
                  </p>
                  <AuthorContractCopy contract={authorContract} />
                  <div className="settings-actions">
                    <button className="button button--danger" type="button" onClick={() => void withdrawAuthorContract()} disabled={submitting}>
                      Отозвать статус автора
                    </button>
                  </div>
                </div>
              ) : (
                <form className="connect-form" onSubmit={(event) => void acceptAuthorContract(event)}>
                  <AuthorContractCopy contract={authorContract} />
                  <label className="contract-check">
                    <input name="acceptAuthorContract" type="checkbox" required />
                    <span>Принимаю договор автора</span>
                  </label>
                  <button className="button button--primary" type="submit" disabled={submitting}>Стать автором</button>
                </form>
              )
            )}
            <div className="settings-session">
              <p className="admin-panel__hint">Сессия: {user.display_name} (@{user.username})</p>
              <button className="button button--quiet" type="button" onClick={() => void logout()} disabled={submitting}>
                Выйти
              </button>
            </div>
          </section>
          )}
          {view === "differ" && repository?.shared.connected && user?.is_author && (
            <section className="notes-panel" aria-labelledby="differ-heading">
              <div>
                <p className="eyebrow">Отличия</p>
                <h2 id="differ-heading">Differ</h2>
                <p className="admin-panel__hint">
                  Сравнение личного слоя (git или загруженные .md) с опубликованной общей
                  в одну сторону: чего в общей ещё нет или что отличается. Git не обязателен.
                  Личный git при предложении не меняется.
                </p>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              {differLoading ? (
                <p className="admin-panel__hint" role="status">Сравниваем личный слой с общей ризомой…</p>
              ) : differences.length === 0 ? (
                <p className="admin-panel__hint">Отличий нет — в общую предлагать нечего.</p>
              ) : (
                <ul className="note-list">
                  {differences.map((item) => (
                    <li key={item.path}>
                      <div className="note-pick">
                        <button className="note-link" type="button" onClick={() => void openPersonalNote(item.path)}>
                          <strong>{item.title}</strong>
                          <small>{item.path} · {differKindLabel(item.kind)}</small>
                        </button>
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
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="button button--primary"
                type="button"
                disabled={submitting || differLoading || proposedPaths.length === 0}
                onClick={() => void proposeSelected()}
              >
                Предложить в общую
              </button>
              {!repository?.personal?.connected && (
              <form className="connect-form" onSubmit={(event) => void importFallback(event)}>
                <label>
                  Загрузка .md или ZIP без git
                  <input name="file" type="file" accept=".md,.zip,text/markdown,application/zip" required />
                </label>
                <button className="button button--quiet" type="submit" disabled={submitting}>
                  Загрузить в личный слой
                </button>
              </form>
              )}
              {repository?.personal?.connected && (
                <p className="admin-panel__hint">
                  Git подключён — загрузка файлов выключена. Отключите git в настройках, чтобы снова грузить .md.
                </p>
              )}
              {report && (
                <p className="ingest-report" role="status">
                  Принято: {report.accepted.length}. Пропущено: {report.skipped.length}. Конфликт: {report.conflicted.length}.
                </p>
              )}
              {uploadEvents.length > 0 && (
                <div>
                  <p className="admin-panel__hint">История загрузок в личный слой — в GraphNotes, не в git log.</p>
                  <ul className="note-list">
                    {uploadEvents.slice(0, 8).map((item) => (
                      <li key={`${item.path}-${item.created_at}`}>
                        <span className="note-link">
                          <strong>{item.path}</strong>
                          <small>{new Date(item.created_at).toLocaleString("ru")} · {item.content_hash.slice(0, 8)}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {personalNotes.length > 0 && user.is_author && (
                <div>
                  <p className="admin-panel__hint">
                    Закрытый корпус остаётся у вас: не в Differ и не в общей. Ссылка из общей — замок, не текст.
                  </p>
                  <ul className="note-list">
                    {personalNotes.map((item) => (
                      <li key={`closed-${item.path}`}>
                        <div className="note-pick">
                          <button className="note-link" type="button" onClick={() => void openPersonalNote(item.path)}>
                            <strong>{item.title}</strong>
                            <small>{item.path}{item.closed ? " · закрыто" : ""}</small>
                          </button>
                          <button
                            className="button button--quiet"
                            type="button"
                            disabled={submitting}
                            onClick={() => void toggleClosedPath(item.path, Boolean(item.closed))}
                          >
                            {item.closed ? "Открыть себе" : "Закрыть"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {openNote && (
                <article className="note-read">
                  <h3>{openNote.title}</h3>
                  {openNote.locked ? (
                    <p className="admin-panel__hint">Закрытая заметка. Тело в общей ризоме не показывается.</p>
                  ) : (
                    <MarkdownBody body={openNote.body} note={openNote} nodes={sharedGraph?.nodes ?? []} />
                  )}
                  {noteFeed.length > 0 && (
                    <div>
                      <p className="admin-panel__hint">Кто трогал карточку (не git log и не тела в PostgreSQL).</p>
                      <ul className="note-list">
                        {noteFeed.map((item) => (
                          <li key={item.id}>
                            <span className="note-link">
                              <strong>{item.actor?.display_name || "автор"}</strong>
                              <small>{item.kind}{item.other_path ? ` · ${item.other_path}` : ""}</small>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!openNote.locked && (
                    <div>
                      <p className="admin-panel__hint">Комментарии: любой вошедший; editor принимает.</p>
                      <ul className="note-list">
                        {noteComments.map((item) => (
                          <li key={item.id}>
                            <span className="note-link">
                              <strong>{item.author.display_name}</strong>
                              <small>{item.status} · {item.body}</small>
                            </span>
                            {canReview && item.status === "pending" && (
                              <button className="button button--quiet" type="button" onClick={() => void moderateComment(item.id, "approved", openNote.path)}>
                                Принять
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      <form className="connect-form" onSubmit={(event) => { event.preventDefault(); void submitComment(openNote.path); }}>
                        <label>
                          Комментарий
                          <input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={2000} required />
                        </label>
                        <button className="button button--quiet" type="submit" disabled={submitting}>Отправить</button>
                      </form>
                    </div>
                  )}
                </article>
              )}
            </section>
          )}
          {user && view === "differ" && (
            <section className="notes-panel" aria-labelledby="contrib-heading">
              <div>
                <p className="eyebrow">Автор</p>
                <h2 id="contrib-heading">Мой вклад</h2>
                <p className="admin-panel__hint">
                  Пустой Differ не стирает принятое. Состояния: только в личном слое, предложено, принято в общую.
                  Карточка — след вклада в GraphNotes, не профиль GitHub.
                </p>
              </div>
              {userCard && (
                <div className="profile-card" style={{ marginBottom: "1.25rem" }}>
                  <div className="avatar" aria-hidden="true">{userCard.user.display_name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <strong>{userCard.user.display_name}</strong>
                    <span>
                      @{userCard.user.username} · {userCard.user.role}
                      {userCard.user.is_author ? " · автор" : ""}
                      {userCard.self && userCard.closed_count != null ? ` · закрыто ${userCard.closed_count}` : ""}
                    </span>
                  </div>
                  <p className="admin-panel__hint">
                    Принято в общую: {userCard.stats.accepted} заметок, {userCard.stats.links_accepted} связей.
                    {userCard.user.website ? ` · ${userCard.user.website}` : ""}
                    {userCard.user.phone ? ` · ${userCard.user.phone}` : ""}
                    {userCard.user.telegram ? ` · ${userCard.user.telegram}` : ""}
                    {userCard.self ? "" : " Чужой подробный журнал недоступен."}
                  </p>
                  {userCard.notes.length > 0 && (
                    <ul className="note-list">
                      {userCard.notes.slice(0, 8).map((item) => (
                        <li key={`${item.state}-${item.path}`}>
                          <span className="note-link">
                            <strong>{item.title}</strong>
                            <small>{item.path} · {item.state}</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {contributions && (
                <div className="stat-grid" aria-label="Моя статистика">
                  <div className="stat-card">
                    <strong>{contributions.stats.notes}</strong>
                    <span>Карточки</span>
                  </div>
                  <div className="stat-card">
                    <strong>{contributions.stats.added}</strong>
                    <span>Добавлено</span>
                  </div>
                  <div className="stat-card">
                    <strong>{contributions.stats.accepted}</strong>
                    <span>Принято</span>
                  </div>
                  <div className="stat-card">
                    <strong>{contributions.stats.links}</strong>
                    <span>
                      Связи
                      {contributions.stats.links_accepted > 0
                        ? ` · принято ${contributions.stats.links_accepted}`
                        : ""}
                    </span>
                  </div>
                </div>
              )}
              {contributions?.review && (
                <div className="review-stats">
                  <h3>Редакционные решения</h3>
                  <p className="admin-panel__hint">
                    Принял {contributions.review.accepted}, отклонил {contributions.review.rejected},
                    вернул {contributions.review.returned}, откатил {contributions.review.rolled_back}.
                    Это работа по очереди, не авторский вклад.
                  </p>
                  {contributions.review.decisions.length > 0 && (
                    <ul className="note-list">
                      {contributions.review.decisions.map((item, index) => (
                        <li key={`${item.proposal_id}-${item.action}-${index}`}>
                          <span className="note-link">
                            <strong>{reviewActionLabel(item.action)} · {item.summary || item.paths.join(", ")}</strong>
                            <small>
                              {item.paths.join(", ") || "без путей"}
                              {item.links.length > 0
                                ? ` · связи: ${item.links.map((link) => `${link.source} → ${link.target}`).join("; ")}`
                                : ""}
                            </small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {!contributions || contributions.notes.length === 0 ? (
                <p className="admin-panel__hint">Пока нет заметок в личном слое и принятого вклада.</p>
              ) : (
                <ul className="note-list">
                  {contributions.notes.map((item) => (
                    <li key={item.path}>
                      <button
                        className="note-link"
                        type="button"
                        onClick={() => {
                          if (item.state === "accepted") window.location.hash = cardHash(item.path);
                          else void openPersonalNote(item.path);
                        }}
                      >
                        <strong>{item.title}</strong>
                        <small>{item.path} · {contributionStateLabel(item.state)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {view === "queue" && (
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
                  <button className="note-link" type="button" onClick={() => void openUserCard(openProposal.author.id)}>
                    {openProposal.author.display_name}
                  </button>
                  {" · "}{proposalStatusLabel(openProposal.status)}
                  {openProposal.reason ? ` · ${openProposal.reason}` : ""}
                </p>
                <GraphDiffView diff={proposalDiff} loading={proposalDiffLoading} theme={theme} />
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
          )}
          {view === "graph" && repository?.shared.connected && (
            <section className="notes-panel notes-panel--graph" aria-labelledby="graph-heading">
              <div>
                <p className="eyebrow">Граф</p>
                <h2 id="graph-heading">{graphLayer === "personal" ? "Ваша личная ризома" : "Общая ризома"}</h2>
                <p className="admin-panel__hint">
                  {graphLayer === "personal"
                    ? "Полный проиндексированный личный git (или загрузки). Слой считается сам: какие заметки входят в «вашу часть ризомы», решает пересечение с общей, не ручной список."
                    : "Живой граф собирается из git. После пуша из Obsidian обновите страницу. Координаты раскладки — только отображение, не знание."}
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
                selectedPath={selectedCardPath}
                canReadNotes
                filterKind={graphLayer}
                onFilterKindChange={setGraphLayer}
                onExpand={setGraphCenter}
                theme={theme}
              />
            </section>
          )}
          {view === "admin" && user.role === "admin" && (
            <section className="admin-panel" aria-labelledby="admin-heading">
              <div>
                <p className="eyebrow">Администрирование</p>
                <h2 id="admin-heading">Пользователи</h2>
                <p className="admin-panel__hint">
                  Роли глобальны: editor включает права user, admin — все права.
                  Статистика вклада, смена пароля и журнал действий — только здесь.
                  После смены пароля старые сессии этой учётки заканчиваются.
                </p>
              </div>
              <button className="button button--quiet" type="button" onClick={() => void connectShared()} disabled={submitting}>
                Подключить общую ризому
              </button>
              {error && <p className="form-error" role="alert">{error}</p>}
              {adminLoading ? (
                <p className="admin-panel__hint">Загружаем пользователей…</p>
              ) : (
                <div className="user-list">
                  {adminUsers.map((managedUser) => {
                    const contribRow = adminContributions?.users.find((row) => row.user.id === managedUser.id);
                    return (
                    <article className="user-row" key={managedUser.id}>
                      <div className="user-row__identity">
                        <strong>{managedUser.display_name}</strong>
                        <span>@{managedUser.username} · {managedUser.email}{managedUser.phone ? ` · ${managedUser.phone}` : ""}{managedUser.telegram ? ` · ${managedUser.telegram}` : ""}</span>
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
              )}
              <div className="audit-log">
                <h3>Журнал действий</h3>
                <p className="admin-panel__hint">
                  События из базы GraphNotes. Пароль и токен в записи не попадают.
                </p>
                {adminAudit.length === 0 ? (
                  <p className="admin-panel__hint">Пока нет записей.</p>
                ) : (
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Когда</th>
                        <th>Действие</th>
                        <th>Кого</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminAudit.map((event) => (
                        <tr key={event.id}>
                          <td>{new Date(event.created_at).toLocaleString("ru")}</td>
                          <td>{auditActionLabel(event.action)}</td>
                          <td>{event.subject_username ? `@${event.subject_username}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
        {authOpen && (
          <section className="auth-layout auth-overlay">
          <div className="hero-copy">
            <p className="eyebrow">Вход</p>
            <h1>Войдите, чтобы читать карточки.</h1>
            <p className="summary">
              Стартовая страница — граф общей ризомы. Гость видит узлы и связи, без карточек и Markdown.
              Договор автора и свой git — в настройках после входа.
            </p>
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
                    Почта
                    <input name="email" type="email" maxLength={320} autoComplete="email" required />
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
              {mode === "register" && <p className="hint">Минимум 12 символов. Договор автора принимается в настройках.</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button--primary" type="submit" disabled={submitting}>
                {submitting ? "Подождите…" : mode === "register" ? "Создать учётку" : "Войти"}
              </button>
              <button className="button button--quiet" type="button" onClick={() => setAuthOpen(false)}>К графу</button>
            </form>
          </div>
          </section>
        )}
        {view === "search" && (
          <CardSearch canReadNotes={false} onNeedAuth={() => setAuthOpen(true)} />
        )}
        {view === "card" && (
          <section className="notes-panel notes-panel--card" aria-labelledby="guest-card-heading">
            <div>
              <p className="eyebrow">Карточка</p>
              <h2 id="guest-card-heading">Карточка ризомы</h2>
              <p className="admin-panel__hint" role="status">Войдите, чтобы открыть эту карточку.</p>
            </div>
            <div className="graph-actions">
            <button className="button button--quiet" type="button" onClick={() => openCardSearch()}>
              К поиску
            </button>
            <button className="button button--quiet" type="button" onClick={() => backToGraph()}>
              К графу
            </button>
            </div>
          </section>
        )}
        {view !== "card" && view !== "search" && repository?.shared.connected && (
          <section className="notes-panel notes-panel--graph" aria-labelledby="public-graph-heading">
            <div>
              <p className="eyebrow">Граф</p>
              <h2 id="public-graph-heading">Общая ризома</h2>
              <p className="admin-panel__hint">
                Публичный граф без входа: узлы и связи. Карточки и Markdown — после входа.
              </p>
            </div>
            <GraphView
              graph={sharedGraph}
              loading={graphLoading}
              selectedPath={selectedCardPath}
              canReadNotes={false}
              onNeedAuth={() => setAuthOpen(true)}
              onExpand={setGraphCenter}
              theme={theme}
            />
          </section>
        )}
        </>
      )}
    </main>
  );
}
