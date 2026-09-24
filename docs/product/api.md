<!-- Раздел канонического ТЗ. Оглавление: docs/product/PRODUCT_SPEC.md -->

## 7. Черновой контракт API MVP

Точные схемы, коды ошибок и авторизация определяются стадиями. Следующие маршруты
фиксируют продуктовую поверхность, но не требуют преждевременной реализации.

```text
POST /api/auth/register                # 410 Gone — street register closed (TZ 2.86)
POST /api/auth/login                    # username or email + password
POST /api/invites                       # any active account; {email}; SMTP letter #/auth/invite?token=
GET  /api/invites                       # caller's unused invites
DELETE /api/invites/{id}                # revoke unused
GET  /api/auth/invite?token=            # preview email + inviter login
POST /api/auth/invite/accept            # token + username + password + display_name → 201 session; email confirmed
GET  /api/auth/mail-status              # { configured, code_ttl_minutes } — no SMTP secrets
POST /api/auth/email/request            # identifier = login or email (field email still accepted); purpose confirm|login|reset; letter only to stored account email; 204 always if SMTP on (no existence leak); 503 if SMTP off
GET  /api/installation/start-card       # { path } or path null — admin-set start card for /card
POST /api/auth/email/verify             # confirm or login by code/token
POST /api/auth/password/reset           # new password + reset code/token; 503 if SMTP off
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/users/me
PATCH /api/users/me                 # settings: display_name, email, phone, telegram,
                                    # notify_queue_email, notify_queue_telegram,
                                    # notify_card_changes (TZ 3.15: one toggle)
GET  /api/author/contract           # public Russian copy (version, WTFPL/AGPL)
GET  /api/users/me/author-contract  # same copy while signed in
POST /api/users/me/author-contract  # accept current contract version
POST /api/users/me/author-contract/withdraw
POST /api/users/me/integration-tokens   # cookie session; token stored and shown again
GET  /api/users/me/integration-tokens   # id, name, token, scopes, expiry — token returned for later copy
GET  /api/users/me/integration-tokens/access  # ~6 months, max ~1y; who / IP / token name; no key
DELETE /api/users/me/integration-tokens/{id}

GET  /api/repository/status

POST /api/personal/connect          # HTTP 410; leftover TZ 3.35 / **3.38**
DELETE /api/personal/connect        # HTTP 410
POST /api/personal/import-md          # leftover TZ 2.96: no website button;
                                    # future upload must sync into the local store
                                    # (same as plugin); ZIP ≤ 10 000 files;
                                    # white noise → 400 + lock (TZ 2.67)
GET  /api/personal/notes              # read-only index of the local personal store
GET  /api/personal/notes/{id}
PUT  /api/personal/notes/{path}       # plugin / API / TZ 2.66 stub; not website editor (TZ 2.93);
                                    # own personal only; source + expected_hash;
                                    # local store; author contract;
                                    # existing path (409 stale) or new personal
                                    # from a missing-link create (TZ 2.66)
GET  /api/personal/uploads            # upload history: who / when / path / hash

GET  /api/differ                      # TZ 3.11 / 3.13 / 3.20 / **3.31**: chrome tab #/differ (Сверка)
                                      # and plugin sidebar offer list;
                                      # {differences, inbound} path lists (no bodies);
                                      # kind=added|changed from content_hash, not wikidiff2;
                                      # inbound omitted from outbound;
                                      # cookie or Bearer gnp_ / personal:read (that user only).
                                      # store hashes only; no live remote API; no git copy-in on list.
                                      # ?include_inbound=false — offer panel (skip inbound+notices).
                                      # no live direction field
POST /api/differ/inbound/{path}/accept
                                      # TZ 3.13 shipped: copy published shared
                                      # → caller's personal store for a watched inbound path;
                                      # not propose, not ZIP
GET  /api/differ/files/{path}         # leftover pair JSON (shipped); not author merge UI (TZ 3.11);
                                      # incoming=published shared, current=personal or empty;
                                      # shared-only path is 200 kind=changed, not 404;
                                      # errors {detail}
GET  /api/contributions/me            # author's notes, links, proposals, counts; derived;
                                      # TZ 3.34: which edits proposed (path, volume, state);
                                      # editor/admin also receive own review stats
GET  /api/users/{login}/card          # public person card (guest + signed-in, TZ 2.98):
                                      # login only (`efimov`); UUID key → 404; no user UUID in JSON;
                                      # derived store + achievements, no git refresh;
                                      # inviter; store{personal_notes, personal_links,
                                      # proposed_notes, proposed_links, proposed_edit_bytes};
                                      # accepted notes list; not personal/closed bodies; not /user
GET  /api/admin/contributions         # admin only: same stats for every account
GET  /api/admin/users                 # list/search/filter by nick/username (also
                                      # email, display name); last login, sessions;
                                      # TZ 3.21 / **3.33**: editor_tags + grants[]
                                      # (kind=path|tag|prefix) so the admin row
                                      # shows rights without a second screen
POST /api/admin/users                 # admin creates an account
PATCH /api/admin/users/{id}/editor-tags
                                      # TZ 3.21 / 3.30: replace tag grants; admin;
                                      # empty list = no extra shared write
                                      # (NOT whole published queue — 3.21 change)
GET  /api/admin/grants                # admin; filter user_id / kind / value
POST /api/admin/grants                # admin; kind=path|tag|prefix
DELETE /api/admin/grants/{id}         # admin
GET  /api/admin/grants/catalog        # admin; shared paths, tags, folder prefixes;
                                      # TZ 3.33: ?q= filters path/title/tag/prefix;
                                      # ?tag= lists cards with that tag; cards[]
                                      # is {path, title}, no bodies
GET  /api/integrations/obsidian/v1/granted
                                      # plugin: list granted shared cards
GET  /api/integrations/obsidian/v1/granted/files/content
                                      # plugin: download one granted shared file
PUT  /api/integrations/obsidian/v1/granted/files
                                      # plugin: sync local → same shared_notes file
GET  /api/admin/audit                 # admin only: filterable action log
POST /api/admin/users/{id}/password   # admin sets a new password; never echoed
POST /api/admin/users/{id}/sessions/revoke
GET  /api/admin/operator              # health + SMTP status + public site URL, no secrets
PUT  /api/admin/operator              # persist public site URL (mail links); survives rebuild
POST /api/admin/mail/test             # operator test send; 503 if SMTP off

GET  /api/graph/shared                # start page; no login; public published layer only; no card bodies;
                                      # optional center+depth 0–4 = local graph (unknown center ≠ first page)
GET  /api/graph/invites               # JSON only. Page is hash #/invites
                                      # (rhizome-test: http://172.16.13.14:8080/#/invites).
                                      # Not #/api/graph/invites. Creators: invited_count.
                                      # Admin only (TZ 2.98). Code Writer deploys to rhizome-test.
GET  /api/public/embed/{user_id}      # opt-in achievement: graph snippet and/or counts; no ZIP/bodies; fields TBD (§6.1.4)
GET  /api/search                      # default layer=visible: role-scoped corpus;
                                      # hits include layer (shared/personal/proposal);
                                      # overlay/personal/shared remain for graph highlight;
                                      # guest = public hits, no snippets in the hit list
GET  /api/cards/{path}                # shipped display today: published shared guest
                                      # may read the body; personal:{path},
                                      # personal:{uuid}:{path} (admin),
                                      # proposal:{id}:{path} (author/editor/admin)
                                      # need a session;
                                      # TZ 3.30: endpoints are per-card;
                                      # authorization is (user_id, card_path)
                                      # OR (user_id, tag) OR (user_id, path_prefix)
                                      # on each request, not an
                                      # ACL document in the markdown and not
                                      # «rights live on the card» (3.24 narrowed);
                                      # write if direct path grant OR any card
                                      # tag matches a tag-grant OR path is under
                                      # a prefix grant; list/queue/file/sync
                                      # share one grant function; missing grant → 404/403;
                                      # this public GET of published shared is
                                      # the guest vitrine, not that grant;
                                      # granted write is the same shared file, not a
                                      # personal blob; PUT /personal/notes/{path} stays
                                      # for ungranted drafts / plugin leftover
GET  /api/cards/{path}/revisions      # TZ 2.94 / 3.34: last 30 snapshots + diff;
                                      # proposer (proposal author / grant writer),
                                      # optional accepter, added/removed lines or bytes;
                                      # not loaded with the card; shared = guest OK;
                                      # personal = session; admin personal:{uuid}:;
                                      # proposal empty
GET  /api/cards/{path}/feed           # contribution events; shared = owner null; own personal
                                      # = caller; admin personal:{uuid}: = that owner;
                                      # proposal empty; no Markdown bodies; card page does not
                                      # fetch this on open
GET  /api/graph/personal              # ваша личная ризома; caller's full indexed personal tree;
                                      # optional center+depth (personal:{path} stripped)
GET  /api/graph/personal-overlay      # ваша часть ризомы: shared page + personal notes that wikilink into it;
                                      # local graph: center may be personal:{path} for overlay-only nodes
POST /api/index/rebuild               # admin, Stage 5
GET  /api/graph/diff?proposal_id=...  # Stage 8 structural view of Differ/proposal

POST /api/proposals                   # cookie or Bearer gnp_ / personal:read;
                                      # author contract; that user only (TZ 3.20)
GET  /api/proposals                   # cookie or Bearer gnp_ / personal:read
                                      # (TZ 3.10: Card Merge editor queue);
                                      # editor — грант-срез; empty grant → [];
                                      # admin — все pending (bypass);
                                      # user — свои;
                                      # {proposals, editorial_queue_mode:
                                      # all|granted|none,
                                      # has_editorial_grants}
GET  /api/proposals/{id}              # тот же вход, что список; file diffs:
                                      # proposed body, shared before,
                                      # unified leftover, html from wikidiff2
                                      # (TZ 3.03 / ADR-018), rows[] parsed from it
GET  /api/proposals/{id}/files/{path} # TZ 3.12 shipped: {path, before, body};
                                      # before=опубликованная общая, body=предложение;
                                      # no html/engine/rows (те на GET /proposals/{id});
                                      # Card Merge «Принять в работу»
POST /api/proposals/{id}/resolve      # TZ 3.12 / 3.18 shipped runtime:
                                      # cookie or Bearer editor/admin;
                                      # {files:[{path,source}], reason?};
                                      # source = смерженный текст этой карточки;
                                      # publish only those paths (branch+merge gate);
                                      # remaining files stay on the open proposal (ТЗ 3.18);
                                      # last file closes the proposal like approve;
                                      # ТЗ 3.25: не равен принятию / Save & Resolve;
                                      # runtime: vault first, then POST if local ≠ store
POST /api/proposals/{id}/approve      # cookie session only; website /queue
POST /api/proposals/{id}/reject
POST /api/proposals/{id}/request-changes
POST /api/proposals/{id}/rollback

POST /api/webhooks/github

GET  /api/integrations/obsidian/v1/capabilities
GET  /api/integrations/obsidian/v1/manifest
GET  /api/integrations/obsidian/v1/files/content?path=
POST /api/integrations/obsidian/v1/transfers          # Idempotency-Key
PUT  /api/integrations/obsidian/v1/transfers/{id}/blobs/{sha256}
POST /api/integrations/obsidian/v1/transfers/{id}/commit
GET  /api/integrations/obsidian/v1/transfers/{id}
DELETE /api/integrations/obsidian/v1/transfers/{id}   # cancel if not applying
```

Плагин **GraphNotes Publisher** (ТЗ 2.68–2.76 / **2.82** / §6.3.4) пишет
**только** в личное хранилище владельца токена — тот же склад, что
`PUT /api/personal/notes/{path}` и `POST /api/personal/import-md`. Общую
ризому, `shared_notes`, предложения и Differ эти методы не меняют.

Плагин **GraphNotes** (`obsidian-card-merge/`) — поставленный один
клиент (ТЗ **3.26**): sync личного склада, офер у `user`, очередь editor’а.
`obsidian-plugin/` leftover. Очередь читает: `GET /capabilities`
(`user.role`, `can_see_queue`, `can_propose_to_rhizome`), `GET /api/proposals` (только список, без тел). **«Принять в
работу»** — `GET /api/proposals/{id}/files/{path}` → `{path, before, body}`
в кэш `.obsidian/plugins/graphnotes-card-merge/work/{id}/…` (черновик
сравнения). **Save & Resolve** в UX — принятие **этой одной** карточки
(ТЗ **3.18**); не равнять с `POST /api/proposals/{id}/resolve`.
**ТЗ 3.25 — две операции:** (1) всегда записать принятый файл в
локальный vault и открыть эту заметку (`createLeafBySplit` /
`getLeaf(true)`, не MergeView); без записи принятие не закончено;
(2) только если локальный файл ≠ файл в хранилище ризомы — обновить
хранилище **от аккаунта editor’а** (Differ — write gate); если
совпадают — пропуск. Ручная правка editor’а — тот же sync, что у
участника. Новый HTTP-глагол не выдумывать. Runtime: сначала vault и
открытие; POST `/api/proposals/{id}/resolve` `{files:[{path,source}]}`
— вторая операция, если локальный ≠ общая; 504 не откатывает vault.
Очередь справа
не перехватывает фокус (ТЗ **3.19** / **3.25**). Повторный resolve на
уже **полностью** принятой заявке — успех. Авторский Differ в плагине
**нет** (ТЗ 3.11). Отклонить / доработать — cookie на сайте. Два
каталога в дереве — leftover, не канон.

Сайт 3.11 / 3.13: вкладка `#/differ`, `/offer` только заявки, «Текст
сверки» снята. Плагин 3.20 / **3.31**: `GET /api/differ?include_inbound=false`
(пути/хеши, без тел) + `POST /api/proposals` по выбранным
для офера после копии в личное. Card Merge leftover-модалка — не этот контракт.

Авторизация передачи и чтения Differ: `Authorization: Bearer <token>`.
UUID склада сервер берёт из токена; клиент **не** передаёт `user_id`,
чтобы выбрать чужое хранилище. Scopes: `personal:read` (Differ и
capabilities), `personal:write` (пакет Publisher), опционально
`personal:delete`. Управление токенами — cookie-сессия
`/api/users/me/integration-tokens` (простой ключ `gnp_…` хранится в
кабинете и снова отдаётся владельцу сессии, чтобы скопировать позже,
ТЗ 2.76; ошибки как у остального веб-API: `{detail}`). Каждый плагин
помнит тот же ключ в своём `data.json`. История входов —
`GET /api/users/me/integration-tokens/access` (кто, IP, User-Agent, имя
и отпечаток токена, маршрут; без ключа; ~183 дня, потолок ~366).
Сейчас строки пишет префикс `/integrations/obsidian/v1`; чтение Differ
по Bearer журнал не дополняет (leftover). Отдельная база логов — не этот
контракт.

Ошибки префикса `/api/integrations/obsidian/v1` — конверт
`{error:{code,message,request_id,retryable,details}}`. Коды: `invalid_token`,
`token_expired`, `insufficient_scope`, `author_contract_required`,
`write_disabled`, `invalid_path`, `not_found` (в т.ч. чужой transfer), `version_conflict`,
`resource_in_use`, `idempotency_mismatch`, `invalid_state`, `transfer_busy`,
`quota_exceeded`, `snapshot_expired`, `transfer_expired`, `file_too_large`,
`batch_too_large`, `unsupported_type`, `hash_mismatch`, `invalid_utf8`,
`rate_limited`.

`GET /capabilities` сообщает, можно ли писать (`write_allowed` /
`write_block_reason`), видна ли очередь (`can_see_queue`: `true` у
`editor` / `admin`), срез очереди (`editorial_queue_mode`: `all` у
`admin`, `granted` у editor с грантами, `none` у editor без грантов;
`has_editorial_grants`), можно ли предложить личное в общую
(`can_propose_to_rhizome`: сегодня `true` у роли `user`; `false` у
`editor` / `admin`, ТЗ **3.27** — грубый шлюз, не вечный ACL), лимиты и ссылки на личный граф и Differ.
`write_allowed` — договор автора и активная учётка, не «git подключён».
Плагин прячет всю панель «Предложить в ризому», если флаг `false`
(нет флага — прятать при роли `editor` / `admin`). **ТЗ 3.32:** ту же
строку в `file-menu` / `editor-menu` (регистрация в начале `onload`)
показывают `user` / флаг true / неизвестные capabilities; прячут только
известного `editor`/`admin`; заголовок без `.md` не прячет Markdown;
клик не вызывает `GET /differ` на весь список — передача одного пути,
затем `POST /proposals`. Очередь от флага
офера не зависит.

Пакет (`POST /transfers` … `commit`) применяется **целиком или никак** к
личному складу. `expected_version: null` — создать, только если пути нет.

**ТЗ 3.30 — ответ на «API покарточное?».** Эндпоинты — по карточке
(GET/PUT этот путь). Авторизация — **грант** в БД: `(user_id, card_path)`
**или** `(user_id, tag)` **или** `(user_id, path_prefix)` на каждый запрос.
Write, если прямой путь или любой тег карточки совпал или путь под
префиксом папки. Не ACL в markdown. Не «права живут на
карточке» как primary (3.24 сужен). Список, очередь, файл, sync — одна
функция гранта. Нет гранта → 404/403, не только скрытие в UI.
`PATCH /api/admin/users/{id}/editor-tags`: **смена 3.21** — пустой список
= нет дополнительной записи в общую, не вся очередь. Admin выдаёт
три формы через `GET/POST /api/admin/grants`, `DELETE /api/admin/grants/{id}`
(`kind=path|tag|prefix`). `GET /api/cards/{path}`
публичной общей — витрина гостя, не editorial grant. Write-grant —
право на **один серверный файл** (`shared_notes`); личное — невыданные
черновики; vault — клиент. **OPEN:** read-без-write для ревью очереди;
грант по исходному автору.
**Долг runtime:** две таблицы на один выданный путь;
сегодня общая после очереди — `POST /resolve`. **ТЗ 3.26:**
один плагин — runtime `obsidian-card-merge/` (очередь — capability
editor’а). `obsidian-plugin/` — leftover. Склейку кода в этой волне не
делать, если ещё не сделана.
Грант API и один плагин живут в SPEC **3.40** / MASTER (ADR-007
**superseded**).

Изменение API-контракта в ходе проектирования стадии допустимо без отдельного
ADR, если не меняет продуктовую модель или внешние интеграционные обязательства.
