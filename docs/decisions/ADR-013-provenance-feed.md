# ADR-013 - Provenance and rhizome-card feed

Status: Accepted
Accepted: 2026-09-03
Refines: ADR-001 (Git remains the text canon); ADR-007

## Decision

GraphNotes records **who did what to the published shared rhizome** as
derived events, not as a second copy of Markdown.

On publication of a proposal, the product writes `rhizome_events` rows:
created or edited for each scoped path, and linked/unlinked for index
edges that appeared or disappeared versus the previous shared revision.
Each event stores actor UUID, proposal id, path, optional other path, and
time. It does **not** store note bodies.

`GET /api/shared/notes/{path}/feed` returns that feed for a rhizome card.
Public JSON omits Git SHAs, branches and PR URLs.

Git remains the canon of note text. Rebuild of the derived index does not
require the feed; the feed is product history that git log cannot express
(the commit is made by the app, not the author's UUID).
