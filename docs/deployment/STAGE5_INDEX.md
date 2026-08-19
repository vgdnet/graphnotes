# Stage 5 graph index

The derived index lives in PostgreSQL. Canonical Markdown stays in Git
(ADR-008). After a push from Obsidian + obsidian-git, open or refresh
GraphNotes; `/api/repository/status` and `/api/graph/*` compare the observed
Git SHA with the indexed SHA and rebuild when they differ.

LAN webhook remains unused. Admin can force `POST /api/index/rebuild`.

Graph API is bounded (`limit`, optional `center` and `depth`). Cytoscape UI is
Stage 6.
