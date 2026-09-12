# ADR-001 - Markdown is the knowledge source of truth

Status: Accepted

## Decision
Canonical knowledge content is Markdown. Graph nodes/edges/indexes are derived from Markdown.

## Consequences
- merge/version operations apply to Markdown state (GraphNotes personal store
  XOR optional git; published shared remains Markdown, not a second graph file)
- graph is re-indexed after relevant store writes / commits / merges
- no canonical `graph.json` is maintained in parallel

## Amendment 2026-09-11 (TZ 2.61)

Markdown remains the source of truth. The **location** of personal Markdown is
the GraphNotes installation by default (hosted store / in-app), not GitHub.
Optional personal git is XOR, not required. Published shared working copies
live in the GraphNotes store after copy-in from the GitHub source (TZ 2.63);
Differ remains the write gate. GitHub is not the user's disk
(see ADR-003 / ADR-008 amendments).
