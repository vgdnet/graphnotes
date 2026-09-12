# GraphNotes — канонический контекст Technical Observer

Статус: ACTIVE
Updated: 2026-09-12 (PRODUCT_SPEC **3.03**: editor queue **wikidiff2**.
Owner 2026-09-12 / ADR-018 amendment: compile the C++ core as a native
helper; this test deploy still runs leftover `php-cli` / `php-wikidiff2`
until that helper ships, then those packages leave the backend image.
Do not keep PHP as the install path.
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
without a card picker; first dump «Отправить все правки»; TZ 2.88: Differ API lists
diffs and missing-from-shared offers — cabinet first, plugin later;
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
TZ 2.68–2.71: Obsidian plugin → personal store API + desktop plugin
in-repo. Alembic 0017–0019, hashed lookup + stored token,
no git copy-in on plugin apply. TZ 2.67: white-noise personal ingest lock + admin
mail; existing notes kept. TZ 2.66: missing card page + personal create
from dangling wikilink. TZ 2.65: ZIP ingest 10 000 files; zip-bomb
size/ratio guards stay. TZ 2.63: GitHub copy-in only; local personal +
shared stores)

Этот файл задаёт рабочий регламент отдельного Technical Observer проекта
GraphNotes. Его можно передать новому воркеру целиком. Он не заменяет
канонические документы проекта и не создаёт новых архитектурных решений.

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

1. `AGENTS.md`;
2. `docs/product/PRODUCT_SPEC.md`;
3. `docs/context/MASTER_CONTEXT.md`;
4. `docs/context/ENVIRONMENTS.md`;
5. `docs/context/STAGE_STATUS.md`;
6. все применимые `docs/decisions/ADR-*.md`;
7. активный `docs/stages/STAGE<N>.md`;
8. предыдущий `STAGE<N-1>_COMPLETED.md`, если он существует.

Для маршрутизации требований между стадиями использовать производную матрицу
`docs/stages/PRODUCT_TRACEABILITY.md`; при расхождении побеждает
`PRODUCT_SPEC.md`.

Для закрытия Stage дополнительно прочитать его
`STAGE<N>_COMPLETED.md` и проверить, что там записаны наблюдавшиеся факты, а не
планы.

Приоритет определяется зоной ответственности документов:

- `PRODUCT_SPEC.md` — продуктовые требования и границы MVP;
- `MASTER_CONTEXT.md` — принятая архитектура;
- ADR — решение, причины и последствия;
- `ENVIRONMENTS.md` — роли и ограничения сред;
- `STAGE_STATUS.md` — фактическое состояние дорожной карты;
- Stage-файл — исполнимый объём конкретной стадии;
- completion-файл — фактически проверенный результат стадии.

Обсуждение, prompt или код сами по себе не отменяют принятое требование или
ADR. Глобальное изменение должно быть явно принято и синхронизировано с ADR,
контекстом и продуктовой спецификацией, когда она затронута.

## 3. Неподвижные технические правила

### Markdown — источник истины

Каноническое знание хранится в Markdown. Склад личного — **всегда**
локальная копия GraphNotes (загрузки / in-app / копия с коннектора). Git,
позже Dropbox / Google Drive — ingest copy-in, не второй канон.
PostgreSQL, узлы, связи, теги, поисковый индекс и визуальный граф —
производные и должны быть восстановимы.

Запрещён второй канонический графовый файл, включая `graph.json`.
Рабочие тела **опубликованной общей** живут в `shared_notes` после copy-in
(ТЗ 2.63) — это не обход Differ и не тела в `note_index` «для поиска».
Личный hosted Markdown — продуктовый путь (ТЗ 2.62). Поиск — `note_index`.
Выгрузка своей — со склада `.md`, не из индекса.

Плагин Obsidian (ТЗ 2.68–2.91 / MASTER §12.1) — HTTP API в **тот же**
`personal_uploads` / `personal_assets`. Клиент 2.90 копит правки локально;
сеть — кнопка «Передать правки на сервер» в боковой панели / лента /
закрыл файл / минуты, не каждый символ. Выбор карточек не обязателен;
«только по команде» (2.69) снято. Не git copy-in при apply, не запись
в `shared_notes`, не предложение, не обход Differ. Таблицы transfer не канон
знания. Ключ хранится в кабинете и копируется в плагин (ТЗ 2.75); отзыв
блокирует, новый ключ снова из кабинета. SHA-256 — только поиск Bearer.
Код плагина в `obsidian-plugin/` — клиент, не канон склада GraphNotes.
§6.6.3 / ТЗ 2.88: Differ (`GET /api/differ`) отдаёт отличия и просьбы
«нет в общей»; сначала кабинет; плагин — позже, тем же маршрутом.
Пометки в Obsidian и публикация из плагина — не этот API.

### Rhizome and RBAC model

- exactly one shared rhizome per installation;
- exactly one personal rhizome per user (GraphNotes local store; connectors
  copy `.md` in — TZ 2.62 / ADR-008 amendment);
- no workspace/organization/team/community/multiple-shared entities;
- published shared working copies live in `shared_notes` after GitHub
  copy-in (TZ 2.63); Differ remains the write gate; `note_index` has no
  bodies; personal hosted Markdown is the product default (TZ 2.61);
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
  vault-replacing second Obsidian; ADR-008 leftover «no hosted vault» vs TZ 2.61;
- app routes (TZ 2.58 / 2.60): `/card` start card (admin settings); `/card/{path}`
  card (2.55–2.56 stack + Differ offer); `/queue` editor queue; `/user`
  **settings** (not person card); `#/users/{login}` **public person card**
  (`GET /api/users/{login}/card`, achievement counters, no unpublished paths;
  UUID key is 404; TZ 2.87: invited_at + inviter login as @user, omit if none);
  `/offer` **my** proposals; `/graph`
  shared canvas; `/invites` invite map (currently admin; TZ 2.98);
  `/search` card search; no `/my_graph` (TZ 3.00; personal is a `/graph` filter);
  `/contribution` Мой вклад; Differ UI is `/offer` (TZ 3.01); editor
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
- global hierarchical roles `user < editor < admin`;
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

GitHub/PostgreSQL atomicity must not be overstated. Observer verifies a durable
state machine, idempotent reconciliation, index-before-visible shared revision
switch, and recovery from merge/index failure.

### Circulation, Differ and Graph Diff

ADR-009 is accepted. Markdown circulation is:

```text
personal layer (git or .md upload) -> Differ -> selected proposal
  -> editor queue -> merge/index -> published shared -> Differ again
```

The opposite direction is not a GraphNotes write into personal git and is
not a ZIP/clone of published shared (TZ 2.5). `take-into-git` / take-from-shared
and `GET /api/shared/archive` / `POST /api/personal/take-from-shared` are not
the product path (HTTP 410).

Differ is derived, one-way personal layer → published shared. Git input
compares trees by Markdown blob SHA **after** GraphNotes reads the caller's
current public HEAD (GET `/api/differ`, create proposal, GitHub `push`
webhook, or the in-process poller `GRAPHNOTES_PERSONAL_SYNC_INTERVAL_SECONDS`;
CLI `python -m app.cli.sync_personal`). Upload-without-git input compares the
owner's staged Markdown with published shared by the same path/content rule.
It is not `graph.json` and must not store **published** shared bodies in
PostgreSQL. Files that exist only in shared are not Differ results.
Git must not be required to see Differ; empty Differ is valid when the
personal layer has nothing to offer. GraphNotes does not keep a second
canonical clone of personal Markdown.

Shared-graph UI uses **fCoSE** (`cytoscape-fcose`), not core `cose`. Layout
coordinates remain UI-only.

Landing `/` is `/graph` (TZ 2.14 / 2.58 / 3.00): rhizome by default; no
«Мой граф» tab. Guests may read published shared card bodies (TZ 2.64);
they must not receive personal, queue, feed or comments.
Settings (TZ 2.13 / 2.58) live at **`/user`** (email/contacts, git bind,
author contract); not the public person card and not the graph home.
The shipped contract copy (TZ 2.44, version `2026-09-05`) is WTFPL for
cards plus AGPL-3.0 for software; it lives in Settings → Договор автора,
not on **О программе**. `#/about` shows rhizome / GraphNotes credits with
Telegram links (TZ 2.78). The footer is the About button only.

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
proposal pair. Editor queue is `/queue` (TZ 2.38 / 2.58); author’s own
proposals are `/offer`. The queue UI opens a Wikipedia-style text table
first (TZ 3.03: wikidiff2 HTML; «В ризоме» | «В предложении»; added =
empty left), then links, then Graph Diff; tabs are New / In progress / Rejected.
`GET /api/proposals/{id}` must include `html` from wikidiff2; do not lead
the review with only the proposed Markdown body. Do not fall back to
`difflib` when the engine is missing. Do not rewrite the engine in JS
or put C++ in the browser. The FastAPI contract stays: allow-listed
table HTML + `engine` + `rows`. The helper is a compiled binary (or
later the same `src/lib` in-process); not `php-cli`.
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
  коммитов и push в GitHub;
- `rhizome-test` (`172.16.13.14`) — development/integration runtime,
  тестирование, миграции, deployment rehearsal и разрушительные проверки;
- `rhizome` (`172.16.13.13`) — production; только утверждённые и уже
  проверенные ревизии.

Канонический маршрут:

```text
nord -> GitHub -> rhizome-test -> approved revision -> rhizome
```

На `rhizome` запрещены первая проверка новой функциональности, разрушительные
эксперименты, ad-hoc правки исходников и Git credentials с возможностью push.

### MVP stack и ограничения

Канонический stack: FastAPI/Python, React/TypeScript, PostgreSQL, SQLAlchemy 2.x
async, Alembic, Docker/Compose, host Nginx; Cytoscape.js — UI общего графа,
personal overlay и Graph Diff (Stage 6+). GitHub App — leftover Git-движок
общей ризомы (Stage 3), не диск пользователя (ТЗ 2.61).

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
- небезопасные uploads, webhooks, cookies, токены и GitHub credentials;
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
- leftover take-into-git or shared ZIP/clone UX after TZ 2.5;
- remounting the «Отличающиеся» chrome tab (TZ 3.01: Differ is internal,
  UI on `/offer`);
- replacing wikidiff2 with `difflib` for editor review, or dropping
  the native wikidiff2 helper from the backend image without a 503
  (TZ 3.03 / ADR-018 amendment: do not keep `php-cli` /
  `php-wikidiff2` as the install path — leftover on this test deploy,
  they leave when the helper ships);
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
- принятых ADR;
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
