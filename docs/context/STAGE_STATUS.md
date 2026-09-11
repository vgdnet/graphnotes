# GraphNotes - Stage Status

Updated: 2026-09-11

Product model TZ 2.63: GitHub is copy-in only. Local stores hold `.md`
(`personal_uploads`, `shared_notes`); PostgreSQL `note_index` is the
search/graph index, not a second canon. Personal export (if any) is
from the store, not synthesized from the index. Shared is not a product ZIP.
TZ 2.62: personal working copy is always the GraphNotes local
store. Connectors (git now; Dropbox / Drive later) copy `.md` in. Differ
compares that copy to the shared rhizome. Copy-in on git connect/refresh is
shipped. In-app save stays on the local store (no write-back to git).
Disconnect keeps copied files (no `drop_personal_layer`). Alembic
`0016_shared_notes`. ADR-008 leftover «no hosted vault» vs hosted store.
In-app edit is **own personal cards only**
(`#/card/personal:{path}`, hash may be `personal%3A`) after view-first
«Отредактировать карточку» (MDXEditor; GraphNotes preview on read).
TZ 2.54: `[[wikilink]]` inherits the open card layer (personal stays personal).
Published shared working copies live in `shared_notes` after copy-in (TZ 2.63).
Current implementation stage is Stage 8. ADR-009: Differ is one-way personal
→ published shared.
TZ 2.59 shipped the 2.58 sitemap in the hash UI: `/card` start card
(Admin → Установка); `/card/{path}` card + stack 2.56; `/queue` editor
queue; `/user` settings; `/offer` my proposals; `/graph` shared canvas;
`/search` SQL card search; `/my_graph` personal graph; `/contribution`
Мой вклад; `/differ` Отличающиеся; `/` → `/graph`. Unified auth:
login / register / forgot; reset by login or email; letter to stored
inbox only. Elasticsearch (ADR-015) and payment gateway remain later.
TZ 2.13: Settings at `/user` hold required email, optional contacts, git
and author contract. TZ 2.14: start page is `/graph`; guests get nodes/edges
only, not cards. Rhizome access levels (ADR-016 / TZ 2.41): paid level =
closed slice; entitlements and payment gateway remain later. SMTP login is
ADR-017 (TZ 2.37 / 2.40 / 2.45 / 2.52 / 2.59). Vsepsy identity stays a
separate ADR.

## Stage 0 - Infrastructure
Status: DONE
Environment: `rhizome`

Do not repeat Stage 0.
Do not assume undocumented Stage 0 details.
If deployment needs an exact host fact, inspect Rhizome.

## Stage 1 - Project Bootstrap
Status: DONE
Branch: `feature/01-project-bootstrap`
Primary authoring environment: `nord`
Target integration environment: `rhizome-test` (`172.16.13.14`)
Production deployment target: `rhizome`
Canonical repository: `https://github.com/vgdnet/graphnotes` (public)
Delivery path: `nord -> GitHub -> rhizome-test -> approved revision -> rhizome`

Accepted project decisions:
- canonical software license: GNU Affero General Public License v3.0 (`AGPL-3.0`)
- card/note content offered to the shared rhizome: WTFPL (TZ 2.44; no second LICENSE file)
- GitHub is the canonical source delivery mechanism
- `rhizome-test` normally consumes candidate revisions read-only
- `rhizome` Git access is read-only and must not use push-capable credentials
- SSH/rsync is fallback/bootstrap only

Goal:
Create a minimal, clean, testable GraphNotes application repository and application stack.

Implemented locally on `nord` as of 2026-08-17:
- FastAPI application with process and database health endpoints
- SQLAlchemy async engine/session and declarative base
- Alembic async environment with Stage 1 baseline revision
- React/TypeScript frontend with a real proxied backend health request
- backend and frontend Dockerfiles
- Compose topology for PostgreSQL, backend and frontend
- loopback-only host bindings for frontend/backend and no PostgreSQL host port
- Git-primary deployment instructions, SSH/rsync fallback instructions and an Nginx location example
- canonical AGPL-3.0 license and license ADR
- GitHub delivery/read-only production security ADR
- canonical `rhizome-test` Compose overlay with configurable frontend LAN bind
- versioned `rhizome-test` boot unit that waits for the configured LAN address
  and repairs the frontend port bindings without exposing `0.0.0.0`

Stage 1 integration results on `rhizome-test`:
- initial integration revision: `5c9ec1b`
- boot-race fix tested revision: `aad3eb0766b6952e9d9c87cbf2d98c0f5812fbad`
- PASS: clean clone from the public GitHub repository
- PASS: canonical public remote
  `https://github.com/vgdnet/graphnotes.git` resolves the tested Stage 1 branch
- PASS: `docker compose config` validated
- PASS: backend image builds
- PASS: frontend image builds
- PASS: PostgreSQL healthy
- PASS: backend healthy
- PASS: frontend healthy
- PASS: `GET /health` returned HTTP 200
- PASS: `GET /health/db` returned HTTP 200 and confirmed database reachable
- PASS: frontend `/api/health` proxy returned HTTP 200
- PASS: Alembic current revision is `0001_bootstrap (head)`
- PASS: PostgreSQL `alembic_version` is `0001_bootstrap`
- PASS: PostgreSQL Docker volume persistence verified across `docker compose down/up`
- PASS: frontend accessed from `nord` by browser and curl at `http://172.16.13.14:8080`
- PASS: backend remains bound only to `127.0.0.1:8000`
- PASS: PostgreSQL has no published host port
- PASS: backend test suite passed (`2 passed`) in a disposable container
- PASS: backend and frontend images built for the tested revision
- PASS: committed systemd unit is enabled and active
- PASS: reboot test reproduced a six-second delay before
  `172.16.13.14` appeared; the unit waited, force-recreated frontend, and
  restored both expected frontend bindings automatically
- PASS: after reboot all three containers became healthy, Alembic remained at
  `0001_bootstrap`, and frontend plus `/api/health` returned HTTP 200 from
  `nord`
- PASS: after reboot backend remained unavailable through
  `172.16.13.14:8000`; PostgreSQL still had no published host port

Deferred until production deployment is explicitly requested:
- reconcile the old uncommitted `/opt/graphnotes` worktree without overwriting
  unmanaged files
- configure read-only Git access with no push-capable credentials
- deploy only a revision validated on `rhizome-test`
- install or configure host Nginx, validate with `nginx -t`, and verify the
  end-to-end route

Resolved integration issue:
- the initial Compose-only deployment could lose the frontend LAN binding when
  Docker restored containers before `172.16.13.14` appeared during boot; the
  versioned systemd unit now waits for the address and repairs the frontend
  bindings, as verified by a real VM reboot on revision `aad3eb0`

Completion decision:
- the owner accepted revision `0152937` after integration validation
- production deployment to `rhizome` (`172.16.13.13`) is explicitly deferred; the
  host was inventoried read-only and remains untouched
- Stage 1 is complete as a reproducible bootstrap validated on
  `rhizome-test`; eventual production deployment retains the normal promotion gate

Expected components:
- FastAPI skeleton
- React + TypeScript skeleton
- PostgreSQL
- SQLAlchemy async
- Alembic
- Dockerfiles / Docker Compose
- `.env.example` and secret hygiene
- health endpoint and DB connectivity check
- basic frontend-to-backend connectivity
- documentation and tests/checks
- deployment/integration path to the already-prepared Rhizome host

Explicitly out of scope:
- registration/login implementation
- Telegram
- GitHub product integration
- Markdown import/parser
- graph engine/UI
- PR/merge workflow

## Stage 2 - Password Authentication
Status: DONE
Branch: `feature/02-password-auth`
Completed: 2026-08-19
Tested integration revision: `c883b2fcae62cc5ceb5e85467399dacc45857e26`
Primary authoring environment: `nord`
Target integration environment: `rhizome-test` (`172.16.13.14`)

MVP auth delivered:
- username/password with Argon2
- opaque PostgreSQL-backed sessions
- HttpOnly SameSite cookies; Secure disabled only for HTTP `rhizome-test`
- `/me`, logout, registration always `user`
- global hierarchical roles `user < editor < admin`
- admin user list, role/blocking UI, bootstrap CLI, last-admin protection
- audit events without authentication secrets

Telegram remains future scope.

Observed on `rhizome-test` at the tested revision:
- PASS: backend tests (`8 passed`)
- PASS: frontend production build
- PASS: Compose config; frontend LAN `8080`; backend loopback-only; no PostgreSQL host port
- PASS: health, db health, frontend from `nord`
- PASS: Alembic `0002_password_auth` upgrade/downgrade/re-upgrade
- PASS: live register/login/logout/RBAC API flow from `nord`
- leftover `0003_pre_git_notes` was downgraded and removed; notes table is gone

See `docs/stages/STAGE2_COMPLETED.md`.

Production deployment to `rhizome` remains deferred.

## Stage 3 - GitHub Integration
Status: DONE
Branch: `feature/03-github-integration`
Completed: 2026-08-19
Tested integration revision: `d8322d425cd97b157d6f7214f2e859e227f8fd87`

Owner-verified on `rhizome-test`: shared `vgdnet/rhizome` connected with
content; a user bound `vgdnet/guide_psy`. See `docs/stages/STAGE3_COMPLETED.md`.

## Stage 4 - Take from shared / ZIP fallback
Status: DONE
Branch: `feature/04-markdown-import`
Completed: 2026-08-19
Tested integration revision: `003638259909c42eedb4fb4973dd9a45d1f0a3e1`

Owner-verified take-from-shared on `rhizome-test`: accepted 1, personal commit
`fbabd7529700` on `vgdnet/guide_psy`. See `docs/stages/STAGE4_COMPLETED.md`.

## Stage 5 - Revisioned Graph Engine
Status: DONE
Branch: `feature/05-graph-engine`
Completed: 2026-08-19
Tested integration revision: `eb09f5a4436a578edccd1a03d1c77668782fb4d8`

Owner-verified derived graph on `rhizome-test` (shared nodes/edges visible;
refresh after git/Obsidian push). See `docs/stages/STAGE5_COMPLETED.md` and
`docs/deployment/STAGE5_INDEX.md`.

## Stage 6 - Shared graph + personal overlay
Status: DONE
Branch: `feature/06-personal-graph`
Completed: 2026-08-19
Tested integration revision: `1dd29caa65607b0edbe5396a7dc7cdcdd5d6a641`

Cytoscape shared graph and overlay of the caller's git onto the shared rhizome.
Public graph without login; overlay requires a session. See
`docs/stages/STAGE6_COMPLETED.md`.

## Stage 7 - Differ, ZIP download, editor queue
Status: DONE
Branch: `feature/07-publish-merge`
Completed: 2026-08-19
Tested integration revision: `b362aa8382777465bc5da8f90663f93e0b7c4b72`

ADR-009: Differ lists one-way personal → published shared differences; the user
selects them and proposes. Download is a ZIP of the published shared revision.
Editors accept, reject, return or roll back. See `docs/stages/STAGE7_COMPLETED.md`.

## Stage 8 - Proposal Graph Diff
Status: CURRENT
Branch: `feature/08-graph-diff`

Graph Diff is the structural view of Differ / a proposal. Follow
`docs/stages/STAGE8.md`. Do not introduce a second comparison model.

TZ 2.5–2.7 on this branch (not merged to main; production
`rhizome` not deployed):
- TZ 2.5–2.6 revision: `fd9d1c314ad344819ff12e7d92d8524d8c5a2c53`
- TZ 2.7 contribution stats revision: `a56b2da908cb0584de5c275ae4332bd22f38fa1c`
- ADR-010 author legal contract revision: `959c624b040adc58b5dd28d84276618d8fe911a1`
  checkbox / accept step, stored who+when, withdraw and re-accept;
  contributing gated; Alembic `0007_author_contract`
- backend tests: 43 passed (`cd backend && .venv/bin/python3 -m pytest -q`)
- frontend production build: PASS (`pnpm build`, tsc included)
- `rhizome-test` (`172.16.13.14`): `compose.yaml` +
  `deploy/compose.rhizome-test.yaml` `up -d --build`
- ADR-010 author contract: `959c624` Alembic `0007_author_contract`
- ADR-011 closed corpus: `4b6636d` Alembic `0008_closed_paths`
- ADR-012 in-app user cards API: `94b1f73`; UI + feed/comments: `5a924e5ab7c265e366d06b81c9e51c8fae5e75ae`
- ADR-013 rhizome-card feed: Alembic `0009_rhizome_events` (no note bodies)
- ADR-014 commenter: Alembic `0010_note_comments` (pending until editor approves)
- live on `rhizome-test` 2026-09-05: SHA `2b38dfcbe25100566b24f0a06baa199375fee086`,
  Alembic `0011_user_settings`
- TZ 2.13–2.15: Settings (required email, contacts, git, author contract);
  start page is the shared graph; guests search without card bodies;
  signed-in users open a separate read-only Markdown card page from the
  bottom node link (`GET /search`, `GET /cards/{path}`)
- TZ 2.27: graph layout is fCoSE; Differ pulls connected personal git HEAD
  on open (and via poller/webhook)
- TZ 2.28: git XOR upload (409); overlay/search from server uploads
  without git; ZIP Cyrillic names + 2 MiB ingest (nginx 8m); in-process
  personal-git poller (`GRAPHNOTES_PERSONAL_SYNC_INTERVAL_SECONDS`)
- TZ 2.29: nested `.md` git trees + unique basename / title wikilinks (NFC)
- TZ 2.30 / 2.32: folder-note `GraphNotes/GraphNotes.md`; gitlink trees
  walked and `[[GraphNotes]]` must not stay `unresolved:GraphNotes`
- TZ 2.31 / ADR-016: rhizome access levels (not a consumer role); paid
  level = closed slice in the same personal git; entitlements later
- TZ 2.41: ADR-016 UX refinement (spec only): «два графа» = shared + own
  overlay on one graph; «ризома автора» = closed-slice view after
  entitlement; «загрузить» = open in GraphNotes, not ZIP/clone. Open
  personal as a public catalog is not accepted. No application code in
  this revision.
- TZ 2.33: one rebuild refreshes shared + every personal git layer;
  search, cards and comments follow the current trees
- TZ 2.34: admin set-password and in-app audit log on the
  Administration tab (`POST /admin/users/{id}/password`,
  `GET /admin/audit`); leftover ADR polish vs ADR-002 is paperwork
- TZ 2.35: Graph Diff cache, parse/time incompleteness, direction change,
  accessible legend; `STAGE8_COMPLETED.md` records test evidence. Stage 8
  stays CURRENT until owner/Observer close. Production `rhizome` not deployed
- TZ 2.36: graph layer names — «ваша часть ризомы» is the overlay
  stitch/intersection with the shared page; «ваша личная ризома» is
  `GET /api/graph/personal`. Automatic from the index; cards and search
  (`layer=overlay|personal`) follow that visibility. Live on
  `rhizome-test` 2026-09-05: SHA `4d6fbd62821c86ee841dd38cde7758046cd42f2c`.
  Production `rhizome` not deployed
- TZ 2.37: installation SMTP (ADR-017) and a three-screen admin
  (users / journal / operator). Alembic `0012_smtp_admin`. Live on
  `rhizome-test` 2026-09-05: SHA `97596f8066dd1f23390f5dc5a44ecde3ec016ecb`.
  Production `rhizome` not deployed
- TZ 2.38–2.40: queue tabs New / In progress / Rejected; `#/card/`
  role-scoped search with layer on hits; password reset + queue notify
  (SMTP 587 STARTTLS). Named in PRODUCT_SPEC 2.50 / MASTER_CONTEXT
- TZ 2.42–2.46: git XOR hint in Settings (not Differ); connected-git
  Settings chrome (no connect field, GitHub link, disconnect wipes
  personal index); author-contract copy `2026-09-05` (WTFPL cards,
  AGPL-3.0 software); SMTP register opens no session until confirm
  (`#/auth/confirm?token=`); Differ chrome **Отличающиеся**
- TZ 2.56: same path in shared + personal → stacked cards on
  `/card/{path}` (rhizome top, personal bottom, even if identical);
  Differ is an offer under the stack, not the landing. Semantic compare
  later + ADR; line-by-line compare is an open question.
- TZ 2.55: one `/card/{path}` router; no layer folders. Own note is
  editable, published is not. Hash `personal:` is transitional.
- TZ 2.54: `[[wikilink]]` inherits the open card layer (personal stays
  personal). Layer-prefixed hashes remain the live `#/card/personal:`
  route until 2.55; do not collapse wiki clicks onto unprefixed shared.
- TZ 2.47–2.50 / **2.53**: card `#/card/{path}` is **view-first**.
  Own personal `#/card/personal:{path}` (hash `personal%3A…` is the same
  class) mounts the thin editor and shows «Отредактировать карточку» only
  for the owner with accepted contract. Broken before this ship: editor
  not wired on the card page, so those URLs looked shared/read-only.
  Widget is **MDXEditor** (rich + source); read stays GraphNotes preview.
  Save is `PUT /api/personal/notes/{path}` (`source` + `expected_hash`;
  git XOR upload; author contract; no new path; 409 stale). In-app saves
  record `rhizome_events` (`edited` / `linked` / `unlinked`) with
  `owner_user_id`; `GET /api/cards/{path}/feed` is the card history
  (no bodies; personal events do not mix into the shared feed for the
  same path). Shared / others' personal / proposal stay read-only on
  `GET /api/cards/{path}`. Guest `#/card/` = published hits, no body.
  Default search `layer=visible` (overlay remains graph stitch).
  ADR-011 `closed_paths` still omit Differ, lock stub, hide body from
  other users. ADR-008 leftover vs this TZ is paperwork.
  Live on `rhizome-test` 2026-09-07: running tree on git SHA
  `3fb9be9db1a9719acab1990a6f0d4bd9b74e2163` (Alembic
  `0015_installation_public_url`; personal editor + `0014_personal_edit_events`
  shipped in the deployed working tree, not in that commit). Production
  `rhizome` not deployed
- TZ 2.51: graph canvas is **весь граф** or **локальный граф** (depth 1–4,
  «Показать всё»). Overlay local center for overlay-only notes is
  `personal:{path}`; unknown `center` does not fall back to the first
  shared page. «К графу» from a card focuses that node on the whole graph
  (own personal switches the layer to «ваша личная ризома»). Named in
  PRODUCT_SPEC 2.51 / MASTER_CONTEXT
- TZ 2.58: owner sitemap (spec only, no app code). `/user` = settings;
  `/offer` = my proposals; `/queue` = editor queue; `/my_graph` =
  personal canvas; `/contribution` = Мой вклад. 2.57 person-card /
  combined-queue inferences withdrawn.
- TZ 2.61–2.63 shipped on this branch: git/shared GitHub copy `.md` into
  `personal_uploads` / `shared_notes`; Differ and cards read the copies;
  disconnect keeps the personal store; search/graph still use `note_index`.
  Leftover: GitHub App merge/rollback live-read of proposal branches.
- leftover: rhizome access-level **entitlement tables** / payment
  gateway (ADR-016 + TZ 2.41 name the model and the «ризома автора»
  view; `closed_paths` already exists — not this slice); vsepsy
  identity §6.1.3 (needs ADR); ZIP wording in ADR-009 vs TZ 2.5;
  formal ADR for TZ 2.18 admin password/audit vs ADR-002 (screen
  already expanded in 2.37); Elasticsearch remains ADR-015. Do not
  ship payment gateway, SMTP redesign, vsepsy, ES or Celery in the
  current implementer wave
