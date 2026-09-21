# GraphNotes — канонический контекст Technical Observer

Статус: ACTIVE
Updated: 2026-09-22 (PRODUCT_SPEC **3.43**: `#/graph-test` shares `#/graph`
settings cog + circular Obsidian seed. **3.41**: `#/graph-test` Pixi+d3-force test
tab; canon `#/graph` Cytoscape. **3.40 accepted**: graph settings panel chrome as
Obsidian. **3.39**: `#/graph` Obsidian-like
settings cog, `localStorage` `graphnotes-graph-settings`. **3.38**: `#/user` has no personal-git
connect; four tabs; leftover `/api/personal/connect` is HTTP 410. **3.37**: living canon does not name an
external git host; plugin ingest. **3.36**: guest chrome / search four states /
hanging local graph / italic `_…_` / plural «2 заметки» / Russian roles
участник/редактор/администратор / title/og / about copy. **3.35**: plugin ingest;
not Wikipedia as a product; leftover git host unfinished. **3.34**: card history and
`/contribution` attribute who **proposed** which edit — volume of that
diff; queue accepter is editorial, not authorship. **3.33**, 3.29 one-file kept: one shared rhizome per
install, apart from every account including editor; endpoints are
per-card; authorization is a DB grant `(user_id, card_path)` **or**
`(user_id, tag)` **or** `(user_id, path_prefix)`, per GET/PUT/queue/sync — write if direct path or any
card tag matches or path is under a prefix grant. Not ACL-in-markdown and not 3.24 «rights on the card»
as primary. Editor-slice = user-with-N-cards.
**3.21 empty-list withdrawn:** empty grant = no extra shared write, not
the whole queue. Editor with zero grants: `editorial_queue_mode=none` and
plugin/site «Нет грантов». Admin queue bypass remains (`all`). Differ = ungranted publish gate. **TZ 3.29 one server
file NOW:** grant = right on the shared object; personal store holds
ungranted drafts only; vault is always a client copy. Plugin downloads
granted cards; 3.25 local-first then sync to the **same** `shared_notes`
file if different. Queue of others’ edits if editor on that card.
`can_propose_to_rhizome` stays user-only for ungranted cards. Revoke:
stop write/sync/load-update from API; vault copy may remain. Later
vault=rhizome same file is not canon. **This wave:** personal store
stays; a path in both tables is not dirt. OPEN (next stage, спросить
product-editor): granted write to already-shared cards.
OPEN: read-without-write for queue review. 3.25 local-first after accept
holds. Today's coarse
`can_propose_to_rhizome` true for role `user`, false for `editor`/`admin`.
Plugin hides the Differ-offer panel; POST `/proposals` 403 when false;
`can_see_queue` stays on for editor. TZ **3.32:** `file-menu` /
`editor-menu` «Предложить в ризому» for user / flag true / unknown caps
(hide only known editor/admin); register both at start of `onload`;
explorer title without `.md` still matches markdown; one-path
personal transfer then POST `/proposals`. Plugin Bearer `gnp_` / `personal:read` is enough — no cookie login.
Capabilities abort/timeout must not fail-close as 3.27; POST `/proposals`
403 is the editor/admin deny. Do not sync whole vault to shared.
TZ **3.33:** `#/admin` user search is `GET /api/admin/users?q=` (nick,
also email/name); each row includes `grants[]` plus role / `is_author` /
`is_active` / `editor_tags`. «Доступы» lists cards/tags via
`GET /api/admin/grants/catalog?q=&tag=` (`cards[]` path+title, no bodies).
Do not invent a second grants UI or a new RBAC model.
OPEN: editor-of-a-slice vs editor who also authors other cards.
**3.26**: one Obsidian plugin is
canon; TZ 3.09 withdrawn. Queue from API is an editor capability in
the same client; without editor access the queue UI is off. Manual
editor edit = same sync as a participant. One live client
`obsidian-card-merge/` (already united). `obsidian-plugin/` is
leftover-not-built, not a second shipped package. Do not invent a
third merge. Later the same plugin shows/hides
capabilities from the API when access is not all cards, only
specific cards — fits TZ 3.24 / 3.28 / 3.29 / **3.30**. Grant API and one
plugin live in MASTER; ADR-007 is superseded. OPEN next stage:
grant-write to already-shared. **3.25**: queue of **others’** edits; editorial
gate; after each accepted file **two operations** — always local
vault first; update the rhizome store from the editor’s account only
if local ≠ store; open the **local** note. Not «Save & Resolve = POST
to shared». GraphNotes stays the canonical shared store; Differ/queue
stays the shared write gate; editor vault is not a second rhizome.
**Shipped 2026-09-16:** Card Merge writes the vault and opens the note
first; POST `/proposals/{id}/resolve` is the second op if local ≠ store;
504 does not undo the vault. **3.29** one server file NOW (supersedes
three-copy-later and 3.28 load-into-personal); **3.30** narrows **3.24**: endpoints per
card; grant `(user_id, card_path)` or `(user_id, tag)` or `(user_id, path_prefix)`; four access classes incl. paid content maker;
global RBAC stays coarse gate; Differ stays ungranted shared write
gate; one plugin is canon TZ 3.26, two catalogs leftover; needs ADR. **3.22**: editor two stores —
personal via Publisher, shared via proposal gate / Card Merge; 2+
editors in parallel on different cards; do not dump the whole `shared_notes`
tree into the vault (3.25 persist: two operations — always local
vault; rhizome store update from editor account only if local ≠
store; open local note). **3.21 / 3.28 / 3.29 / 3.30**: write grants in the shared
DB — `(user, path)` or `(user, tag)` or `(user, path_prefix)`; not a fourth role, not a paid
level; **empty grant = no extra shared write** (3.21 empty = whole
queue withdrawn). **3.15**: one Settings checkbox or
toggle «Получать уведомления об изменениях в карточках, которые вы
правили» — `notify_card_changes`; same SMTP/bot when on; event =
inbound Differ. **3.13**: inbound Differ on `#/differ`
for watched published paths; accept copies shared → personal store;
ADR-009 superseded. **3.12**: Card Merge queue is
metadata-only; one card in work (TZ 3.16); «Принять в работу» caches both card sides;
do not equate Save & Resolve with `POST /proposals/{id}/resolve` (TZ 3.25). **3.18**: one accepted card; remaining files stay on the open proposal. **3.25** two operations: (1) always write the local vault first (open that note; accept unfinished if write fails); (2) update the rhizome store from the editor account only if local ≠ store (Differ write gate; skip if equal). Open the local note with `createLeafBySplit` / `getLeaf(true)` + `openFile` + `revealLeaf` only if the leaf is not MergeView (fallback `openLinkText(basename, path, true)`; never `getLeaf(false)` / `openFile` on MergeView), close MergeView only after the note is the active view — required UX; append each step to plugin `debug.log` (`time | STEP | OK/FAIL | detail`; command «Показать debug.log»); reload queue in place without stealing the markdown leaf; repeat resolve on a fully accepted proposal is success. **Shipped vs 3.25:** Card Merge writes the vault first, then may POST `/resolve` if local ≠ store — not a second spec. **3.11**: author outbound Differ is chrome
tab `#/differ` — compare two stores and propose, not merge; plugin
does not list personal Differ. **3.10**: editor-access
sidebar is website `#/queue` New via `GET /api/proposals`. **3.09**
leftover withdrawn by **3.26**: two plugin packages are not the lock;
two catalogs leftover until one package ships. **3.08**: `#/queue`
accordion — one
proposal, one card body, decide buttons under each card for the whole
proposal. **3.06** leftover withdrawn by 3.11. **3.05**: one canon for all agents —
PRODUCT_SPEC **3.40** + MASTER_CONTEXT; this file is a working brief, not a
second TZ. **3.03**: editor queue
**wikidiff2**. Owner 2026-09-12 / ADR-018 amendment: compile the C++
core as a native helper. **Shipped 2026-09-21:** pinned 1.14.2 + CLI in
the backend image. `php-cli` / `php-wikidiff2` leave this path only.
**2.99**: product TZ → technical TZ →
`rhizome-test`. TZ 2.89 / §17 shipped on
`rhizome-test`: invite email link; no Register tab; any account may invite;
person card «Приглашен … от @user»; existing accounts except `efimov`
attributed to `@efimov`. TZ 2.98 invite map page is `http://172.16.13.14:8080/#/invites`
(`#/invites`; JSON `GET /api/graph/invites` is not a hash). Code Writer
deploys that URL to `rhizome-test`. Admin-only for now: `@login · N` +
`invited_count` node size; click → `#/users/{login}`; not the rhizome
canvas. TZ 2.93 website editor off; TZ 2.94 `card_revisions` last 30
on demand; TZ 2.96 no website `.md`/ZIP upload UI; TZ 2.90 plugin writes
on sidebar «Передать правки на сервер» / ribbon / close / idle minutes,
not every keystroke. Do not deploy production `rhizome`.
TZ 2.83: Elasticsearch iteration starts **only after
the first approved rhizome production deploy**; SQL `/search` until then;
do not add ES to Compose. TZ 2.82/2.90: plugin copies vault edits
without a card picker; first dump «Отправить все правки»; TZ 2.88 / **3.11**:
Differ API lists path diffs for chrome tab `#/differ` (propose, not
merge); Card Merge does not consume that list;
§6.6.3 marks/topics are site
UI leftover. TZ 2.81: Login tab mail-code / `#/auth/login-code`
uses the existing SMTP contour. TZ 2.80: guest anti-scrape of published cards is
product §16 — after `rhizome` prod only, not `rhizome-test`, ADR before
code. TZ 2.79 shipped 2.72–2.76. TZ 2.75: plugin key lives in the cabinet and is
copied into the plugin; revoke then mint/copy a new key. Hash-only /
show-once is not the product. TZ 2.74: access log stays in the working
DB for ~6 months, hard ceiling ~1 year; do not add a second logs
database yet. TZ 2.73: plugin token access log on `/user`. TZ 2.72:
API key stored in Settings and plugin `data.json`; list returns `token`.
TZ 2.65: ZIP ingest 10 000 files; zip-bomb
size/ratio guards stay. TZ 2.66: missing card page + personal create
from dangling wikilink. TZ 2.67: white-noise personal ingest lock + admin
mail; existing notes kept. TZ **3.38:** `#/user` has no «Свой git»
tab or connect form; leftover personal git **bind** API (no copy-in). TZ **3.35 / 3.37:** plugin ingest; leftover
copy-in unused. TZ 2.68–2.71: Obsidian
plugin → personal store API + desktop plugin in-repo. Alembic 0017–0019,
hashed lookup + stored token, no git copy-in on plugin apply.)

Этот файл задаёт рабочий регламент отдельного Technical Observer проекта
GraphNotes. Его можно передать новому воркеру целиком. Он не заменяет
канонические документы проекта и не создаёт новых архитектурных решений.
**Канон всегда один (ТЗ 3.05):** product editor, technical editor, code
writer, наблюдатели и агенты Codex/Cursor читают одну истину —
`PRODUCT_SPEC.md` **3.40** и `MASTER_CONTEXT.md`. Чат не спецификация.
Living vs superseded ADR — индекс в MASTER §0 и
`docs/decisions/README.md`. **Не читай superseded ADR как канон.** Нет
личного ТЗ у агента. Если код и ТЗ расходятся — остановиться; leftover
runtime не второй канон.

## 1. Роль

Technical Observer следит за технической целостностью проекта и предотвращает
архитектурный технический долг.

Он проверяет:

- архитектуру и соблюдение ADR;
- безопасность и изоляцию данных;
- масштабируемость без преждевременного усложнения;
- поддерживаемость и миграционную безопасность;
- соответствие техническому заданию и активному Stage;
- архитектурный, инфраструктурный и документационный drift;
- полноту проверок конкретной Git-ревизии перед merge и promotion.

Technical Observer:

- не реализует функциональность вместо основного воркера;
- не вносит кодовые исправления в рамках наблюдения;
- не принимает продуктовые или архитектурные решения;
- не расширяет границы Stage;
- не объявляет результат проверки без доказательств;
- может предложить техническую рекомендацию, но решение остаётся за владельцем.

## 2. Источники истины

Перед каждым аудитом прочитать полностью:

1. `docs/product/PRODUCT_SPEC.md` **3.40**;
2. `docs/context/MASTER_CONTEXT.md` (включая §0 ADR index);
3. `docs/context/ENVIRONMENTS.md`;
4. `docs/context/STAGE_STATUS.md`;
5. активный `docs/stages/STAGE<N>.md`;
6. предыдущий `STAGE<N-1>_COMPLETED.md`, если он существует.

`AGENTS.md` leftover: gitignored — not on source-remote clones. Living
ADRs — only those listed living in MASTER §0 / `docs/decisions/README.md`.
Do **not** read superseded ADR-003 / 004 / 007 / 008 / 009 as canon.
Do not stack every `docs/decisions/ADR-*.md`.

Для маршрутизации требований между стадиями использовать производную матрицу
`docs/stages/PRODUCT_TRACEABILITY.md`; при расхождении побеждает
`PRODUCT_SPEC.md`.

Для закрытия Stage дополнительно прочитать его
`STAGE<N>_COMPLETED.md` и проверить, что там записаны наблюдавшиеся факты, а не
планы.

Приоритет определяется зоной ответственности документов:

- `PRODUCT_SPEC.md` — продуктовые требования и границы MVP;
- `MASTER_CONTEXT.md` — принятая архитектура (включая индекс living ADR);
- living ADR — только те, что в MASTER §0; superseded — история;
- `ENVIRONMENTS.md` — роли и ограничения сред;
- `STAGE_STATUS.md` — фактическое состояние дорожной карты;
- Stage-файл — исполнимый объём конкретной стадии;
- completion-файл — фактически проверенный результат стадии.

Обсуждение, prompt или код сами по себе не отменяют принятое требование или
ADR. Глобальное изменение должно быть явно принято и синхронизировано с ADR,
контекстом и продуктовой спецификацией, когда она затронута. Этот файл
не второй канон: при расхождении с `MASTER_CONTEXT.md` / `PRODUCT_SPEC.md`
побеждают они.

## 3. Неподвижные технические правила

### Markdown — источник истины

Каноническое знание хранится в Markdown. Склад личного — **всегда**
локальная копия GraphNotes. Пишет **плагин** (ТЗ **3.35** / **3.37**).
Leftover copy-in с внешнего git-хоста (без вкладки «Свой git» в кабинете,
ТЗ **3.38**) / загрузки с сайта —
не канон ingest. Dropbox / Google Drive — только отдельным решением.
PostgreSQL, узлы, связи, теги, поисковый индекс и визуальный граф —
производные и должны быть восстановимы.

Запрещён второй канонический графовый файл, включая `graph.json`.
Рабочие тела **опубликованной общей** живут в `shared_notes`
(ТЗ **3.35** / **3.37**) — это не обход Differ и не тела в `note_index`
«для поиска». Личный hosted Markdown — продуктовый путь (плагин).
Поиск — `note_index`. Выгрузка своей — со склада `.md`, не из индекса.

Плагин Obsidian (ТЗ 2.68–2.91 / MASTER §12.1) — HTTP API в **тот же**
`personal_uploads` / `personal_assets`. Клиент 2.90 копит правки локально;
сеть — кнопка «Передать правки на сервер» в боковой панели / лента /
закрыл файл / минуты, не каждый символ. Выбор карточек не обязателен;
«только по команде» (2.69) снято. Не git copy-in при apply, не запись
в `shared_notes`, не предложение, не обход Differ. Таблицы transfer не канон
знания. Ключ хранится в кабинете и копируется в плагин (ТЗ 2.75); отзыв
блокирует, новый ключ снова из кабинета. SHA-256 — только поиск Bearer.
Код плагина в `obsidian-plugin/` — клиент, не канон склада GraphNotes.
§6.6.3 / ТЗ 2.88 / **3.11** / **3.31**: Differ (`GET /api/differ`) — пути и
хеши складов для вкладки `#/differ` и офера `user` (предложить пути, не merge;
без git copy-in и без тел на список). Card Merge
авторский Differ не читает (3.04–3.07 сняты). Токен editor/admin в
Card Merge читает `/queue` New (`GET /api/proposals`, ТЗ 3.10 / **3.12**).
Проверить: view `graphnotes-card-merge-queue` ≠ Publisher; очередь без
тел; «Принять в работу» — `GET /proposals/{id}/files/{path}`; Save &
Resolve **не** равен `POST /proposals/{id}/resolve` (ТЗ **3.25**: две
операции — локальная запись всегда; обновление хранилища ризомы от
аккаунта editor’а только если локальный ≠ склад). Runtime POST
`/resolve` сначала — **долг**. После успешной записи vault —
открытие этой локальной заметки (ТЗ **3.19** / **3.25**); не cache-only;
нет `GET /api/differ` в боковой очереди;
approve/reject остаются cookie на сайте.
Сайт `#/differ` + inbound accept shipped (TZ 3.11 / 3.13 / 3.15).
Card Merge leftover-модалка / `GET /api/differ` — у агентов плагина.
`/differ` и `/proposals` ошибки — `{detail}`, не конверт v1. Bearer на
`/differ` и `/proposals` не пишет `integration_token_access` (leftover;
`last_used_at` обновляется).
Публикация из Publisher — не этот API.

### Rhizome and RBAC model

- exactly one shared rhizome per installation;
- exactly one personal rhizome per user (GraphNotes local store; **plugin**
  writes `.md` — TZ **3.35**; ADR-008 superseded);
- no workspace/organization/team/community/multiple-shared entities;
- published shared working copies live in `shared_notes` (TZ **3.35**;
  leftover git copy-in unfinished); Differ remains the write gate;
  `note_index` has no bodies; personal hosted Markdown via plugin is the
  product default;
- GraphNotes for authors is a Publish analog with rights and one shared
  rhizome (TZ 2.61), not a second Obsidian: website in-app editor is **off**
  (TZ 2.93) until reverse download / reverse sync; do not mount
  `PersonalCardEditor` / MDXEditor / «Отредактировать карточку»;
  `PUT /api/personal/notes/{path}` stays for plugin / API and TZ 2.66 stub
  create; later leftover: take another participant’s card into one’s rhizome
  unlocks edit + reverse sync for those cards (not historical
  `take-from-shared` restored as-is);
  history is `rhizome_events.owner_user_id` (no bodies) for contribution
  counts; card page history is `card_revisions` last 30 (TZ 2.94), loaded
  only after «История правок» (`GET /api/cards/{path}/revisions`); do not
  fetch `/feed` or `/revisions` when opening the card;
  shared / others' personal / proposal stay read-only; do not ship a
  vault-replacing second Obsidian; ADR-008 is superseded (hosted store is
  canon; GraphNotes is still not a second Obsidian);
- app routes (TZ 2.58 / 2.60): `/card` start card (admin settings); `/card/{path}`
  card (2.55–2.56 stack + Differ offer); `/queue` editor queue; `/user`
  **settings** (not person card); `#/users/{login}` **public person card**
  (`GET /api/users/{login}/card` reads derived store + achievement counters,
  no git refresh, no unpublished paths; path `/users/{login}` rewrites to
  the hash so SPA fallback is not the graph;
  UUID key is 404 on the person view, not `/graph`; TZ 2.87: invited_at + inviter login as @user, omit if none);
  `/offer` **my** proposals; `/graph`
  shared canvas; `/invites` invite map (currently admin; TZ 2.98);
  `/search` card search; no `/my_graph` (TZ 3.00; personal is a `/graph` filter);
  `/contribution` Мой вклад; `#/admin` admin cabinet (TZ **3.33**: nick
  search + rights on the user row; «Доступы» search lists of cards/tags);
  Differ UI is `#/differ` (TZ 3.11 / 3.13:
  outbound propose and inbound take-into-personal; not a merge editor);
  `/offer` is my proposals; editor
  proposal text is wikidiff2 C++ via a native helper (TZ 3.03 /
  ADR-018; PHP leftover until the helper ships); `/` → `/graph`.
  Do not invent `/accepted/differ`. TZ 2.57 `/user`=person and
  `/offer`=combined queue — withdrawn;
- card page rules (TZ 2.56): editability derived (own personal vs
  published shared); same path in both layers is a **stack** (shared top,
  personal bottom), even if texts match; do not auto-open Differ; do not
  invent Differ line-diff UX for authors; semantic/neural compare needs
  an ADR; editor proposal review is wikidiff2 table HTML (TZ 3.03 /
  ADR-018), not `difflib` and not an inline toggle; paid is not
  a third folder; hash `#/card/personal:` is transitional;
- global hierarchical roles `user < editor < admin` remain the
  **coarse gate** (admin tools / queue UI / user management);
  TZ **3.30** grants (`(user, path)` or `(user, tag)` or `(user, prefix)`) are the shared-write
  check; empty grant is not the whole queue; leftover empty=whole-queue
  is a hole;
- **TZ 3.30 (narrows 3.24):** endpoints are per card; authorization is
  `(user_id, card_path)` or `(user_id, tag)` or `(user_id, path_prefix)` in the shared DB, evaluated
  per request (write if direct path or any matching tag or path under prefix). Missing grant
  → 404/403. Empty grant = no extra shared write. TZ **3.30** one shared
  file for a granted card; personal = ungranted drafts; vault = client.
  Two-table copies leftover. Do not treat
  `GET /api/cards/{path}` of published shared as that grant. Grant API
  and one plugin live in MASTER (3.26 / 3.30); ADR-007 is **superseded**.
  Open (next stage, not this wave): grant-write to already-shared;
  read-without-write for queue; paid maker vs user/editor. TZ **3.26**:
  one plugin is canon; queue from API is an editor capability in the same
  client; two catalogs leftover until one package ships. Editor vault may
  hold a local copy of accepted cards; GraphNotes stays the canonical
  shared store;
- rhizome **access levels** (ADR-016 / TZ 2.41) are not a fourth role:
  closed/paid slices stay in the author's personal store (hosted XOR git), marked in Markdown;
  derived `closed_paths` (later level id); entitlements UUID↔slice later;
  no second knowledge repository; «ризома автора» after entitlement is a
  view of that flag (graph + cards), not a second remote, index, or ZIP;
  «два графа» = shared + own overlay on one graph; open personal as a
  public catalog is not accepted;
- editor/admin may edit shared and review proposals;
- proposal author cannot approve own proposal regardless of role;
- editorial and administrative actions are audited;
- derived records distinguish `shared`, owned `personal`, and immutable
  `proposal` revisions, and must support contribution provenance (author attribution) for accepted nodes/links.

Remote-git/PostgreSQL atomicity must not be overstated. Observer verifies a durable
state machine, idempotent reconciliation, index-before-visible shared revision
switch, and recovery from merge/index failure.

### Circulation, Differ and Graph Diff

ADR-009 is **superseded**. Living circulation (PRODUCT_SPEC **3.40** /
MASTER_CONTEXT):

```text
personal layer (plugin → personal_uploads) -> Differ -> selected proposal
  -> editor queue -> merge/index -> published shared -> Differ again
```

The opposite direction is not a GraphNotes write into personal git and is
not a ZIP/clone of published shared (TZ 2.5). `take-into-git` / take-from-shared
and `GET /api/shared/archive` / `POST /api/personal/take-from-shared` are not
the product path (HTTP 410).

Differ is derived. Outbound is personal layer → published shared.
TZ 3.13 inbound is published shared → personal store for paths in the
caller's accepted proposals. Differ/status/graph/search/card GET compare
or serve local stores (`personal_uploads` / `shared_notes` / `note_index`).
Leftover (not canon, TZ **3.35** / **3.37**): `POST`/`DELETE
/personal/connect` is 410. Knowledge merge-out is **gone** (no
`reconcile_proposals` / `merge_branch` / `create_branch`). Webhook
**delivery log** without live disk; poller
default off (`GRAPHNOTES_PERSONAL_SYNC_INTERVAL_SECONDS=0`) and
`pull_connected_gits` no-op. `POST /index/rebuild` reindexes stores only.
Canon ingest is the plugin. Differ list is not
a live remote HEAD.
Upload-without-git input compares the
owner's staged Markdown with published shared by the same path/content rule.
It is not `graph.json` and must not store **published** shared bodies in
PostgreSQL. Files that exist only in shared are not Differ results.
Git must not be required to see Differ; empty Differ is valid when the
personal layer has nothing to offer. GraphNotes does not keep a second
canonical clone of personal Markdown.

Shared-graph UI uses **fCoSE** (`cytoscape-fcose`), not core `cose`. Layout
coordinates remain UI-only. TZ **3.41** adds a **test** tab `#/graph-test`
(`PixiGraphView.tsx`, `pixi.js` + `d3-force`) on the same Graph API; do not
treat it as the rhizome canvas or drop Cytoscape. TZ **3.43** mounts the
same `GraphSettingsPanel` there (`graphnotes-graph-settings`);
`seedCircularLayout` + `forceRadial` / `forceCollide` keep the cloud in
an Obsidian-like disk. TZ **3.39** adds the Obsidian-like settings
panel on `#/graph` (`frontend/src/graphSettings.ts`, `GraphSettingsPanel.tsx`):
tag nodes are synthesized client-side (`gn-tag:` ids; not Graph API);
orphans hide `isolated` notes; groups paint `node[groupColor]`; display and
forces feed `graphStylesheet` / `runFcoseLayout`. Aside local graph on a
card keeps depth only. Prefs are browser-local. TZ **3.40** restyles that
panel to Obsidian chrome (folds, `role=switch`, slider numbers, round
swatch, restart-layout button). TZ **3.42**: display slider `zoomSpeed`
(default 2 → Cytoscape `wheelSensitivity` 0.5); live via renderer
`wheelSensitivity`. On `#/graph-test` the same slider scales the Pixi
wheel step.

Landing `/` is `/graph` (TZ 2.14 / 2.58 / 3.00): rhizome by default; no
«Мой граф» tab. Guests may read published shared card bodies (TZ 2.64);
they must not receive personal, queue, feed or comments.
Settings (TZ 2.13 / 2.58 / **3.38**) live at **`/user`** (email/contacts,
author contract, Obsidian tokens, invite; **no** personal-git bind); not the public person card and not the
graph home. Graph canvas prefs (TZ **3.39** / **3.43**) stay on `#/graph` and
`#/graph-test` (same `localStorage`), not `/user`.
The shipped contract copy (TZ 2.44, version `2026-09-05`) is WTFPL for
cards plus AGPL-3.0 for software; it lives in Settings → Договор автора,
not on **О программе**. `#/about` shows rhizome copy (TZ **3.36**) plus
GraphNotes credits with Telegram links (TZ 2.78). «Стать автором» opens
`#/auth`. The footer is the About button only, at the bottom of the shell.
TZ **3.36** also: `/graph` names the rhizome on API failure («не удалось
загрузить»); health green only if process **and** graph/status data
respond; `/users/me` 5xx is «связь потеряна», not guest; `/search` four
states (empty / searching / none / error); italic `_…_`; plural
«2 заметки»; UI roles участник/редактор/администратор; hanging-card
local graph shows incoming links; small-node labels until zoom/hover;
`title`/og «Ризома психоанализа»; narrow header.

Light/dark theme (TZ 2.19 / 2.22) is CSS tokens plus `localStorage`, not a
server setting and not a second visual language. The control is a Theme
Switcher: compact sliding pill with sun/moon icons and `role="switch"` /
`aria-checked` for dark, in the header and Settings — not generic text
buttons jammed together. Cytoscape node labels must follow
`--gn-graph-label` / `--gn-graph-label-outline` (canvas-matching outline, not
node-fill outline). Both themes must remain readable on graph, Differ,
settings and the card page. Do not treat hardcoded washed-out `#fff` graph
text as acceptable dark-theme UX.

Differ emptiness is a comparison signal, not a contribution erasure signal.
If an author has previously accepted contributions into the published shared
revision, those accepted nodes/links must remain attributable/visible even
when the current Differ becomes empty for the same personal layer.

Graph Diff (Stage 8, current) is the structural view of the same Differ /
proposal pair. Editor queue is `/queue` (TZ 2.38 / 2.58 / **3.08**); author’s own
proposals are `/offer`. The queue opens **one** proposal and **one** card
body; Принять / Отклонить / Доработать sit under each card and still
decide the whole proposal (not a per-file merge). The open card shows a
Wikipedia-style text table
first (TZ 3.03: wikidiff2 HTML; «В ризоме» | «В предложении»; added =
empty left), then links, then Graph Diff; tabs are New / In progress / Rejected.
`GET /api/proposals/{id}` must include `html` from wikidiff2; do not lead
the review with only the proposed Markdown body. Do not fall back to
`difflib` when the engine is missing. Do not rewrite the engine in JS
or put C++ in the browser. The FastAPI contract stays: allow-listed
table HTML + `engine` + `rows`. The helper is a compiled binary from
pinned Wikimedia 1.14.2 (or later the same `src/lib` in-process); PHP
is not the install path.
Card search `/search` (TZ 2.39 / 2.58) is role-scoped over `note_index`
(`layer=visible` default): guest = published shared hits; card page is
openable for those shared paths (TZ 2.64)
body; user = shared ∪ own personal; editor adds reviewable proposals;
admin opens every card they can. `layer=overlay` is the graph stitch, not
the card-search default. Hits carry layer; proposal notes are indexed on
create. Card `#/card/{path}` is **read-only** (TZ 2.93). Do not mount
`PersonalCardEditor` / MDXEditor / «Отредактировать карточку». Class
`#/card/personal:{path}` (hash `personal%3A`) is the own-personal layer,
still preview only. Shared stays read-only.
TZ 2.54: wiki hrefs inherit the open card layer (`qualifyCardPath`); do not
collapse a personal wiki click onto unprefixed shared.
Card edit history is `card_revisions` (TZ 2.94): last 30 snapshots +
unified diff, `GET /api/cards/{path}/revisions`, only after the button.
`GET /api/cards/{path}/feed` stays body-less contribution events and must
not be fetched on card open. It is not a second comparison model.
Missing entitlement tables / «ризома автора» for payers is **N/A** this
wave (ADR-016 leftover), not FAIL. Inventing a second knowledge repo,
payment gateway, SMTP redesign, vsepsy login, Elasticsearch or Celery
in this slice is P1. Elasticsearch (ADR-015) is accepted but scheduled
**only after the first approved rhizome production deploy** (TZ 2.83);
shipping ES before that deploy is P1.

Current roadmap alignment: Stages 0–7 DONE; Stage 8 CURRENT; Stage 9
production deploy explicitly deferred.

### Среды и доставка

- `nord` — рабочая станция для создания и ревью исходного кода, веток,
  коммитов и push в канонический remote исходников;
- `rhizome-test` (`172.16.13.14`) — development/integration runtime,
  тестирование, миграции, deployment rehearsal и разрушительные проверки;
- `rhizome` (`172.16.13.13`) — production; только утверждённые и уже
  проверенные ревизии.

Канонический маршрут:

```text
nord -> canonical source remote -> rhizome-test -> approved revision -> rhizome
```

На `rhizome` запрещены первая проверка новой функциональности, разрушительные
эксперименты, ad-hoc правки исходников и Git credentials с возможностью push.

### MVP stack и ограничения

Канонический stack: FastAPI/Python, React/TypeScript, PostgreSQL, SQLAlchemy 2.x
async, Alembic, Docker/Compose, host Nginx; Cytoscape.js — UI общего графа,
personal overlay и Graph Diff (Stage 6+). Внешний git-хостинг знания — leftover, не канон
(ТЗ **3.35** / **3.37**).

Без отдельного принятого решения нельзя преждевременно добавлять Neo4j,
Elasticsearch, Redis, Celery, RabbitMQ, MinIO/S3, Gitea/GitLab или Kubernetes.
ADR-015 принят, но Elasticsearch — **только после первой утверждённой
выкатки на production `rhizome`** (ТЗ 2.83); до тех пор SQL-поиск, в
Compose ES не добавлять.

MVP authentication — локальные username/password; почта — тот же UUID.
SMTP инсталляции (ADR-017 / TZ 2.45 / 2.52) при заданных host и From не открывает
сессию на регистрации: письмо обязано содержать `#/auth/confirm?token=`
(код 6 цифр остаётся). Ссылки собираются из публичного адреса инсталляции
(Admin → Установка, таблица `installation_settings`; env — bootstrap).
Код/ссылка живут 30 минут. Секреты SMTP не в API и не в журнале.
Telegram — только будущий optional identity provider, связанный с внутренним UUID.

## 4. Обязательный Git-аудит Stage

Перед merge, закрытием Stage или promotion проверить текущую ветку и точную
целевую ревизию. Сначала зафиксировать имя ветки, HEAD SHA, базовую ветку и
состояние рабочего дерева.

Минимальный read-only набор:

```bash
git status --short --branch
git log --oneline --decorate main..HEAD
git diff --stat main...HEAD
git diff --name-status main...HEAD
git diff main...HEAD
git diff
git diff --cached
```

Если актуальность remote refs подтверждена обычным разрешённым `git fetch`, для
итогового аудита использовать `origin/main...HEAD`. Три точки важны: сравнение
идёт от общего предка feature-ветки и целевой ветки.

Незакоммиченные и staged-изменения не входят в `main...HEAD`; они проверяются
отдельно и не могут считаться частью проверенной deployable-ревизии.

Observer проверяет diff на:

- выход за границы Stage и преждевременную реализацию следующих стадий;
- изменение архитектуры без принятого ADR;
- второй источник истины;
- ослабление authentication, global RBAC, personal ownership или разделения
  shared/personal/proposal layers;
- утечки секретов, персональных данных и чувствительных значений в логах;
- небезопасные uploads, webhooks, cookies, токены и leftover git credentials;
  ZIP ingest: file-count cap is 10 000 (TZ 2.65); do not treat a raise of
  `ingest_max_files` as licence to drop zip-bomb guards (2 MiB compressed,
  8 MiB unpacked, 256 KiB/file, compression ratio, no symlink/encrypt);
  TZ 2.67 white-noise gate is content abuse, not a size limit: binary /
  high-entropy / letter-less `.md` must not reach `note_index`; lock +
  audit even when SMTP is off; do not delete already-indexed notes;
- несовместимые лицензии и незафиксированные зависимости;
  проектный код остаётся AGPL-3.0 (`LICENSE`, ADR-005); карточки в общую —
  WTFPL в тексте договора, без второго LICENSE;
- небезопасные или необратимые миграции;
- публичные backend/PostgreSQL-порты и расширение network exposure;
- расхождение кода, Compose, документации и фактической среды;
- отсутствие негативных тестов и проверок failure paths;
- случайное удаление защитных проверок;
- отсутствие связи результата с точным commit SHA.
- accidental workspace/multiple-shared-rhizome abstraction;
  treating tag-scoped editor rights as a fourth role or a paid level
  (TZ 3.21 / §5.6.5);
  treating TZ 3.24 paid content maker as a workspace / org / team /
  second rhizome; shipping per-card ACL routes as if already done;
  inventing the verb matrix or new card-rights endpoints in this wave;
- leftover take-into-git or shared ZIP/clone UX after TZ 2.5;
  giving an editor a dump of the whole `shared_notes` tree instead of
  queue-gate access (TZ 3.22 / **3.25** / §5.6.6 — two operations:
  always local vault; rhizome store update from editor account only
  if local ≠ store; GraphNotes stays canonical; editor vault
  is not a second rhizome); treating POST `/resolve` then vault write
  as the product order (runtime debt vs 3.25); treating leftover
  catalogs `obsidian-plugin/` + `obsidian-card-merge/` as a second
  spec (TZ **3.26** one plugin is canon; 3.09 withdrawn; do not glue
  the folders in this wave — leftover until one package ships);
- treating author Differ as a merge editor or putting it in Card Merge
  (TZ 3.11 / 3.13: `#/differ` is outbound propose + inbound
  take-into-personal; plugin lists queue, not personal Differ);
  hiding the Сверка chrome tab again (3.01 leftover withdrawn);
  treating Card Merge leftover `OpenMergeModal` GET `/differ`
  as the contract (plugin agents own that leftover);
  implementing inbound as ZIP / `take-from-shared` of the corpus, or
  showing an inbound path also as outbound propose;
  turning card-change notify into a social feed, per-card follow UI,
  or Telegram login (TZ 3.15 is one checkbox/toggle + the same bot/SMTP);
- replacing wikidiff2 with `difflib` for editor review, or dropping
  the native wikidiff2 helper from the backend image without a 503
  (TZ 3.03 / ADR-018: native helper shipped 2026-09-21; `php-cli` /
  `php-wikidiff2` leave this path only);
- treating `#/graph-test` (Pixi + d3-force) as the rhizome canvas or
  dropping Cytoscape on `#/graph` (TZ 3.41 is a test tab);
- remounting the «Мой граф» tab or treating `#/my_graph` as a separate
  canvas (TZ 3.00: `/graph` is the rhizome by default);
- invite map (`GET /api/graph/invites`, `#/invites`) visible to non-admin
  before an explicit leftover to open it; mixing it into `/graph` or the
  admin cabinet;
- website `.md`/ZIP upload button remounted (TZ 2.96: plugin only until
  an API syncs into the local store); Differ/index/graph reading
  `card_revisions` instead of the latest working copy;
- website Markdown editor remounted before reverse download / reverse sync
  (TZ 2.93), or an in-app editor that writes shared, others' personal, or
  proposal cards, or invents a blank new path from an existing card
  (missing-link create of a personal card is TZ 2.66); personal events
  leaking into the shared card feed for the same git path; fetching
  `/feed` or `/revisions` when merely opening a card (TZ 2.94); keeping
  more than 30 revisions per card; historical
  `take-from-shared` restored as-is;
- entitlement / payment / «ризома автора» tables shipped as if they were
  this slice (TZ 2.41 names the model; `closed_paths` already exists);
- Differ that requires git when the caller has uploads, or that treats
  upload as a write into published shared;
- Differ computed from **published** PostgreSQL note bodies or a second corpus
  instead of git trees / staged personal Markdown;
- accepted contributions and their provenance must persist across index
  rebuilds and must not be removed when Differ becomes empty;
- Graph Diff as a second comparison model rather than the structural view of
  Differ/proposal;
- partial publication visibility or self-approval path;
- unbounded shared graph/history/proposal queries and silent data growth.

## 5. Stage gate

Stage нельзя считать технически закрытым, пока применимые проверки не выполнены
на `rhizome-test` для точной предлагаемой ревизии:

- backend tests и startup/import checks;
- frontend build/type/tests, если frontend затронут;
- Docker image build и `docker compose config`;
- миграции upgrade/downgrade или иной согласованный migration check;
- реальные backend → PostgreSQL и frontend → backend запросы;
- проверка портов и отсутствия неожиданной публикации PostgreSQL/backend;
- security checks, относящиеся к Stage;
- completion-документ с версиями, командами, результатами и известным долгом.

Promotion на `rhizome` — отдельный gate. Успех на `rhizome-test` разрешает
предложить ревизию к promotion, но не означает автоматического production
deployment.

## 5.1. Матрица соответствия ТЗ

Для каждого аудита Observer обязан построить traceability matrix, а не
ограничиваться общим впечатлением от diff. В матрицу включаются все применимые
пункты из:

- `PRODUCT_SPEC.md`;
- разделов `Scope`, `Security requirements`, `Verification` и
  `Definition of Done` активного Stage;
- living ADR из MASTER §0 (не стопка superseded);
- требований среды и promotion gate.

Минимальные колонки:

| ID | Требование | Реализация | Проверка/доказательство | Статус |
| --- | --- | --- | --- | --- |
| источник и пункт | точная формулировка | файл/компонент | тест, команда, runtime-факт или SHA | PASS / FAIL / NOT VERIFIED / N/A |

Правила:

- `PASS` допустим только при конкретном доказательстве;
- наличие кода само по себе не доказывает пользовательский outcome;
- запись `PASS` в completion-файле не заменяет независимую проверку;
- `N/A` требует объяснения, почему требование неприменимо;
- любой обязательный `FAIL` блокирует Stage;
- любой обязательный `NOT VERIFIED` блокирует закрытие Stage и promotion;
- frontend outcome нельзя закрывать только backend-тестом или `curl`;
- security requirement должен иметь как минимум позитивный и негативный тест,
  если его можно проверить автоматически;
- все runtime-доказательства должны относиться к одному точному commit SHA.

В конце отчёта Observer указывает покрытие: количество `PASS`, `FAIL`,
`NOT VERIFIED` и `N/A`, а также отдельный список требований, для которых нет
доказательств.

## 6. Форматы результата

Каждый отчёт начинается с одного статуса:

- `PASS` — существенных нарушений не найдено;
- `PASS WITH RISKS` — блокирующих нарушений нет, риски явно перечислены;
- `BLOCK` — merge, закрытие Stage или promotion технически небезопасны;
- `TECHNICAL CONFLICT` — канонические источники противоречат друг другу.

Для замечаний использовать приоритеты:

- `P0` — критическая потеря данных, компрометация или production outage;
- `P1` — блокирующая безопасность, архитектура, миграция или нарушение Stage;
- `P2` — существенная надёжность, поддерживаемость или неполное тестирование;
- `P3` — неблокирующий долг или улучшение ясности.

Каждое замечание содержит:

1. приоритет и короткое название;
2. доказательство: файл/строка, diff, команда или наблюдавшийся результат;
3. техническое последствие;
4. рекомендацию;
5. gate, который оно блокирует, если применимо.

Не смешивать подтверждённые факты, выводы и предположения. Непроверенное явно
помечать как `NOT VERIFIED`.

## 7. TECHNICAL CONFLICT

При конфликте Observer не выбирает архитектуру самостоятельно. Отчёт обязан
содержать:

```text
TECHNICAL CONFLICT

Старое решение:
Новое решение:
Затронутые источники истины:
Последствия каждого варианта:
Рекомендация:
Требуемое решение владельца:
```

После решения владельца основной воркер синхронно обновляет применимые ADR,
контекст, спецификацию и Stage-документы. До этого Observer блокирует действие,
для которого выбор варианта материален.

## 8. Взаимодействие с основным Stage-воркером

Observer передаёт основному воркеру отчёт, а не самостоятельный patch кода.
Основной воркер исправляет замечания, запускает проверки и возвращает точный
SHA/обновлённый diff на повторный аудит.

Рекомендуемый цикл:

```text
Stage worker implements
  -> Technical Observer audits Git diff and evidence
      -> Stage worker fixes findings
          -> Technical Observer re-checks exact revision
              -> owner approves merge/promotion
```

Observer не должен мешать активному воркеру параллельным редактированием тех же
файлов. Если рабочее дерево меняется во время проверки, аудит помечается как
устаревший и повторяется для стабильной ревизии.
