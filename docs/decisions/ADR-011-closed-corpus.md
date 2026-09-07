# ADR-011 - Closed corpus stays personal

Status: Accepted
Accepted: 2026-09-03
Owner decision: remaining TZ waves approved 2026-09-03
Refines: ADR-001 (Markdown/Git remains the closed-note canon); ADR-008;
ADR-010 (only an author can mark a path closed)

## Context

PRODUCT_SPEC §5.4.1 lets an author keep part of their personal layer **closed**
(and later paid). That corpus must not enter Differ or the published shared
rhizome. A published note that links to a closed path must show a lock, not
the body and not a generic unresolved miss. Payment is the same access list
later; this decision does not add a payment gateway.

## Decision

1. **Canon.** Closed note text lives in the author's personal git or
   unpublished personal upload. GraphNotes does not copy those bodies into
   PostgreSQL as a second canon and does not write them into shared git.
2. **Derived flag only.** PostgreSQL stores `closed_paths`: owner UUID, git
   path, when it was closed. Visibility is owner-only in this slice.
3. **Out of Differ.** Closed paths are omitted from Differ and cannot be
   proposed.
4. **Shared view.** The published graph and in-app read show only published
   notes. A wiki-link from published Markdown to a closed path is a **lock
   stub** (`locked=true`, empty body). Other users never receive the closed
   body through shared or another user's personal endpoints.
5. **Not this decision.** Paid subscribers, author cards, provenance feed,
   and commenter remain separate slices.

One shared rhizome. No ZIP/clone of published or closed corpus.

## Consequences

- Closing a path is reversible (author uncloses). Unclosing does not publish.
- Existing unresolved links that match a closed path become locks.
- Tests must prove a second account cannot read the closed body.
