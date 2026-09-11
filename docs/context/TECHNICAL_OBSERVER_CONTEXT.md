# GraphNotes — канонический контекст Technical Observer

Статус: ACTIVE
Updated: 2026-09-12 (TZ 2.84 / §17: invite-only register after `rhizome`
prod, not test; ADR before code. TZ 2.83: Elasticsearch iteration starts **only after
the first approved rhizome production deploy**; SQL `/search` until then;
do not add ES to Compose. TZ 2.82: plugin copies vault edits after save;
no card picker; first dump «Отправить всё»; §6.6.3 marks/topics are site
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

Плагин Obsidian (ТЗ 2.68–2.82 / MASTER §12.1) — HTTP API в **тот же**
`personal_uploads` / `personal_assets`. Клиент 2.82 копирует правки vault
после сохранения; выбор карточек не обязателен; «только по команде»
(2.69) снято. Не git copy-in при apply, не запись
в `shared_notes`, не предложение, не обход Differ. Таблицы transfer не канон
знания. Ключ хранится в кабинете и копируется в плагин (ТЗ 2.75); отзыв
блокирует, новый ключ снова из кабинета. SHA-256 — только поиск Bearer.
Код плагина в `obsidian-plugin/` — клиент, не канон склада GraphNotes.
§6.6.3 пометки/темы — UI сайта, не этот API.

### Rhizome and RBAC model

- exactly one shared rhizome per installation;
- exactly one personal rhizome per user (GraphNotes local store; connectors
  copy `.md` in — TZ 2.62 / ADR-008 amendment);
- no workspace/organization/team/community/multiple-shared entities;
- published shared working copies live in `shared_notes` after GitHub
  copy-in (TZ 2.63); Differ remains the write gate; `note_index` has no
  bodies; personal hosted Markdown is the product default (TZ 2.61);
- GraphNotes for authors is a Publish analog with rights and one shared
  rhizome (TZ 2.61), not a second Obsidian: thin
  in-app editor is **own personal cards only** after «Отредактировать
  карточку» (`PUT /api/personal/notes/{path}`,
  `source` + `expected_hash`, author contract, git XOR upload, no new path,
  409 if stale);
  in-app history is `rhizome_events.owner_user_id` (no bodies);
  shared / others' personal / proposal stay read-only; do not ship a
  vault-replacing second Obsidian; ADR-008 leftover «no hosted vault» vs TZ 2.61;
- app routes (TZ 2.58 / 2.60): `/card` start card (admin settings); `/card/{path}`
  card (2.55–2.56 stack + Differ offer); `/queue` editor queue; `/user`
  **settings** (not person card); `#/users/{uuid}` **public person card**
  (`GET /api/users/{id}/card`, achievement counters, no unpublished paths);
  `/offer` **my** proposals; `/graph`
  shared canvas; `/search` card search; `/my_graph` personal graph;
  `/contribution` Мой вклад; `/differ` stays Отличающиеся; `/` → `/graph`.
  Do not invent `/accepted/differ`. TZ 2.57 `/user`=person and
  `/offer`=combined queue — withdrawn;
- card page rules (TZ 2.56): editability derived (own personal vs
  published shared); same path in both layers is a **stack** (shared top,
  personal bottom), even if texts match; do not auto-open Differ; do not
  invent line-diff UX; semantic/neural compare needs an ADR; paid is not
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

Landing `/` is `/graph` (TZ 2.14 / 2.58). `/my_graph` is the personal
layer only. Guests may read published shared card bodies (TZ 2.64);
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
proposals are `/offer`. The queue UI opens proposed card Markdown and
links first, then Graph Diff; tabs are New / In progress / Rejected.
Card search `/search` (TZ 2.39 / 2.58) is role-scoped over `note_index`
(`layer=visible` default): guest = published shared hits; card page is
openable for those shared paths (TZ 2.64)
body; user = shared ∪ own personal; editor adds reviewable proposals;
admin opens every card they can. `layer=overlay` is the graph stitch, not
the card-search default. Hits carry layer; proposal notes are indexed on
create. Card `#/card/{path}` is view-first; «Отредактировать карточку» and
MDXEditor exist only for own personal (author contract) on the class
`#/card/personal:{path}` (hash `personal%3A` is the same). TZ 2.53: that
route must mount `PersonalCardEditor`; it was broken when the editor was
unwired so those URLs looked shared/read-only. Shared stays read-only.
TZ 2.54: wiki hrefs inherit the open card layer (`qualifyCardPath`); do not
collapse a personal wiki click onto unprefixed shared.
In-app history is
`rhizome_events.owner_user_id` on `GET /api/cards/{path}/feed` (no bodies).
It is not a second comparison model and must present contribution
provenance (author attribution) for included nodes/links when available.
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
- in-app editor that writes shared, others' personal, or proposal cards,
  or invents a blank new path from an existing card (missing-link create
  of a personal card is TZ 2.66), or opens the editor without
  «Отредактировать карточку» / without author rights (TZ 2.50: view-first;
  TZ 2.49 widget is MDXEditor, not a vault clone; TZ 2.48 allows own
  personal `PUT` only); personal in-app events leaking into the shared
  card feed for the same git path;
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
