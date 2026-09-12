# Stage 7 - Differ, ZIP download, editor queue - COMPLETED

Status: DONE
Completed: 2026-08-19
Branch: `feature/07-publish-merge`
Tested integration revision: `b362aa8382777465bc5da8f90663f93e0b7c4b72`
Integration host: `rhizome-test` (`172.16.13.14`)

Production deployment to `rhizome` (`172.16.13.13`) remains deferred.

## Delivered

- Differ: one-way personal git → published shared (`GET /api/differ`);
  missing paths and same-path content changes only
- proposal from a selected subset of Differ rows; optional summary, otherwise
  derived from the path or note count
- hidden Git branch on the shared repository; merge via refs +
  `POST /repos/.../merges`, not the GitHub Pull Request API
- editor/admin queue: accept, reject, return, rollback; self-approval forbidden
  by author user id, including admin authors
- ZIP download of the published shared revision (`GET /api/shared/archive`)
- Alembic `0005_proposals`
- public JSON hides branch names, SHAs and GitHub URLs

See `docs/deployment/STAGE7_PROPOSALS.md` and ADR-009.

## State machine

```text
open
  -> accepted_pending_merge
  -> merged_indexing
  -> published
```

Failure states: `rejected`, `changes_requested`, `conflicted`, `failed`.
Readers see the previous published shared revision until indexing of the merge
succeeds.

## Observed on rhizome-test

- live SHA `b362aa8382777465bc5da8f90663f93e0b7c4b72`
- Alembic `0005_proposals (head)`
- health, frontend `8080`, ZIP `/shared/archive` 200 without login
- anonymous `GET /api/differ` 401
- backend remains loopback-only; PostgreSQL has no host port

Local backend suite at Stage 7 close-out: 31 passed. Frontend Docker build uses
`tsconfig.app.json` (`tsc --noEmit`).

## Stage 8 handoff

Graph Diff is the structural view of the same Differ/proposal pair (added,
removed or changed nodes, links, tags). Do not invent a second comparison
model or a canonical graph file.
