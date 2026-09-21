# Stage 7 proposals, Differ (no shared ZIP)

Differ compares the caller's **personal store** (`personal_uploads`) to
**published shared** (`shared_notes`) on GraphNotes (TZ **3.31** /
**3.35** / **3.37**). Outbound lists paths missing from shared, or paths
whose **content hash** differs and are not inbound (TZ 3.13). Living
ingest is the plugin; leftover git copy-in is not the offer path. Opening
`GET /api/differ` or `#/differ` does **not** call an external git host, does
not copy-in git, does not load Markdown bodies, and does not run wikidiff2.
Plugin offer uses `GET /api/differ?include_inbound=false`. Files that exist
only in shared and were never in this caller's personal store are not
outbound Differ results.

The user selects outbound rows and creates a proposal from the store pair.
Leftover GitHub merge-out on `POST /proposals` must not block the offer on
rate limit. Connected personal git is not rewritten. Store Markdown is not
a write into published shared until an editor accepts (`POST /resolve`
writes `shared_notes`; leftover `/approve` merge-out is not the live
offer path). After accept and index catch-up, those paths leave **outbound**
Differ. TZ 3.11 / **3.13**: chrome tab **Сверка** (`#/differ`) is the author
Differ — outbound propose, plus inbound take-into-personal for paths that
were in this caller's accepted proposals and now differ. It is not a merge
editor. `#/offer` is my proposals only. Shipped `GET /api/differ` is
`{differences, inbound}` path/hash metadata. `POST /api/differ/inbound/{path}/accept`
copies published shared into the caller's personal store for a watched
inbound path. Leftover «Свой git» connect/disconnect in Settings is not
canon ingest (TZ **3.35** / **3.37**). While leftover git is connected,
Settings may hide the bind field; disconnect must not wipe copied store
files. Leftover poller/webhook may still copy `.md` in; they are not on
the Differ list path.

GraphNotes does **not** offer ZIP download of published shared (`Скачать` /
`GET /api/shared/archive` removed, TZ 2.5). Shared is read in the app.

Editors accept, reject, return or roll back in product language. The queue
UI has three tabs: New (`open`, plus `conflicted`/`failed` still needing a
decision), In progress (`changes_requested` — editor comment sent back to
the author), Rejected (`rejected`). Accepted/published items leave these
tabs. TZ 3.08: only one proposal is expanded; only one card body is
open; Принять / Отклонить / Доработать sit under each card and still
decide the whole proposal. Opening a proposal shows a Wikipedia-style line table first (TZ 3.03 /
ADR-018): **wikidiff2** table HTML from the C++ `TableFormatter`
(same fragment as `wikidiff2_do_diff`; «В ризоме» |
«В предложении»; added cards have an empty left). Graph Diff is the
following rhizome block. Target runtime is a compiled native helper
from pinned Wikimedia `src/lib` (owner 2026-09-12 / ADR-018 amendment).
`php-cli` / `php-wikidiff2` in the image is unfinished code, not an
alternate canon. `GET /api/proposals/{id}` file diffs include `html`,
`engine`, proposed `body`, shared `before`, leftover unified `diff`, and
`rows` parsed from the table. Missing engine is HTTP 503, not `difflib`.
There is no inline/unified toggle. Author Differ stays a path-checkbox list.
Reject, return and rollback require a
reason the author can read. GitHub pull-request URLs, branch names and SHAs
stay out of public JSON.

`GET /api/contributions/me` returns derived author counts: cards (`notes`),
`added`, `accepted`, `links`, `links_accepted`. An editor or admin also
receives their own review stats (which proposals and links they decided).
`GET /api/admin/contributions` is admin-only and lists the same stats for
every account. A user cannot read another user's stats. No new canonical
note bodies are stored for this.

## API

```text
GET  /api/differ                         # shipped {differences, inbound}
GET  /api/differ/files/{path}            # leftover pair JSON
POST /api/differ/inbound/{path}/accept   # TZ 3.13 shipped
POST /api/personal/import-md
GET  /api/personal/uploads
GET  /api/contributions/me
GET  /api/admin/contributions
POST /api/proposals
GET  /api/proposals                      # cookie or Bearer; TZ 3.10 queue
GET  /api/proposals/{id}                 # wikidiff2 html
GET  /api/proposals/{id}/files/{path}    # TZ 3.12 {path,before,body}
POST /api/proposals/{id}/resolve         # TZ 3.12 / 3.18 shipped runtime (one card);
                                         # TZ 3.25: not the product accept;
                                         # POST-first then maybe vault = debt
POST /api/proposals/{id}/approve         # cookie only
POST /api/proposals/{id}/reject
POST /api/proposals/{id}/request-changes
POST /api/proposals/{id}/rollback
```

Reject, return and rollback require a reason. Authors cannot decide on their
own proposal, including admin authors.

When a proposal is created, opted-in editors/admins are notified (TZ 2.40):
email if installation SMTP is on and `notify_queue_email` is true;
Telegram if `GRAPHNOTES_TELEGRAM_BOT_TOKEN` is set, the recipient opted in,
and a Telegram contact is stored. Defaults are off. The author of the
proposal is not notified. Delivery failure does not roll back the proposal.

TZ 3.15: when an inbound Differ row appears (watched published path,
shared ≠ personal), authors with `notify_card_changes` on are notified
by email and Telegram (same SMTP/bot). Default off. The letter or
Telegram message links to `#/differ`. One Settings checkbox or toggle,
not two channel boxes. Not a social feed. Failure does not block the
shared accept that created the inbound row.

Alembic revision: `0005_proposals`. Personal upload staging: `0006_personal_uploads`.
Notify prefs: `0013_notify_prefs`.
