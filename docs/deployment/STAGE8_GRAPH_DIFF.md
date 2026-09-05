# Stage 8 Graph Diff

Graph Diff is the structural view of a Stage 7 proposal: the same immutable
base and head Git revisions, parsed as Markdown, compared as a graph. It is not
a second corpus, not `graph.json`, and not canonical note bodies in PostgreSQL.

`GET /api/graph/diff?proposal_id=...` is visible to the proposal author and to
editor/admin. Other users get 404. Public JSON still hides Git SHAs, branch
names and GitHub URLs.

The preview is the changed neighborhood, bounded like the shared graph. Summary
counts stay complete when the drawing is truncated. Incomplete fetch or parse
never looks like an empty diff. Parse warnings set `complete: false` and keep
the computed changes. A fetch or time-bound miss (`GRAPHNOTES_GRAPH_DIFF_TIMEOUT_SECONDS`,
default 30s) returns an incomplete sentinel, not an empty success.

A process-local cache keyed by proposal id, base/head SHA, status, stale,
conflicted and `limit` retains at most
`GRAPHNOTES_GRAPH_DIFF_CACHE_MAX` (default 20) complete payloads. It is
derived, not a second graph canon; a restart drops it.

Direction reversal (A→B becomes B→A) is `edges_direction_changed`, not a
pair of add+remove. Failed Graph Diff in the queue UI is an error, not a
silent empty canvas.

Markers are shape plus label, not color alone: triangle added, octagon removed,
rectangle modified, diamond renamed, star unresolved, ellipse neighbor.
The legend is exposed to assistive tech (not `aria-hidden`).
