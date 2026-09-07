# ADR-012 - In-app user cards

Status: Accepted
Accepted: 2026-09-03
Refines: ADR-007 (same UUID, not three people); ADR-010; ADR-011

## Decision

A user card is an in-app page for the GraphNotes UUID. It is not a GitHub
profile and not another person's personal git.

Public face: display name, username, role, author flag, **counters** of
accepted shared notes and links, and titles/paths of accepted notes.
A viewer does not get another person's personal, proposed, or closed notes,
and does not get another person's detailed contribution journal.

The owner of the card also sees their own TZ 2.7 stats, editorial review
if they are editor/admin, and a **count** of closed paths (not bodies).

No Git SHAs, branches or PR URLs. Closed bodies stay personal (ADR-011).
