# Stage 5 graph index

The derived index lives in PostgreSQL. Canonical Markdown stays in Git.
After a push from Obsidian + obsidian-git, open or refresh
GraphNotes; `/api/repository/status` and `/api/graph/*` compare the observed
Git SHA with the indexed SHA and rebuild when they differ.

LAN webhook remains unused. Admin can force `POST /api/index/rebuild`.

Graph API is bounded (`limit`, optional `center` and `depth`). Cytoscape UI is
Stage 6.

## Rebuild

- Full rebuild reads every Markdown file at the observed revision.
- Incremental rebuild, used after historical take-from-shared or ZIP/MD upload
  fallback, fetches only new and requested paths, reconstructs unchanged notes
  from the current index, then re-resolves links. Incremental result must
  equal a clean full rebuild.
- Each layer keeps only the current revision. Previous projections are deleted.
- At most 20 `sync_jobs` rows are retained.

## Limits

| Limit | Default |
| --- | --- |
| Notes per layer | 5000 |
| Graph page default | 50 |
| Graph page maximum | 200 |
| Neighborhood depth | 0–4 |
| Sync job history | 20 |

`index_status` values returned without Git SHA: `empty`, `current`, `updating`,
`error`. Failed sync is never labelled `current`. A previous complete revision
may still be returned with `error` until rebuild succeeds.

## Query baseline

Recorded on 2026-08-19 against SQLite test fixtures and the live shared
repository on `rhizome-test`:

- 80 isolated notes, `GET /api/graph/shared?limit=20`: truncated page of 20,
  under 2 seconds in the backend test suite.
- Live shared `vgdnet/rhizome` at Stage 5 close-out: 5 note nodes, 22 edges,
  `index_status=current`, not truncated at the default page size.
- Default list query uses `ORDER BY path LIMIT n+1` and does not load the whole
  layer into the response. Neighborhood queries (`center`, `depth`) walk
  adjacency for the current revision, still capped by `limit`.

PostgreSQL indexes used: `note_index (layer, owner_user_id, revision_sha)`,
path/revision/owner, `note_links` source and target, unique `index_key`.

Redis, Neo4j and queues were not added.
