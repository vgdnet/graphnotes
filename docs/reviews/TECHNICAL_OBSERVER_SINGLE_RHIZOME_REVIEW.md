# Technical Observer review - single shared rhizome

Date: 2026-08-18
Decision baseline: PRODUCT_SPEC 1.2 / ADR-007

## PASS

- Markdown/Git remains the canonical knowledge source; graph/index/proposal
  previews are derived.
- Product model now has exactly one shared rhizome and one personal rhizome per
  user.
- Global hierarchical RBAC `user < editor < admin` is sufficient for the MVP;
  no workspace-scoped role system is needed.
- Current Stage 2 application model already uses the three canonical role
  values; no role-model migration is required for ADR-007.
- Future API/stage specifications no longer require workspace IDs.
- Proposal graph changes are represented by Markdown/frontmatter revisions,
  not an independent graph patch.

## ARCHITECTURE DRIFT

Found and corrected in documentation:

- multiple workspace/shared-repository planning;
- workspace membership and additive `member/editor/reviewer/admin` groups;
- separate reviewer role although review belongs to editor/admin;
- `/api/workspaces/{id}/...` routes;
- index rows identified by workspace rather than explicit
  shared/personal/proposal revision context.

Application-code search found no workspace/domain implementation to remove.

## RISKS

### Distributed publication atomicity

GitHub and PostgreSQL cannot share an ACID transaction. Treating merge plus
index update as one database transaction would be false. Required mitigation:
durable proposal states, idempotent webhook/reconciliation, separate indexing
of merged revision and index-before-visible shared revision switch.

### One shared rhizome growth

- full-graph responses become too large;
- high node/link degree increases query and layout cost;
- Git history and per-user branches grow;
- retained proposal previews/index revisions consume PostgreSQL/disk;
- large proposal diffs become expensive;
- long rebuilds increase stale-index windows;
- proposal queues and audit history require pagination/retention.

Mitigation belongs in bounded APIs, PostgreSQL indexing/query plans,
incremental re-index, revision retention/archival and measured capacity
baselines. Do not add Neo4j/Redis/Celery/S3 before evidence and decision.

### Global admin power

Admin inherits editor/user rights. Accidental role change, shared edit or
proposal decision has broad impact. All such actions require actor/role/reason,
exact revision and immutable audit linkage; protect last active admin and test
recovery.

### Self-approval

Role checks alone are insufficient because an editor/admin can also be proposal
author. Decision endpoints must compare proposal author user ID with current
user ID and reject equality before GitHub merge.

## REQUIRED DECISIONS

- Stage 3: knowledge repository visibility, GitHub App installation/permissions,
  shared/personal branch naming and lifecycle.
- Stage 6/8: local graph depth, provenance and visual state details.
- Stage 7: selected changes versus full personal diff; behavior of personal
  changes created after proposal snapshot.
- Stage 9: retention/capacity thresholds, backup destination/retention,
  production domain/TLS, maintenance window and deployment approval.

No decision is required about number of shared rhizomes, workspace isolation or
a reviewer role; ADR-007 already closes those questions.

## RECOMMENDED CHANGES

- centralize role checks (`user`, `editor`, `admin`) and personal-owner checks;
- key derived graph records by layer plus exact Git revision and owner/proposal;
- store an explicit currently visible shared revision pointer;
- model proposal publication as durable monotonic states;
- build/index a new shared revision before changing the visible pointer;
- audit auth/admin/editor/proposal/recovery actions with exact revision;
- keep Git content history and PostgreSQL business audit responsibilities
  separate;
- add bounded pagination/subgraph limits before large-data optimization;
- record synthetic scale baselines at Stage 5, 8 and 9.

## STAGE IMPACT

| Stage | Required mechanism |
| --- | --- |
| 2 | global role enum, admin user/role/blocking management, audit/bootstrap/recovery |
| 3 | singleton GitHub binding, shared branch, one personal state per user, verified webhook |
| 4 | personal-only import/edit ownership and Git commits |
| 5 | revisioned shared/personal/proposal derived layers, rebuild, scale baseline |
| 6 | bounded personal/shared graph UX and ownership enforcement |
| 7 | shared editor/admin CRUD, proposal state machine, self-approval ban, atomic publication, audit/reconciliation |
| 8 | text/graph impact from immutable base/head revisions, large-diff bounds |
| 9 | backup/restore, retention, capacity, interrupted-publication recovery, production gate |

## Current Stage 2 gap

The accepted Stage 2 baseline contains authentication/session flow and the
canonical `user/editor/admin` role field. The working tree also contains
unverified application changes produced by an interrupted implementation
worker. Those changes are outside this documentation review and are not proof
that admin user management, initial-admin recovery, audit or negative RBAC
tests are complete. Stage 2 must not be declared complete until an
implementation worker reconciles the tree and every Stage 2 gate passes.
