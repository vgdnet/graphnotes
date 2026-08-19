# Stage 6 - Shared graph + personal overlay - COMPLETED

Status: DONE
Completed: 2026-08-19
Branch: `feature/06-personal-graph`
Tested integration revision: `1dd29caa65607b0edbe5396a7dc7cdcdd5d6a641`
Integration host: `rhizome-test` (`172.16.13.14`)

Production deployment to `rhizome` (`172.16.13.13`) remains deferred.

## Delivered

- Cytoscape.js shared graph; layout coordinates are UI state only
- public `GET /api/graph/shared` without login
- `GET /api/graph/personal-overlay` for the caller with connected personal git
  (401 anonymous)
- open node reads source Markdown (`GET /api/shared/notes/{path}`)
- filters, bounded page, neighbor expansion via `center`/`depth`
- no GitHub PR vocabulary

See `docs/deployment/STAGE6_GRAPH.md`.

## Stage 7 handoff

Editor proposal queue, selected-file publish into the one shared rhizome, merge
and rollback. Do not start graph-diff visualization (Stage 8).
