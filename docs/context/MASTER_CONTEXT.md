# GraphNotes - MASTER CONTEXT

Updated: 2026-09-22
Status: canonical architecture baseline
Aligned with PRODUCT_SPEC **3.41** (test tab `#/graph-test`: Pixi.js +
d3-force on the same `GET /api/graph/*`; canon canvas stays Cytoscape
`#/graph`; Vite/pnpm deps, not CDN) /
**3.40** (`#/graph` settings panel chrome matches
Obsidian: folds, switches, slider readouts, restart layout) /
**3.39** (`#/graph` Obsidian-like graph
settings: tags/orphans, groups, display, forces; browser `localStorage`) /
**3.38** (`#/user` has no personal-git connect;
working copy is GraphNotes store; plugin writes personal; leftover git
copy-in API only) /
**3.37** (living canon does not name an external
git host: ingest is Markdown + Obsidian + plugin) /
**3.36** (guest chrome: named rhizome + load
error, health follows graph/status, 5xx session is not logout, search
empty/searching/none/error, italic `_…_`, plural «2 заметки», hanging-card
local graph, small-node labels until zoom/hover, Russian roles
участник/редактор/администратор, title/og «Ризома психоанализа»,
narrow header, about copy) /
**3.35** (plugin ingest; not Wikipedia/MediaWiki as a product) /
**3.34** (card history and contribution stats
attribute **who proposed** which edit — proposer, path, diff volume;
accepter is editorial, not authorship. Not paragraph blame.) /
**3.33** (3.30 grant kept): one
shared rhizome per install, **apart from every account** (including
editor). «Editor account is the rhizome» is rejected. Endpoints are per
card; authorization is a DB grant `(user_id, card_path)` **or**
`(user_id, tag)` **or** `(user_id, path_prefix)`, evaluated per
GET/PUT/queue/sync of a path — write if direct path **or** any of the
card’s tags has a tag-grant **or** the path is under a prefix grant. Not an ACL document in markdown and not
TZ 3.24 «rights live on the card» as primary. Editor slice and
user-with-N-cards are one primitive.
**TZ 3.21 empty-list change:** empty grant = **no extra shared write**,
not the whole published queue. Empty is not a corpus dump.
**TZ 3.29 / 3.30 one server file NOW:** a granted card is a **right on the
shared object**, not a second blob in the personal store. Personal store
holds **ungranted drafts only**. Vault is always a **client copy**.
Plugin downloads granted cards; TZ 3.25 writes local on accept first,
then syncs to the **same** `shared_notes` file if different. Repeat
until that card’s queue is empty; then vault copy and the one server
file match. User with 1–10 granted cards: same grant + same one server
file + vault copy; queue only if editor on those cards. Revoke: stop
write/sync/load-update from the API; vault copy may remain. Differ /
proposals stay the write path onto shared for people **without** a write
grant. Later vault=rhizome same file is **not** canon (disk stays
client). Do not restore take-from-shared. No website editor. No second
rhizome. **This wave:** user cards always live in `personal_uploads`
(see their graph; send edits). Passing a card into the rhizome creates a
proposal from that personal copy. A path in both personal and shared is
**not dirt** — do not delete personal rows because a shared file exists.
OPEN (next stage, спросить product-editor): granted write to
already-shared cards (one shared file, plugin PUT shared, no duplicate
personal). Do not implement that this wave.
OPEN: read-without-write for queue review. TZ 3.25 local-first after
accept still holds. Today's coarse `can_propose_to_rhizome`: true
for role `user`, false for `editor`/`admin`. Plugin hides the
Differ-offer panel; POST /proposals is 403 when false; queue stays via
`can_see_queue`. Do not reuse POST /proposals for TZ 3.25 op 2. Do not
sync the whole vault to shared. OPEN: editor-of-a-slice vs editor who
also authors cards outside the write grant. One live Obsidian client
(`obsidian-card-merge/`); plugins already united. `obsidian-plugin/`
(old Publisher) is leftover-not-built, not a second shipped package.
Do not invent a third merge. TZ 3.09 withdrawn. Queue from API is an
editor capability in the same client; without editor access the queue UI
is off. Manual editor edit uses the same sync as a participant. Later the
same plugin shows/hides capabilities from the API when access is not
all cards, only granted cards — fits TZ 3.28 / 3.29 / **3.30**. Grant API and one plugin live in this file
(3.26 / 3.30); ADR-007 is superseded. OPEN next stage: grant-write to
already-shared.
3.25: two distinct operations after accept,
not «Save & Resolve = POST shared». (1) **Always:** write the accepted
file to the editor’s local vault; opening = that local note; if the
write fails, accept is unfinished. (2) **Only if** local ≠ GraphNotes
rhizome store: update the **same** `shared_notes` file **from the editor’s
account** (vault is the client copy; Differ stays the write gate for
ungranted publish). If they are the same, skip the store
update. Queue = others’ edits through the editor. GraphNotes stays the
canonical shared store; editor vault is not a second rhizome.
**Runtime 2026-09-16:** Card Merge writes the vault and opens the note first; POST `/proposals/{id}/resolve` is the second op if local ≠ shared; 504 does not undo the vault write) /
3.30 (third grant kind: `(user, path_prefix)`; admin «Доступы»;
TZ **3.33** nick/card/tag search on `#/admin`;
plugin granted GET/PUT; one server file kept from 3.29) /
3.29 (one server file for a granted card NOW; grant = right on shared;
personal = ungranted drafts; vault = client; 3.21 empty ≠ whole queue;
two-table copies leftover) /
3.28 (superseded on load-slice-into-personal; grant shapes and empty-list
change kept; «editor account is the rhizome» withdrawn) /
3.24 (narrowed by 3.30: not «rights live on the card»;
four access classes incl. paid content maker; global RBAC stays the
coarse gate; Differ stays the ungranted shared write gate; grant model
lives in this file, ADR-007 superseded) /
3.22 (editor has two stores: own personal
via Publisher, shared via queue/Card Merge; 2+ editors in parallel
on different cards; no shared ZIP into vault; 3.25: two operations
after accept — always local vault write; store update from editor
account only if local ≠ store) /
3.21 (editor editorial rights may be
scoped to card tags; admin grants; **empty = whole published queue
withdrawn by 3.28 / 3.30** — empty = no extra shared write; empty is
not a corpus dump; not a fourth role) /
3.20 (Publisher sidebar may list outbound
Differ and POST /proposals after personal copy for role `user`;
TZ 3.27 hides that panel for editor/admin; still queue, not
shared_notes) / 3.19 (after accept write the merged
card into the local vault at the proposal path and open it as a
normal note; TZ 3.25: that write is operation 1 and mandatory) / 3.18 (one accepted card;
remaining files stay on the open proposal / New tab) /
3.16 (Card Merge: one card in work;
other accept buttons stay off until Save & Resolve or cancel) /
3.15 (one Settings checkbox or toggle:
«Получать уведомления об изменениях в карточках, которые вы правили»;
`notify_card_changes`; email+Telegram when on; event = inbound Differ) /
3.13 (inbound Differ: watched published
paths; `#/differ` can take shared updates into personal store;
ADR-009 superseded) /
3.12 (Card Merge queue is metadata-only;
accept-into-work caches both card sides; do not equate Save & Resolve
with POST /proposals/{id}/resolve — TZ 3.25 two operations; that POST
first is runtime debt) /
3.11 (author outbound Differ is `#/differ` propose-only,
not a merge; Card Merge does not list personal Differ; editor plugin = queue) /
3.20 (Publisher lists GET /api/differ added/changed and
creates POST /api/proposals with the same gnp_ token) /
3.31 (GET /api/differ is store path/hash metadata; no live remote API,
no git copy-in, no bodies, no wikidiff2 on list; plugin `?include_inbound=false`) /
3.10 (editor-access sidebar =
website `#/queue` New tab via GET /api/proposals) /
3.09 leftover withdrawn by 3.26 (one plugin is canon;
runtime client is `obsidian-card-merge/`; `obsidian-plugin/` leftover —
do not merge trees again) /
3.08 (`#/queue` accordion: one proposal, one
card body, decide buttons under each card still approve/reject/return the
whole proposal) /
3.06 leftover withdrawn by 3.11 (author plugin does not list Differ) /
3.05 (one canon for all agents: PRODUCT_SPEC
**3.40** + this file; living ADRs in §0, not a stack. Leftover runtime
is unfinished code, not a second spec) /
3.03 (editor queue text diff is MediaWiki
**wikidiff2** table HTML, ADR-018; not `difflib`. Wikipedia two-column
layout. Author Differ stays a path-checkbox list.
Owner 2026-09-12 / ADR-018 amendment: editor-diff helper is compiled
native wikidiff2 C++, not `php-cli` / `php-wikidiff2`. **Shipped
2026-09-21:** backend image compiles pinned Wikimedia **1.14.2**
`src/lib` + GraphNotes CLI. Those PHP packages leave because they
were only for this helper — not a project-wide PHP ban. Missing
helper → HTTP 503, not `difflib`.) /
3.02 (Wikipedia-style editor table) /
3.01 leftover withdrawn by 3.11: Differ is chrome tab `#/differ` again
(propose differing paths; not merge). `#/offer` is my proposals only.
3.00 (no «Мой граф» / `/my_graph`; `/graph`
defaults to the rhizome canvas; `#/my_graph` → `/graph`).
2.99: product TZ → technical TZ → `rhizome-test`. Invite map page is hash `#/invites`
(rhizome-test: `http://172.16.13.14:8080/#/invites`). JSON is
`GET /api/graph/invites` — not in the hash. Code Writer deploys that
URL to `rhizome-test`. Separate cytoscape graph of `users.invited_by_id`
for creators: node shows `invited_count`. Not the rhizome canvas and
not an admin screen. Currently admin-only.
Person card URL is `#/users/{login}`
(`#/users/efimov`). Path `/users/{login}` (SPA `try_files`) is rewritten
on boot to that hash so the guest sees the card, not `/graph`.
`GET /api/users/{login}/card` reads derived index/store stats and does
**not** refresh git. A UUID in the hash or in
`GET /api/users/{…}/card` is **404** (person card empty state, not the
graph) and is not canonicalized to login.
Website `.md`/ZIP upload buttons are
**gone** (including Differ «Загрузить в личный слой»); the plugin writes
the personal store. A future upload API must sync into that same local
store. Last **30** file versions are kept for rollback (`card_revisions`);
index, graph and Differ read **only the latest** working copy.
Person card `#/users/{login}` is the same
for guests and signed-in users (`store` counts + inviter; no foreign
personal bodies). TZ 2.94: card history is **not** fetched
with the card body. Button «История правок» loads `GET /api/cards/{path}/revisions`
— last **30** snapshots + diff (TZ **3.34**: who **proposed** the edit,
optional accepter, volume). **Shipped 2026-09-21:** `actor_user_id` is the
proposer (proposal author / grant writer); `accepter_user_id` is who
accepted in the queue; list payload includes `proposer`, `accepter`,
`lines_added`, `lines_removed`, `bytes`. Alembic `0021` + `0025`.
Table `card_revisions` (Alembic `0021`, accepter `0025`); working copy stays in the store;
this is not a second living canon. ADR-013 `rhizome_events` stay body-less
for contribution counts; the card page does not auto-fetch `/feed`.
TZ 2.93: the website Markdown editor is
**off** (no «Отредактировать карточку», `PersonalCardEditor` unmounted)
until reverse download / reverse sync exists; taking another participant’s
card into one’s own rhizome later unlocks edit + reverse sync for those
cards. Do not restore historical `take-from-shared` without a new decision.
`PUT /api/personal/notes/{path}` stays for the plugin and TZ 2.66 stub
create. TZ 2.85–2.87 / §17 **shipped on
`rhizome-test`**: any active account may invite by email link; no
Register tab; person card shows «Приглашен … по приглашению от @user»
(inviter login). Send form is Settings `#/user` tab **«Пригласить пользователя»**,
not personal data. TZ 2.92: the same attribution line is on `/user`, «Мой вклад»,
and the admin user row. Cutover: existing rows except `efimov` point at the
real `@efimov` account (`invited_by_id`, Alembic `0020`). Same rule on
vsepsy.ru. Do not deploy this wave to production `rhizome`. TZ 2.83: the Elasticsearch iteration
(ADR-015) starts **only after the first approved rhizome production
deploy**. Not this branch; do not add ES to Compose; SQL `/search` until
then; §6.5.3 questions 1–9 stay unanswered for that later wave.
TZ 2.90 / §12.1: GraphNotes Publisher queues vault edits and copies them
on the sidebar ItemView «Передать правки на сервер», ribbon paper-plane,
file close, idle minutes, or interval (not every keystroke), into
the owner's `personal_uploads` / `personal_assets` (no card picker
required; first dump is «Отправить все правки»; matching bytes skipped). Shared
rhizome write stays on the proposal queue. TZ 2.88 / **3.11** / **3.20**: Differ
API lists paths that differ (`GET /api/differ`); the site tab `#/differ`
and Publisher sidebar propose them (`POST /api/proposals`, Bearer `gnp_`
with `personal:read`, that user only). Card Merge does not consume that
list. Publisher does not write `shared_notes`.
Contribution marks/topics (§6.6.3) are not this plugin transfer API.
TZ 2.81 ships login-by-mail on the Login
tab (same SMTP contour as confirm/reset). TZ 2.68–2.76 shipped (2.79) / §12.1: Obsidian plugin
**API** writes only the token owner's personal store. Desktop
**GraphNotes Publisher** lives in
`obsidian-plugin/` (TZ 2.69). Token is a personal API key (TZ 2.75):
`gnp_` + `secrets.token_urlsafe(32)`, stored in Settings and in the
plugin `data.json` (TZ 2.75: cabinet stores the key and the user copies
it into the plugin; hash-only / show-once is not the product). SHA-256
is kept for Bearer lookup. TZ 2.73–2.74:
token access log on `/user` (who / IP / which token), ~6 months in the
working DB, hard ceiling ~1 year; a separate logs database is later.
Shared rhizome and Differ stay unchanged. TZ 2.67: personal ingest that hits the
Markdown indexer (ZIP, one `.md`, plugin write, personal git copy-in) is
scanned for **white noise** (garbage, not notes). Combined signals — not
one weak heuristic: invalid UTF-8 / binary `.md` (NUL), Shannon entropy
≥ ~7.5 or incompressible high-entropy printable, almost no letters
(Unicode `L*`, including Cyrillic/CJK) vs symbols, control-char soup.
YAML frontmatter and fenced code are stripped before soft scores; short
stubs skip soft checks. Normal Markdown, fences, CJK/Cyrillic, stubs and
wikilinks do not lock. Zip-bomb size/ratio/10 000-file guards stay (TZ
2.65). On hit: do not write or index the payload; HTTP 400
`content is not Markdown notes`; set `is_active=false` (same as admin
lock; drop sessions); audit `ingest.white_noise_lock`. Already-indexed
real notes stay. Last active admin is not locked; ingest is still
rejected. Mail every active `admin` with a confirmed email (or
`notify_queue_email`); SMTP from / public URL from installation
settings. SMTP off or send failure must not undo the lock. Shared
copy-in is not this gate.
Missing wikilink hover shows a Publish-like
hint: guests «карточки пока нет»; signed-in authors «Создать карточку»
(personal store, not shared). TZ 2.65: ZIP personal ingest accepts **10 000**
files per archive (Obsidian vault / git dump); ~120 files succeed. Over the
cap is HTTP 400 `archive has too many files`. Zip-bomb guards stay: 2 MiB
compressed, 8 MiB unpacked, 256 KiB per file, compression ratio, no
symlinks/encryption/odd compression. Graph node tap and `[[wikilink]]` open
`/card/{path}`; the card page shows a local neighborhood graph beside the
article. Guests may read published shared cards (not personal, queue, or
comments). Knowledge Markdown **always** lives in GraphNotes
local stores (personal `personal_uploads`, published shared `shared_notes`).
**TZ 3.35 / 3.37:** ingest is the **Obsidian plugin**. Cards and Differ read
local stores. Live-read of an external git remote on GET Differ / `#/differ`
/ plugin sidebar / `GET /repository/status` / graph / search / card /
comments / contributions is **closed**. Leftover unfinished: personal git **bind** API (no copy-in), unused
merge-out. `#/user` has **no**
«Свой git» tab (TZ **3.38**). Do not treat leftover as
canon. Dropbox/Drive are not this wave.
`/search` and the graph read `note_index`
(no bodies there «so search is faster»). Working copies live in
`personal_uploads` / `shared_notes`. A personal export, if offered, is
bytes from the local store, not rows synthesized from the index. Published
shared is still not a product ZIP.
Auth is one chrome (login / register /
forgot); reset lookup is login or email, mail only to stored inbox. App routes (owner list; typo `/seach` →
**`/search`**, hash `#/…`): `/card` = admin start card (path in
`installation_settings`, Admin → Установка, 404 if unset);
`/card/{path}` = that card (TZ 2.55–2.56: no layer in URL; website
read-only, TZ 2.93; same path in both layers = **stack** rhizome-top /
personal-bottom + Differ offer — **shipped 2.59**); `/queue` = editor
proposal queue; `/user` = **account settings** (not the public person
card); `#/users/{login}` = **public person card** (TZ 2.60 / **2.97** / **2.98**: achievements —
accepted notes/links, proposal count, shared created/edited events; path
`/users/{login}` → `#/users/{login}`; feed
names and proposal author open it; `GET /api/users/{login}/card` (derived
stats, no git refresh; UUID key is 404 and stays on the person view, not `/graph`; no public UUID);
TZ 2.87: «Приглашен %date% по приглашению от @user»
from stored inviter login — omit if none); `/offer` = **my** proposals into the rhizome; `/graph` = shared
rhizome canvas (fCoSE); `/invites` = invite map page `#/invites` for creators (TZ 2.98;
rhizome-test `http://172.16.13.14:8080/#/invites`; Code Writer deploys);
JSON `GET /api/graph/invites` is not a hash; `@login · N` + node size from
`invited_count`; click → `#/users/{login}`; diamond if no inviter;
currently admin; non-admin hash redirects to `/graph`;
not the rhizome canvas and not an admin screen); `/search` = card search (SQL `note_index`,
`layer=visible`; Elasticsearch only after the first approved rhizome
production deploy — ADR-015 / TZ 2.83); no `/my_graph` tab (TZ 3.00;
personal layer is a filter on `/graph`); `/contribution` = Мой вклад.
`#/differ` is the Differ tab (TZ 3.11 / **3.13**: outbound propose and
inbound take-into-personal; not a merge editor); `#/offer` is
my proposals. Do not invent `/accepted/differ`. Editor review of a proposal (TZ 3.03 /
ADR-018, `/queue` and the same proposal body on `/offer`) is
**wikidiff2** table HTML from `GET /api/proposals/{id}` (`html`,
`engine`, parsed `rows`); `difflib` is not the review engine. The
engine is Wikimedia C++ (`Wikidiff2::execute` + `TableFormatter` in
`src/lib`). FastAPI calls a GraphNotes-compiled native helper (same
JSON contract as today’s PHP stdin helper: `before` / `after` →
`table_html`), then allow-lists HTML. Missing helper → 503. No
inline/unified toggle. Do not rewrite the algorithm in JS or run C++
in the browser. Author Differ remains path checkboxes. `/` → `/graph`.
TZ 2.57 wrongly inferred `/user` = person card and `/offer` = combined
editor queue — withdrawn. Website in-app edit is **off** (TZ 2.93). The
transitional own-personal class `#/card/personal:{path}` (hash encodes
`:` as `%3A`) is **read-only**; do not mount `PersonalCardEditor`. Shared
stays read-only; admin does not in-place-edit published shared. For authors
GraphNotes is a Markdown publisher with rights and one shared rhizome
(TZ 2.61 / Publish analog), not a second Obsidian. Re-enable the thin
in-app editor only with reverse download / reverse sync; taking another
participant’s card into one’s rhizome later unlocks edit + reverse sync
for those cards. Shared / `personal:{uuid}:` / proposal stay read-only.
`[[wikilink]]` on a card inherits that card's layer (TZ 2.54 / `qualifyCardPath`):
own personal → `personal:{file}`; foreign personal → `personal:{uuid}:{file}`;
proposal → `proposal:{id}:{file}`; already-prefixed targets stay. Shared and
personal are not collapsed — the same git path can exist in both.
Card page is GraphNotes Markdown preview only. `PUT /api/personal/notes/{path}`
with `source` + `expected_hash` stays for the **plugin / API** and a **new**
personal path from a missing-link page (TZ 2.66); 409 if stale. Plugin /
upload / copy-in saves record `rhizome_events`
(`edited` / `linked` / `unlinked`) with `owner_user_id` so they do not mix
into the shared card feed for the same git path; no Markdown bodies in that
table. `GET /api/cards/{path}/revisions` is the on-demand card edit history
(TZ 2.94, last 30). `GET /api/cards/{path}/feed` stays for contribution
events and is not fetched when opening a card. Shared / others'
personal / proposal cards stay read-only; shared changes go through Differ.
Working copies of **published shared** Markdown live in `shared_notes`
(TZ **3.35** / **3.37**); leftover git copy-in is not ingest canon and
is not a write path that bypasses Differ. Personal hosted Markdown
(plugin) is the product default (TZ 2.61 / **3.35** / **3.37**; 2.62–2.63
leftover).
ADR-008 is **superseded**. Hosted personal store is canon (plugin).
«No in-app Obsidian» still forbids a second Obsidian-class editor;
TZ 2.93 also keeps the thin website editor off until reverse sync.
Differ is a two-store compare (TZ 3.11 / **3.13**): UI is chrome tab
`#/differ` (outbound propose; inbound accept into personal for watched
published paths). It is not a merge editor and not the editor plugin
list.
Author-contract copy (version `2026-09-05`)
is responsibility for notes/links offered to the shared rhizome, withdraw
(new proposes/uploads/git-as-contribution blocked until re-accept; already
published notes stay in shared git), **WTFPL for card/note content** offered
to the shared rhizome, and **AGPL-3.0 for the software** with developer
credit (Юрий Ефимов, y@psychoanalyst.pro). Same Russian text in Settings →
Договор автора only — not on **О программе**. `#/about` (footer button
«О программе», guests and signed-in; footer stays at the bottom of the
shell) shows rhizome copy (TZ **3.36**): «Ризома психоанализа» + Maria’s
description, editor credit (Мария Надршина, `https://t.me/unconsciousjourney`),
GraphNotes credit (Юрий Ефимов, `https://t.me/guide_psy`), and **Стать автором**
→ `#/auth` (invite-only). Persistent footer has no WTFPL/AGPL one-liner
and no author-contract control (TZ 2.78). No second
LICENSE file; `LICENSE` remains AGPL-3.0.
**TZ 3.36 chrome (same install, not a second spec):** `/graph` on API
failure still shows the rhizome name, two lead phrases, and
«не удалось загрузить» — not a silent empty canvas. Header health is
green only when the process **and** graph/status data respond; else
«данные не загрузились» / «нет связи» — not `/api/health` alone.
`GET /api/users/me` **5xx** keeps the session and says «связь потеряна»;
**401** is guest; do not paint a login-form error as logout. `/search`
status is four states: empty («наберите слово») / searching / none /
error (timeout/fault); «Ищем…» only while a request runs. Card Markdown
renders italic `_…_` as well as `*…*`. Note counts use Russian plural
(«2 заметки»). RBAC strings in UI are **участник** / **редактор** /
**администратор**, not raw `user`/`editor`/`admin`. Missing-card local
graph shows **incoming** wikilinks when they exist. On the whole-graph
canvas, small-node labels stay hidden until zoom or hover (selected /
hit / hovered stay named). Document `title` and og tags are
«Ризома психоанализа». Header stays inset from the window edge (TZ 2.77
narrow chrome). Git in Settings is **leftover**
(TZ **3.35** / **3.37**): not canon ingest. The plugin writes `.md`. Disconnect of a
leftover git link does **not** wipe copied files. TZ 2.41 refines ADR-016 UX without a second
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
layers + queue). Hits carry `layer`; Graph overlay stitch is unchanged. Editor queue (TZ 2.38 / **3.08**): tabs New /
In progress / Rejected; one proposal expanded, one card body visible;
Принять / Отклонить / Доработать sit under each card and still decide the
whole proposal; Graph Diff after; reject and return store a comment the author can read. SMTP
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
the same UUID. Auth UI is one chrome: «Вход» /
«Не помню пароль». TZ 2.86: no «Регистрация» tab; new accounts only via
the invite email link `#/auth/invite?token=` (`POST /api/invites`,
`POST /api/auth/invite/accept`; `POST /api/auth/register` → 410).
On «Вход», when SMTP is on, «Войти письмом»
requests `purpose=login` (identifier = login or email; letter only to
the stored inbox) and then accepts the 6-digit code or
`#/auth/login-code?token=` (TZ 2.81). That is not a fourth tab.
Mail links use one **public site URL** per install
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
TZ 3.15 adds one author pref `notify_card_changes` (default off) —
same SMTP / Telegram bot when the toggle is on, sent when an inbound
Differ row appears; link `#/differ`. Control is one checkbox or
slider in Settings and Admin users, not two channel boxes. Admin
UI is three screens (users / journal / operator), not a stub list.
Graph-layer names from TZ 2.36 stay. Shared-graph UI uses Cytoscape.js **fCoSE**
(TZ 2.27 / §6.5.1): live force layout, centered outlined labels, neighborhood
highlight; GraphNotes layer colors stay unless a canvas group recolors the
node (TZ **3.39**). The `#/graph` page has an Obsidian-like settings cog:
filters (tag nodes, orphans), groups (search query + color), display
(arrows, text-fade, node size, link thickness), forces (center/gravity,
repel, link elasticity, ideal length). Prefs: `localStorage`
`graphnotes-graph-settings`, same class as `graphnotes-theme`, not `/user`.
The card-page aside local graph does not open that panel. Gene-demo sliders
are still not ported. TZ **3.40** matches Obsidian chrome: collapsible
sections, right-hand switches, numeric slider readouts, round color swatch,
«Запустить анимацию» re-runs fCoSE, header reset/close. TZ **3.41**
adds chrome tab `#/graph-test` (`view` `graph_test`): WebGL/canvas via
Pixi.js, layout via `d3-force` (`forceManyBody` / `forceLink` /
`forceCenter`). Payload is the **same** `sharedGraph` fetch as default
`#/graph` (guest published index / signed-in shared page), not
`GET /graph/personal`. Do not point this tab at a second index. Do not
replace `#/graph`. The canvas has two views (TZ 2.51):
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
indexed personal tree, or uploads if git is off). That layer is a filter
on `/graph`, not a `/my_graph` route (TZ 3.00). Default `/search` / `GET /api/search` is `layer=visible` (the
role-scoped corpus above, including guest published hits without
bodies). `layer=overlay` is the graph stitch for canvas highlight;
`layer=personal` is the full personal tree. Cards and Graph Diff /
the interaction feed read that same derived visibility — no second
manual catalog of which personal notes are «the part». Differ offer list
(`GET /differ`, plugin «Предложить в ризому») compares `personal_uploads`
with `shared_notes` and does **not** call an external git host (TZ 3.31 / **3.35** / **3.37**).
Leftover poller / webhook / unused `copy_git_*` do **not** copy-in
(TZ **3.37**). The offer path never live-pulls GitHub. No second canonical clone of
personal Markdown. Light and dark UI themes (TZ 2.19 / 2.22 /
§5.5.4) are client-side: `localStorage` key `graphnotes-theme`, else
`prefers-color-scheme`. The control is a Theme Switcher toggle (sliding
sun/moon pill, `role="switch"`), not generic text buttons. Cytoscape labels
use CSS theme tokens, not hardcoded washed-out fills. Landing `/` is `/graph`
(rhizome canvas by default) for guests and signed-in users (TZ 2.14 / 2.58 /
3.00). There is no «Мой граф» tab; `#/my_graph` opens `/graph`. Guests see published nodes/edges and may
open published shared card bodies (TZ 2.64); feed, comments, personal
and queue still require a session. Account settings
(§5.5 / TZ 2.13 / 2.58 / 2.77) live at **`/user`** (name in header opens it; `.topbar` `padding-inline: 1.25rem` keeps that control and the brand off the window edge):
four chrome tabs — personal data, author contract, Obsidian tokens,
**«Пригласить пользователя»**. There is **no** «Свой git» tab and no
personal-git connect form (TZ **3.38**). Send-invite UI (email field, submit button,
pending unused invites) lives **only** on that invite tab (`POST /api/invites`,
`GET /api/invites`); personal-data has the «who invited you» line, not the
send form. Required unique email, optional phone/Telegram contacts (not login)
and author contract — not the public person card. Leftover
`POST`/`DELETE /api/personal/connect` is HTTP 410 and is not mounted in the cabinet.
ZIP download of published shared is removed (TZ 2.5; ADR-009
**superseded**). **Rhizome access
levels** (ADR-016 / TZ 2.31, UX 2.41): a paid level is a closed slice of
content, not a «потребитель» role. Closed Markdown stays in the author's
personal store (local copy; path/frontmatter mark); PostgreSQL holds a derived flag
(`closed_paths` now, level id later). No second knowledge repository. The
author view after entitlement is another screen of that flag, not a second
remote. UUID entitlements and a payment gateway are later. SMTP login is
ADR-017. Vsepsy identity (§6.1.3) stays a separate ADR.

This file is the canonical handoff context for GraphNotes across ChatGPT/Codex sessions.

**One canon for all agents (TZ 3.05).** Product editor, technical editor,
code writer, observers, and Codex/Cursor agents read the same truth:
`docs/product/PRODUCT_SPEC.md` **3.40** (what) and **this file** (how).
Chat is not spec. Do **not** read the `docs/decisions/` pile as a second
Markdown canon. Living vs superseded ADR one-liners: §0 below and
`docs/decisions/README.md`. If code and TZ diverge, stop. Leftover
runtime is unfinished code, not a second spec. Leftover: `AGENTS.md` is
gitignored, so clones of the source remote do not carry it; do not treat that hole as
a second brief.

**Technical TZ / runtime architecture** is coordinated by the technical
agent (`MASTER_CONTEXT`, observer, deployment). Always-applied Cursor
rule: `.cursor/rules/technical-canon.mdc`. The product editor does
**not** invent a second stack. Code writers follow this file and
`PRODUCT_SPEC.md` last accepted (owner 2026-09-21: **3.40** graph
settings chrome as Obsidian; ingest remains **3.37** plugin / no
external git host). One live Obsidian client: `obsidian-card-merge/`
(already united). `obsidian-plugin/` is leftover-not-built, not a
second shipped package. Do not invent a third merge.

The canonical product requirements are maintained in
`docs/product/PRODUCT_SPEC.md`. This file defines the accepted architecture that
implements those requirements. Living ADRs are indexed in §0; superseded
files are history.

## 0. ADR index (not a second spec)

Agents open **two** living files. Do not stack every `ADR-*.md`.

**Living** (still true):

- ADR-001 — Markdown is knowledge source of truth; graph derived; no `graph.json`
- ADR-002 — MVP auth is local username/password; Telegram IdP later on the same UUID
- ADR-005 — software AGPL-3.0 (`LICENSE`); card content to shared is WTFPL (TZ 2.44)
- ADR-006 — GitHub is **source-code delivery only** (repo private; `nord → GitHub → rhizome-test → rhizome`); production git read-only
- ADR-010 — author contract flag on the UUID; not a fourth RBAC role
- ADR-011 — closed corpus stays in the author's personal store; derived `closed_paths`; not a second canon in PostgreSQL
- ADR-012 — in-app person card `#/users/{login}`; no public UUID
- ADR-013 — `rhizome_events` provenance, no bodies
- ADR-014 — commenter is not a fourth RBAC role
- ADR-015 — Elasticsearch only after first approved `rhizome` production deploy; SQL `/search` until then; not in Compose now
- ADR-016 — rhizome access levels = closed slice, not a consumer role; no second knowledge repo
- ADR-017 — installation SMTP for confirm / login-by-mail / reset; not a replacement IdP
- ADR-018 — editor `/queue` text diff is native C++ wikidiff2; not `difflib`; **not PHP as the engine**

**Superseded** (keep the files; do not treat as ingest / git-disk / ZIP / «editor account is the rhizome»):

- ADR-003 — GitHub as knowledge git engine
- ADR-004 — environment/delivery (living successor: ADR-006)
- ADR-007 — single rhizome + global RBAC *as git-merge architecture* (still-true one-rhizome / `user < editor < admin` / no workspaces live in this file and PRODUCT_SPEC)
- ADR-008 — personal = git remote / ZIP of shared / no hosted store (Obsidian authoring remains)
- ADR-009 — git circulation + ZIP of published shared (living Differ is store path/hash)

Do not invent grant-write-to-already-shared this wave (OPEN, next stage).
Do not wipe the personal store.

## 1. Product
GraphNotes is a Markdown publisher with access rights and exactly one shared
rhizome — analog of Obsidian Publish. It is **not** Wikipedia / MediaWiki as
a product (wikidiff2 is editor `/queue` only). Knowledge is **`.md`**. Authors
write in **Obsidian**. The **plugin** copies files into GraphNotes stores
(TZ **3.35**). Each user has a personal layer on the same `/graph` canvas
(TZ 3.00). Website editor off until reverse sync (TZ 2.93).
GraphNotes shows the one
shared rhizome as a graph in the app (read-only Markdown, cards). It does
**not** offer ZIP download or a product clone of the published shared corpus.
Differ outbound is **local personal copy** → published shared (propose).
TZ 3.13 adds inbound **published shared → personal store** only for paths
this author already got accepted. Editors still merge selected outbound
differences into shared. ADR-008 / ADR-009 are **superseded**; living
circulation is this file + PRODUCT_SPEC **3.40** / 3.13 / **3.24**.

Core data flow:

```text
.md (Obsidian vault → plugin / API)
  -> GraphNotes local stores (personal_uploads + shared_notes)
      -> Parser
          -> PostgreSQL derived index
              -> Graph API
                  -> Web UI
```

## 2. Critical data rule
Markdown is the primary/canonical knowledge data.

The graph is derived data.

Do not merge graph files. Merge Markdown changes in the local store
(plugin ingest; leftover connector copy-in unused), then re-index
affected notes and links.

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
```

Leftover (not canon, TZ **3.35** / **3.37**): `POST`/`DELETE /personal/connect`
is HTTP 410 (no GitHub App). Knowledge merge-out is **gone**: no
`create_branch` / `merge_branch` / `commit_markdown` / `reconcile_proposals`.
Approve/reject/rollback write `shared_notes` and proposal rows. GitHub is
**source-code delivery only** (ADR-006). Knowledge App credentials are
not required to run the stack. ADR-003 / ADR-007 / ADR-008 / ADR-009 are
**superseded** (owner 2026-09-21) — living product is **3.40** + this file
(ingest still 3.37). Do not read those files as ingest canon.

Technologies:
- FastAPI / Python
- MediaWiki **wikidiff2** C++ (`src/lib`: `Wikidiff2` + `TableFormatter`)
  compiled in the backend image from pinned Wikimedia tarball
  1.14.2 (https://releases.wikimedia.org/wikidiff2/,
  sha256 `97c91a0d4b5b468c533bcd2485fa089612dbcd541773f57f1ffc086942107724`)
  plus GraphNotes CLI `wikidiff2/main.cpp` →
  `/usr/local/bin/graphnotes-wikidiff2`. Compile with `-include cstdint`
  (GCC 15). Build without `HAVE_CONFIG_H` so
  `WD2_ALLOCATOR` is `std::allocator`; Zend / `php_wikidiff2.cpp` is not
  linked. Runtime dep: `libthai0` (compile: `g++`, `libthai-dev`).
  FastAPI subprocess, JSON stdin `before`/`after` → `table_html`, same
  allow-list as before. This path does not depend on `php-cli` /
  `php-wikidiff2` (dropped with the helper; they were only for
  editor-diff). Missing helper → HTTP 503, not `difflib` (ADR-018 /
  TZ 3.03; owner 2026-09-21 native helper shipped).
- React + TypeScript
- PostgreSQL
- SQLAlchemy 2.x async
- Alembic
- Docker Engine + Docker Compose
- Nginx on target host
- Cytoscape.js plus `cytoscape-fcose` for the **canonical** shared graph
  (`#/graph`), personal overlay and Graph Diff (layout coordinates are
  UI only)
- TZ **3.41** test canvas: `pixi.js` + `d3-force` on `#/graph-test`
  (`frontend/src/PixiGraphView.tsx`, `pixiGraph.ts`). Vite/pnpm
  dependencies, not a CDN. Same Graph JSON as the default `#/graph`
  load: `nodes[].path` → simulation id, `nodes[].title` → label,
  `edges[].source|target` → links. No new FastAPI route, no
  `graph.json`. The tab is **not** the rhizome canvas: no 3.39/3.40
  settings cog, no «весь / локальный», no «ваша часть / ваша личная
  ризома» layer switch. Guest and session both get the chrome tab.
  Click opens `/card/{path}` (tag/`locked:` nodes do not; unresolved
  → hanging-card hash). Wheel zoom, pan, node drag, hover neighbors,
  labels appear with zoom. Missing helper libraries must fail the
  frontend build, not silently skip the tab.
- GraphNotes Markdown preview on the card page; MDXEditor leftover until
  reverse download / reverse sync (TZ 2.93; was TZ 2.49 / 2.50)
- Light/dark themes via CSS custom properties on `document.documentElement`
  (`data-theme`); graph stylesheets are rebuilt from those tokens when the
  theme changes. Preference is browser-local, not a user-profile field.
  The chrome control is a Theme Switcher (`role="switch"` sliding pill with
  sun and moon icons) in the header and Settings, not a pair of text buttons.

## 4. Knowledge ingest (TZ 3.35 / 3.37)

Ingest is the Obsidian plugin into `personal_uploads` / `shared_notes`.
GraphNotes is not Wikipedia. An external git host is **not** in the living
canon: not a store, connector, merge engine, or live API.

Leftover unfinished (not canon): `POST`/`DELETE /personal/connect` is
HTTP 410 (no GitHub App for knowledge). `copy_git_*` / `commit_markdown`
/ `create_branch` / `merge_branch` / `reconcile_proposals` are **removed**
from product runtime. Approve writes `shared_notes`. Webhook delivery
log does not copy-in.
Poller default `GRAPHNOTES_PERSONAL_SYNC_INTERVAL_SECONDS=0`;
`pull_connected_gits` is a no-op. Knowledge GitHub App env vars are
**not** required to run Compose. Admin «Подключить общую ризому» is
**gone**; `POST /repository/connect` ensures a **local** shared binding
and reindexes `shared_notes`. `#/user` does **not** show «Свой git» (TZ **3.38**).
Do not add MinIO/S3/Gitea. Pull Request pages, branch names and SHAs are
not shown in the product UI.

ADR-003 / ADR-008 / ADR-009 are **superseded**. Obsidian authoring
remains. GitHub stays ADR-006 source delivery.

GraphNotes should handle:
- application users and permissions
- the hosted personal store (plugin) as the **default** personal rhizome
- leftover optional connected personal git remotes (bind metadata only) — not canon
- leftover `GitHubAppClient` stub — raises, does not call GitHub
- Differ (outbound personal layer → published shared; TZ 3.13 inbound
  published shared → personal store for watched accepted paths;
  list/open reads local stores, not a live remote HEAD)
- graph indexing and in-app read of published Markdown
- one derived `note_index` for graph **and** SQL search; rebuild
  (`POST /index/rebuild`) reindexes local stores only; leftover webhook
  records delivery and does not copy-in; leftover poller is a no-op
- card GET and comment create read `shared_notes` / `personal_uploads`;
  a path missing from the local store is 404, not a ghost body
- admin sets any account password (`POST /admin/users/{id}/password`),
  creates accounts (`POST /admin/users`), searches/filters users **by nick**
  (`GET /admin/users?q=` also matches email/display name; each row includes
  `grants[]` plus `editor_tags`, role, `is_author`, `is_active` so `#/admin`
  shows rights without a second screen — TZ **3.33**), revokes
  sessions (`POST /admin/users/{id}/sessions/revoke`), reads the filterable
  in-database action log (`GET /admin/audit`), and sees operator/SMTP
  status (`GET /admin/operator`) plus a persisted public site URL
  (`PUT /admin/operator`) and a test send (`POST /admin/mail/test`);
  plaintext passwords, mail codes and SMTP secrets are never stored in
  audit details or API responses
- shared-graph UX and personal overlay (links to shared); graph layer menu
  and personal-origin legend say «ваша ризома», not «ваш git»
- editor proposal queue at `/queue` (tabs New / In progress /
  Rejected; TZ 3.08 accordion: one proposal, one card body, buttons
  under each card decide the whole proposal);
  author’s own proposals at `/offer`; `/contribution` is
  Мой вклад (`GET /api/contributions/me`). Proposal detail shows
  proposed card text and links first, then Graph Diff; reject and
  return require a comment the author can read
- `/search` is role-scoped over `note_index` (`layer=visible`
  default): guest = published shared hits and may open those card bodies;
  user = shared ∪
  own personal; editor = that ∪ reviewable proposals; admin = every card
  they can open. Hits include `layer`. `layer=overlay` stays the graph
  stitch, not the card-search default. Proposal files are indexed on
  create and dropped when published; admin may open `personal:{uuid}:{path}`
- own-personal **read** (TZ 2.93 withdraws 2.48–2.53 website edit): card
  `#/card/{path}` is **read-only**. No «Отредактировать карточку», no
  MDXEditor. `PUT /api/personal/notes/{path}` stays for plugin / API and
  TZ 2.66 missing-wikilink create (empty `expected_hash`); 409 if hash stale.
  Plugin / upload / copy-in record `rhizome_events` (`edited` / `linked` /
  `unlinked`) with `owner_user_id` and a `card_revisions` snapshot (last 30,
  TZ 2.94). `GET /api/cards/{path}/revisions` is on-demand history with the
  text diff; `/feed` is contribution events (no bodies) and is not fetched
  on card open. Personal events/revisions do not mix into the shared
  card of the same git path. Shared, others' personal and proposal cards
  stay read-only on `GET /api/cards/{path}`. Re-enable the thin editor only
  with reverse download / reverse sync; taking another participant’s card
  into one’s rhizome later unlocks edit + reverse sync for those cards.
  Entitlement tables / «ризома автора» payer view remain later (ADR-016)
- Graph Diff as the structural view of Differ/proposal; derived
  process-local cache keyed by proposal id and base/head SHA (capped);
  parse warnings or time bound mark `complete: false`; direction
  reversal is its own edge change, not add+remove

Do not expose ZIP download or clone-the-corpus as product UX.
Leftover git in the image is unfinished code, not a user take-away and
not the user's disk (TZ 2.61 / **3.37**).

Do not build a custom Git/version/3-way-merge engine for the MVP.
Do not replace writing on GraphNotes with a second Obsidian (live preview,
`[[ ]]` autocomplete, backlinks as the product). Do not mount the website
Markdown editor (TZ 2.93) until reverse download / reverse sync exists.
`PUT /api/personal/notes/{path}` remains for the plugin / API and TZ 2.66
stub create. Published shared working copies live in
`shared_notes` after plugin ingest (leftover copy-in unused); Differ remains the write gate.

Initial product store concept:

```text
GraphNotes personal store             = always the working copy (TZ 2.62)
GraphNotes shared store               = working copy of published rhizome (TZ 2.63)
git / later Dropbox / Google Drive    = leftover connectors, not ingest canon
shared knowledge repo                 = gone; accept writes shared_notes
.md / ZIP upload                      = copy into the same local personal store
Obsidian plugin API + GraphNotes Publisher = copy vault edits after save into that store (TZ 2.68–2.82)
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
  accepted/withdrawn timestamps; contributing (Obsidian plugin write to
  the personal store, Differ, propose; leftover upload) requires an
  accepted contract; editor review and admin user management do not

Telegram as an **identity provider** remains future scope, linked to the
existing internal user UUID (ADR-002). TZ 2.40 adds Telegram only as an
**outbound notification channel** for the editor queue when
`GRAPHNOTES_TELEGRAM_BOT_TOKEN` is set. That is not Telegram login.

## 5.1 Permission and rhizome model - accepted decision

Authorization uses global `user`, `editor`, and `admin` RBAC as the
**coarse gate** for admin tools, the proposal queue and user management.
There is exactly one shared rhizome and exactly one personal rhizome
per user. The shared rhizome lives **apart from the editor account**
(TZ 3.28). `editor` includes proposal review of the **granted** slice.
TZ 3.21 / **3.30**: admin grants write as `(user_id, card_path)` or
`(user_id, tag)` or `(user_id, path_prefix)` in the shared-rhizome DB.
Evaluation per request: write if a direct path grant **or** any of the
card’s tags has a tag-grant **or** the path is under a prefix grant.
**Empty grant (TZ 3.21 withdrawn 3.28 / 3.30):** empty = no extra shared
write, not the whole published queue. Empty is **not** a dump of the
whole corpus into the vault. Role `user` with no write grant has no
extra shared write. That is not a fourth RBAC
role, not an ADR-016 paid slice, and not a dump of the whole corpus into
the vault. The same primitive can give any user 1–N cards; those cards
are the same one shared file + vault client copy (queue only if editor
capability on those cards; two-table copies leftover). `admin` includes all
editor/user rights plus system administration; grants do not cut admin
queue review (`editorial_queue_mode=all` on GET `/proposals` and
capabilities). Editor with zero grants: `[]` plus `editorial_queue_mode=none`;
plugin and `/queue` show «Нет грантов», not a blank «нет предложений».
Admin with an empty grant still does **not** download the
whole corpus into the vault.

**TZ 3.30 (narrows 3.24; keeps 3.29 one file).** Card endpoints are per
path (GET/PUT this card). Authorization is a GraphNotes-DB grant:
`(user_id, card_path)` **or** `(user_id, tag)` **or**
`(user_id, path_prefix)`, evaluated per request. Write if the path is
granted directly **or** any card tag matches a tag-grant **or** the
path starts with a granted folder prefix. Do not store
an ACL document in markdown. Do not keep «rights live on the card» as
the primary model. List, queue, file and sync use the same grant
function; missing grant → 404/403, not UI-only hiding. Public
`GET /api/cards/{path}` of published shared is the guest vitrine, not
that grant. Write-grant is a right on **one** `shared_notes`
file; personal store is ungranted drafts only; plugin downloads into
the vault (client). **OPEN:**
a read-without-write grant for queue review; grant by original author.
Differ remains the write
gate into published shared for **ungranted** publish. Granted write is
vault → the same shared file. Do not collapse the vault with the rhizome.
Do not collapse ungranted drafts.
Four access classes unchanged. No workspaces/orgs.

Owner 2026-09-21: ADR-007 is **superseded**; still-true one-rhizome /
global RBAC live in this file. Grant API (3.28 / 3.29 / 3.30) and one
plugin (3.26) live here — not a second ADR this wave. OPEN (next stage,
not this wave): grant-write to already-shared cards; how a paid maker
differs from `user` vs `editor`; tag inheritance vs per-card override;
ADR-016 closed slice vs grant. TZ **3.26**: one plugin is canon, not an
intended-later client.
Queue from API is an editor capability in the same client; without
editor access the queue UI is off. Two catalogs are leftover runtime
until one package ships; do not treat the leftover folders as a second
spec. TZ **3.25** persist: the queue is **others’** edits; acceptance
goes through the editor. After each accepted file there are **two
operations**, not «Save & Resolve = POST to shared»: (1) **always**
write the accepted file to the editor’s local vault (open that local
note; without the write, accept is incomplete); (2) **only if** local
≠ GraphNotes store, update the rhizome store from the editor’s account
(Differ/queue stays the write gate into published shared; skip if equal). Editor vault is
not a second canonical rhizome. Do not restore `take-from-shared` of
the corpus. Do not dump the whole `shared_notes` tree into an editor
vault (narrow 3.22 lock). **Shipped vs 3.25:** Card Merge writes the vault
and opens the note first; POST `/api/proposals/{id}/resolve` is the
second op if local ≠ shared; 504 does not undo the vault. A leftover
POST-then-vault path would be unfinished code, not a second spec. Do not
remount the website Markdown editor.

All shared writes remain audited Markdown store changes followed by
revisioned re-indexing. Editors/admins cannot approve their own proposals.
There are no workspace, organization, team or multi-shared-rhizome entities
(one shared rhizome per install; global `user < editor < admin`).

Personal knowledge is unpublished drafts in the owner's GraphNotes store
(plugin). It is not a second published vault. GraphNotes does not give the
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
- Elasticsearch (ADR-015 accepted, scheduled **only after the first
  approved rhizome production deploy**; not this branch; SQL search until
  then; do not add to Compose now)
- Redis
- Celery / RabbitMQ
- MinIO / S3
- Gitea / GitLab / self-hosted Git
- Kubernetes
- a second PostgreSQL (or other store) just for logs — later; TZ 2.74
  keeps access history in the working DB with a 6–12 month prune
- guest anti-scrape of published cards (TZ 2.80 / product §16): after
  first `rhizome` production deploy only; do **not** implement on
  `rhizome-test`. No Redis/WAF just for this. ADR before code.
- invite-only registration (TZ 2.85–2.87 / product §17): **shipped on
  `rhizome-test`** (TZ 2.89). Invite is an **email link**; no Register
  tab (Login / forgot password stay). Any active account may invite;
  store inviter UUID (one chain with vsepsy.ru). Website send UI is the
  Settings tab **«Пригласить пользователя»** (`#/user`; same
  `POST /api/invites`); not on personal data. Person card and
  `GET /api/users/{login}/card` show «Приглашен %date% по приглашению от
  @user» (omit if no inviter). Cutover attributes existing accounts
  except `efimov` to that real row. No street register. No workspace.
  Do not promote this wave to production `rhizome` without a separate
  owner decision.

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
  -> canonical source remote
      -> rhizome-test
          -> approved revision
              -> rhizome
```

Owner 2026-09-21: GitHub **`https://github.com/vgdnet/rhizome`** is
**private**. Not a public product, not knowledge ingest. Do not confuse
with production host `rhizome`. `nord` `origin` for this tree is still
`git@github.com:vgdnet/graphnotes.git` until the owner retargets.
`rhizome-test` must fetch the source remote with authenticated Git
(SSH deploy key / token), not anonymous HTTPS.

Git is the primary delivery mechanism. SSH/rsync is a fallback or bootstrap mechanism only. `nord` owns source authoring and write operations on that remote. `rhizome-test` is the development-runtime and test environment; it normally consumes candidate revisions read-only and is never canonical source. `rhizome` is production. Its Git access must be read-only, with no credentials capable of push, and it receives only commits or tags approved on `rhizome-test`. Every new feature revision must pass the applicable integration, deployment and migration checks on `rhizome-test` before the same approved revision is deployed to `rhizome`. Do not use `rhizome` for destructive experiments, first-run migrations or ad-hoc source edits. See `docs/decisions/ADR-006-production-git-readonly.md`.

## 8. Stage roadmap
- Stage 0 - Infrastructure - DONE
- Stage 1 - Project Bootstrap - DONE
- Stage 2 - Password Authentication - DONE
- Stage 3 - historical git connector - DONE
- Stage 4 - Take from shared / ZIP fallback - DONE (product path superseded; ZIP of published shared is not UX)
- Stage 5 - Graph Engine - DONE
- Stage 6 - Shared graph + personal overlay (links to shared) - DONE
- Stage 7 - Differ, editor proposal queue / merge / rollback - DONE
  (ZIP «Скачать» of published shared removed from product path, TZ 2.5)
- Stage 8 - Graph Diff (structural view of Differ/proposal) - CURRENT
- Stage 9 - Production Hardening / CI/CD - deferred (no `rhizome` deploy until an explicit owner decision)

## 9. Stage branches
Recommended source-code branch **names** stay historical so later stages do not
rename remotes. Product meaning of Stages 4, 6, 7 and 8 is PRODUCT_SPEC
**3.40** + this file, not superseded ADR-008 / ADR-009.

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

- Personal and shared working copies (TZ **3.35**): GraphNotes **local
  stores are always** the working copy. The Obsidian plugin writes personal
  (`personal_uploads`; attachments in `personal_assets`). External git
  copy-in is leftover, not canon. Differ outbound is local copy → published
  shared. TZ 3.13 inbound copies published shared into the personal store
  only for watched accepted paths. The plugin is not a write into published
  shared. After editor accept, the published shared working copy is
  `shared_notes` (leftover stack may still push shared git). Git live-read
  and in-app commit to an external host are leftover vs 3.35.
- Unpublished personal bytes live in the owner's GraphNotes store.
  Published shared bodies in `shared_notes` are the serving copy, not a
  Differ bypass. Upload history (who / when /
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
- Provenance, rhizome-card interaction feed, public user cards
  and closed/paid corpus remain product will pending entitlement tables.
  Do not invent a second Markdown canon or a second knowledge repository
  to implement them (ADR-016).
- Graph UI is visualization plus cards; website in-app edit is **off**
  (TZ 2.93) until reverse sync; leftover then is own personal only, not a
  vault replacement and not a shared-card editor.
- Published shared is not downloadable as ZIP/clone UX (TZ 2.5).

## 12. MVP API surface (product contract)

The product defines the external API surface for the MVP. Exact request/response schemas, error codes, and authorization details are finalized per Stage, but the route list and ownership of responsibilities are part of the contract (product spec §7).

Authentication / users:
- `POST /api/auth/register` (410 Gone; street register closed)
- `POST /api/auth/login` (username or email + password)
- `POST /api/invites` / `GET /api/invites` / `DELETE /api/invites/{id}`
- `GET  /api/auth/invite?token=` / `POST /api/auth/invite/accept`
- `GET  /api/auth/mail-status`
- `POST /api/auth/email/request` (purpose `confirm` / `login` / `reset`)
- `POST /api/auth/email/verify`
- `POST /api/auth/password/reset`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET  /api/users/me` (includes contacts, `is_author` and contract timestamps)
- `PATCH /api/users/me` (settings: display_name, email, phone, telegram, website, public flags, queue notify prefs, TZ 3.15 `notify_card_changes`)
- `GET  /api/users/me/author-contract`
- `POST /api/users/me/author-contract`
- `POST /api/users/me/author-contract/withdraw`
- `POST /api/users/me/integration-tokens` (cookie session; token stored)
- `GET  /api/users/me/integration-tokens` (includes `token`)
- `GET  /api/users/me/integration-tokens/access` (6 months: who / IP /
  token name + prefix; no key)
- `DELETE /api/users/me/integration-tokens/{id}`
- `GET  /api/author/contract` (same text; settings aliases are canonical)
- `POST /api/author/accept`
- `POST /api/author/withdraw`
- `GET  /api/repository/status`

Personal layer (plugin write to the local store; git connector leftover):
- `POST /api/personal/connect` (HTTP 410; leftover TZ **3.38**: cabinet
  does not call this; knowledge GitHub App is not used)
- `DELETE /api/personal/connect` (HTTP 410; leftover unbind)
- `POST /api/personal/import-md` (leftover TZ 2.96: no website button;
  future upload must sync into the local store like the plugin;
  ZIP up to 10 000 members, else 400 `archive has too many files`;
  2 MiB compressed / 8 MiB unpacked / 256 KiB per file remain;
  white noise → 400 `content is not Markdown notes` + account lock)
- `GET  /api/personal/notes` (read-only index of the caller's personal layer)
- `GET  /api/personal/notes/{id}`
- `PUT  /api/personal/notes/{path}` (plugin / API and TZ 2.66 stub create;
  not the website editor, TZ 2.93; `source` + `expected_hash`; author
  contract; local store; 409 stale; records owner-scoped feed events
  and a `card_revisions` snapshot)
- `GET  /api/personal/uploads` (upload history: who / when / path / hash)
- `GET  /api/personal/closed-paths`
- `PUT  /api/personal/closed-paths`
- `DELETE /api/personal/closed-paths/{path}`

Shared publication and Differ:
- `GET  /api/differ` (TZ 3.11 / **3.13** / **3.31**: chrome tab `#/differ`
  and plugin offer list; `{differences, inbound}` path lists, **no bodies**;
  `kind` = `added`|`changed` from `content_hash`, not wikidiff2.
  Cookie or Bearer `gnp_` / `personal:read`. Store hashes only — **no
  live remote API, no git copy-in on list**. `?include_inbound=false` for the user offer
  panel (skip inbound + notices). Inbound paths are omitted from
  outbound when inbound is computed. Do not invent a live `direction` field.)
- `POST /api/differ/inbound/{path}/accept` (TZ 3.13 shipped: copy
  published shared into the caller's personal store for a watched
  inbound path; cookie + author contract; not a proposal)
- `GET  /api/differ/files/{path}` (leftover pair JSON, shipped;
  `incoming` = published shared, `current` = personal or empty;
  shared-only path is 200 `kind=changed`, not 404. Author `#/differ` is
  path checkboxes + propose, not a merge pane. Card Merge sidebar does
  not consume this (TZ 3.11). `{detail}` errors: 400 invalid path, 404
  missing/closed, 409 shared not connected)
- `GET  /api/contributions/me` (author’s notes/links/proposals/counts; TZ 3.34
  which edits proposed: path, volume, state; derived; git not required)
- `GET  /api/admin/contributions` (admin: same stats for every account; TZ 2.7 / §5.4.2)
- `GET  /api/admin/users` (search/filter by nick/username, also email and
  display name; last login and session count; TZ 3.21 / **3.33**
  `editor_tags` and `grants[]` `{id, kind, value}` on each row)
- `POST /api/admin/users` (admin-created account)
- `PATCH /api/admin/users/{id}/editor-tags` (admin; TZ 3.21 / **3.30**;
  replaces `kind=tag` grants; empty = no extra shared write, not the
  whole queue and not a corpus dump)
- `GET  /api/admin/grants` (admin; filter `user_id` / `kind=path|tag|prefix` / `value`)
- `POST /api/admin/grants` (admin; `{user_id, kind, value}`; 201 / 409)
- `DELETE /api/admin/grants/{id}` (admin; 204)
- `GET  /api/admin/grants/catalog` (admin; shared paths, tags, folder prefixes;
  TZ **3.33**: `?q=` substring on path/title/tag/prefix; `?tag=` cards with
  that tag; `cards[]` `{path, title}`, no bodies)
- `POST /api/admin/users/{id}/sessions/revoke`
- `GET  /api/admin/operator`
- `PUT  /api/admin/operator` (persist public site URL for mail links)
- `POST /api/admin/mail/test`
- `GET  /api/users/{login}/card` (public person card by login only; UUID key 404; no public UUID;
  not personal or closed bodies)
- `GET  /api/shared/notes` (public titles; not card bodies)
- `GET  /api/shared/notes/{path}` (published shared card body; guest OK, TZ 2.64)
- `GET  /api/cards/{path}` (shipped display today: published shared body
  is public; `personal:{path}`, admin `personal:{uuid}:{path}`,
  `proposal:{id}:{path}` need a session; write is PUT personal, not
  this route. TZ 3.28: endpoints per card; authorization is
  grant(user, path); this public GET of published shared is the guest
  vitrine, not that grant)
- `GET  /api/cards/{path}/revisions` (TZ 2.94 / **3.34**: last 30 snapshots
  + diff; **proposer** of the edit, optional accepter, added/removed
  lines or bytes; not fetched with the card; shared guest OK; personal
  needs a session)
- `GET  /api/cards/{path}/feed` (contribution events; shared `owner_user_id` null;
  own personal = caller; admin `personal:{uuid}:` = that owner; proposal
  empty; in-app personal edits do not appear on the shared path feed; no bodies)
- `GET  /api/shared/notes/{path}/feed` (login required; shared events only,
  `owner_user_id IS NULL`)
- `GET  /api/shared/notes/{path}/comments` (login required)
- `POST /api/shared/notes/{path}/comments` (any signed-in user; pending)
- `POST /api/comments/{id}/moderate` (editor/admin; not self)

Removed from product surface (TZ 2.5 / 2.6):
- `GET  /api/shared/archive` (ZIP of published shared — gone; do not restore as UX)
- `POST /api/personal/take-from-shared` (write shared into personal git — gone;
  leftover TZ 2.93: a later “take another participant’s card into my rhizome”
  is a new decision, not this route restored as-is)

Graph visualization and Graph Diff (Stage-owned):
- `GET  /api/graph/shared` (`/graph` canvas; no login; public published layer only)
- `GET  /api/graph/invites` (JSON; page is `#/invites` /
  `http://172.16.13.14:8080/#/invites`; Code Writer deploys to rhizome-test;
  who-invited-whom + `invited_count`;
  node size / `@login · N`; currently admin; TZ 2.98)
- `GET  /api/graph/personal` (layer filter on `/graph`; ваша личная ризома; caller’s full indexed tree or uploads)
- `GET  /api/graph/personal-overlay` (ваша часть ризомы; shared page + automatic wikilink stitch)
- `GET  /api/search` (`layer=visible|overlay|personal|shared`; visible is
  the `/search` default; guest = public hits, no snippets in the list;
  overlay/personal remain for graph highlight; hits include layer)
- `GET  /api/graph/diff?proposal_id=...` (Stage 8 structural view of Differ/proposal; same derived index)

Proposals and editor workflow (Stage-owned):
- `POST /api/proposals` (cookie + author contract)
- `GET  /api/proposals` (cookie or Bearer `personal:read`; TZ 3.10
  Card Merge editor queue; role still filters: editor/admin see
  reviewable items, user sees own; TZ **3.30**: write-grant on the file
  (direct path or intersecting tag or path prefix); empty grant → no extra shared
  write, not the whole queue; leftover empty=whole-queue is a hole;
  missing grant on a file GET → 404/403)
- `GET  /api/proposals/{id}` (same auth as the list; TZ 3.03: each file
  has `html` from wikidiff2, `engine` / `engine_version`, `body`,
  `before`, leftover unified `diff`, and `rows` parsed from the table)
- `GET  /api/proposals/{id}/files/{path}` (TZ 3.12 shipped:
  `{path, before, body}` only, no wikidiff2; Card Merge accept-into-work)
- `POST /api/proposals/{id}/resolve` (cookie or Bearer `editor`/`admin`;
  `{files:[{path,source}], reason?}`; `source` is the merged card text;
  publish only those paths via a one-file branch + `merge_branch` (not
  last-write-wins on `shared_notes`); remaining `scope_paths` stay
  `open` on the same proposal; last file marks the proposal published;
  TZ 3.18. TZ **3.25**: this POST is not the product definition of
  accept / Save & Resolve; runtime that POSTs it first then maybe
  writes vault is **debt**. Do not invent a new HTTP verb. Website
  `POST …/approve` still merges the whole branch)
- `POST /api/proposals/{id}/approve` (cookie session only)
- `POST /api/proposals/{id}/reject`
- `POST /api/proposals/{id}/request-changes`
- `POST /api/proposals/{id}/rollback`

Reconciliation hook (leftover, not canon ingest):
- `POST /api/webhooks/github`

### 12.1 Obsidian plugin → personal store (TZ 2.68–2.90)

Product requirement: §6.3.4 / §5.5.7 / TZ 2.82 / 2.90. Operator examples:
`docs/deployment/OBSIDIAN_PLUGIN_API.md`. The desktop plugin
(`obsidian-card-merge/`, GraphNotes Card Merge) is the live product
client. `obsidian-plugin/` (Publisher) is leftover — do not resurrect
or merge trees (TZ 2.69 catalog history). GraphNotes owns the HTTP API and the personal store.
TZ 2.90 client: vault create/modify/delete/rename enqueue locally.
Network runs on the sidebar ItemView «Передать правки на сервер»,
ribbon paper-plane, file close, idle minutes after the
last edit, or an interval if the queue is not empty — not on every
`modify`. Default `autoMode: idle`, `autoMinutes: 5`. Obsidian quit does
not start a transfer (same limit as Obsidian Git). Card picking is not
required. First dump of an existing vault is the
«Отправить все правки» command. Matching SHA-256 is skipped. One transfer at
a time. Rename is upsert new path + delete old when `personal:delete`
is granted. TZ 2.91: vault and personal store are one copy; local wins.
TZ **3.30:** a **granted** card is downloaded into the vault as a client
copy of the **one** shared file (`GET /integrations/obsidian/v1/granted`
and `/granted/files/content`; local-first then `PUT /granted/files` if
different). That is not a website editor (2.93 stays
off) and not a dump of the shared corpus. Two tables holding the same
granted path (`personal_uploads` + `shared_notes`) are runtime debt.
No conflict UI. Differing server bytes are overwritten with local using
`expected_version` from the manifest / GET content — no `force=true`.
Publisher still does not write shared or create proposals.
Interrupted plan + token persist in `data.json`; changed
bytes before upload cancel the plan and rebuild it. 2.69 «send only on
command» for vault edits is withdrawn. TZ 2.88 / **3.11** / **3.31**: Differ API
(`GET /api/differ`) lists personal → shared **path/hash** diffs for the site
tab `#/differ` (propose only) and the user offer panel. No git refresh,
no note bodies, no wikidiff2 on the list. Bodies load for selected
paths (`POST /proposals`) or leftover `GET /differ/files/{path}`.
Plugin offer uses `GET /api/differ?include_inbound=false`. Card Merge
does not list personal Differ in the editor queue
(TZ 3.11). TZ 3.10: an `editor` / `admin` token lists the website
`#/queue` New tab (`GET /api/proposals`). TZ 3.12: the sidebar lists
metadata only; «Принять в работу» fetches
`GET /api/proposals/{id}/files/{path}` (`{path,before,body}`) into
`.obsidian/plugins/graphnotes-card-merge/work/{id}/…` (compare
scratchpad, not the accepted note). TZ 3.18: one card; siblings stay
listed. TZ **3.25** canon persist: two operations after each accepted
file, not «Save & Resolve = POST /resolve». (1) **Always** write the
vault `.md` first (proposal path, not `.obsidian` cache); without that
write, accept is incomplete; opening the card = that local note.
(2) **Only if** local ≠ GraphNotes store, update the rhizome store
from the editor account (Differ/queue stays the shared write gate; skip
if equal). Open with
`createLeafBySplit` or `getLeaf(true)`
+ `openFile` + `revealLeaf` only if that leaf is not MergeView
(`getLeaf('tab')` only when it is not MergeView; fallback
`openLinkText(basename, path, true)` then `workspace.openFile` if present
— never `getLeaf(false)` / `openFile` on MergeView), then detach MergeView
only after the markdown file is the active view; each step
is appended to `.obsidian/plugins/graphnotes-card-merge/debug.log` as
`time | STEP | OK/FAIL | detail` (command «Показать debug.log»);
clear the
work slot, reload the existing right-sidebar queue in place (do not
`openQueue(true)`); a repeat resolve on
an already fully accepted proposal returns success.
**Shipped 2026-09-16:** Card Merge writes the vault and opens the note
first; POST `/api/proposals/{id}/resolve` `{files:[{path,source}]}`
is the second operation if local ≠ shared; 504 does not undo the vault.
TZ **3.26** / **3.22** / **3.25**:
one plugin is canon (3.09 withdrawn). An editor runs the **same**
client as a participant (vault ↔ personal copy) plus, if the account
has editor access, the queue of others’ edits through the editorial
gate, then two persist operations (local vault always; rhizome store
update from editor account only if local ≠ store). Without editor
access the queue UI is off. Runtime client is `obsidian-card-merge/`;
`obsidian-plugin/` is leftover. Do not dump the whole `shared_notes` tree into the vault. 2+ editors accept
different cards in parallel; one card in work is one person (server
slot leftover if only local TZ 3.16). Capabilities includes `user.role`,
`can_see_queue`, `can_propose_to_rhizome`, `editorial_queue_mode`
(`all`/`granted`/`none`), and `has_editorial_grants` so the
plugin shows the queue when the account is editor/admin, otherwise the
queue UI is off; editor with zero grants sees «Нет грантов»; admin sees
all pending; and shows «Предложить в ризому» only when
`can_propose_to_rhizome` is true (today: role `user`; TZ 3.27 coarse
gate, not a forever editor-never-proposes ACL) **or** capabilities are
still unknown. `editor`/`admin` hide the whole offer panel and the
file-menu line once role is known; unknown ping does not hide.
`file-menu` and `editor-menu` register at the start of `onload` (before
`loadData`). Explorer title without `.md` still matches a markdown
`TFile`. POST `/proposals`
is 403 when the flag is false. TZ **3.32:** Obsidian `file-menu` (markdown
`TFile`) and `editor-menu` (active note) show the same «Предложить в
ризому» for role `user`, flag true, or unknown capabilities; hide only known editor/admin; click uploads **that path** to
personal (not a vault-wide Differ), then `POST /api/proposals` for it;
already-open / already-in-sync notices, no duplicate spam. Runtime
`obsidian-card-merge/` 0.1.1. Plugin Bearer `gnp_` is enough (no website login/password). A
capabilities timeout is not «this account cannot propose»; POST
`/proposals` is the server gate (user 200, editor/admin 403). TZ 3.25 op 2 stays POST `/resolve`, not
the user offer. Do not wire vault→shared for every personal draft
(slice filter OPEN). Leftover:
`OpenMergeModal` still calls `GET /api/differ` — unfinished code, not
a second contract. Card Merge also pings
`GET /integrations/obsidian/v1/capabilities`. Reject / request-changes /
rollback stay cookie-only on the website. Publisher
`/integrations/obsidian/v1` still does not publish to shared.

Browser/plugin URLs use the `/api` prefix. FastAPI routes do **not**:
Nginx `location /api/` strips it. FastAPI sets `root_path="/api"` so
Swagger at `/api/docs` loads `/api/openapi.json` (not the SPA at
`/docs` or `/openapi.json`). Incompatible protocol → new prefix
(`/integrations/obsidian/v2`), do not silently reshape v1 fields.

**Auth.** Transfer APIs: `Authorization: Bearer`. Mint is
`secrets.token_urlsafe(32)` with prefix `gnp_` (TZ 2.70: personal API
key). Create and list (`POST`/`GET /api/users/me/integration-tokens`,
cookie session, `{detail}` errors like the rest of `/users/me`) return
the same `token` so Settings can show it again (TZ 2.75 canon: the key
lives in the cabinet and is copied into the plugin). Server stores the
token value and SHA-256 for Bearer lookup (`integration_tokens.token` +
`token_hash`). Hash-only / show-once is not the product. The desktop
plugin persists the same token in its `data.json`. Compromise → revoke
in `/user`; restored access → mint a new key in the cabinet and paste
it into the plugin.
Successful Bearer calls on `/integrations/obsidian/v1` append
`integration_token_access` (username,
token name/prefix, IP from `X-Forwarded-For` / `X-Real-IP` / peer,
User-Agent, route). Leftover: `GET /differ`,
`GET /differ/files/{path}`, `GET /proposals`,
`GET /proposals/{id}/files/{path}` and `POST /proposals/{id}/resolve`
authenticate the same token but do not insert an access row
(`last_used_at` still updates). Same token+IP
within
`GRAPHNOTES_INTEGRATION_ACCESS_DEBOUNCE_SECONDS` (default 3600) is one
row; a new IP always inserts. Retention
`GRAPHNOTES_INTEGRATION_ACCESS_RETENTION_DAYS` (default 183), clamped
to `GRAPHNOTES_INTEGRATION_ACCESS_RETENTION_MAX_DAYS` (366). This is
working-DB hygiene, not a forever archive. A separate logs database
vs working store is later architecture; do not add a second Postgres,
Redis, or warehouse in this wave. Owner
lists this on `GET /api/users/me/integration-tokens/access`. Revoke
does not delete history (`token_id` SET NULL if the row is later
removed). The access payload never includes the key.
Scopes:
`personal:read` (required), `personal:write`, optional `personal:delete`.
Owner UUID is derived from the token; the client must not send `user_id`
to pick a store. An admin-role user's token still sees only that user's
personal files (foreign `transfer_id` → 404 `not_found`). Revoke, expiry
and inactive account stop later requests and uncommitted apply. Commit
re-checks author contract (`403 author_contract_required`) and activity.

**Write policy.** `write_allowed` = active account + accepted author
contract. `can_see_queue` = role `editor` or `admin`.
`editorial_queue_mode` = `all` (admin, grants do not cut pending),
`granted` (editor with grants), `none` (editor with zero grants — empty
queue copy «Нет грантов», not the whole queue).
`can_propose_to_rhizome` = today's coarse gate, role `user` (TZ 3.27;
`editor`/`admin` → false). Not a per-card ACL and not «editor never
proposes, forever». POST `/proposals` 403 when false. Leftover connected
personal git does **not** set `write_disabled` (TZ **3.35** / **3.37**:
working copy is always the GraphNotes store; 2.62 leftover).

**Store.** Markdown upsert/delete applies to `personal_uploads` (same
rows as in-app / ZIP ingest). Attachments live in `personal_assets`
(BYTEA). Opaque `object_version` on both; compare version even when
SHA-256 matches. Transfer / blob / idempotency / snapshot tables are
**not** a knowledge canon. Apply must **not** call git copy-in
(`copy_git_*` is deleted; `rebuild_personal` reindexes uploads only):
that would overwrite plugin writes. After files commit, reindex personal
`note_index` **from uploads only**. Graph and search already read
`personal_uploads` when the store has rows.

**Transfer protocol (FastAPI paths):**
- `GET  /integrations/obsidian/v1/capabilities`
- `GET  /integrations/obsidian/v1/manifest`
- `GET  /integrations/obsidian/v1/files/content` (raw bytes +
  `X-GraphNotes-*` headers; path header is percent-encoded)
- `GET  /integrations/obsidian/v1/granted` (TZ 3.30 write-grant list;
  empty grant → `[]`, including admin — not a corpus dump)
- `GET  /integrations/obsidian/v1/granted/files/content` (raw bytes of
  one granted shared file; 403/404 without grant)
- `PUT  /integrations/obsidian/v1/granted/files` (local → same
  `shared_notes` file; 403 without grant)
- `POST /integrations/obsidian/v1/transfers` (`Idempotency-Key`)
- `PUT  /integrations/obsidian/v1/transfers/{id}/blobs/{sha256}`
  (`application/octet-stream`, 204)
- `POST /integrations/obsidian/v1/transfers/{id}/commit` (202; 409 on
  conflict)
- `GET  /integrations/obsidian/v1/transfers/{id}`
- `DELETE /integrations/obsidian/v1/transfers/{id}` (204 if not applying)

Error envelope on this prefix only:
`{error:{code,message,request_id,retryable,details}}`. Existing APIs
including `/differ` keep `{detail}`.

States: `awaiting_upload → ready → applying → indexing → succeeded`;
also `conflict` / `failed` / `cancelled` / `expired`; `indexing_failed`
then retry index only (`files_applied: true`). Whole batch is atomic.
Same Idempotency-Key + body → same plan; different body → `409
idempotency_mismatch`. Plan TTL 24h; result/key ≥ 30 days. One concurrent
commit per user → `409 transfer_busy`.

Limits (also in capabilities): 1 MiB Markdown, 25 MiB attachment, 500
ops, 100 MiB batch, 200 manifest page, 500 MiB personal quota, path
length/depth as ingest. Nginx `client_max_body_size` 32m on the frontend
proxy. No Redis/S3/Celery.

Audit: `integration.token_*`, `integration.transfer_*` with user UUID,
token id, client_id, transfer_id, paths, versions, sizes, result. No
secrets, passwords, or note bodies. Owner-visible access history is
table `integration_token_access`, not the admin audit journal.

Alembic: `0017_obsidian_integration`, `0018_integration_token_access`,
`0020_invites` (invite table + `users.invited_by_id` / `invited_at`;
cutover UPDATE to `@efimov`), `0021_card_revisions` (last 30 snapshots;
index / graph / Differ still read the working copy). Integration checks:
`rhizome-test` only; do not apply on `rhizome` until an approved revision.
