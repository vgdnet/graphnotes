# ADR-012 - In-app user cards

Status: Accepted (living). ADR-007 is superseded; same-UUID rule still
lives in MASTER. Not a GitHub profile and not another person's git.
Accepted: 2026-09-03
Refines: ADR-010; ADR-011

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

## Amendment 2026-09-10

Public face also includes **achievement counters**: proposals submitted,
cards created in the published rhizome, and published text edits
(`created` / `edited` on the shared interaction feed). Unpublished personal
paths and the detailed contribution journal stay private.

The in-app page is `#/users/{login}` (`GET /api/users/{login}/card`).
It is not `/user` (account settings). Names in the rhizome-card feed and
proposal author open that page for any signed-in viewer.

## Amendment 2026-09-12

The public address is the GraphNotes **login**, not the internal UUID:
`#/users/efimov`. `GET /api/users/{login}/card` looks up by username
only. A UUID in the URL or API key is **404**; the public card JSON does
not include user or inviter UUIDs. Do not shine the internal id on the
internet. Index people by login.
