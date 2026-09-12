# Stage 7 proposals, Differ (no shared ZIP)

Differ compares the caller's **personal layer** to the **published** shared
rhizome. Outbound lists what can be offered: paths missing from shared, or
paths whose content differs and are not inbound (TZ 3.13). Personal layer
is connected git **or** `.md`/ZIP upload without git (TZ 2.6). Git
comparison is derived from Git trees by blob SHA. Upload comparison uses
the same path/content rule. Differ does not read canonical **published**
note bodies from PostgreSQL. Files that exist only in shared and were
never published by this caller are not Differ results.

The user selects outbound rows and creates a proposal. GraphNotes copies
only those files onto a hidden branch of the shared repository. Connected
personal git is not rewritten. Upload-without-git is not a write into
published shared until an editor accepts. After accept and index catch-up,
those paths leave **outbound** Differ. TZ 3.11 / **3.13**: chrome tab
**Сверка** (`#/differ`) is the author Differ — outbound propose, plus
inbound take-into-personal for paths that were in this caller's accepted
proposals and now differ. It is not a merge editor. `#/offer` is my
proposals only. Leftover: the SPA still mounts outbound Differ on
`#/offer` (hash `#/differ` opens the same view) plus «Текст сверки».
Shipped `GET /api/differ` is outbound `{differences:[{path,title,kind,updated_at}]}`
only. `POST /api/differ/inbound/{path}/accept` is TZ-only, not shipped.
The git XOR upload copy is next to connect/disconnect in Settings,
not a top-level Differ tab. While git is connected, Settings hides the bind
field and shows a GitHub link; disconnect drops the personal `note_index`.

Opening Differ reads the caller's connected public git HEAD through the GitHub
App before comparing trees. The personal index is rebuilt when the SHA moved
by the in-process poller (`GRAPHNOTES_PERSONAL_SYNC_INTERVAL_SECONDS`, default
300; `0` disables it), `python -m app.cli.sync_personal`, graph/status
requests, or a configured GitHub `push` webhook. GraphNotes does not keep a
second canonical clone of personal Markdown.

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
GET  /api/differ                         # shipped outbound list
GET  /api/differ/files/{path}            # leftover pair JSON
POST /api/differ/inbound/{path}/accept   # TZ 3.13, not shipped
POST /api/personal/import-md
GET  /api/personal/uploads
GET  /api/contributions/me
GET  /api/admin/contributions
POST /api/proposals
GET  /api/proposals                      # cookie or Bearer; TZ 3.10 queue
GET  /api/proposals/{id}                 # wikidiff2 html
GET  /api/proposals/{id}/files/{path}    # TZ 3.12 {path,before,body}
POST /api/proposals/{id}/resolve         # TZ 3.12 Save & Resolve
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
