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
5. Copy it from Settings into GraphNotes Publisher and/or GraphNotes
   Card Merge. Each plugin keeps the same key in its own `data.json`.
6. Compromise: revoke the key on the same tab (Publisher stops writing;
   Card Merge stops reading Differ). When access is restored, mint a new
   key in the cabinet and paste it into the plugin(s). Default TTL 30
   days, max 90.

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
manifest / GET content). No `force=true`. Shared / Differ / proposals
are not written. Differ read is a **separate** desktop plugin
(`obsidian-card-merge`, TZ 3.04 / **3.06**): `GET /api/differ` and
`GET /api/differ/files/{path}` with the same `gnp_` token
(`personal:read`). Same JSON as `#/offer`. Sidebar «Очередь правок»
is that list (not website `/queue`). It does not POST proposals
and does not write shared.

### Technical editor check (TZ 3.06)

- View type `graphnotes-card-merge-queue` ≠ Publisher `graphnotes-publisher-sync`.
- Sidebar fetches only `GET /api/differ` (Bearer). No `/api/differ/queue`.
- Click opens merge via `GET /api/differ/files/{path}`.
- Does not call approve/reject/POST `/proposals`.
- Website `/queue` (wikidiff2) is unchanged.

## Card Merge / Differ read (TZ 3.04 / 3.06)

Not a second prefix. Card Merge (`obsidian-card-merge/`,
`graphnotes-card-merge`) uses the **same** Differ the website `#/offer`
uses. FastAPI paths have no `/api`; Nginx strips it.

| Browser / plugin | FastAPI |
| --- | --- |
| `GET /api/differ` | `GET /differ` |
| `GET /api/differ/files/{path}` | `GET /differ/files/{path}` |
| `GET /api/integrations/obsidian/v1/capabilities` | ping / whoami only |

Auth: `Authorization: Bearer gnp_…` with `personal:read`, **or** the
website cookie session. Differ also requires an accepted author
contract (403 `{detail}` like the rest of `/differ`). The client must
not send `user_id`. Card Merge does not POST `/proposals`, does not
write shared, and does not call the transfer methods above.

Errors on `/differ` keep the ordinary web envelope `{ "detail": "…" }`,
not the v1 `{error:{code,…}}` wrapper. Typical:

| Status | `detail` | When |
| --- | --- | --- |
| 401 | `authentication required` / token message | no cookie and no Bearer, or bad/expired/revoked token |
| 403 | author-contract text, or `insufficient_scope` | not an author, or token lacks `personal:read` |
| 400 | `path is invalid` | `..`, leading `/`, hidden segment |
| 404 | `personal card not found` / `path is closed` | no personal row, or closed path |
| 409 | `the shared rhizome is not connected` | no published shared SHA |

Leftover: successful `/differ` Bearer calls do **not** append
`integration_token_access`. Only `/integrations/obsidian/v1` records
the access log. Token `last_used_at` still updates on authenticate.

```http
GET /api/differ
Authorization: Bearer gnp_…
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
`changed`. Identical paths are omitted. `updated_at` is the personal
store stamp. Closed paths are omitted.

```http
GET /api/differ/files/fresh.md
Authorization: Bearer gnp_…
Accept: application/json
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

File `kind` is `added` | `changed` | `same` (manual path that already
matches). `incoming` is published shared (empty body when `added`);
`current` is the personal working copy. Card Merge puts `incoming` on
the left and the vault file on the right. Save writes only the vault.

Capabilities (same as Publisher) is only «Проверить подключение»:

```http
GET /api/integrations/obsidian/v1/capabilities
Authorization: Bearer gnp_…
```

`personal:read` is enough. `write_allowed` is for Publisher; Card Merge
ignores a write block.

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
| `POST /transfers` | ready | optional `Idempotency-Key`; 201 plan |
| `PUT /transfers/{id}/blobs/{sha256}` | ready | `application/octet-stream`; 204 |
| `POST /transfers/{id}/commit` | ready | 202 on run/replay; 409 on conflict |
| `GET /transfers/{id}` | ready | state, results, remaining_blobs, index_revision |
| `DELETE /transfers/{id}` | ready | 204 cancel; 409 if applying |

`write_allowed` is **author contract + active account**. A connected
personal git does **not** set `write_disabled` (canonical TZ 2.62: the
working copy is always the GraphNotes store).

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
  "user": {"id": "uuid", "username": "alice", "display_name": "Alice"},
  "write_allowed": true,
  "write_block_reason": null,
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
    "differ": "http://172.16.13.14:8080/#/offer"
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
