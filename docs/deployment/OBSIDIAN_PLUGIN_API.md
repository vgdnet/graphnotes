# Obsidian plugin → GraphNotes personal store

Handoff for the plugin author (Codex / separate tree). No secrets.

**Canonical product:** `docs/product/PRODUCT_SPEC.md` §6.3.4 / §5.5.7,
[api.md](../product/api.md). **Canonical architecture:**
`docs/context/MASTER_CONTEXT.md` §12.1. The discussion file
`docs/OBSIDIAN_PLUGIN_API_TZ.md` is not a second canon; if it conflicts,
the files above win.

Test origin is HTTP as an explicit exception (`ENVIRONMENTS.md`);
production must use HTTPS. FastAPI itself has **no** `/api` prefix:
Nginx `location /api/` strips it.

| Where | Example |
| --- | --- |
| Browser / plugin base | `http://172.16.13.14:8080/api/integrations/obsidian/v1` |
| FastAPI path | `/integrations/obsidian/v1` |
| OpenAPI | `http://172.16.13.14:8080/api/openapi.json` |
| Swagger UI | `http://172.16.13.14:8080/api/docs` (not `/docs`; that is the SPA) |
| Token UI | `http://172.16.13.14:8080/#/user` → tab **Obsidian** |

`rhizome` (production) is not this API until an approved revision is
promoted. Do not point the plugin at production while testing.

## How to get a token

1. Sign in on the test site (username/password). Cookie session is
   `graphnotes_session`, HttpOnly, SameSite=Lax. There is no extra CSRF
   header: token CRUD is same-origin Settings, like the rest of the web UI.
2. Open **Настройки** (click the signed-in name) → **Obsidian**.
3. Name the token, optionally allow `personal:delete`, create.
4. The token starts with `gnp_`. The cabinet **stores** it and shows it
   again (TZ 2.75). SHA-256 is also stored for Bearer lookup, not instead
   of the key.
5. Copy it from Settings into the Obsidian plugin `data.json`. Until one
   package ships (TZ **3.26**), leftover catalogs `obsidian-plugin/` and
   `obsidian-card-merge/` each keep the same key in their own `data.json`.
6. Compromise: revoke the key on the same tab (the plugin stops writing
   and, with editor access, stops reading the queue). When access is
   restored, mint a new key in the cabinet and paste it into the plugin.
   Default TTL 30 days, max 90.

Web token routes (cookie session, errors `{ "detail": "..." }`):

```http
POST /api/users/me/integration-tokens
Content-Type: application/json

{"name":"Obsidian","scopes":["personal:read","personal:write"]}
```

201 body includes `token`, plus `id`, `name`, `token_prefix`,
`scopes`, `expires_at`, `created_at`. `GET` lists the same fields,
including `token`. `GET /api/users/me/integration-tokens/access` is the
access log (~6 months, max ~1 year; who / IP / token name + prefix;
never the key). Separate logs DB is later.
`DELETE /api/users/me/integration-tokens/{id}` → 204.

Plugin transfer APIs use `Authorization: Bearer <token>`. They never
create tokens.

## Client behaviour (TZ 2.82 / 2.88 / 2.90)

The HTTP prefix is unchanged. GraphNotes Publisher queues eligible vault
edits locally. It does not call the API on every `modify`. Write triggers
(TZ 2.90, same idea as Obsidian Git): sidebar ItemView «Передать правки
на сервер»; ribbon paper-plane; close the file;
N minutes after the last edit; or every N minutes if the queue is not
empty. Quit does not start a transfer. First dump of an existing vault is
«Отправить все правки». Matching bytes are not uploaded. One transfer at a
time. TZ 2.91: one personal copy; local wins; no conflict UI. Other
server bytes are overwritten with local (`expected_version` from
manifest / GET content). No `force=true`. Shared notes are not written.
TZ **3.20**: after personal copy, Publisher lists outbound Differ and
creates a proposal when `can_propose_to_rhizome` is true (role `user`).
TZ **3.27**: `editor` / `admin` → flag false; hide that panel.
TZ **3.32**: Obsidian `file-menu` on a markdown `TFile` (and `editor-menu`
for the active note) adds «Предложить в ризому» for role `user`, flag true,
or unknown capabilities; hide only known editor/admin. Register both
events at the start of `onload` (before `loadData`). Explorer title may
omit `.md`; still treat `extension === 'md'`. Click: transfer **this path** into personal (same as «Передать
правки», not the whole vault), then `POST /api/proposals` for that path
if it is new or differs; notices for created / already queued / already
in sync / error. Do not `GET /differ` for the bulk list. Do not GitHub.
Canon client `obsidian-card-merge/` 0.1.1.
TZ **3.26**: one Obsidian plugin is canon (3.09
withdrawn). Queue from API is an editor capability in the same client;
without editor access the queue UI is off. Manual editor edit uses the
same sync as a participant. Catalogs `obsidian-plugin/` +
`obsidian-card-merge/` are leftover runtime until one package ships;
runtime is `obsidian-card-merge/`. The Card Merge view
(TZ **3.10** / **3.12** / **3.22** / **3.25**) is still the queue of
**others’** edits. Acceptance goes through the editor.
After **each accepted file** there are **two operations**, not
«Save & Resolve = POST to shared»: (1) **always** write the editor’s
**local vault** (open that local note; without the write, accept is
incomplete); (2) **only if** local ≠ GraphNotes store, update the
rhizome store **from the editor’s account** (Differ/queue stays the write
gate; skip if equal). Do not invert. It is not a second canonical
rhizome. Do not
describe the queue as cache-only. Same `gnp_` token (`personal:read`).
TZ **3.30** (narrows 3.24): endpoints are per card; authorization is
grant(user, path) via tags, explicit cards, **or folder prefix**.
Missing grant → 404/403 on queue file GET. **Empty editor-tags = full
queue (3.21) is withdrawn** — empty grant = no extra shared write.
TZ **3.30:** one server file NOW; grant is a right on `shared_notes`,
not a second personal blob; plugin downloads granted cards into the
vault (client) then 3.25 local-first and syncs to that same file if
different (`GET/PUT /granted*`, not Differ-offer).
The same plugin shows/hides capabilities from that grant
when access is not all cards, only granted cards. Do not add
ACL-in-markdown or treat `GET /api/cards/{path}` as that grant.
Do not collapse the vault with the rhizome. Do not collapse ungranted
drafts with shared. TZ **3.30:** one server file **now** (grant = right
on `shared_notes`); two-table copies of the same granted path are
runtime debt, not a later collapse plan.
No editor access: no queue sidebar (TZ 3.11 / **3.26**; 3.04–3.07
withdrawn). Publisher (TZ **3.20** / **3.27**) lists outbound Differ
after personal copy and creates a proposal only when
`can_propose_to_rhizome` is true; it still does not write `shared_notes`.
Editor/admin token: website `#/queue` New tab via `GET /api/proposals`
(metadata only). «Принять в работу» fetches
`GET /api/proposals/{id}/files/{path}` (`before` + `body`, no wikidiff2)
into `.obsidian/plugins/graphnotes-card-merge/work/…`. Merge opens from
that cache (compare scratchpad). TZ **3.25** canon: two operations —
always write the vault note first; then update the rhizome store from
the editor account only if local ≠ store. Ordinary vault notes are not used for the compare pair.
**Shipped:** Card Merge writes the vault first; POST
`POST /api/proposals/{id}/resolve` **before** the vault write —
unfinished code vs this canon, not a second spec. Reject /
request-changes / rollback stay on the website.

### Technical editor check (TZ 3.10 / 3.12 / 3.20)

- View type `graphnotes-card-merge-queue` ≠ Publisher `graphnotes-publisher-sync`.
- Publisher/Card Merge user offer fetches `GET /api/differ?include_inbound=false`
  (added/changed paths from store hashes, TZ **3.31**) and
  `POST /api/proposals` with Bearer `gnp_` / `personal:read` (TZ 3.20).
  TZ **3.32** file-menu / editor-menu propose-one-path does **not** fetch
  that bulk list: one-path personal transfer, then `POST /api/proposals`.
  Role `user` Bearer `gnp_` must succeed (no website login). Editor/admin
  Bearer is 403. A failed capabilities ping is not a propose deny.
  It does not write `shared_notes` and does not restore conflict-picker UX.
- Card Merge editor/admin token: sidebar does **not** fetch `GET /api/differ`.
- Editor/admin token: sidebar fetches `GET /api/proposals` (Bearer);
  no file bodies on refresh. Same New-tab statuses as `#/queue`.
- «Принять в работу» uses `GET /api/proposals/{id}/files/{path}`
  (`{path, before, body}`); merge then reads the plugin cache only.
  TZ 3.16: only one card in work; a second click does not start another
  download; «Отменить» drops the cache.
- Save & Resolve is the editorial accept of **those** paths (TZ 3.18:
  siblings stay on `GET /proposals` New tab). Bearer `editor`/`admin`;
  not last-write-wins on `shared_notes`. **TZ 3.25 canon:** two
  operations after each accepted file: **always** write the vault `.md`
  first (proposal path, not `.obsidian/plugins/…/work/`; without the
  write, accept is incomplete); **then** update the rhizome store from
  the editor account only if local ≠ store (skip if equal);
  **open that local note** — required UX.
  Wait until `getAbstractFileByPath`
  sees the `TFile`, open it in a **new** markdown leaf:
  `createLeafBySplit` or `workspace.getLeaf(true)` + `leaf.openFile(TFile)`
  + `revealLeaf` / `setActiveLeaf` only if that leaf is not
  `MERGE_VIEW_TYPE`; `getLeaf('tab')` only when it is not merge.
  If `openFile` is missing or throws,
  `workspace.openLinkText(file.basename, file.path, true)`, then
  `workspace.openFile` if the API exists.
  Detach every `MERGE_VIEW_TYPE` leaf only after the markdown file is
  the active view.
  Each step is appended to
  `.obsidian/plugins/graphnotes-card-merge/debug.log` as
  `time | STEP | OK/FAIL | detail` (no tokens). Command
  «GraphNotes: показать debug.log» dumps the last 30 lines.
  Notice «Карточка открыта: путь» on success (15s). Every
  failure is a 20s Notice with the actual reason (write: path; open:
  leaf type + API; sync: HTTP status + body).
  **Shipped 2026-09-16:** Card Merge writes the vault first, then POSTs
  `/api/proposals/{id}/resolve` `{files:[{path,source}]}` only if
  local ≠ shared. While that POST hangs: WAIT lines every 10s, abort
  after 75s (vault is already written and open).
  Clear the work slot and reload the existing right-sidebar queue in
  place (do not `openQueue(true)`). Repeat resolve
  on an already fully accepted proposal is 200, not 409.
- Does not call approve/reject/request-changes/rollback.
- Website `/queue` reject / request-changes / rollback stay cookie-only.
- Leftover: command «Сравнить и слить карточку» / `OpenMergeModal`
  still lists `GET /api/differ` — unfinished code, not the contract.

## Author Differ (website `#/differ`, TZ 3.11 / Publisher 3.20) / Card Merge queue

Not a second prefix. Author Differ is the website chrome tab `#/differ`
and the Publisher/Card Merge sidebar offer list (`GET /api/differ`: outbound path
list + `POST /api/proposals`; TZ **3.31** hashes, `?include_inbound=false`). Card Merge editor sidebar does not consume that
list. FastAPI paths have no `/api`; Nginx strips it.

| Browser / plugin | FastAPI |
| --- | --- |
| `GET /api/differ` | `GET /differ` (site Сверка; offer list, TZ 3.31 hashes, **no GitHub**; `?include_inbound=false`) |
| `GET /api/differ/files/{path}` | `GET /differ/files/{path}` (leftover pair; local stores) |
| `POST /api/proposals` | `POST /proposals` (TZ 3.20: cookie or Bearer, that user; compare local; leftover GitHub branch does not block on rate limit) |
| `GET /api/proposals` | `GET /proposals` (TZ 3.10 editor queue; offer queued mark; **no GitHub reconcile**) |
| `GET /api/proposals/{id}` | `GET /proposals/{id}` (website `/queue` wikidiff2) |
| `GET /api/proposals/{id}/files/{path}` | `GET /proposals/{id}/files/{path}` (TZ 3.12 pair) |
| `POST /api/proposals/{id}/resolve` | `POST /proposals/{id}/resolve` (TZ 3.12 publish) |
| `GET /api/integrations/obsidian/v1/capabilities` | ping / whoami; `user.role`; `can_see_queue`; `can_propose_to_rhizome` |

Auth: website `#/differ` uses the cookie session. Bearer `gnp_…` with
`personal:read` authenticates `GET /differ` and `POST /proposals` for
that user only (TZ 3.20). Card Merge sidebar must not call author Differ
(TZ 3.11). Differ also requires an accepted author contract
(403 `{detail}`). The client must not send `user_id`.
Publisher propose still goes through the proposal queue; it does not
write `shared_notes`. Resolve remains the only shared write from
Card Merge; it still goes through the proposal branch + approve gate.

Errors on `/differ` and `/proposals` keep the ordinary web envelope
`{ "detail": "…" }`, not the v1 `{error:{code,…}}` wrapper. Typical
`/differ` details:

| Status | `detail` | When |
| --- | --- | --- |
| 401 | `authentication required` / token message | no cookie and no Bearer, or bad/expired/revoked token |
| 403 | author-contract text, or `insufficient_scope` | not an author, or token lacks `personal:read` |
| 400 | `path is invalid` | `..`, leading `/`, hidden segment |
| 404 | `personal card not found` / `path is closed` | no personal row, or closed path |
| 409 | `the shared rhizome is not connected` | no published shared SHA |

Leftover: successful Bearer calls on `/differ` and `/proposals` do
**not** append `integration_token_access`. Only
`/integrations/obsidian/v1` records the access log. Token
`last_used_at` still updates on authenticate.

Shipped outbound list (site `#/differ` and user offer panel; TZ **3.31**
path/hash metadata, no bodies; plugin `?include_inbound=false`):

```http
GET /api/differ
Cookie: graphnotes_session=…
Accept: application/json
```

```json
{
  "differences": [
    {
      "path": "fresh.md",
      "title": "fresh",
      "kind": "added",
      "updated_at": "2026-09-12T02:00:00Z"
    }
  ]
}
```

List `kind` is `added` (personal card missing from published shared) or
`changed`. Identical and closed paths are omitted. TZ 3.13 inbound is
accepted, not in this JSON (no `direction` field).

Leftover pair (site «Текст сверки»; not the Card Merge sidebar):

```http
GET /api/differ/files/fresh.md
```

```json
{
  "path": "fresh.md",
  "title": "fresh",
  "kind": "added",
  "incoming": {
    "layer": "shared",
    "path": "fresh.md",
    "body": "",
    "author": null,
    "updated_at": null
  },
  "current": {
    "layer": "personal",
    "path": "fresh.md",
    "body": "# Fresh\n",
    "author": {"id": "uuid", "username": "alice", "display_name": "Alice"},
    "updated_at": "2026-09-12T02:00:00Z"
  }
}
```

Card Merge accept-into-work (TZ 3.12):

```http
GET /api/proposals/{id}/files/fresh.md
Authorization: Bearer gnp_…
```

```json
{
  "path": "fresh.md",
  "before": "# Shared\n",
  "body": "# Proposed\n"
}
```

`before` is published shared; `body` is the proposal text. Cache both
under `.obsidian/plugins/graphnotes-card-merge/work/{id}/…` (compare
scratchpad). TZ **3.25**: always write a normal vault note at that
path first; then sync to the GraphNotes account only if local ≠ store;
the editor opens the **local** note. Save & Resolve account-side API:

```http
POST /api/proposals/{id}/resolve
Authorization: Bearer gnp_…
Content-Type: application/json

{"files":[{"path":"fresh.md","source":"# Merged\n"}],"reason":""}
```

200 is the same proposal JSON as website «Принять». Remaining files in
the proposal go through as the author sent them (TZ 3.08).

Capabilities (same as Publisher) is only «Проверить подключение»:

```http
GET /api/integrations/obsidian/v1/capabilities
Authorization: Bearer gnp_…
```

`personal:read` is enough. `write_allowed` is for personal sync.
`can_see_queue` is `true` for `editor` / `admin` (TZ 3.26: queue UI on;
`user` → queue off). `editorial_queue_mode` is `all` for admin (grants
do not cut pending proposals), `granted` for an editor with at least one
grant, `none` for an editor with zero grants — plugin shows «Нет грантов»
instead of a blank «нет предложений». `has_editorial_grants` is the raw
row flag. `can_propose_to_rhizome` is `true` today for role
`user` (TZ 3.27 coarse gate, not a forever ACL); `false` for `editor` / `admin` — hide the whole
Differ-offer panel («Обновить список» / «Предложить выбранные» /
«Предложить в ризому») **and** the file-explorer / editor context-menu
line (TZ **3.32**) once role is known editor/admin (unknown caps still
show the line) and do not call the offer refresh. Queue UI
does not depend on this flag. `user.role` is `user` / `editor` / `admin`.

## Ready methods (Publisher v1)

All under `/api/integrations/obsidian/v1`. Auth: Bearer token.
Personal data responses: `Cache-Control: no-store`. Errors:

```json
{
  "error": {
    "code": "version_conflict",
    "message": "…",
    "request_id": "uuid",
    "retryable": false,
    "details": [{"path": "Темы/Память.md", "current_version": "…"}]
  }
}
```

| Method | Status | Notes |
| --- | --- | --- |
| `GET /capabilities` | ready | `protocol_version` is `"1.0"` |
| `GET /manifest?cursor&limit` | ready | snapshot + `next_cursor`; 410 `snapshot_expired` |
| `GET /files/content?path=` | ready | **raw bytes**, not JSON |
| `GET /granted` | ready | TZ 3.30: `{items:[{path,kind,sha256,version,size}]}`; write-grant only; empty grant → `[]` even for admin |
| `GET /granted/files/content?path=` | ready | **raw bytes** of one granted shared file; 403/404 without grant |
| `PUT /granted/files?path=` | ready | local vault → same `shared_notes` file; `personal:write`; 403 without grant |
| `POST /transfers` | ready | optional `Idempotency-Key`; 201 plan |
| `PUT /transfers/{id}/blobs/{sha256}` | ready | `application/octet-stream`; 204 |
| `POST /transfers/{id}/commit` | ready | 202 on run/replay; 409 on conflict |
| `GET /transfers/{id}` | ready | state, results, remaining_blobs, index_revision |
| `DELETE /transfers/{id}` | ready | 204 cancel; 409 if applying |

`write_allowed` is **author contract + active account**. Leftover
connected personal git does **not** set `write_disabled` (TZ **3.35** /
**3.37**: the working copy is always the GraphNotes store; 2.62 leftover).

## GET /files/content

TZ asked for current bytes and version. Representation:

- Body: exact stored bytes
- `Content-Type`: `text/markdown; charset=utf-8` or the attachment MIME
- `X-GraphNotes-Path`: percent-encoded POSIX path (HTTP headers are Latin-1)
- `X-GraphNotes-Kind`: `markdown` / `png` / `jpeg` / `gif` / `webp` / `pdf`
- `X-GraphNotes-SHA256`
- `X-GraphNotes-Version`
- `X-GraphNotes-Size`

If the plugin needs a JSON envelope instead, that is a contract change:
agree before switching.

## Examples

Capabilities (abridged):

```http
GET /api/integrations/obsidian/v1/capabilities
Authorization: Bearer gnp_…
```

```json
{
  "protocol_version": "1.0",
  "api_prefix": "/api/integrations/obsidian/v1",
  "user": {"id": "uuid", "username": "alice", "display_name": "Alice", "role": "user"},
  "write_allowed": true,
  "write_block_reason": null,
  "can_see_queue": false,
  "can_propose_to_rhizome": true,
  "editorial_queue_mode": "none",
  "has_editorial_grants": false,
  "scopes": ["personal:read", "personal:write"],
  "formats": ["md", "png", "jpeg", "gif", "webp", "pdf"],
  "limits": {
    "markdown_max_bytes": 1048576,
    "attachment_max_bytes": 26214400,
    "batch_max_operations": 500,
    "batch_max_bytes": 104857600,
    "manifest_page_max": 200,
    "path_max_length": 180,
    "path_max_depth": 8
  },
  "quota": {
    "personal_max_bytes": 524288000,
    "personal_used_bytes": 0,
    "personal_remaining_bytes": 524288000
  },
  "links": {
    "personal_graph": "http://172.16.13.14:8080/#/graph",
    "differ": "http://172.16.13.14:8080/#/differ"
  }
}
```

`write_block_reason` is `null`, `author_contract_required`, or
`account_inactive`.

Minimal send of one note:

```http
POST /api/integrations/obsidian/v1/transfers
Authorization: Bearer gnp_…
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "client_id": "11111111-1111-1111-1111-111111111111",
  "operations": [
    {
      "op": "upsert",
      "path": "Темы/Память.md",
      "kind": "markdown",
      "expected_version": null,
      "sha256": "64 lowercase hex chars of the exact bytes",
      "size": 21
    }
  ]
}
```

201:

```json
{
  "transfer_id": "uuid",
  "state": "awaiting_upload",
  "files_applied": false,
  "expires_at": "2026-09-12T00:00:00Z",
  "required_blobs": [{"sha256": "…", "size": 21}],
  "remaining_blobs": [{"sha256": "…", "size": 21}],
  "results": [],
  "errors": [],
  "index_revision": null,
  "client_id": "11111111-1111-1111-1111-111111111111"
}
```

```http
PUT /api/integrations/obsidian/v1/transfers/{transfer_id}/blobs/{sha256}
Authorization: Bearer gnp_…
Content-Type: application/octet-stream

<exact file bytes>
```

204. Then:

```http
POST /api/integrations/obsidian/v1/transfers/{transfer_id}/commit
Authorization: Bearer gnp_…
```

202 `state: succeeded`, `files_applied: true`, `results[].version` for
the comparison DB. Replay commit returns the same transfer. Same
Idempotency-Key + same body returns the same plan; different body →
409 `idempotency_mismatch`.

Delete needs `personal:delete` and a current `expected_version` (not
null). Rename = upsert new path + delete old path in one batch or two
confirmed steps.

## Limits and ops

Nginx `client_max_body_size` on the test frontend is **32m** so 25 MiB
attachments fit. In-process rate limit: 120 requests / minute / user
(429 `rate_limited`, `Retry-After: 60`). One concurrent commit per user
→ 409 `transfer_busy`.

White-noise Markdown is rejected as 415 `unsupported_type` on this
plugin path **without** the ZIP-ingest account lock (TZ 2.67 lock stays
on `POST /api/personal/import-md`).

Indexing after apply reads `personal_uploads` only; it does not copy git
over plugin writes. `indexing_failed` keeps `files_applied: true`;
re-commit retries index only.

## Operator

- Alembic: `0017_obsidian_integration` (`object_version` on
  `personal_uploads`, token/transfer/blob/snapshot tables,
  `personal_assets`); `0018_integration_token_access` (~6-month who /
  IP / token log); `0019_integration_token_secret` (token value for
  Settings re-copy).
- Audit actions: `integration.token_created` / `token_revoked` /
  `transfer_created` / `transfer_applied` / `transfer_indexed` /
  `transfer_index_failed` / `transfer_conflict` / `transfer_cancelled`.
  No token secrets, passwords, or note bodies.
- Uncommitted blobs are dropped on success, cancel, or plan expiry (24h).
  Transfer rows and idempotency keys stay ≥ 30 days.
