# GraphNotes - MASTER CONTEXT

Updated: 2026-09-11
Status: canonical architecture baseline
Aligned with PRODUCT_SPEC 2.63. Knowledge Markdown **always** lives in GraphNotes
local stores (personal `personal_uploads`, published shared `shared_notes`).
GitHub is a **source**: connectors copy `.md` in. Cards and Differ read copies.
Git live-read of blobs for cards is leftover. Editor merge may still push GitHub
then copy-in. Disconnect personal git does not wipe copied files. Do not rip the
GitHub App this wave. Dropbox/Drive are not this wave.
TZ 2.63: `/search` and the graph read `note_index`. Do not put note bodies
in PostgreSQL «so search is faster». A personal export, if offered, is
bytes from the local store, not rows synthesized from the index. Published
shared is still not a product ZIP.
Auth is one chrome (login / register /
forgot); reset lookup is login or email, mail only to stored inbox. App routes (owner list; typo `/seach` →
**`/search`**, hash `#/…`): `/card` = admin start card (path in
`installation_settings`, Admin → Установка, 404 if unset);
`/card/{path}` = that card (TZ 2.55–2.56: no layer in URL; own editable,
shared not; same path in both layers = **stack** rhizome-top /
personal-bottom + Differ offer — **shipped 2.59**); `/queue` = editor
proposal queue; `/user` = **account settings** (not the public person
card); `#/users/{uuid}` = **public person card** (TZ 2.60: achievements —
accepted notes/links, proposal count, shared created/edited events; feed
names and proposal author open it; `GET /api/users/{id}/card`); `/offer` = **my** proposals into the rhizome; `/graph` = shared
rhizome canvas (fCoSE); `/search` = card search (SQL `note_index`,
`layer=visible`); `/my_graph` = personal graph layer only;
`/contribution` = Мой вклад. `/differ` stays Отличающиеся (compare /
stack-offer target); do not invent `/accepted/differ`. `/` → `/graph`.
TZ 2.57 wrongly inferred `/user` = person card and `/offer` = combined
editor queue — withdrawn. Thin in-app edit is own personal only. The
transitional own-personal class `#/card/personal:{path}` (hash encodes
`:` as `%3A`) still mounts `PersonalCardEditor`. Shared stays read-only;
admin does not in-place-edit published shared. For authors GraphNotes is a
Markdown publisher with rights and one shared rhizome (TZ 2.61 / Publish
analog), not a second Obsidian. Thin in-app edit
is **own personal cards only** after **«Отредактировать карточку»** (card
opens view-first; no button without author rights). The own-personal route
is `#/card/personal:{path}` for **any** own file; the hash encodes `:` as
`%3A` (`#/card/personal%3A…`). That class must mount `PersonalCardEditor`
(MDXEditor after the button). It was broken on rhizome-test: the editor
from TZ 2.48–2.50 was not wired/shipped on the card page, so
`personal:` URLs rendered as shared read-only. Shared / `personal:{uuid}:`
/ proposal stay read-only; admin does not in-place-edit published shared.
`[[wikilink]]` on a card inherits that card's layer (TZ 2.54 / `qualifyCardPath`):
own personal → `personal:{file}`; foreign personal → `personal:{uuid}:{file}`;
proposal → `proposal:{id}:{file}`; already-prefixed targets stay. Shared and
personal are not collapsed — the same git path can exist in both.
Widget is MDXEditor
rich+source + GraphNotes Markdown preview on read; `PUT /api/personal/notes/{path}`
with `source` + `expected_hash`; write to connected git or the upload store;
existing path only, 404 if missing, 409 if stale. In-app saves record `rhizome_events`
(`edited` / `linked` / `unlinked`) with `owner_user_id` so they do not mix
into the shared card feed for the same git path; no Markdown bodies in that
table. `GET /api/cards/{path}/feed` is the card history. Shared / others'
personal / proposal cards stay read-only; shared changes go through Differ. Do not
store canonical **published shared** bodies in PostgreSQL as a second corpus
that bypasses Differ. Personal hosted Markdown (upload store / in-app) is the
product default (TZ 2.61–2.62). ADR-008 leftover: «no hosted vault» does not forbid
that store; «no in-app Obsidian» still forbids a second Obsidian-class editor.
The Differ comparison screen chrome is
**Отличающиеся** (tab and heading); API/entity remain Differ. Author-contract copy (version `2026-09-05`)
is responsibility for notes/links offered to the shared rhizome, withdraw
(new proposes/uploads/git-as-contribution blocked until re-accept; already
published notes stay in shared git), **WTFPL for card/note content** offered
to the shared rhizome, and **AGPL-3.0 for the software** with developer
credit (Юрий Ефимов, y@psychoanalyst.pro). Same Russian text in Settings →
Договор автора and the guest-visible **О программе** footer. No second
LICENSE file; `LICENSE` remains AGPL-3.0. Git in Settings is a **connector**
(TZ 2.62): it copies `.md` into the local store. Disconnect does **not** wipe
copied files. Hint lives next to
connect/disconnect in Settings, not on Differ. TZ 2.41 refines ADR-016 UX without a second
repo: «два графа» is the shared start map plus the signed-in user's own
overlay on **one** graph (layer filter, Stage 6 — not two indexes). After
entitlement, «ризома автора» is a **view** of the marked closed slice
(graph + cards), same personal git / upload store and derived
`closed_paths`. «Загрузить» opens that view in GraphNotes; it is not a
ZIP/clone into the payer's vault. Open personal-as-public-catalog is not
accepted (product §12.9). Card search `/search` (TZ 2.39 / 2.58 / §6.5.2) is
role-scoped over the same `note_index`: guest = published shared hits
(no card body); user = shared ∪ own personal; editor = that ∪ proposal
notes they can review; admin = every card they can open (all personal
layers + queue). Hits carry `layer`; Graph overlay stitch is unchanged. Editor queue (TZ 2.38): tabs New /
In progress / Rejected; proposed Markdown and links open first, Graph Diff
after; reject and return store a comment the author can read. SMTP
(ADR-017 / TZ 2.37 / 2.40 / 2.45 / 2.52): when
`GRAPHNOTES_SMTP_HOST` and `GRAPHNOTES_SMTP_FROM` are set, registration
does not open a session until the address is confirmed. The letter must
include `#/auth/confirm?token=` and still carries the 6-digit code
(`POST /auth/email/request` / `POST /auth/email/verify` — not a second
flow). Password login requires a confirmed address, and a forgotten
password is reset by the same one-time code/link
(`POST /auth/password/reset`). Reset **request** accepts login **or**
email (`identifier` or `email` on `POST /auth/email/request`); the
letter always goes to the **stored account email**, never a typed
address that is not on file. HTTP 204 is generic (no enumeration).
Username **or** email identifies
the same UUID. Auth UI is one chrome: «Вход» / «Регистрация» /
«Не помню пароль». Mail links use one **public site URL** per install
(default `https://rhizome.vsepsy.ru`), persisted in
`installation_settings` and edited on Admin → Установка
(`PUT /api/admin/operator`). `GRAPHNOTES_PUBLIC_BASE_URL` is bootstrap
only; a Compose rebuild must not wipe the saved origin. Confirm, login
and reset codes/links expire after **30 minutes**; an expired secret
does not open a session or set a password. Resend to an existing
address sends a new letter after expiry (or after a 60s cooldown while
the previous unused code is still live); the HTTP response does not
reveal whether the address exists. Outbound mail is installation SMTP, **587 STARTTLS**
(`GRAPHNOTES_SMTP_PORT=587`, `GRAPHNOTES_SMTP_USE_TLS=true`). IMAP 993 is
not a send path. Without SMTP that mail path is not promised. Secrets stay
in host `.env`. New proposal in the queue notifies opted-in editors/admins
by email (if SMTP on) and/or Telegram (if `GRAPHNOTES_TELEGRAM_BOT_TOKEN`
is set) — Telegram here is a notify channel, not login/IdP. Preference
columns default off (`notify_queue_email`, `notify_queue_telegram`);
toggles live in Settings and Admin users. Admin
UI is three screens (users / journal / operator), not a stub list.
Graph-layer names from TZ 2.36 stay. Shared-graph UI uses Cytoscape.js **fCoSE**
(TZ 2.27 / §6.5.1): live force layout, centered outlined labels, neighborhood
highlight; GraphNotes layer colors stay. The canvas has two views (TZ 2.51):
**весь граф** (bounded page) and **локальный граф** (`center` + `depth` 1–4,
«Показать всё»). Overlay-only personal nodes keep `personal:{path}` as the
local-graph center so the neighborhood is not the first shared page. Nested `.md` trees are indexed from
the recursive git tree and blob SHA (TZ 2.29). Gitlinks (mode 160000) are
walked and prefixed; if `Name/Name.md` is still missing, rebuild probes
`GET /contents/{prefix}/{name}.md` (TZ 2.32). `[[wikilink]]` resolves a unique
basename, full path, or unique title/alias after NFC; folder-note
`GraphNotes/GraphNotes.md` wins over root `GraphNotes.md`. A directory or
gitlink named GraphNotes is not a missing note. Rebuild is atomic across
graph and search (TZ 2.33): one `note_index` from current shared and
personal git trees; deleted paths leave search, card GET (404) and
comments. Graph layers (TZ 2.36): `GET /api/graph/personal-overlay` is
**ваша часть ризомы** (bounded shared page plus personal notes that
wikilink into it — automatic stitch from `note_links`, not a curated
catalog); `GET /api/graph/personal` is **ваша личная ризома** (full
indexed personal tree, or uploads if git is off). `/my_graph` is that
personal canvas. Default `/search` / `GET /api/search` is `layer=visible` (the
role-scoped corpus above, including guest published hits without
bodies). `layer=overlay` is the graph stitch for canvas highlight;
`layer=personal` is the full personal tree. Cards and Graph Diff /
the interaction feed read that same derived visibility — no second
manual catalog of which personal notes are «the part». Differ with connected git reads the
caller's **current public HEAD** before compare (open Differ, create proposal,
webhook, or in-process poller; TZ 2.27 / §6.6). No second canonical clone of
personal Markdown. Light and dark UI themes (TZ 2.19 / 2.22 /
§5.5.4) are client-side: `localStorage` key `graphnotes-theme`, else
`prefers-color-scheme`. The control is a Theme Switcher toggle (sliding
sun/moon pill, `role="switch"`), not generic text buttons. Cytoscape labels
use CSS theme tokens, not hardcoded washed-out fills. Landing `/` is `/graph`
(shared canvas) for guests and signed-in users (TZ 2.14 / 2.58). `/my_graph`
is the personal layer only. Guests see published nodes/edges only;
card bodies, feed and comments require a session. Account settings
(§5.5 / TZ 2.13 / 2.58) live at **`/user`** (name in header opens it):
required unique email, optional phone/Telegram contacts (not login), git
connect/disconnect and author contract — not the public person card.
ZIP download of published shared is removed (TZ 2.5; ADR-009 amendment
2026-09-11). **Rhizome access
levels** (ADR-016 / TZ 2.31, UX 2.41): a paid level is a closed slice of
content, not a «потребитель» role. Closed Markdown stays in the author's
personal store (hosted XOR git; path/frontmatter mark); PostgreSQL holds a derived flag
(`closed_paths` now, level id later). No second knowledge repository. The
author view after entitlement is another screen of that flag, not a second
remote. UUID entitlements and a payment gateway are later. SMTP login is
ADR-017. Vsepsy identity (§6.1.3) stays a separate ADR.

This file is the canonical handoff context for GraphNotes across ChatGPT/Codex sessions.

The canonical product requirements are maintained in
`docs/product/PRODUCT_SPEC.md`. This file defines the accepted architecture that
implements those requirements. Cross-cutting decisions and rationale are stored
in `docs/decisions/ADR-*.md`.

## 1. Product
GraphNotes is a Markdown publisher with access rights and exactly one shared
rhizome — analog of Obsidian Publish, not «knowledge lives on GitHub». Each
user has their own graph (`/my_graph`). People author on the GraphNotes store
(upload / thin in-app editor of own cards). External disks **copy** `.md` into
that store (TZ 2.62). GraphNotes shows the one shared rhizome as a graph in the app (read-only
Markdown, cards). It does **not** offer ZIP download or a product clone of the
published shared corpus. Differ is one-way **local personal copy** → published shared;
editors merge selected differences. See ADR-008 amendment TZ 2.62, ADR-009,
PRODUCT_SPEC 2.62.

Core data flow:

```text
.md (upload / git connector / later Dropbox-Drive)
  -> copy into GraphNotes personal store
      -> Parser
          -> PostgreSQL derived index
              -> Graph API
                  -> Web UI
```

## 2. Critical data rule
Markdown is the primary/canonical knowledge data.

The graph is derived data.

Do not merge graph files. Merge Markdown changes in the local store (after
connector copy-in), then re-index affected notes and links.

```text
personal Markdown (GraphNotes local copy) / shared Markdown
      -> parser
      -> note index / links / tags in PostgreSQL
      -> graph representation
```

## 2.1 Project license
GraphNotes **software** is licensed under GNU Affero General Public License
v3.0 (`AGPL-3.0`). The canonical license text is the repository-root
`LICENSE` file. See `docs/decisions/ADR-005-agpl-3-license.md`. Do not add a
second root license file.

**Note/card content** offered to the shared rhizome is WTFPL (owner decision
2026-09-05 / TZ 2.44). That is a product content license stated in the
author-contract copy, not a relicense of project-owned code.

## 3. MVP architecture
Target application stack:

```text
Internet
   -> Nginx (Rhizome host)
       -> React frontend
       -> FastAPI backend
           -> PostgreSQL
           -> GitHub App / GitHub API
```

Technologies:
- FastAPI / Python
- React + TypeScript
- PostgreSQL
- SQLAlchemy 2.x async
- Alembic
- Docker Engine + Docker Compose
- Nginx on target host
- Cytoscape.js plus `cytoscape-fcose` for the shared graph, personal overlay
  and Graph Diff (layout coordinates are UI only)
- MDXEditor for own-personal card edit after «Отредактировать карточку»
  (rich + source); GraphNotes Markdown preview on read (TZ 2.49 / 2.50)
- Light/dark themes via CSS custom properties on `document.documentElement`
  (`data-theme`); graph stylesheets are rebuilt from those tokens when the
  theme changes. Preference is browser-local, not a user-profile field.
  The chrome control is a Theme Switcher (`role="switch"` sliding pill with
  sun and moon icons) in the header and Settings, not a pair of text buttons.

## 4. GitHub role in the product
GitHub is **not** the user's knowledge store (TZ 2.61). Ordinary UX is hosted
graph + cards on the installation (Publish analog). GitHub remains: (a) source
delivery ADR-006; (b) optional personal git XOR; (c) leftover Git engine for
**shared** Markdown merge in the current stack (Stage 3 GitHub App). Do not
treat GitHub as the product disk. Do not add MinIO/S3/Gitea because of 2.61.

When the shared-merge leftover still uses GitHub, it should handle:
- Git repositories
- branches
- commits
- history
- textual diff
- mergeability/conflicts
- merge

GraphNotes uses GitHub git refs and the merges API for proposals while that
leftover remains. Pull Request pages, branch names and SHAs are not shown in
the product UI.

GraphNotes should handle:
- application users and permissions
- the hosted personal store (`.md` / ZIP / in-app) as the **default** personal
  rhizome; optional connected personal git remotes (XOR)
- binding one shared knowledge repository in the current leftover stack
- Differ (one-way personal layer → published shared; connected git is
  re-read at public HEAD on Differ/proposal)
- graph indexing and in-app read of published Markdown
- one derived `note_index` for graph **and** SQL search; rebuild
  (`POST /index/rebuild`, SHA drift, webhook/poller) refreshes shared plus
  every personal git tree and drops comments whose paths left those trees
- card GET and comment create refresh the relevant git HEAD before read;
  a path missing from the current tree is 404, not a ghost body
- admin sets any account password (`POST /admin/users/{id}/password`),
  creates accounts (`POST /admin/users`), searches/filters users, revokes
  sessions (`POST /admin/users/{id}/sessions/revoke`), reads the filterable
  in-database action log (`GET /admin/audit`), and sees operator/SMTP
  status (`GET /admin/operator`) plus a persisted public site URL
  (`PUT /admin/operator`) and a test send (`POST /admin/mail/test`);
  plaintext passwords, mail codes and SMTP secrets are never stored in
  audit details or API responses
- shared-graph UX and personal overlay (links to shared); graph layer menu
  and personal-origin legend say «ваша ризома», not «ваш git»
- editor proposal queue at `/queue` (tabs New / In progress /
  Rejected); author’s own proposals at `/offer`; `/contribution` is
  Мой вклад (`GET /api/contributions/me`). Proposal detail shows
  proposed card text and links first, then Graph Diff; reject and
  return require a comment the author can read
- `/search` is role-scoped over `note_index` (`layer=visible`
  default): guest = published shared hits, no card body; user = shared ∪
  own personal; editor = that ∪ reviewable proposals; admin = every card
  they can open. Hits include `layer`. `layer=overlay` stays the graph
  stitch, not the card-search default. Proposal files are indexed on
  create and dropped when published; admin may open `personal:{uuid}:{path}`
- own-personal write (TZ 2.48–2.50): card `#/card/{path}` opens **view-first**.
  «Отредактировать карточку» exists only for the author's own personal card
  (accepted contract); no button and no contract hint otherwise. After the
  button the widget is **MDXEditor** (rich + source); read stays the
  GraphNotes Markdown preview. Save is `PUT /api/personal/notes/{path}` with
  `source` + `expected_hash`; git commit XOR upload store; existing path
  only (404 if missing, 409 if hash stale). In-app saves record
  `rhizome_events` (`edited` / `linked` / `unlinked`) with `owner_user_id`;
  `GET /api/cards/{path}/feed` is that history (no Markdown bodies); personal
  events do not mix into the shared feed for the same git path. Shared,
  others' personal and proposal cards stay read-only on `GET /api/cards/{path}`.
  Entitlement tables / «ризома автора» payer view remain later (ADR-016)
- Graph Diff as the structural view of Differ/proposal; derived
  process-local cache keyed by proposal id and base/head SHA (capped);
  parse warnings or time bound mark `complete: false`; direction
  reversal is its own edge change, not add+remove

Do not expose ZIP download or clone-the-corpus as product UX.
Shared knowledge git in the leftover stack is a backend merge source, not a
user take-away and not the user's disk (TZ 2.61).

Do not build a custom Git/version/3-way-merge engine for the MVP.
Do not replace writing on GraphNotes with a second Obsidian (live preview,
`[[ ]]` autocomplete, backlinks as the product). A thin in-app card editor
writes **own personal** notes only after «Отредактировать карточку»
(TZ 2.50 / MDXEditor, TZ 2.49): `PUT /api/personal/notes/{path}`
(author contract; write the local store; leftover may still commit git;
no new path from the card page). Do not store canonical **published shared**
note bodies in PostgreSQL.

Initial product store concept:

```text
GraphNotes personal store             = always the working copy (TZ 2.62)
git / later Dropbox / Google Drive    = connectors that copy .md into that store
shared knowledge repo default branch  = leftover merge engine for approved shared
.md / ZIP upload                      = copy into the same local store
proposal                              = selected Differ results, queued for editors
Differ                                = local personal copy → published shared
```

The `user/<uuid>` branch-on-shared-repo sketch is not the product story.
The current product does not contain workspaces or multiple shared knowledge
repositories.

## 5. Authentication - accepted decision
MVP authentication is owned by GraphNotes and uses username/password.

Stage 2 delivered:
- internal user ID: UUID
- username/login
- secure password hash (Argon2)
- opaque PostgreSQL-backed sessions (HttpOnly SameSite cookies)
- `/me`
- logout
- global roles: `user`, `editor`, `admin`
- email is required and unique; when SMTP is configured it must be
  confirmed before password login; login accepts username or email
- email can still be used as contact data when SMTP is off (treated as
  confirmed at registration)
- author status (ADR-010): `is_author` plus contract version and
  accepted/withdrawn timestamps; contributing (personal git connect, upload
  as contribution, Differ, propose) requires an accepted contract; editor
  review and admin user management do not

Telegram as an **identity provider** remains future scope, linked to the
existing internal user UUID (ADR-002). TZ 2.40 adds Telegram only as an
**outbound notification channel** for the editor queue when
`GRAPHNOTES_TELEGRAM_BOT_TOKEN` is set. That is not Telegram login.

## 5.1 Permission and rhizome model - accepted decision

Authorization uses global `user`, `editor`, and `admin` RBAC. There is exactly
one shared rhizome and exactly one personal rhizome per user. `editor` includes
direct shared editing and proposal review. `admin` includes all editor/user
rights plus system administration.

All shared writes remain audited Markdown/Git changes followed by revisioned
re-indexing. Editors/admins cannot approve their own proposals. There are no
workspace, organization, team or multi-shared-rhizome entities. See ADR-007
and ADR-008.

Personal knowledge is the user's git **or** unpublished uploads owned by that
UUID. It is not a second published vault. GraphNotes does not give the
published shared corpus out as files. Reading shared is in-app (graph, card,
Markdown). Proposing requires an accepted author contract (ADR-010).
Editorial merge requires an editor/admin account; self-approval remains
forbidden.

Derived data explicitly separates `shared`, per-owner `personal`, and immutable
`proposal` revisions. Accepted publication switches the visible shared revision
only after the merged revision is fully indexed, so readers never see partial
proposal application.

## 5.2 Single shared rhizome growth

One shared rhizome is a fixed product boundary, not a reason to load all data in
one request. Scale through bounded/paginated Graph APIs, PostgreSQL indexes,
incremental affected-set re-indexing, immutable revision references and
proposal/audit retention policies. Record performance/capacity baselines before
adding infrastructure excluded from the MVP.

## 6. Scope discipline
Not needed for the initial MVP unless actual load/features justify them:
- Neo4j
- Elasticsearch
- Redis
- Celery / RabbitMQ
- MinIO / S3
- Gitea / GitLab / self-hosted Git
- Kubernetes

Start simple. Add infrastructure only for measured/observed needs.

## 7. Development model
The canonical environment topology is:
- `nord`: Ubuntu development workstation at `172.16.13.205/24` with Codex and VS Code; primary source authoring
- `rhizome-test`: Debian 13 KVM at `172.16.13.14/24`;
  development-runtime, integration, deployment, migration and destructive
  testing
- `rhizome`: Debian 13 at `172.16.13.13/24`; production target for approved
  revisions only

`nord` and `rhizome-test` are currently reachable on the same
`172.16.13.0/24` network. The canonical integration deployment combines
`compose.yaml` with `deploy/compose.rhizome-test.yaml`. This exposes only the
frontend to the shared network at `http://172.16.13.14:8080`; backend remains on
`127.0.0.1:8000`, and PostgreSQL has no published host port. The bind IP is
configurable through `GRAPHNOTES_TEST_BIND_IP` with `172.16.13.14` as its
default. Local `compose.override.yaml` files are not canonical and are not
required for deployment.

The integration host uses the versioned
`deploy/graphnotes-rhizome-test.service` boot unit to wait for the configured
LAN address before force-recreating the frontend container. This prevents a
Docker host-port bind race during reboot without widening the frontend binding
to `0.0.0.0`.

The canonical delivery workflow is:

```text
nord
  -> GitHub
      -> rhizome-test
          -> approved revision
              -> rhizome
```

The canonical public repository is `https://github.com/vgdnet/graphnotes`.

Git is the primary delivery mechanism. SSH/rsync is a fallback or bootstrap mechanism only. `nord` owns source authoring and GitHub write operations. `rhizome-test` is the development-runtime and test environment; it normally consumes candidate revisions read-only and is never canonical source. `rhizome` is production. Its Git access must be read-only, with no credentials capable of push, and it receives only commits or tags approved on `rhizome-test`. Every new feature revision must pass the applicable integration, deployment and migration checks on `rhizome-test` before the same approved revision is deployed to `rhizome`. Do not use `rhizome` for destructive experiments, first-run migrations or ad-hoc source edits. See `docs/decisions/ADR-006-production-git-readonly.md`.

## 8. Stage roadmap
- Stage 0 - Infrastructure - DONE
- Stage 1 - Project Bootstrap - DONE
- Stage 2 - Password Authentication - DONE
- Stage 3 - GitHub Integration - DONE
- Stage 4 - Take from shared / ZIP fallback - DONE (product path superseded by ADR-009)
- Stage 5 - Graph Engine - DONE
- Stage 6 - Shared graph + personal overlay (links to shared) - DONE
- Stage 7 - Differ, editor proposal queue / merge / rollback - DONE
  (ZIP «Скачать» of published shared removed from product path, TZ 2.5)
- Stage 8 - Graph Diff (structural view of Differ/proposal) - CURRENT
- Stage 9 - Production Hardening / CI/CD - deferred (no `rhizome` deploy until an explicit owner decision)

## 9. Stage branches
Recommended source-code branch **names** stay historical so later stages do not
rename remotes. Product meaning of Stages 4, 6, 7 and 8 is ADR-008 and ADR-009,
not the old branch titles.

```text
main
feature/01-project-bootstrap
feature/02-password-auth
feature/03-github-integration
feature/04-markdown-import
feature/05-graph-engine
feature/06-personal-graph
feature/07-publish-merge
feature/08-graph-diff
feature/09-production
```

## 10. Architectural-change rule
If implementation discovers a reason to change this architecture:
1. state the concrete problem;
2. propose the change;
3. explain tradeoffs/migration impact;
4. obtain an explicit decision;
5. update this file and, when appropriate, add an ADR.

## 11. Author contributions and provenance (post-first-version product wave)

After the first product version, GraphNotes must treat the user as the primary unit of contribution and must persist/visualize *provenance* for nodes and directed links once they are accepted into the published shared rhizome (product spec §3.5 and §6.6.2).

This section is a technical verification contract: the exact storage schema and UI contracts are governed by an Accepted ADR that is still pending at the product-spec level.

Key product invariants that the technical architecture must preserve:

- Personal layer inputs (TZ 2.62): GraphNotes **local store is always** the
  working copy. Upload / in-app write that store. Git (and later Dropbox /
  Google Drive) **copy** `.md` into it. One active connector; do not merge two
  remotes. Differ is one-way local copy → published shared. Upload is not a
  write into published shared. After editor accept, canon of those paths is
  the published shared rhizome (leftover stack may still commit shared git).
  Current git live-read without copy-in and in-app commit to GitHub are leftover vs 2.62.
- Unpublished personal bytes live in the owner's GraphNotes store
  (not published shared bodies in PostgreSQL). Upload history (who / when /
  path / hash / Differ/proposal outcome) is GraphNotes-derived, not git log.
- Contribution states: `personal`, `proposed`, `accepted`. Closed corpus
  (ADR-011) is a derived `closed_paths` flag. **Paid access level** is the
  same closed slice with entitlements later (ADR-016 / TZ 2.41): mark paths
  in the author's personal store, do not add a second shared repo, do not store
  closed bodies as a second published canon in PostgreSQL. After entitlement the API/UI may expose a separate
  **view** of those paths («ризома автора»); that is still one personal
  store and one derived flag, not a second index or Differ. Payment gateway
  is not in this slice. Author legal status is ADR-010.
- Differ emptiness is not contribution erasure.
- TZ 2.7 / §5.4.2 contribution **counts** are derived from `proposals`,
  `personal_uploads`, `note_index`/`note_links` and editorial audit events.
  A user sees only own stats; an editor additionally sees own review
  decisions; admin sees the same stats for every account on
  «Администрирование». This does not change shared-note visibility (that is
  §5.4.1 closed corpus / ADR-016). Public JSON still omits Git
  SHAs, branches and PR URLs.
- Provenance, rhizome-card interaction feed, GitHub-style public user cards
  and closed/paid corpus remain product will pending entitlement tables.
  Do not invent a second Markdown canon or a second knowledge repository
  to implement them (ADR-016).
- Graph UI is visualization plus cards; thin in-app edit is own personal
  only after view-first «Отредактировать карточку» (TZ 2.50, MDXEditor
  TZ 2.49), not a vault replacement and not a shared-card editor.
- Published shared is not downloadable as ZIP/clone UX (TZ 2.5).

## 12. MVP API surface (product contract)

The product defines the external API surface for the MVP. Exact request/response schemas, error codes, and authorization details are finalized per Stage, but the route list and ownership of responsibilities are part of the contract (product spec §7).

Authentication / users:
- `POST /api/auth/register` (email required and unique; `accept_author_contract` optional)
- `POST /api/auth/login` (username or email + password)
- `GET  /api/auth/mail-status`
- `POST /api/auth/email/request` (purpose `confirm` / `login` / `reset`)
- `POST /api/auth/email/verify`
- `POST /api/auth/password/reset`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET  /api/users/me` (includes contacts, `is_author` and contract timestamps)
- `PATCH /api/users/me` (settings: display_name, email, phone, telegram, website, public flags, queue notify prefs)
- `GET  /api/users/me/author-contract`
- `POST /api/users/me/author-contract`
- `POST /api/users/me/author-contract/withdraw`
- `GET  /api/author/contract` (same text; settings aliases are canonical)
- `POST /api/author/accept`
- `POST /api/author/withdraw`
- `GET  /api/repository/status`

Personal layer (connected git **or** upload without git):
- `POST /api/personal/connect` (from account settings; requires author contract)
- `DELETE /api/personal/connect` (unbind personal git; uploads remain)
- `POST /api/personal/import-md` (`.md`/ZIP only if git is not connected; else 409)
- `GET  /api/personal/notes` (read-only index of the caller's personal layer)
- `GET  /api/personal/notes/{id}`
- `PUT  /api/personal/notes/{path}` (TZ 2.50: own personal only after the
  card-page edit button; `source` + `expected_hash`; author contract;
  git XOR upload; no new path; 409 stale; records owner-scoped feed events)
- `GET  /api/personal/uploads` (upload history: who / when / path / hash)
- `GET  /api/personal/closed-paths`
- `PUT  /api/personal/closed-paths`
- `DELETE /api/personal/closed-paths/{path}`

Shared publication and Differ:
- `GET  /api/differ` (refresh connected personal public HEAD, then one-way
  personal layer → published shared; git not required for upload-only authors)
- `GET  /api/contributions/me` (author’s notes/links/proposals/counts; derived; git not required)
- `GET  /api/admin/contributions` (admin: same stats for every account; TZ 2.7 / §5.4.2)
- `GET  /api/admin/users` (search/filter; last login and session count)
- `POST /api/admin/users` (admin-created account)
- `POST /api/admin/users/{id}/sessions/revoke`
- `GET  /api/admin/operator`
- `PUT  /api/admin/operator` (persist public site URL for mail links)
- `POST /api/admin/mail/test`
- `GET  /api/users/{id}/card` (public person card / achievements; not a GitHub
  profile; not personal or closed bodies)
- `GET  /api/shared/notes` (public titles; not card bodies)
- `GET  /api/shared/notes/{path}` (card body; login required, TZ 2.14)
- `GET  /api/cards/{path}` (card GET; `personal:{path}`, admin
  `personal:{uuid}:{path}`, `proposal:{id}:{path}`; write is PUT personal,
  not this route)
- `GET  /api/cards/{path}/feed` (card history; shared `owner_user_id` null;
  own personal = caller; admin `personal:{uuid}:` = that owner; proposal
  empty; in-app personal edits do not appear on the shared path feed; no bodies)
- `GET  /api/shared/notes/{path}/feed` (login required; shared events only,
  `owner_user_id IS NULL`)
- `GET  /api/shared/notes/{path}/comments` (login required)
- `POST /api/shared/notes/{path}/comments` (any signed-in user; pending)
- `POST /api/comments/{id}/moderate` (editor/admin; not self)

Removed from product surface (TZ 2.5 / 2.6):
- `GET  /api/shared/archive` (ZIP of published shared — gone; do not restore as UX)
- `POST /api/personal/take-from-shared` (write shared into personal git — gone)

Graph visualization and Graph Diff (Stage-owned):
- `GET  /api/graph/shared` (`/graph` canvas; no login; public published layer only)
- `GET  /api/graph/personal` (`/my_graph`; ваша личная ризома; caller’s full indexed tree or uploads)
- `GET  /api/graph/personal-overlay` (ваша часть ризомы; shared page + automatic wikilink stitch)
- `GET  /api/search` (`layer=visible|overlay|personal|shared`; visible is
  the `/search` default; guest = public hits, no bodies; overlay/personal
  remain for graph highlight; hits include layer)
- `GET  /api/graph/diff?proposal_id=...` (Stage 8 structural view of Differ/proposal; same derived index)

Proposals and editor workflow (Stage-owned):
- `POST /api/proposals`
- `GET  /api/proposals`
- `GET  /api/proposals/{id}`
- `POST /api/proposals/{id}/approve`
- `POST /api/proposals/{id}/reject`
- `POST /api/proposals/{id}/request-changes`
- `POST /api/proposals/{id}/rollback`

Reconciliation hook:
- `POST /api/webhooks/github`
