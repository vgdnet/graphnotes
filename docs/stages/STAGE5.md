# Stage 5 - Revisioned Graph Engine

Status: DONE
Branch: `feature/05-graph-engine`
Completed: 2026-08-19
See `docs/stages/STAGE5_COMPLETED.md`.
Depends on: accepted Stage 4
Product model: ADR-007, ADR-008. Index Markdown from the shared knowledge
repository and connected personal git remotes. Do not persist canonical note
bodies in PostgreSQL.

## User outcome

Markdown revisions produce fast, reproducible graph projections. Failure or
rebuild of the index cannot change canonical knowledge or mix published and
unpublished states.

## Derived representation

Every indexed record belongs to an explicit immutable revision context:

- `shared`: approved shared Git revision;
- `personal`: Git revision of exactly one user's connected remote;
- `proposal`: preview of immutable proposal base/head revisions.

Minimum identity includes layer, Git revision, Git path and, when applicable,
owner user ID or proposal ID. Proposed rows never become shared by flipping an
ambiguous boolean; shared publication points to a fully built revision.

## Scope

- `note_index`, `note_links`, `tags`, `note_tags`, `sync_jobs`;
- directed links, link type/direction, tags/properties and unresolved targets;
- content hash and commit SHA;
- deterministic full rebuild and incremental affected-set re-index;
- idempotent sync jobs with status/error/timestamps;
- indexed-vs-Git SHA mismatch detection;
- bounded/paginated Graph API;
- admin-triggered rebuild with audit;
- fixtures for empty, isolated, cyclic, unresolved and large graphs;
- PostgreSQL indexes/query baseline for nodes, links, revision and owner.

## API baseline

```text
GET  /api/graph/personal
GET  /api/graph/shared
POST /api/index/rebuild       # admin-only
GET  /api/repository/status   # includes index consistency
```

## Source-of-truth and security

- PostgreSQL never becomes canonical Markdown/graph storage;
- no canonical `graph.json`;
- Git wins on mismatch;
- user accesses own personal and the single shared projection only;
- editor/admin role does not alter personal ownership;
- queries have node/edge/time bounds;
- rebuild has role guard, concurrency guard and observable status.

## Scale baseline

- initial graph requests do not load the whole shared rhizome;
- query-count and latency recorded on a representative synthetic dataset;
- incremental result equals clean rebuild;
- history/projection retention is explicit and does not grow unbounded silently;
- Redis/Neo4j/queues are not added without measured need and decision.

## Out of scope

- Cytoscape product UI;
- proposal merge/publication state machine;
- graph diff;
- workspace/multi-shared graphs.

## Verification

- deterministic rebuild twice;
- incremental result equals full rebuild;
- unresolved→resolved, delete, rename, cycle, self/duplicate link cases;
- strict shared/personal/proposal revision separation;
- two-user personal isolation;
- SHA mismatch visible/recoverable;
- bounded subgraph and query/performance baseline;
- migration/rebuild on `rhizome-test` exact SHA.

## Definition of Done

- index is fully reconstructible from Git/Markdown;
- shared/personal/proposal rows cannot be confused;
- stale/failed sync is not presented as current;
- limits and performance baseline are documented;
- `STAGE5_COMPLETED.md` records schema and rebuild evidence.
