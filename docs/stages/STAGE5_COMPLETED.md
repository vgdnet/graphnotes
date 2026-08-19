# Stage 5 - Revisioned Graph Engine - COMPLETED

Status: DONE
Completed: 2026-08-19
Branch: `feature/05-graph-engine`
Tested integration revision: `eb09f5a4436a578edccd1a03d1c77668782fb4d8`
Integration host: `rhizome-test` (`172.16.13.14`)

Production deployment to `rhizome` (`172.16.13.13`) remains deferred.

## Delivered baseline

- Alembic `0004_graph_index`: `note_index`, `note_links`, `tags`, `note_tags`,
  `sync_jobs`; `indexed_sha` and `index_status` on shared and personal bindings
- layers `shared`, `personal`, `proposal` (proposal ID reserved; no proposal
  state machine — Stage 7)
- reconstructible index from Git Markdown; no canonical note bodies in PostgreSQL
- directed wikilink/markdown links, tags, unresolved targets, content hash,
  commit SHA
- full rebuild and incremental affected-set rebuild (incremental equals full)
- SHA mismatch refresh on status and graph GET; admin `POST /api/index/rebuild`
- bounded Graph API (`limit`, `center`, `depth`); personal isolation
- list UI «Связи ризомы» (not Cytoscape)

## API

```text
GET  /api/graph/shared
GET  /api/graph/personal
POST /api/index/rebuild       # admin-only
GET  /api/repository/status   # includes index_status
```

`GET /api/graph/shared` does not require login. Personal graph is the caller's
layer only. Overlay of personal-to-shared links is Stage 6.

## Observed on rhizome-test

- first live index at `65baa4f24d4ed11b459ff3f858d0d9baa729c773`: shared graph
  5 nodes, 22 edges, `index_status=current`
- owner confirmed visible graph changes after Obsidian/git updates
- close-out revision `eb09f5a4436a578edccd1a03d1c77668782fb4d8` adds incremental
  rebuild, error/stale status, bounded queries and PRODUCT_SPEC 1.4
- frontend LAN `172.16.13.14:8080`; backend loopback-only; no Postgres host port
- webhook still unused on the LAN; refresh follows observed Git SHA

Local backend suite at Stage 5 close-out: 27 passed. Frontend `tsc --noEmit`
passed on `nord`.

## Limits and baseline

See `docs/deployment/STAGE5_INDEX.md`.

## Stage 6 handoff

Stage 6 adds the Cytoscape shared graph and personal overlay. The Graph API
already returns bounded nodes/edges, unresolved nodes and `index_status`.
Do not start a second canonical graph store. Layout coordinates stay UI state.
