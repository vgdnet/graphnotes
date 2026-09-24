import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { GraphView } from "./GraphView";
import type { FilterKind, GraphResponse } from "./GraphView";

const PixiGraphView = lazy(async () => {
  const mod = await import("./PixiGraphView");
  return { default: mod.PixiGraphView };
});
import { InviteGraph, type InviteGraphPayload } from "./InviteGraph";
import { graphRequestParams } from "./graphQuery";
import { GraphDiffView } from "./GraphDiffView";
import { WikiDiffTable } from "./WikiDiffTable";
import type { WikiDiffRow } from "./WikiDiffTable";
import type { GraphDiffResponse } from "./GraphDiffView";
import { CardHistory } from "./CardHistory";
import { MarkdownBody } from "./MarkdownBody";
import { CardSearch } from "./CardSearch";
import { CARD_LOCAL_GRAPH_MIN_WIDTH, cardApiUrl, cardFilePath, cardHash, cardPageShowsLocalGraph, cardSearchHash, isOwnPersonalCard, missingNotePath, missingNoteTitle } from "./cardRoute";
import { parseAppRoute, personCardHash, routeToView, viewHash, type ShellView } from "./appRoute";
import { AuthPanel, type AuthMode } from "./AuthPanel";
import { ActorLink, InviteAttribution, PersonCardPage } from "./PersonCard";
import { AdminPanel } from "./AdminPanel";
import { ThemeSwitcher } from "./ThemeSwitcher";
import {
  contributionIsEmpty,
  RHIZOME_LEAD,
  RHIZOME_TITLE,
  roleLabel,
  ruNotes,
} from "./labels";
import {
  DEFAULT_MAIL_CODE_TTL_MINUTES,
  mailCodeExpired,
  parseAuthHash,
} from "./authMail";
import {
  applyTheme,
  persistTheme,
  resolveTheme,
  storedTheme,
  systemTheme,
  type ThemeName,
} from "./theme";

type HealthState = "checking" | "online" | "degraded" | "offline";
type QueueTab = "new" | "in_progress" | "rejected";
type SettingsBlock = "profile" | "contract" | "integrations" | "invite";

type User = {
  id: string;
  username: string;
  email: string;
  display_name: string;
  phone: string | null;
  telegram: string | null;
  phone_public: boolean;
  telegram_public: boolean;
  notify_queue_email: boolean;
  notify_queue_telegram: boolean;
  notify_card_changes: boolean;
  website: string | null;
  role: "user" | "editor" | "admin";
  is_active: boolean;
  is_author: boolean;
  author_contract_version: string | null;
  author_contract_accepted_at: string | null;
  author_contract_withdrawn_at: string | null;
  email_verified_at?: string | null;
  last_login_at?: string | null;
};

type AuthorContract = {
  version: string;
  title: string;
  responsibility: string;
  withdraw: string;
  content_license: string;
  software_license: string;
  developer: string;
};

type IntegrationToken = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
  token?: string;
};

type IntegrationAccess = {
  id: string;
  token_id: string | null;
  username: string;
  token_name: string;
  token_prefix: string;
  ip: string;
  user_agent: string;
  route: string;
  created_at: string;
};

const AUTHOR_CONTRACT_FALLBACK: Omit<AuthorContract, "version" | "title"> = {
  responsibility:
    "Принимая договор, вы несёте ответственность за содержание своих заметок и связанных с ними связей, которые предлагаете в общую ризому.",
  withdraw:
    "Вы можете отозвать статус автора. GraphNotes запишет время отзыва; новые предложения, загрузки как вклад и подключение git как вклад будут недоступны, пока вы не примете договор снова. Заметки, уже принятые в общую ризому, остаются в её git.",
  content_license:
    "(Все карточки распространяются по лицензии WTFPL https://ru.wikipedia.org/wiki/WTFPL, вы имеете право делать с этим текстом что хотите.",
  software_license:
    "Программное обеспечение распространяется под лицензией GNU Affero General Public License v3.0",
  developer: "разработчик программного обеспечения Юрий Ефимов  y@psychoanalyst.pro",
};

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

type NoteDetail = NoteProjection & { body: string; content_hash: string; source?: string | null };

type NoteListResponse = {
  notes: NoteProjection[];
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
  diff: { path: string; diff: string; body?: string; before?: string; html?: string; engine?: string; rows?: WikiDiffRow[] }[];
};

type DifferItem = {
  path: string;
  title: string;
  kind: "added" | "changed" | string;
  updated_at?: string | null;
};

type DifferResponse = { differences: DifferItem[]; inbound?: DifferItem[] };
type ProposalListResponse = {
  proposals: Proposal[];
  editorial_queue_mode?: "all" | "granted" | "none";
  has_editorial_grants?: boolean;
};

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
    id?: string;
    username: string;
    display_name: string;
    role: string;
    is_author: boolean;
    website?: string | null;
    phone?: string | null;
    telegram?: string | null;
  };
  invited_at?: string | null;
  inviter?: { username: string } | null;
  self: boolean;
  stats: ContributionStats;
  achievements: {
    accepted_notes: number;
    accepted_links: number;
    proposals: number;
    created: number;
    edits: number;
  };
  store?: {
    personal_notes: number;
    personal_links: number;
    proposed_notes: number;
    proposed_links: number;
    proposed_edit_bytes: number;
  };
  notes: { path: string; title: string; state: ContributionState }[];
  review: ReviewStats | null;
  closed_count: number | null;
};
type UploadEventItem = {
  path: string;
  content_hash: string;
  created_at: string;
  differed?: boolean;
  proposed?: boolean;
  outcome?: string | null;
};
type UploadHistoryResponse = { events: UploadEventItem[] };

function differKindLabel(kind: string): string {
  if (kind === "added") return "нет в общей";
  if (kind === "changed") return "отличается";
  return kind;
}

function proposalQueueTab(status: string): QueueTab | null {
  if (status === "rejected") return "rejected";
  if (status === "changes_requested") return "in_progress";
  if (status === "open" || status === "conflicted" || status === "failed") return "new";
  return null;
}

function proposalCardTitle(path: string, body: string): string {
  const heading = body.split("\n").find((line) => line.startsWith("# "));
  if (heading) return heading.replace(/^#\s+/, "").trim() || path;
  return path;
}

function proposalIsDecidable(status: string): boolean {
  return status === "open" || status === "conflicted" || status === "failed" || status === "changes_requested";
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

function AuthorContractCopy({ contract }: { contract: AuthorContract | null }) {
  const copy = contract ?? AUTHOR_CONTRACT_FALLBACK;
  return (
    <div className="contract-copy">
      {contract ? (
        <p><strong>{contract.title}</strong> · версия {contract.version}</p>
      ) : null}
      <p>{copy.responsibility}</p>
      <p>{copy.withdraw}</p>
      <p>{copy.content_license}</p>
      <p>{copy.software_license}</p>
      <p>{copy.developer}</p>
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
    if (formatted) {
      if (/github rate limit/i.test(formatted)) {
        return "Сверка временно недоступна. Повторите позже.";
      }
      return formatted;
    }
  } catch {
    // HTML 413 from nginx, plaintext 500, or a non-object body.
  }
  if (response.status === 413) return "Файл слишком большой. ZIP — до 2 МиБ.";
  return "Не удалось выполнить запрос. Попробуйте ещё раз.";
}

function useCardPageShowsLocalGraph(): boolean {
  const [show, setShow] = useState(() =>
    typeof window !== "undefined" && cardPageShowsLocalGraph(window.innerWidth),
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${CARD_LOCAL_GRAPH_MIN_WIDTH}px)`);
    const sync = () => setShow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return show;
}

export function App() {
  const showCardLocalGraph = useCardPageShowsLocalGraph();
  const [health, setHealth] = useState<HealthState>("checking");
  const [sessionLost, setSessionLost] = useState(false);
  const [graphLoadError, setGraphLoadError] = useState("");
  const [statusFailed, setStatusFailed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [view, setView] = useState<ShellView>(() => routeToView(parseAppRoute(window.location.hash)));
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsBlock, setSettingsBlock] = useState<SettingsBlock>("profile");
  const [integrationTokens, setIntegrationTokens] = useState<IntegrationToken[]>([]);
  const [integrationAccess, setIntegrationAccess] = useState<IntegrationAccess[]>([]);
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginByMail, setLoginByMail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [mailConfigured, setMailConfigured] = useState(false);
  const [mailCodeTtlMinutes, setMailCodeTtlMinutes] = useState(DEFAULT_MAIL_CODE_TTL_MINUTES);
  const [mailChallengeStartedAt, setMailChallengeStartedAt] = useState<number | null>(null);
  const [mailChallengeClock, setMailChallengeClock] = useState(0);
  const [authNote, setAuthNote] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteInviter, setInviteInviter] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [pendingInvites, setPendingInvites] = useState<{ id: string; email: string; expires_at: string }[]>([]);
  const [repository, setRepository] = useState<RepositoryStatusResponse | null>(null);
  const [sharedNotes, setSharedNotes] = useState<NoteProjection[]>([]);
  const [personalNotes, setPersonalNotes] = useState<NoteProjection[]>([]);
  const [personalRevision, setPersonalRevision] = useState<string | null>(null);
  const [differences, setDifferences] = useState<DifferItem[]>([]);
  const [inbound, setInbound] = useState<DifferItem[]>([]);
  const [differLoading, setDifferLoading] = useState(false);
  const [proposedPaths, setProposedPaths] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [editorialQueueMode, setEditorialQueueMode] = useState<"all" | "granted" | "none" | undefined>(undefined);
  const [queueTab, setQueueTab] = useState<QueueTab>("new");
  const [openProposal, setOpenProposal] = useState<Proposal | null>(null);
  const [openProposalCard, setOpenProposalCard] = useState<string | null>(null);
  const [proposalDiff, setProposalDiff] = useState<GraphDiffResponse | null>(null);
  const [proposalDiffLoading, setProposalDiffLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [openNote, setOpenNote] = useState<NoteDetail | null>(null);
  const [missingCard, setMissingCard] = useState<{ path: string; title: string } | null>(null);
  const [stackedPersonal, setStackedPersonal] = useState<NoteDetail | null>(null);
  const [uploadStamp, setUploadStamp] = useState(0);
  const [inviteGraph, setInviteGraph] = useState<InviteGraphPayload | null>(null);
  const [inviteGraphLoading, setInviteGraphLoading] = useState(false);
  const [contributions, setContributions] = useState<ContributionsResponse | null>(null);
  const [uploadEvents, setUploadEvents] = useState<UploadEventItem[]>([]);
  const [sharedGraph, setSharedGraph] = useState<GraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphCenter, setGraphCenter] = useState<string | null>(null);
  const [graphDepth, setGraphDepth] = useState(1);
  const [graphLayer, setGraphLayer] = useState<FilterKind>("all");
  const [authorContract, setAuthorContract] = useState<AuthorContract | null>(null);
  const [userCard, setUserCard] = useState<UserCard | null>(null);
  const [personCard, setPersonCard] = useState<UserCard | null>(null);
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
    document.title = view === "about" ? `О программе · ${RHIZOME_TITLE}` : RHIZOME_TITLE;
  }, [view]);

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
        if (response.status === 401) {
          setSessionLost(false);
          return null;
        }
        if (!response.ok) {
          setSessionLost(true);
          return undefined;
        }
        setSessionLost(false);
        return (await response.json()) as User;
      })
      .then((next) => {
        if (next !== undefined) setUser(next);
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setSessionLost(true);
        }
      })
      .finally(() => setAuthChecking(false));

    void fetch("/api/repository/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as RepositoryStatusResponse;
      })
      .then((body) => {
        setRepository(body);
        setStatusFailed(false);
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setRepository(null);
          setStatusFailed(true);
        }
      });

    void fetch("/api/author/contract", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as AuthorContract;
      })
      .then(setAuthorContract)
      .catch(() => undefined);

    void fetch("/api/auth/mail-status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { configured: boolean; code_ttl_minutes?: number };
        setMailConfigured(body.configured);
        if (typeof body.code_ttl_minutes === "number" && body.code_ttl_minutes > 0) {
          setMailCodeTtlMinutes(body.code_ttl_minutes);
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!sessionLost) return;
    const id = window.setInterval(() => {
      void fetch("/api/users/me")
        .then(async (response) => {
          if (response.status === 401) {
            setUser(null);
            setSessionLost(false);
            return;
          }
          if (!response.ok) return;
          setSessionLost(false);
          setUser((await response.json()) as User);
        })
        .catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(id);
  }, [sessionLost]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/repository/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as RepositoryStatusResponse;
      })
      .then((body) => {
        setRepository(body);
        setStatusFailed(false);
      })
      .catch(() => setStatusFailed(true));
    return () => controller.abort();
  }, [authChecking, user?.id]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/shared/notes", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as NoteListResponse;
      })
      .then((body) => setSharedNotes(body.notes))
      .catch(() => undefined);
    return () => controller.abort();
  }, [repository?.shared.updated_at]);

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
    if (!user?.is_author || view !== "differ") {
      if (!user?.is_author) {
        setDifferences([]);
        setInbound([]);
      }
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
      .then((body) => {
        setDifferences(body.differences);
        setInbound(body.inbound ?? []);
      })
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
    uploadStamp,
    view,
  ]);

  useEffect(() => {
    if (!user) {
      setUserCard(null);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/users/${encodeURIComponent(user.username)}/card`, { signal: controller.signal })
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
      setEditorialQueueMode(undefined);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/proposals", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as ProposalListResponse;
      })
      .then((body) => {
        setProposals(body.proposals);
        setEditorialQueueMode(body.editorial_queue_mode);
      })
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
    const routeNow = parseAppRoute(locationHash);
    const viewingCard = routeNow.kind === "card" ? routeNow.path : null;
    const cardIsPersonal = Boolean(viewingCard && isOwnPersonalCard(viewingCard));
    const fetchCenter = viewingCard ? cardFilePath(viewingCard) : graphCenter;
    const fetchPersonal = viewingCard ? cardIsPersonal : graphLayer === "personal";
    const controller = new AbortController();
    const params = new URLSearchParams(graphRequestParams({
      scope: fetchCenter ? "local" : "full",
      center: fetchCenter,
      depth: graphDepth,
      personalLayer: fetchPersonal,
    }));
    const path = !user
      ? `/api/graph/shared?${params}`
      : fetchPersonal
        ? `/api/graph/personal?${params}`
        : `/api/graph/personal-overlay?${params}`;
    setGraphLoading(true);
    setGraphLoadError("");
    void fetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as GraphResponse;
      })
      .then((body) => {
        setSharedGraph(body);
        setGraphLoadError("");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setSharedGraph(null);
        setGraphLoadError("Не удалось загрузить ризому.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setGraphLoading(false);
      });
    return () => controller.abort();
  }, [
    user,
    repository?.shared.updated_at,
    repository?.shared.index_status,
    repository?.personal?.connected,
    repository?.personal?.updated_at,
    uploadStamp,
    graphCenter,
    graphDepth,
    graphLayer,
    locationHash,
  ]);

  async function loadCardLayer(path: string): Promise<NoteDetail | null> {
    const response = await fetch(cardApiUrl(path));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as NoteDetail;
  }

  async function createMissingCard(rawPath: string) {
    if (!user) {
      setAuthOpen(true);
      goHash("#/auth");
      return;
    }
    if (!user.is_author) {
      setError("Чтобы создать карточку, примите договор автора в Настройках.");
      goHash(viewHash("user"));
      return;
    }
    const filePath = missingNotePath(rawPath);
    if (!filePath) {
      setError("Нельзя создать карточку с таким путём.");
      return;
    }
    const title = missingNoteTitle(filePath);
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/personal/notes/${encodeURI(filePath)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: `# ${title}\n\n`, expected_hash: "" }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMissingCard(null);
      setUploadStamp((value) => value + 1);
      goHash(cardHash(`personal:${filePath}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось создать карточку");
    } finally {
      setSubmitting(false);
    }
  }

  function showMissingCard(path: string) {
    const filePath = missingNotePath(path);
    setMissingCard({ path: filePath, title: missingNoteTitle(filePath) });
    setOpenNote(null);
    setStackedPersonal(null);
    setNoteComments([]);
    setError("");
    setSelectedCardPath(filePath);
  }

  async function openGraphNote(path: string, origin: string) {
    if (path.startsWith("unresolved:")) {
      showMissingCard(path);
      return;
    }
    if (path.startsWith("locked:")) {
      const title = path.slice("locked:".length);
      setNoteComments([]);
      setStackedPersonal(null);
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
    const isPersonal = path.startsWith("personal:");
    const isProposal = path.startsWith("proposal:");
    const filePath = cardFilePath(path);
    const stackable = !isPersonal && !isProposal;
    setSubmitting(true);
    setError("");
    setMissingCard(null);
    setOpenNote(null);
    setStackedPersonal(null);
    try {
      if (stackable) {
        const [shared, personal] = await Promise.all([
          loadCardLayer(filePath),
          user ? loadCardLayer(`personal:${filePath}`) : Promise.resolve(null),
        ]);
        if (!shared && !personal) {
          showMissingCard(filePath);
          return;
        }
        setOpenNote(shared);
        setStackedPersonal(personal);
        setSelectedCardPath(shared?.path || `personal:${filePath}`);
        if (shared) {
          const comments = await fetch(`/api/shared/notes/${encodeURI(filePath)}/comments`);
          if (comments.ok) setNoteComments(((await comments.json()) as { comments: NoteCommentItem[] }).comments);
          else setNoteComments([]);
        } else {
          setNoteComments([]);
        }
        return;
      }
      const detail = await loadCardLayer(path);
      if (!detail) {
        showMissingCard(filePath);
        return;
      }
      setOpenNote(detail);
      setSelectedCardPath(isPersonal ? path : detail.path);
      if (!detail.locked && !isProposal) {
        if (!isPersonal) {
          const comments = await fetch(`/api/shared/notes/${encodeURI(filePath)}/comments`);
          if (comments.ok) setNoteComments(((await comments.json()) as { comments: NoteCommentItem[] }).comments);
          else setNoteComments([]);
        } else {
          setNoteComments([]);
        }
      } else {
        setNoteComments([]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  const appRoute = parseAppRoute(locationHash);
  const cardPath = appRoute.kind === "card" ? appRoute.path : null;
  const personLogin = appRoute.kind === "person" ? appRoute.login : null;
  const personUnknown = appRoute.kind === "person_unknown";
  const loadedCardRef = useRef<string | null>(null);
  useEffect(() => {
    if (personUnknown) {
      setPersonCard(null);
      setError("Пользователь не найден");
      return;
    }
    if (!personLogin) {
      setPersonCard(null);
      return;
    }
    const controller = new AbortController();
    setError("");
    void fetch(`/api/users/${encodeURIComponent(personLogin)}/card`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as UserCard;
      })
      .then((body) => {
        if (!controller.signal.aborted) setPersonCard(body);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setPersonCard(null);
        setError(requestError instanceof Error ? requestError.message : "Не удалось открыть карточку человека");
      });
    return () => controller.abort();
  }, [personLogin, personUnknown]);
  useEffect(() => {
    if (authChecking || user?.role !== "admin") {
      setInviteGraph(null);
      setInviteGraphLoading(false);
      return;
    }
    if (parseAppRoute(locationHash).kind !== "invites") return;
    const controller = new AbortController();
    setInviteGraphLoading(true);
    void fetch("/api/graph/invites", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as InviteGraphPayload;
      })
      .then((body) => {
        if (!controller.signal.aborted) setInviteGraph(body);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setInviteGraph(null);
        setError(requestError instanceof Error ? requestError.message : "Не удалось открыть карту инвайтов");
      })
      .finally(() => {
        if (!controller.signal.aborted) setInviteGraphLoading(false);
      });
    return () => controller.abort();
  }, [authChecking, user?.role, locationHash]);
  useEffect(() => {
    if (authChecking) return;
    const route = parseAppRoute(locationHash);
    if (route.kind === "auth") {
      setAuthOpen(true);
      return;
    }
    setAuthOpen(false);
    if (route.kind === "invites" && user?.role !== "admin") {
      goHash(viewHash("graph"));
      return;
    }
    if (route.kind === "person_unknown") {
      setView("person");
      setError("Пользователь не найден");
      return;
    }
    setView(routeToView(route));
    if (route.kind === "start_card") {
      loadedCardRef.current = null;
      if (!user) {
        setAuthOpen(true);
        setOpenNote(null);
        setStackedPersonal(null);
        return;
      }
      void (async () => {
        const response = await fetch("/api/installation/start-card");
        if (!response.ok) {
          setError("Стартовая карточка не задана.");
          setOpenNote(null);
          setStackedPersonal(null);
          return;
        }
        const body = (await response.json()) as { path: string | null };
        if (!body.path) {
          setError("Стартовая карточка не задана.");
          setOpenNote(null);
          setStackedPersonal(null);
          return;
        }
        goHash(cardHash(body.path));
      })();
      return;
    }
    if (route.kind !== "card") {
      loadedCardRef.current = null;
      return;
    }
    const gated = route.path.startsWith("personal:") || route.path.startsWith("proposal:");
    if (!user && gated) {
      loadedCardRef.current = null;
      setAuthOpen(true);
      setOpenNote(null);
      setStackedPersonal(null);
      setError("");
      return;
    }
    if (loadedCardRef.current === route.path) return;
    loadedCardRef.current = route.path;
    void openGraphNote(route.path, route.path.startsWith("personal:") ? "personal" : "shared");
  }, [authChecking, user, locationHash]);

  function openCardSearch() {
    goHash(cardSearchHash());
  }

  function backToGraph() {
    const path = openNote && !openNote.path.startsWith("locked:") ? openNote.path : selectedCardPath;
    setGraphCenter(null);
    if (path) {
      setGraphLayer("all");
      setSelectedCardPath(path);
    }
    goHash(viewHash("graph"));
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

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      const profileBody: Record<string, unknown> = {
        display_name: form.get("displayName"),
        email: form.get("email"),
        phone: form.get("phone") || null,
        telegram: form.get("telegram") || null,
        website: form.get("website") || null,
        phone_public: form.get("phonePublic") === "on",
        telegram_public: form.get("telegramPublic") === "on",
      };
      if (user?.role === "editor" || user?.role === "admin") {
        profileBody.notify_queue_email = form.get("notifyQueueEmail") === "on";
        profileBody.notify_queue_telegram = form.get("notifyQueueTelegram") === "on";
      }
      if (user?.is_author) {
        profileBody.notify_card_changes = form.get("notifyCardChanges") === "on";
      }
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileBody),
      });
      if (!response.ok) throw new Error(await readError(response));
      setUser((await response.json()) as User);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadPendingInvites() {
    const response = await fetch("/api/invites");
    if (!response.ok) return;
    const body = (await response.json()) as { invites: { id: string; email: string; expires_at: string }[] };
    setPendingInvites(body.invites);
  }

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    setInviteNote("");
    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("inviteEmail") }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setInviteNote("Письмо со ссылкой отправлено.");
      event.currentTarget.reset();
      await loadPendingInvites();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadIntegrationTokens() {
    const response = await fetch("/api/users/me/integration-tokens");
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { tokens: IntegrationToken[] };
    setIntegrationTokens(body.tokens);
    const accessResponse = await fetch("/api/users/me/integration-tokens/access");
    if (accessResponse.ok) {
      const accessBody = (await accessResponse.json()) as { access: IntegrationAccess[] };
      setIntegrationAccess(accessBody.access);
    }
  }

  async function createIntegrationToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const allowDelete = form.get("tokenDelete") === "on";
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/users/me/integration-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("tokenName") || "Obsidian").trim() || "Obsidian",
          scopes: allowDelete
            ? ["personal:read", "personal:write", "personal:delete"]
            : ["personal:read", "personal:write"],
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await loadIntegrationTokens();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeIntegrationToken(tokenId: string) {
    if (!window.confirm("Отозвать этот токен? Плагин Obsidian перестанет писать в личное хранилище, пока не введёте новый.")) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/users/me/integration-tokens/${tokenId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) throw new Error(await readError(response));
      await loadIntegrationTokens();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (view !== "settings" || settingsBlock !== "integrations" || !user) return;
    void loadIntegrationTokens().catch((requestError: unknown) => {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    });
  }, [view, settingsBlock, user]);

  useEffect(() => {
    if (view !== "settings" || settingsBlock !== "invite" || !user) return;
    void loadPendingInvites();
  }, [view, settingsBlock, user]);

  function openDiffer() {
    if (!user) {
      setAuthOpen(true);
      goHash("#/auth");
      return;
    }
    if (!user.is_author) {
      setSettingsBlock("contract");
      setError("Чтобы предлагать в общую, примите договор автора в настройках.");
      goHash(viewHash("user"));
      return;
    }
    setError("");
    goHash(viewHash("differ"));
  }

  async function acceptInbound(path: string) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/differ/inbound/${path.split("/").map(encodeURIComponent).join("/")}/accept`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as DifferResponse;
      setDifferences(body.differences);
      setInbound(body.inbound ?? []);
      setUploadStamp((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось принять карточку");
    } finally {
      setSubmitting(false);
    }
  }

  async function proposeSelected() {
    if (user?.role !== "user" || proposedPaths.length === 0) return;
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
        const body = (await listed.json()) as ProposalListResponse;
        setProposals(body.proposals);
        setEditorialQueueMode(body.editorial_queue_mode);
      }
      const differ = await fetch("/api/differ");
      if (differ.ok) {
        const body = (await differ.json()) as DifferResponse;
        setDifferences(body.differences);
        setInbound(body.inbound ?? []);
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
      const detail = (await response.json()) as Proposal;
      setOpenProposal(detail);
      setOpenProposalCard(detail.diff[0]?.path ?? null);
      await loadProposalGraphDiff(id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleProposalDetail(id: string) {
    if (openProposal?.id === id) {
      setOpenProposal(null);
      setOpenProposalCard(null);
      setProposalDiff(null);
      setDecisionReason("");
      return;
    }
    void openProposalDetail(id);
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
      setOpenProposal(action === "approve" ? null : updated);
      if (action === "approve") setOpenProposalCard(null);
      if (action === "reject") setQueueTab("rejected");
      if (action === "request-changes") setQueueTab("in_progress");
      setDecisionReason("");
      await loadProposalGraphDiff(id);
      const listed = await fetch("/api/proposals");
      if (listed.ok) {
        const body = (await listed.json()) as ProposalListResponse;
        setProposals(body.proposals);
        setEditorialQueueMode(body.editorial_queue_mode);
      }
      const status = await fetch("/api/repository/status");
      if (status.ok) {
        setRepository((await status.json()) as RepositoryStatusResponse);
      }
      const differ = await fetch("/api/differ");
      if (differ.ok) {
        const body = (await differ.json()) as DifferResponse;
        setDifferences(body.differences);
        setInbound(body.inbound ?? []);
      }
      const mine = await fetch("/api/contributions/me");
      if (mine.ok) {
        setContributions((await mine.json()) as ContributionsResponse);
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
      const detail = (await response.json()) as NoteDetail;
      setNoteComments([]);
      setOpenNote(detail);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  async function finishSignedIn(next: User) {
    setUser(next);
    setAuthOpen(false);
    setAuthNote("");
    setResetToken("");
    setLoginByMail(false);
    setMailChallengeStartedAt(null);
    const route = parseAppRoute(window.location.hash);
    if (route.kind === "auth" || route.kind === "graph") goHash(viewHash("graph"));
  }

  function expireMailChallenge(message: string, nextMode: AuthMode = mode) {
    setResetToken("");
    setMailChallengeStartedAt(null);
    if (nextMode === "login") {
      setMode("login");
      setLoginByMail(true);
    } else if (nextMode === "confirm") {
      setMode("confirm");
      setLoginByMail(false);
    } else {
      setMode("reset");
      setLoginByMail(false);
    }
    setAuthOpen(true);
    setAuthNote(message);
    goHash("#/auth");
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  }

  useEffect(() => {
    if (mailChallengeStartedAt == null) return;
    const tick = () => {
      const now = Date.now();
      setMailChallengeClock(now);
      if (mailCodeExpired(mailChallengeStartedAt, mailCodeTtlMinutes, now)) {
        expireMailChallenge("Ссылка или код истекли. Запросите письмо снова.");
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
    // expireMailChallenge is local state setter wrap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailChallengeStartedAt, mailCodeTtlMinutes]);

  async function verifyEmailToken(purpose: "confirm" | "login", token: string) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, token }),
      });
      if (!response.ok) {
        const message = await readError(response);
        if (response.status === 401) {
          expireMailChallenge(
            "Ссылка или код истекли. Запросите письмо снова.",
            purpose === "login" ? "login" : "confirm",
          );
        }
        throw new Error(message);
      }
      await finishSignedIn((await response.json()) as User);
      if (window.location.hash.startsWith("#/auth/")) {
        window.location.hash = "";
      }
    } catch (requestError) {
      setAuthOpen(true);
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const parsed = parseAuthHash(window.location.hash);
    if (!parsed) return;
    if (parsed.purpose === "reset") {
      setAuthOpen(true);
      setMode("reset");
      setLoginByMail(false);
      setResetToken(parsed.token);
      setMailChallengeStartedAt(Date.now());
      setAuthNote("Введите новый пароль, чтобы завершить сброс.");
      return;
    }
    if (parsed.purpose === "invite") {
      setAuthOpen(true);
      setMode("invite");
      setLoginByMail(false);
      setInviteToken(parsed.token);
      setInviteEmail("");
      setInviteInviter("");
      setAuthNote("Задайте логин и пароль по ссылке из письма.");
      void fetch(`/api/auth/invite?token=${encodeURIComponent(parsed.token)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(await readError(response));
          return (await response.json()) as { email: string; inviter_username: string };
        })
        .then((body) => {
          setInviteEmail(body.email);
          setInviteInviter(body.inviter_username);
          setAuthNote(`Вас пригласил @${body.inviter_username}.`);
        })
        .catch((requestError: unknown) => {
          setError(requestError instanceof Error ? requestError.message : "Ссылка недействительна");
        });
      return;
    }
    if (parsed.purpose === "login") {
      setMode("login");
      setLoginByMail(true);
    }
    void verifyEmailToken(parsed.purpose, parsed.token);
    // hash consume once on load / hash change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationHash]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setError("");
    setAuthNote("");

    const form = new FormData(formElement);
    try {
      if (mode === "reset") {
        const identifier = String(form.get("identifier") || form.get("email") || "");
        const code = String(form.get("code") || "").trim();
        const password = String(form.get("password") || "");
        if (!code && !resetToken) {
          const requested = await fetch("/api/auth/email/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier, purpose: "reset" }),
          });
          if (!requested.ok) throw new Error(await readError(requested));
          setMailChallengeStartedAt(Date.now());
          setAuthNote("Если такая учётка есть, письмо уже на её почте.");
          return;
        }
        const reset = await fetch("/api/auth/password/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: identifier || undefined,
            purpose: "reset",
            code: code || undefined,
            token: resetToken || undefined,
            password,
          }),
        });
        if (!reset.ok) {
          const message = await readError(reset);
          if (reset.status === 401) {
            expireMailChallenge("Ссылка или код истекли. Запросите письмо снова.");
          }
          throw new Error(message);
        }
        setResetToken("");
        setMailChallengeStartedAt(null);
        await finishSignedIn((await reset.json()) as User);
        formElement.reset();
        return;
      }
      if (mode === "confirm") {
        const email = String(form.get("email") || "");
        const code = String(form.get("code") || "").trim();
        if (!code) {
          const requested = await fetch("/api/auth/email/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: email, purpose: "confirm" }),
          });
          if (!requested.ok) throw new Error(await readError(requested));
          setMailChallengeStartedAt(Date.now());
          setAuthNote("Если такая почта есть, письмо уже отправлено.");
          return;
        }
        const verified = await fetch("/api/auth/email/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, purpose: "confirm", code }),
        });
        if (!verified.ok) throw new Error(await readError(verified));
        await finishSignedIn((await verified.json()) as User);
        formElement.reset();
        return;
      }

      if (mode === "login" && loginByMail) {
        const identifier = String(form.get("identifier") || form.get("username") || "");
        const code = String(form.get("code") || "").trim();
        if (!code) {
          const requested = await fetch("/api/auth/email/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier, purpose: "login" }),
          });
          if (!requested.ok) throw new Error(await readError(requested));
          setMailChallengeStartedAt(Date.now());
          setAuthNote("Если такая учётка есть, письмо уже на её почте.");
          return;
        }
        const verified = await fetch("/api/auth/email/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, purpose: "login", code }),
        });
        if (!verified.ok) {
          const message = await readError(verified);
          if (verified.status === 401) {
            expireMailChallenge("Ссылка или код истекли. Запросите письмо снова.", "login");
          }
          throw new Error(message);
        }
        await finishSignedIn((await verified.json()) as User);
        formElement.reset();
        return;
      }

      if (mode === "invite") {
        const accepted = await fetch("/api/auth/invite/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: inviteToken || String(form.get("inviteToken") || ""),
            username: form.get("username"),
            password: form.get("password"),
            display_name: form.get("displayName"),
          }),
        });
        if (!accepted.ok) throw new Error(await readError(accepted));
        setInviteToken("");
        setInviteEmail("");
        setInviteInviter("");
        await finishSignedIn((await accepted.json()) as User);
        formElement.reset();
        return;
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await finishSignedIn((await response.json()) as User);
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
      setAuthOpen(false);
      goHash(viewHash("graph"));
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

  const canReview = user?.role === "editor" || user?.role === "admin";
  const canProposeToRhizome = user?.role === "user";
  const queueEmptyHint = canReview && editorialQueueMode === "none"
    ? "Нет грантов"
    : queueTab === "new"
      ? (canReview
        ? "Нет новых предложений: редактор их ещё не трогал."
        : "Нет предложений, которые редактор ещё не смотрел.")
      : queueTab === "in_progress"
        ? "Нет возвращённых на доработку."
        : "Нет отклонённых предложений.";
  const scopedProposals = view === "offer"
    ? proposals.filter((item) => item.author.id === user?.id)
    : proposals;
  const queueCounts = {
    new: scopedProposals.filter((item) => proposalQueueTab(item.status) === "new").length,
    in_progress: scopedProposals.filter((item) => proposalQueueTab(item.status) === "in_progress").length,
    rejected: scopedProposals.filter((item) => proposalQueueTab(item.status) === "rejected").length,
  };
  const queuedOnTab = scopedProposals.filter((item) => proposalQueueTab(item.status) === queueTab);
  const proposedLinks = (proposalDiff?.edges ?? []).filter((edge) => edge.change === "added");

  function goHash(hash: string) {
    if (window.location.hash === hash) {
      setLocationHash(hash);
      return;
    }
    window.location.hash = hash;
  }

  function openSettings(block: SettingsBlock = "profile") {
    setSettingsBlock(block);
    goHash(viewHash("user"));
  }

  function openAbout() {
    setAuthOpen(false);
    goHash(viewHash("about"));
  }

  function openJoin() {
    setError("");
    setAuthNote("Новая учётка только по ссылке из письма-приглашения.");
    setMode("login");
    setAuthOpen(true);
    goHash("#/auth");
  }

  const dataBroken = Boolean(graphLoadError || statusFailed);
  const chromeHealth: HealthState =
    health === "checking" || health === "offline" ? health : dataBroken ? "degraded" : "online";
  const healthCaption =
    chromeHealth === "online"
      ? "Система доступна"
      : chromeHealth === "checking"
        ? "Проверка"
        : chromeHealth === "degraded"
          ? "Данные не загрузились"
          : "Нет связи";

  const legalAboutPanel = (
    <section className="notes-panel" aria-labelledby="about-heading">
      <div>
        <h2 id="about-heading">О программе</h2>
        <div className="about-credits">
          <p>
            <strong>Ризома психоанализа</strong> — {RHIZOME_LEAD}
          </p>
          <p>
            Карточки соединены в общий граф — ризому, по которой можно двигаться от узла к узлу.
            База никогда не будет закончена и бесконечно обновляется: каждый автор ведёт свой слой
            заметок и предлагает их в общую ризому.
          </p>
          <p>
            Главный редактор ризомы — Мария Надршина. Следить за обновлениями можно в{" "}
            <a href="https://t.me/unconsciousjourney" target="_blank" rel="noreferrer">
              телеграм-канале
            </a>
            .
          </p>
          <p>
            Сайт работает на GraphNotes — движке для совместных баз знаний. Автор и разработчик
            GraphNotes — Юрий Ефимов (
            <a href="https://t.me/guide_psy" target="_blank" rel="noreferrer">
              @guide_psy
            </a>
            ).
          </p>
          <p>
            <button className="button button--primary" type="button" onClick={() => openJoin()}>
              Стать автором
            </button>
          </p>
        </div>
      </div>
    </section>
  );

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
          <button className={view === "graph_test" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => goHash(viewHash("graph_test"))}>
            Тестовый граф
          </button>
          {user?.role === "admin" && (
            <button className={view === "invites" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => goHash(viewHash("invites"))}>
              Инвайты
            </button>
          )}
          <button
            className={view === "card" || view === "search" ? "button button--quiet tab--active" : "button button--quiet"}
            type="button"
            onClick={() => openCardSearch()}
            aria-current={view === "card" || view === "search" ? "page" : undefined}
          >
            Поиск
          </button>
          {user?.is_author && (
            <button className={view === "differ" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => goHash(viewHash("differ"))}>
              Сверка
            </button>
          )}
          {user && (
            <button className={view === "offer" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => goHash(viewHash("offer"))}>
              Предложения
            </button>
          )}
          {canReview && (
            <button className={view === "queue" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => goHash(viewHash("queue"))}>
              Очередь
            </button>
          )}
          {user && (
            <button className={view === "contribution" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => goHash(viewHash("contribution"))}>
              Мой вклад
            </button>
          )}
          {user?.role === "admin" && (
            <button className={view === "admin" ? "button button--quiet tab--active" : "button button--quiet"} type="button" onClick={() => goHash(viewHash("admin"))}>
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
            <button className="button button--primary" type="button" onClick={() => { setMode("login"); setError(""); setAuthOpen(true); goHash("#/auth"); }}>
              Войти
            </button>
          )}
          <div className={`status status--${chromeHealth}`} role="status">
            <span className="status__dot" aria-hidden="true" />
            {sessionLost ? "Связь потеряна" : healthCaption}
          </div>
        </div>
      </header>

      {authChecking ? (
        <section className="loading" aria-live="polite">
          <p>Загружаем ризому…</p>
        </section>
      ) : user ? (
        <>
          {view === "search" && (
            <CardSearch
              canReadNotes
              role={user.role}
              hasPersonal={Boolean(repository?.personal?.connected) || personalNotes.length > 0}
              onNeedAuth={() => { setAuthOpen(true); goHash("#/auth"); }}
            />
          )}
          {view === "card" && (
          <section className="notes-panel notes-panel--card card-workspace" aria-labelledby="card-heading">
            <div className="card-workspace__main">
            <div>
              <p className="eyebrow">Карточка</p>
              <h2 id="card-heading">{openNote?.title || stackedPersonal?.title || missingCard?.title || "Карточка ризомы"}</h2>
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
            ) : (openNote || stackedPersonal) ? (
              <article className="note-read">
                {openNote && (
                  <div className={stackedPersonal ? "card-stack__pane" : undefined}>
                    {stackedPersonal ? <h3 className="card-stack__label">Ризома</h3> : null}
                    <MarkdownBody
                      body={openNote.body}
                      note={openNote}
                      nodes={sharedGraph?.nodes ?? []}
                      cardPath={cardPath ?? openNote.path}
                      signedIn
                      onCreateMissing={(path) => void createMissingCard(path)}
                    />
                    <CardHistory cardPath={cardPath ?? openNote.path} />
                    {openNote && !openNote.path.startsWith("personal:") && !openNote.path.startsWith("proposal:") ? (
                    <div>
                      <p className="admin-panel__hint">Комментарии: любой вошедший; редактор принимает.</p>
                      <ul className="note-list">
                        {noteComments.map((item) => (
                          <li key={item.id}>
                            <span className="note-link">
                              <strong><ActorLink actor={item.author} /></strong>
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
                    ) : null}
                  </div>
                )}
                {stackedPersonal && (
                  <div className="card-stack__pane">
                    <h3 className="card-stack__label">Ваша</h3>
                    <MarkdownBody
                      body={stackedPersonal.body}
                      note={stackedPersonal}
                      nodes={sharedGraph?.nodes ?? []}
                      cardPath={`personal:${cardFilePath(stackedPersonal.path)}`}
                      signedIn
                      onCreateMissing={(path) => void createMissingCard(path)}
                    />
                    <CardHistory cardPath={`personal:${cardFilePath(stackedPersonal.path)}`} />
                  </div>
                )}
                {openNote && stackedPersonal && user.is_author && (
                  <p className="admin-panel__hint">
                    <button className="auth-link" type="button" onClick={() => openDiffer()}>
                      Сравнить в Сверке
                    </button>
                  </p>
                )}
              </article>
            ) : missingCard ? (
              <div className="missing-card">
                <p className="admin-panel__hint" role="status">Карточки пока нет</p>
                {user ? (
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={submitting}
                    onClick={() => void createMissingCard(missingCard.path)}
                  >
                    Создать карточку
                  </button>
                ) : null}
              </div>
            ) : error ? (
              <p className="admin-panel__hint" role="status">Карточка не загрузилась.</p>
            ) : (
              <p className="admin-panel__hint" role="status">Загружаем карточку…</p>
            )}
            </div>
            {showCardLocalGraph ? (
            <aside className="card-workspace__graph" aria-label="Локальный граф карточки">
                <p className="eyebrow">Рядом</p>
                <h3>Граф</h3>
                <GraphView
                  variant="aside"
                  graph={sharedGraph}
                  loading={graphLoading}
                  selectedPath={selectedCardPath || cardPath}
                  localCenter={cardPath ? cardFilePath(cardPath) : null}
                  localDepth={graphDepth}
                  canReadNotes
                  filterKind={cardPath && isOwnPersonalCard(cardPath) ? "personal" : graphLayer}
                  onLocalCenterChange={() => undefined}
                  onLocalDepthChange={setGraphDepth}
                  theme={theme}
                />
              </aside>
            ) : null}
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
                Здесь имя, почта, контакты, договор автора, токены плагина Obsidian и приглашение человека. Это не граф и не очередь.
              </p>
            </div>
            <div className="appearance-row">
              <p className="admin-panel__hint">Оформление: {theme === "dark" ? "тёмная" : "светлая"} тема. Выбор хранится в этом браузере.</p>
              <ThemeSwitcher theme={theme} onToggle={toggleTheme} />
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="tabs tabs--four" role="tablist" aria-label="Блоки настроек">
              <button className={settingsBlock === "profile" ? "tab tab--active" : "tab"} type="button" onClick={() => setSettingsBlock("profile")}>Личные данные</button>
              <button className={settingsBlock === "contract" ? "tab tab--active" : "tab"} type="button" onClick={() => setSettingsBlock("contract")}>Договор автора</button>
              <button className={settingsBlock === "integrations" ? "tab tab--active" : "tab"} type="button" onClick={() => setSettingsBlock("integrations")}>Obsidian</button>
              <button className={settingsBlock === "invite" ? "tab tab--active" : "tab"} type="button" onClick={() => setSettingsBlock("invite")}>Пригласить пользователя</button>
            </div>
            {settingsBlock === "profile" && (
              <form className="connect-form" onSubmit={(event) => void saveProfile(event)}>
                <InviteAttribution
                  invitedAt={userCard?.invited_at}
                  inviterUsername={userCard?.inviter?.username}
                />
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
                {(user.role === "editor" || user.role === "admin") && (
                  <>
                    <p className="admin-panel__hint">Новые правки по ризоме: по умолчанию выключено, чтобы не слать лишние письма.</p>
                    <label className="contract-check">
                      <input name="notifyQueueEmail" type="checkbox" defaultChecked={user.notify_queue_email} />
                      <span>Письмо, когда в очереди новые правки</span>
                    </label>
                    <label className="contract-check">
                      <input name="notifyQueueTelegram" type="checkbox" defaultChecked={user.notify_queue_telegram} />
                      <span>Telegram, когда в очереди новые правки (не вход)</span>
                    </label>
                  </>
                )}
                {user.is_author && (
                  <label className="contract-check">
                    <input name="notifyCardChanges" type="checkbox" defaultChecked={user.notify_card_changes} />
                    <span>Получать уведомления об изменениях в карточках, которые вы правили</span>
                  </label>
                )}
                <label>
                  Сайт <span className="optional">необязательно</span>
                  <input name="website" defaultValue={user.website ?? ""} maxLength={300} />
                </label>
                <button className="button button--primary" type="submit" disabled={submitting}>Сохранить</button>
              </form>
            )}
            {settingsBlock === "invite" && (
              <form className="connect-form" onSubmit={(event) => void sendInvite(event)}>
                <p className="admin-panel__hint">
                  Пригласить человека: укажите почту, сервер пришлёт ссылку. Учётка появится, когда человек откроет письмо.
                </p>
                <label>
                  Почта приглашаемого
                  <input name="inviteEmail" type="email" maxLength={320} required autoComplete="email" />
                </label>
                {inviteNote && <p className="admin-panel__hint" role="status">{inviteNote}</p>}
                <button className="button button--primary" type="submit" disabled={submitting}>Отправить приглашение</button>
                {pendingInvites.length > 0 && (
                  <ul className="note-list">
                    {pendingInvites.map((item) => (
                      <li key={item.id}>
                        <span className="note-link">
                          <strong>{item.email}</strong>
                          <small>до {new Date(item.expires_at).toLocaleString("ru")}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </form>
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
            {settingsBlock === "integrations" && (
              <div className="settings-stack">
                <p className="admin-panel__hint">
                  Ключ живёт в кабинете: создайте и скопируйте в плагин. Плагин запомнит. Срок по умолчанию 30 дней, не больше 90. Чужой вход — отзовите ключ здесь. Доступ вернули — новый ключ снова из кабинета в плагин. Общую ризому и Differ ключ не трогает.
                </p>
                <form className="connect-form" onSubmit={(event) => void createIntegrationToken(event)}>
                  <label>
                    Имя
                    <input name="tokenName" defaultValue="Obsidian" maxLength={80} required />
                  </label>
                  <label className="contract-check">
                    <input name="tokenDelete" type="checkbox" />
                    <span>Разрешить удаление файлов на сервере (personal:delete)</span>
                  </label>
                  <button className="button button--primary" type="submit" disabled={submitting}>
                    Создать токен
                  </button>
                </form>
                {integrationTokens.length === 0 ? (
                  <p className="admin-panel__hint">Активных токенов нет.</p>
                ) : (
                  <ul className="note-list">
                    {integrationTokens.map((item) => (
                      <li key={item.id}>
                        <div className="note-pick">
                          <span className="note-link">
                            <strong>{item.name}</strong>
                            <small>
                              {item.scopes.join(", ")} · до {new Date(item.expires_at).toLocaleString("ru")}
                              {item.last_used_at ? ` · вход ${new Date(item.last_used_at).toLocaleString("ru")}` : ""}
                              {item.revoked_at ? " · отозван" : ""}
                            </small>
                            {item.token ? (
                              <label>
                                Токен
                                <input value={item.token} readOnly onFocus={(event) => event.currentTarget.select()} />
                              </label>
                            ) : (
                              <small>{item.token_prefix}…</small>
                            )}
                          </span>
                          {item.revoked_at == null && (
                            <button
                              className="button button--danger"
                              type="button"
                              disabled={submitting}
                              onClick={() => void revokeIntegrationToken(item.id)}
                            >
                              Отозвать
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="admin-panel__hint">
                  Входы с токеном: кто, откуда (IP) и какой токен. Храним около полугода, не дольше года — чтобы не раздувать рабочую базу. Чужой адрес — отзовите токен.
                </p>
                {integrationAccess.length === 0 ? (
                  <p className="admin-panel__hint">Пока никто не заходил с токеном.</p>
                ) : (
                  <ul className="note-list">
                    {integrationAccess.map((item) => (
                      <li key={item.id}>
                        <span className="note-link">
                          <strong>{item.username} · {item.token_name} ({item.token_prefix}…)</strong>
                          <small>
                            {new Date(item.created_at).toLocaleString("ru")} · {item.ip || "IP неизвестен"}
                            {item.user_agent ? ` · ${item.user_agent}` : ""}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="settings-session">
              <p className="admin-panel__hint">Сессия: {user.display_name} (@{user.username})</p>
              <button className="button button--quiet" type="button" onClick={() => void logout()} disabled={submitting}>
                Выйти
              </button>
            </div>
          </section>
          )}
          {view === "differ" && user?.is_author && (
            <section className="notes-panel" aria-labelledby="differ-heading">
              <div>
                <p className="eyebrow">Сверка</p>
                <h2 id="differ-heading">Личное и ризома</h2>
                <p className="admin-panel__hint">
                  {canProposeToRhizome
                    ? "В ризому — отметить отличающиеся карточки и предложить. Из ризомы — чужие правки по карточкам, которые вы уже отдавали."
                    : "Из ризомы — чужие правки по карточкам, которые вы уже отдавали. Предложить в очередь с этой учётки нельзя."}
                </p>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              {canProposeToRhizome && (
                <>
              <h3>В ризому</h3>
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
                </>
              )}
              <h3>Из ризомы</h3>
              {inbound.length === 0 ? (
                <p className="admin-panel__hint">Нет входящих правок по вашим карточкам.</p>
              ) : (
                <ul className="note-list">
                  {inbound.map((item) => (
                    <li key={`in-${item.path}`}>
                      <div className="note-pick">
                        <button className="note-link" type="button" onClick={() => void openPersonalNote(item.path)}>
                          <strong>{item.title}</strong>
                          <small>{item.path} · чужие правки в общей</small>
                        </button>
                        <button
                          className="button button--quiet"
                          type="button"
                          disabled={submitting}
                          onClick={() => void acceptInbound(item.path)}
                        >
                          Принять в своё
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {uploadEvents.length > 0 && (
                <div>
                  <p className="admin-panel__hint">История загрузок в личный слой — в GraphNotes, не в git log.</p>
                  <ul className="note-list">
                    {uploadEvents.slice(0, 8).map((item) => (
                      <li key={`${item.path}-${item.created_at}`}>
                        <span className="note-link">
                          <strong>{item.path}</strong>
                          <small>
                            {new Date(item.created_at).toLocaleString("ru")} · {item.content_hash.slice(0, 8)}
                            {item.differed ? " · Differ" : ""}
                            {item.proposed ? " · в предложении" : ""}
                            {item.outcome ? ` · ${item.outcome}` : ""}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {personalNotes.length > 0 && user.is_author && (
                <div>
                  <p className="admin-panel__hint">
                    Закрытый корпус остаётся у вас: не в отличающихся и не в общей. Ссылка из общей — замок, не текст.
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
                    <>
                      <MarkdownBody
                        body={openNote.body}
                        note={openNote}
                        nodes={sharedGraph?.nodes ?? []}
                        cardPath={cardPath ?? `personal:${cardFilePath(openNote.path)}`}
                        signedIn
                        onCreateMissing={(path) => void createMissingCard(path)}
                      />
                      <CardHistory cardPath={cardPath ?? `personal:${cardFilePath(openNote.path)}`} />
                    </>
                  )}
                </article>
              )}
            </section>
          )}
          {view === "person" && (
            <PersonCardPage
              card={personCard}
              loading={Boolean(personLogin) && !personCard && !error}
              error={error}
              onOpenNote={(path) => goHash(cardHash(path))}
            />
          )}
          {user && view === "contribution" && (
            <section className="notes-panel" aria-labelledby="contrib-heading">
              <div>
                <p className="eyebrow">Автор</p>
                <h2 id="contrib-heading">Мой вклад</h2>
                <p className="admin-panel__hint">
                  Пустой список отличающихся не стирает принятое. Состояния: только в личном слое, предложено, принято в общую.
                  Карточка — след вклада в GraphNotes.
                </p>
              </div>
              {userCard && (
                <div className="profile-card" style={{ marginBottom: "1.25rem" }}>
                  <div className="avatar" aria-hidden="true">{userCard.user.display_name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <strong>{userCard.user.display_name}</strong>
                    <span>
                      @{userCard.user.username} · {roleLabel(userCard.user.role)}
                      {userCard.user.is_author ? " · автор" : ""}
                      {userCard.self && userCard.closed_count != null ? ` · закрыто ${userCard.closed_count}` : ""}
                    </span>
                    <InviteAttribution
                      invitedAt={userCard.invited_at}
                      inviterUsername={userCard.inviter?.username}
                    />
                  </div>
                  <p className="admin-panel__hint">
                    Принято в общую: {ruNotes(userCard.stats.accepted)}, {userCard.stats.links_accepted} связей.
                    {userCard.user.website ? ` · ${userCard.user.website}` : ""}
                    {userCard.user.phone ? ` · ${userCard.user.phone}` : ""}
                    {userCard.user.telegram ? ` · ${userCard.user.telegram}` : ""}
                    {" "}
                    <a className="person-link" href={personCardHash(userCard.user.username)}>Публичная карточка</a>
                  </p>
                  {userCard.achievements && (
                    <div className="stat-grid" aria-label="Публичные достижения">
                      <div className="stat-card">
                        <strong>{userCard.achievements.proposals}</strong>
                        <span>Предложений</span>
                      </div>
                      <div className="stat-card">
                        <strong>{userCard.achievements.created}</strong>
                        <span>Создано в ризоме</span>
                      </div>
                      <div className="stat-card">
                        <strong>{userCard.achievements.edits}</strong>
                        <span>Правок в ризоме</span>
                      </div>
                    </div>
                  )}
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
              {contributionIsEmpty(contributions) || !contributions ? (
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
          {(view === "queue" || view === "offer") && (
          <section className="notes-panel" aria-labelledby="proposals-heading">
            <div>
              <p className="eyebrow">Публикация</p>
              <h2 id="proposals-heading">{view === "queue" ? "Очередь предложений" : "Мои предложения"}</h2>
              <p className="admin-panel__hint">
                {view === "queue"
                  ? "Откройте одну заявку. Внутри — одна карточка с текстом. Кнопки под карточкой решают всю заявку. Потом связи и ризома."
                  : "Ваши заявки в ризому. Откройте одну — внутри одна карточка с текстом. Возврат и отклонение приходят с комментарием редактора."}
              </p>
            </div>
            <div className="tabs tabs--three" role="tablist" aria-label="Папки очереди">
              <button
                className={queueTab === "new" ? "tab tab--active" : "tab"}
                type="button"
                role="tab"
                aria-selected={queueTab === "new"}
                onClick={() => setQueueTab("new")}
              >
                Новые{queueCounts.new > 0 ? ` (${queueCounts.new})` : ""}
              </button>
              <button
                className={queueTab === "in_progress" ? "tab tab--active" : "tab"}
                type="button"
                role="tab"
                aria-selected={queueTab === "in_progress"}
                onClick={() => setQueueTab("in_progress")}
              >
                В работе{queueCounts.in_progress > 0 ? ` (${queueCounts.in_progress})` : ""}
              </button>
              <button
                className={queueTab === "rejected" ? "tab tab--active" : "tab"}
                type="button"
                role="tab"
                aria-selected={queueTab === "rejected"}
                onClick={() => setQueueTab("rejected")}
              >
                Отклонённые{queueCounts.rejected > 0 ? ` (${queueCounts.rejected})` : ""}
              </button>
            </div>
            {queuedOnTab.length === 0 ? (
              <p className="admin-panel__hint">{queueEmptyHint}</p>
            ) : (
              <ul className="proposal-list">
                {queuedOnTab.map((item) => {
                  const expanded = openProposal?.id === item.id;
                  const canDecide = Boolean(canReview && user && item.author.id !== user.id && proposalIsDecidable(expanded ? openProposal.status : item.status));
                  return (
                    <li key={item.id} className={expanded ? "proposal-item proposal-item--open" : "proposal-item"}>
                      <button
                        className={expanded ? "proposal-row proposal-row--open" : "proposal-row"}
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleProposalDetail(item.id)}
                      >
                        <strong>{item.summary}</strong>
                        <span>{item.author.display_name} · {proposalStatusLabel(item.status)}</span>
                        {item.reason && (queueTab === "in_progress" || queueTab === "rejected") && (
                          <small>Комментарий редактора: {item.reason}</small>
                        )}
                      </button>
                      {expanded && openProposal && (
                        <article className="proposal-detail">
                          <p className="admin-panel__hint">
                            <a className="person-link" href={personCardHash(openProposal.author.username)}>
                              {openProposal.author.display_name}
                            </a>
                            {" · "}{proposalStatusLabel(openProposal.status)}
                          </p>
                          {openProposal.reason && (openProposal.status === "rejected" || openProposal.status === "changes_requested") && (
                            <p className="proposal-comment" role="status">
                              Комментарий редактора: {openProposal.reason}
                            </p>
                          )}
                          {canDecide && (
                            <label className="proposal-reason">
                              Комментарий автору
                              <input
                                value={decisionReason}
                                onChange={(event) => setDecisionReason(event.target.value)}
                                maxLength={255}
                                placeholder="обязателен, чтобы отклонить или доработать"
                              />
                            </label>
                          )}
                          <div className="proposal-text">
                            <h4>Текст и связи</h4>
                            {openProposal.diff.length === 0 ? (
                              <p className="admin-panel__hint">В предложении нет файлов.</p>
                            ) : (
                              openProposal.diff.map((file) => {
                                const cardOpen = openProposalCard === file.path;
                                return (
                                  <article className={cardOpen ? "proposal-card proposal-card--open" : "proposal-card"} key={file.path}>
                                    <button
                                      className="proposal-card__toggle"
                                      type="button"
                                      aria-expanded={cardOpen}
                                      onClick={() => setOpenProposalCard(cardOpen ? null : file.path)}
                                    >
                                      <strong>{proposalCardTitle(file.path, file.body || "")}</strong>
                                      <small>
                                        {file.path}
                                        {openProposal.added.includes(file.path) ? " · новая карточка" : ""}
                                        {openProposal.changed.includes(file.path) ? " · изменение текста" : ""}
                                      </small>
                                    </button>
                                    {cardOpen && (
                                      <div className="proposal-card__body">
                                        {file.html || (file.rows && file.rows.length > 0) ? (
                                          <WikiDiffTable
                                            html={file.html}
                                            rows={file.rows}
                                            added={openProposal.added.includes(file.path)}
                                          />
                                        ) : file.body ? (
                                          <MarkdownBody
                                            body={file.body}
                                            note={{
                                              links: proposedLinks.filter((edge) => edge.source === file.path && !edge.unresolved).map((edge) => edge.target),
                                              unresolved_links: proposedLinks.filter((edge) => edge.source === file.path && edge.unresolved).map((edge) => edge.target),
                                            }}
                                            cardPath={`proposal:${openProposal.id}:${file.path}`}
                                            signedIn
                                            onCreateMissing={(path) => void createMissingCard(path)}
                                          />
                                        ) : (
                                          <pre className="proposal-diff">{file.diff || file.path}</pre>
                                        )}
                                      </div>
                                    )}
                                    {canDecide && (
                                      <div className="proposal-actions">
                                        <button className="button button--primary" type="button" disabled={submitting} onClick={() => void decideProposal(openProposal.id, "approve")}>
                                          Принять
                                        </button>
                                        <button className="button button--danger" type="button" disabled={submitting || decisionReason.trim().length === 0} onClick={() => void decideProposal(openProposal.id, "reject")}>
                                          Отклонить
                                        </button>
                                        <button className="button button--quiet" type="button" disabled={submitting || decisionReason.trim().length === 0} onClick={() => void decideProposal(openProposal.id, "request-changes")}>
                                          Доработать
                                        </button>
                                      </div>
                                    )}
                                  </article>
                                );
                              })
                            )}
                            {proposedLinks.length > 0 && (
                              <div>
                                <h5>Связи</h5>
                                <ul className="note-list">
                                  {proposedLinks.map((edge) => (
                                    <li key={`${edge.source}-${edge.target}-${edge.type}`}>
                                      <span className="note-link">
                                        <strong>{edge.source} → {edge.target}</strong>
                                        <small>{edge.type}{edge.unresolved ? " · нет заметки" : ""}</small>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          <div className="proposal-rhizome">
                            <h4>Ризома</h4>
                            <GraphDiffView diff={proposalDiff} loading={proposalDiffLoading} theme={theme} />
                          </div>
                        </article>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          )}
          {view === "invites" && user.role === "admin" && (
            <section className="notes-panel notes-panel--graph" aria-labelledby="invites-heading">
              <div>
                <p className="eyebrow">Создатели</p>
                <h2 id="invites-heading">Инвайты</h2>
                <p className="admin-panel__hint">
                  Кто кого пригласил. Число и размер узла — сколько прямых связей.
                  Это не ризома и не админка. Клик по узлу открывает карточку человека.
                </p>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <InviteGraph graph={inviteGraph} loading={inviteGraphLoading} />
            </section>
          )}
          {view === "graph_test" && (
            <section className="notes-panel notes-panel--graph" aria-labelledby="graph-test-heading">
              <div>
                <p className="eyebrow">Проба</p>
                <h2 id="graph-test-heading">Тестовый граф</h2>
                <p className="admin-panel__hint">
                  Тот же индекс ризомы, другой холст: Pixi.js и d3-force. Канон остаётся
                  вкладка «Граф» (Cytoscape / fCoSE). Клик по узлу открывает карточку.
                </p>
                {graphLoadError ? <p className="form-error" role="alert">{graphLoadError}</p> : null}
              </div>
              <Suspense fallback={<p className="admin-panel__hint">Загружаем холст…</p>}>
                <PixiGraphView graph={sharedGraph} loading={graphLoading} />
              </Suspense>
            </section>
          )}
          {view === "graph" && (
            <section className="notes-panel notes-panel--graph" aria-labelledby="graph-heading">
              <div>
                <p className="eyebrow">Граф</p>
                <h2 id="graph-heading">{graphLayer === "personal" ? "Ваша личная ризома" : RHIZOME_TITLE}</h2>
                <p className="admin-panel__hint">
                  {graphLayer === "personal"
                    ? "Полный личный склад. По умолчанию на «Граф» — ризома; этот слой — фильтр на том же холсте, не отдельная вкладка."
                    : "По умолчанию — граф ризомы. Клик по узлу или ссылке открывает карточку; сбоку будет её локальный граф. Координаты раскладки — только отображение, не знание."}
                </p>
                {graphLoadError ? <p className="form-error" role="alert">{graphLoadError}</p> : null}
              </div>
              <div className="graph-actions">
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
                localCenter={graphCenter}
                localDepth={graphDepth}
                canReadNotes
                filterKind={graphLayer}
                onFilterKindChange={setGraphLayer}
                onLocalCenterChange={setGraphCenter}
                onLocalDepthChange={setGraphDepth}
                theme={theme}
              />
            </section>
          )}
          {view === "admin" && user.role === "admin" && (
            <AdminPanel
              currentUserId={user.id}
              submitting={submitting}
              error={error}
              onError={setError}
              onSubmitting={setSubmitting}
              onCurrentUserUpdated={(updated) => setUser((current) => current ? { ...current, ...updated } : current)}
              onSignedOut={() => {
                setUser(null);
                setAuthOpen(true);
                goHash(viewHash("graph"));
              }}
            />
          )}
          {view === "about" && legalAboutPanel}
        </>
      ) : (
        <>
        {authOpen && (
          <AuthPanel
            mode={mode}
            mailConfigured={mailConfigured}
            mailCodeTtlMinutes={mailCodeTtlMinutes}
            mailChallengeStartedAt={mailChallengeStartedAt}
            mailChallengeClock={mailChallengeClock}
            resetToken={resetToken}
            inviteToken={inviteToken}
            inviteEmail={inviteEmail}
            inviteInviter={inviteInviter}
            authNote={authNote}
            error={error}
            submitting={submitting}
            onMode={(next) => {
              setMode(next);
              setLoginByMail(false);
              setError("");
              setAuthNote("");
              setResetToken("");
              setMailChallengeStartedAt(null);
            }}
            onSubmit={(event) => void submitAuth(event)}
            onExpireReset={expireMailChallenge}
            onLoginByMail={(next) => {
              setLoginByMail(next);
              setError("");
              setAuthNote("");
              setMailChallengeStartedAt(null);
            }}
            loginByMail={loginByMail}
            onClose={() => {
              setAuthOpen(false);
              if (parseAppRoute(locationHash).kind === "auth") goHash(viewHash("graph"));
            }}
          />
        )}
        {view === "search" && (
          <CardSearch canReadNotes onNeedAuth={() => { setAuthOpen(true); goHash("#/auth"); }}
          />
        )}
        {view === "card" && (
          <section className="notes-panel notes-panel--card card-workspace" aria-labelledby="guest-card-heading">
            <div className="card-workspace__main">
            <div>
              <p className="eyebrow">Карточка</p>
              <h2 id="guest-card-heading">{openNote?.title || missingCard?.title || "Карточка ризомы"}</h2>
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
                <MarkdownBody body={openNote.body} note={openNote} nodes={sharedGraph?.nodes ?? []} cardPath={cardPath ?? openNote.path} />
                <CardHistory cardPath={cardPath ?? openNote.path} />
              </article>
            ) : missingCard ? (
              <p className="admin-panel__hint" role="status">Карточки пока нет</p>
            ) : error ? (
              <p className="admin-panel__hint" role="status">Карточка не загрузилась.</p>
            ) : (
              <p className="admin-panel__hint" role="status">Загружаем карточку…</p>
            )}
            </div>
            {showCardLocalGraph ? (
            <aside className="card-workspace__graph" aria-label="Локальный граф карточки">
                <p className="eyebrow">Рядом</p>
                <h3>Граф</h3>
                <GraphView
                  variant="aside"
                  graph={sharedGraph}
                  loading={graphLoading}
                  selectedPath={selectedCardPath || cardPath}
                  localCenter={cardPath ? cardFilePath(cardPath) : null}
                  localDepth={graphDepth}
                  canReadNotes
                  onLocalCenterChange={() => undefined}
                  onLocalDepthChange={setGraphDepth}
                  theme={theme}
                />
              </aside>
            ) : null}
          </section>
        )}
        {view === "person" && (
          <PersonCardPage
            card={personCard}
            loading={Boolean(personLogin) && !personCard && !error}
            error={error}
            onOpenNote={(path) => goHash(cardHash(path))}
          />
        )}
        {view === "about" && legalAboutPanel}
        {view === "graph_test" && !authOpen && (
          <section className="notes-panel notes-panel--graph" aria-labelledby="public-graph-test-heading">
            <div>
              <p className="eyebrow">Проба</p>
              <h2 id="public-graph-test-heading">Тестовый граф</h2>
              <p className="admin-panel__hint">
                Тот же публичный индекс, холст Pixi.js + d3-force. Канон — вкладка «Граф».
              </p>
              {graphLoadError ? <p className="form-error" role="alert">{graphLoadError}</p> : null}
            </div>
            <Suspense fallback={<p className="admin-panel__hint">Загружаем холст…</p>}>
              <PixiGraphView graph={sharedGraph} loading={graphLoading} />
            </Suspense>
          </section>
        )}
        {view !== "card" && view !== "search" && view !== "about" && view !== "person" && view !== "invites" && view !== "graph_test" && !authOpen && (
          <section className="notes-panel notes-panel--graph" aria-labelledby="public-graph-heading">
            <div>
              <p className="eyebrow">Граф</p>
              <h2 id="public-graph-heading">{RHIZOME_TITLE}</h2>
              <p className="admin-panel__hint">{RHIZOME_LEAD}</p>
              {graphLoadError ? (
                <p className="form-error" role="alert">
                  {graphLoadError} Обновите страницу или зайдите позже.
                </p>
              ) : (
                <p className="admin-panel__hint">
                  Публичный граф: клик по узлу или ссылке открывает карточку.
                </p>
              )}
            </div>
            <GraphView
              graph={sharedGraph}
              loading={graphLoading}
              selectedPath={selectedCardPath}
              localCenter={graphCenter}
              localDepth={graphDepth}
              canReadNotes
              onNeedAuth={() => { setAuthOpen(true); goHash("#/auth"); }}
              onLocalCenterChange={setGraphCenter}
              onLocalDepthChange={setGraphDepth}
              theme={theme}
            />
          </section>
        )}
        </>
      )}
      {!authChecking && (
        <footer className="legal-footer">
          <button
            className={view === "about" ? "button button--quiet tab--active" : "button button--quiet"}
            type="button"
            onClick={() => openAbout()}
          >
            О программе
          </button>
        </footer>
      )}
    </main>
  );
}
