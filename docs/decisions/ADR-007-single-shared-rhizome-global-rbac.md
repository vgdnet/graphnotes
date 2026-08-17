# ADR-007 - Single shared rhizome and global RBAC

Status: Accepted
Accepted: 2026-08-18

## Context

Earlier planning drifted toward multiple workspaces, workspace-scoped knowledge
repositories and additive `member/editor/reviewer/admin` permission groups.
That architecture is broader than the accepted GraphNotes product.

The MVP needs one collective canonical knowledge base and one personal working
rhizome per user. Proposal review is an editor responsibility, not a separate
product role.

## Decision

One GraphNotes installation has exactly:

- one shared rhizome containing approved collective knowledge;
- one personal rhizome for each user;
- zero workspace, organization, team, community or multi-shared-rhizome
  abstractions in the current product model.

Canonical product formula:

> Личная ризома — рабочее пространство человека; единая общая ризома —
> проверенное коллективное знание.

The MVP has three hierarchical global roles: `user < editor < admin`.

| Role | Permissions |
| --- | --- |
| `user` | read the shared rhizome; create/read/edit the user's own personal rhizome; create proposals |
| `editor` | all `user` permissions; directly edit the shared rhizome; inspect, approve, reject or return proposals with a reason |
| `admin` | all `user` and `editor` permissions; manage users, roles, blocking, recovery and audit |

An editor or admin may not approve their own proposal. Administrative and
editorial actions, including those performed by admin, are always audited.

Personal/shared are product visibility and responsibility layers. This decision
does not require separate physical databases. The implementation may use one
PostgreSQL database and one GitHub knowledge repository, provided ownership,
revision and visibility are explicit.

Markdown/Git remains the knowledge source of truth. A proposal may change
Markdown content and thereby change derived nodes, links, link direction and
type, tags and properties. Graph entities are never merged independently of the
Markdown representation that produces them.

Accepted proposal publication is atomic at the product-read boundary:

1. the proposal identifies immutable base and head Git revisions;
2. GitHub applies the accepted Markdown change as one canonical merge result;
3. the new shared projection is indexed for the merged revision in isolation;
4. the application switches the visible shared revision only after the index is
   complete and consistent;
5. readers see either the previous complete shared revision or the new complete
   revision, never a partially indexed mixture.

GitHub and PostgreSQL cannot participate in one ACID transaction. Therefore a
durable proposal/reconciliation state machine, idempotency and recovery replace
any false distributed-transaction guarantee.

## Representation

Derived records must distinguish at least:

- `shared`: approved shared revision;
- `personal`: a revision owned by exactly one user;
- `proposal`: immutable preview derived from proposal base/head revisions and
  not yet visible as shared knowledge.

The exact schema may use layer/revision/owner/proposal fields or revisioned
snapshots. It must not create a canonical graph file or ambiguous mutable rows
that mix published and unpublished knowledge.

## Consequences

- all workspace and multi-rhizome planning is removed from the MVP;
- API paths do not require `/workspaces/{id}`;
- Stage 2's global hierarchical `user/editor/admin` enum is sufficient for the
  MVP authorization model;
- Stage 3 binds the installation to one GitHub knowledge repository and maps
  one shared branch plus one personal state per user;
- Stage 5 owns revisioned derived-layer representation and safe rebuild;
- Stage 7 owns editor/admin shared editing, self-approval prevention, durable proposal
  state, atomic publication visibility, audit and reconciliation;
- Stage 8 owns text/graph impact preview for immutable proposal revisions;
- Stage 9 owns backup/restore and production recovery drills;
- scaling uses bounded subgraphs, pagination, indexes, incremental re-indexing,
  retention/archival and measured optimization before adding infrastructure;
- multiple shared rhizomes or workspace isolation require a future explicit
  product decision and a new ADR.
