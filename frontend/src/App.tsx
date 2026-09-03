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
  user: { id: string; username: string; display_name: string; role: string; is_author: boolean };
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
  const [adminContributions, setAdminContributions] = useState<AdminContributionsResponse | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
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
  const [authorContract, setAuthorContract] = useState<AuthorContract | null>(null);
  const [userCard, setUserCard] = useState<UserCard | null>(null);
  const [noteFeed, setNoteFeed] = useState<NoteFeedEvent[]>([]);
  const [noteComments, setNoteComments] = useState<NoteCommentItem[]>([]);
  const [commentDraft, setCommentDraft] = useState("");

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
    ])
      .then(([usersBody, contribBody]) => {
        setAdminUsers(usersBody.users);
        setAdminContributions(contribBody);
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
    if (!user?.is_author || !repository?.shared.connected) {
      setDifferences([]);
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
    const endpoint = origin === "personal"
      ? `/api/personal/notes/${encodeURI(filePath)}`
      : `/api/shared/notes/${encodeURI(filePath)}`;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(await readError(response));
      const detail = (await response.json()) as NoteDetail;
      setOpenNote(detail);
      if (origin !== "personal" && !detail.locked) {
        const [feed, comments] = await Promise.all([
          fetch(`/api/shared/notes/${encodeURI(filePath)}/feed`),
          fetch(`/api/shared/notes/${encodeURI(filePath)}/comments`),
        ]);
        if (feed.ok) setNoteFeed(((await feed.json()) as { events: NoteFeedEvent[] }).events);
        if (comments.ok) setNoteComments(((await comments.json()) as { comments: NoteCommentItem[] }).comments);
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
          email: form.get("email") || null,
          accept_author_contract: form.get("acceptAuthorContract") === "on",
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

  async function acceptAuthorContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accepted = new FormData(event.currentTarget).get("acceptAuthorContract") === "on";
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/author/accept", {
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
      const response = await fetch("/api/author/withdraw", { method: "POST" });
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
              {user.is_author ? (
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
              ) : (
                <form className="connect-form" onSubmit={(event) => void acceptAuthorContract(event)}>
                  <p className="admin-panel__hint">
                    Чтобы предлагать, загружать и связывать git как вклад, примите договор автора.
                  </p>
                  <AuthorContractCopy contract={authorContract} />
                  <label className="contract-check">
                    <input name="acceptAuthorContract" type="checkbox" required />
                    <span>Принимаю договор автора</span>
                  </label>
                  <button className="button button--primary" type="submit" disabled={submitting}>
                    Стать автором
                  </button>
                </form>
              )}
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
                <span>@{user.username} · {user.role}{user.is_author ? " · автор" : ""}</span>
              </div>
              {user.is_author && (
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={() => void withdrawAuthorContract()}
                  disabled={submitting}
                >
                  Отозвать статус автора
                </button>
              )}
              <button className="button button--quiet" onClick={() => void logout()} disabled={submitting}>
                Выйти
              </button>
            </aside>
          </section>
          {repository?.shared.connected && user?.is_author && (
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
                disabled={submitting || differLoading || proposedPaths.length === 0}
                onClick={() => void proposeSelected()}
              >
                Предложить в общую
              </button>
              <form className="connect-form" onSubmit={(event) => void importFallback(event)}>
                <label>
                  Загрузка .md или ZIP без git
                  <input name="file" type="file" accept=".md,.zip,text/markdown,application/zip" required />
                </label>
                <button className="button button--quiet" type="submit" disabled={submitting}>
                  Загрузить в личный слой
                </button>
              </form>
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
                    <pre>{openNote.body}</pre>
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
          {user && (
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
                          if (item.state === "accepted") void openGraphNote(item.path, "shared");
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
                <p className="admin-panel__hint">
                  Роли глобальны: editor включает права user, admin — все права.
                  Статистика вклада по всем учётным записям видна только здесь.
                </p>
              </div>
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
                      {contribRow && (
                        <p className="user-row__stats">
                          Карточки {contribRow.stats.notes} · добавлено {contribRow.stats.added} ·
                          принято {contribRow.stats.accepted} · связи {contribRow.stats.links}
                          {contribRow.review
                            ? ` · решения: принял ${contribRow.review.accepted}, отклонил ${contribRow.review.rejected}, вернул ${contribRow.review.returned}, откатил ${contribRow.review.rolled_back}`
                            : ""}
                        </p>
                      )}
                    </article>
                    );
                  })}
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
              {sharedLabel(repository?.shared ?? null)} Markdown остаётся в git
              общей ризомы. GraphNotes показывает её в приложении и файлами не отдаёт.
              Войдите, чтобы сравнить свой слой (git или загрузка .md) с общей.
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
              {mode === "register" && (
                <>
                  <AuthorContractCopy contract={authorContract} />
                  <label className="contract-check">
                    <input name="acceptAuthorContract" type="checkbox" />
                    <span>Принимаю договор автора (нужен, чтобы предлагать вклад)</span>
                  </label>
                </>
              )}
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
