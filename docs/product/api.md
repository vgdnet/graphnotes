<!-- Раздел канонического ТЗ. Оглавление: docs/product/PRODUCT_SPEC.md -->

## 7. Черновой контракт API MVP

Точные схемы, коды ошибок и авторизация определяются стадиями. Следующие маршруты
фиксируют продуктовую поверхность, но не требуют преждевременной реализации.

```text
POST /api/auth/register                # SMTP on: 201, no session; letter has #/auth/confirm?token= + code
POST /api/auth/login                    # username or email + password
GET  /api/auth/mail-status              # { configured, code_ttl_minutes } — no SMTP secrets
POST /api/auth/email/request            # identifier = login or email (field email still accepted); purpose confirm|login|reset; letter only to stored account email; 204 always if SMTP on (no existence leak); 503 if SMTP off
GET  /api/installation/start-card       # { path } or path null — admin-set start card for /card
POST /api/auth/email/verify             # confirm or login by code/token
POST /api/auth/password/reset           # new password + reset code/token; 503 if SMTP off
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/users/me
PATCH /api/users/me                 # settings: display_name, email, phone, telegram,
                                    # notify_queue_email, notify_queue_telegram, …
GET  /api/author/contract           # public Russian copy (version, WTFPL/AGPL)
GET  /api/users/me/author-contract  # same copy while signed in
POST /api/users/me/author-contract  # accept current contract version
POST /api/users/me/author-contract/withdraw

GET  /api/repository/status

POST /api/personal/connect          # from account settings, not the graph home
POST /api/personal/import-md          # .md/ZIP into the local personal store
GET  /api/personal/notes              # read-only index of the local personal store
GET  /api/personal/notes/{id}
PUT  /api/personal/notes/{path}       # own personal only; source + expected_hash;
                                    # local store; author contract;
                                    # existing path only (404 missing, 409 stale)
GET  /api/personal/uploads            # upload history: who / when / path / hash

GET  /api/differ                      # one-way personal → published shared;
                                      # connected git: refresh public HEAD first
GET  /api/contributions/me            # author's notes, links, proposals, counts; derived
                                      # editor/admin also receive own review stats
GET  /api/users/{id}/card             # public person card: achievements + accepted notes;
                                      # not personal/closed bodies; not /user settings
GET  /api/admin/contributions         # admin only: same stats for every account
GET  /api/admin/users                 # list/search/filter; last login, sessions
POST /api/admin/users                 # admin creates an account
GET  /api/admin/audit                 # admin only: filterable action log
POST /api/admin/users/{id}/password   # admin sets a new password; never echoed
POST /api/admin/users/{id}/sessions/revoke
GET  /api/admin/operator              # health + SMTP status + public site URL, no secrets
PUT  /api/admin/operator              # persist public site URL (mail links); survives rebuild
POST /api/admin/mail/test             # operator test send; 503 if SMTP off

GET  /api/graph/shared                # start page; no login; public published layer only; no card bodies;
                                      # optional center+depth 0–4 = local graph (unknown center ≠ first page)
GET  /api/public/embed/{user_id}      # opt-in achievement: graph snippet and/or counts; no ZIP/bodies; fields TBD (§6.1.4)
GET  /api/search                      # default layer=visible: role-scoped corpus;
                                      # hits include layer (shared/personal/proposal);
                                      # overlay/personal/shared remain for graph highlight;
                                      # guest = public hits, no bodies
GET  /api/cards/{path}                # card GET; personal:{path}, personal:{uuid}:{path}
                                      # (admin), proposal:{id}:{path} (author/editor/admin);
                                      # write is PUT /personal/notes/{path}, not this route
GET  /api/cards/{path}/feed           # card history; shared = owner null; own personal
                                      # = caller; admin personal:{uuid}: = that owner;
                                      # proposal empty; no Markdown bodies
GET  /api/graph/personal              # ваша личная ризома; caller's full indexed personal tree;
                                      # optional center+depth (personal:{path} stripped)
GET  /api/graph/personal-overlay      # ваша часть ризомы: shared page + personal notes that wikilink into it;
                                      # local graph: center may be personal:{path} for overlay-only nodes
POST /api/index/rebuild               # admin, Stage 5
GET  /api/graph/diff?proposal_id=...  # Stage 8 structural view of Differ/proposal

POST /api/proposals
GET  /api/proposals
GET  /api/proposals/{id}              # file diffs include proposed Markdown body
POST /api/proposals/{id}/approve
POST /api/proposals/{id}/reject
POST /api/proposals/{id}/request-changes
POST /api/proposals/{id}/rollback

POST /api/webhooks/github
```

Изменение API-контракта в ходе проектирования стадии допустимо без отдельного
ADR, если не меняет продуктовую модель или внешние интеграционные обязательства.
