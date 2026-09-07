# ADR-001 - Markdown is the knowledge source of truth

Status: Accepted

## Decision
Canonical knowledge content is Markdown. Graph nodes/edges/indexes are derived from Markdown.

## Consequences
- merge/version operations apply to Markdown/Git state
- graph is re-indexed after relevant commits/merges
- no canonical `graph.json` is maintained in parallel
