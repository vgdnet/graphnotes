# Stage 8 Graph Diff

Graph Diff is the structural view of a Stage 7 proposal: the same immutable
base and head Git revisions, parsed as Markdown, compared as a graph. It is not
a second corpus, not `graph.json`, and not canonical note bodies in PostgreSQL.

`GET /api/graph/diff?proposal_id=...` is visible to the proposal author and to
editor/admin. Other users get 404. Public JSON still hides Git SHAs, branch
names and GitHub URLs.

The preview is the changed neighborhood, bounded like the shared graph. Summary
counts stay complete when the drawing is truncated. Incomplete fetch or parse
never looks like an empty diff.

Markers are shape plus label, not color alone: triangle added, octagon removed,
rectangle modified, diamond renamed, star unresolved, ellipse neighbor.
