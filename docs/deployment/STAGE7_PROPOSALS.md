# Stage 7 proposals, Differ (no shared ZIP)

Differ compares the caller's **personal layer** to the **published** shared
rhizome and lists what can be offered: paths missing from shared, or paths
whose content differs. Personal layer is connected git **or** `.md`/ZIP upload
without git (TZ 2.6). Git comparison is derived from Git trees by blob SHA.
Upload comparison uses the same path/content rule. Differ does not read
canonical **published** note bodies from PostgreSQL. Files that exist only in
shared are not Differ results.

The user selects those rows and creates a proposal. GraphNotes copies only
those files onto a hidden branch of the shared repository. Connected personal
git is not rewritten. Upload-without-git is not a write into published shared
until an editor accepts. After accept and index catch-up, those paths leave
Differ. The git XOR upload copy is next to connect/disconnect in Settings,
not on the Differ tab.

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
tabs. Opening a proposal shows proposed card Markdown and links first;
Graph Diff is the following rhizome block. `GET /api/proposals/{id}` file
diffs include the proposed `body`. Reject, return and rollback require a
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
GET  /api/differ
POST /api/personal/import-md
GET  /api/personal/uploads
GET  /api/contributions/me
GET  /api/admin/contributions
POST /api/proposals
GET  /api/proposals
GET  /api/proposals/{id}
POST /api/proposals/{id}/approve
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

Alembic revision: `0005_proposals`. Personal upload staging: `0006_personal_uploads`.
Notify prefs: `0013_notify_prefs`.
