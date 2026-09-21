# Product requirements to Stage traceability

Статус: DERIVED / MAINTAINED
Источник: `docs/product/PRODUCT_SPEC.md` version 3.40

Матрица маршрутизирует канонические требования в Stage-файлы и не изменяет
`PRODUCT_SPEC.md`.

## Product model and roles

| Requirement | Owning Stage | Acceptance evidence |
| --- | --- | --- |
| Exactly one shared rhizome | 3, 5, 6 | singleton Git binding; one shared revision pointer/API |
| Exactly one personal rhizome per user | 3, 4, 5, 6 | hosted store; git/plugin copy-in; derived overlay |
| No workspace/multiple shared graphs | every Stage | absence of workspace entities/routes/IDs |
| Published shared working copy is local (`shared_notes`); Differ is the write gate; `note_index` has no bodies | every Stage | Markdown remains source of truth; plugin ingest (TZ **3.35** / **3.37**) |
| Markdown source of truth | 4, 5, 7, 8 | hosted stores + plugin; leftover git copy-in; rebuild equivalence, no graph merge file |
| `user` outcome | 2, 6, 7, next wave | auth, shared graph, Differ, proposal E2E; no ZIP/clone of published shared; author contribution view |
| `editor` outcome | 2, 7, 8, next wave | proposal queue, human diff, author notes/links, merge/rollback |
| `admin` outcome | 2, 5, 7, 9 | user/role/block/password-set on «Администрирование» → «Пользователи»; action log in GraphNotes DB, admin-readable; inherited editor/user rights |
| Self-approval forbidden | 7 | editor/admin author negative tests |
| Author as unit of contribution; provenance on notes/links | next wave (owner Stage file; not Stage 9) | author sees notes, links, personal/proposed/accepted; empty Differ does not erase accepted work |
| No note bodies in PostgreSQL for author history | every Stage | Git/store remains canonical text; provenance is derived |
| 5.4 Author status; legal contract; commenter tier; closed-segment visibility model | next wave (owner Stage file; requires ADR if security/permission boundary changes) | contract checkbox enables author status; author profile; commenter tier; visibility rules for closed segments |
| 5.4.1 Closed/paid access level in personal store only (mark paths; no second repo); shared shows lock stub not body | next wave + ADR-016 | not in Differ; no product ZIP/clone of shared; author card sees closed; shared graph lock |
| 5.4.2 Per-user contribution stats: self only on `/contribution`; public `#/users/{login}` achievements; editor review stats; admin sees all | 6, next wave | user: cards/added/accepted/links; public: proposals/created/edits; editor: which proposals/links decided; admin: all users |
| 5.6 Start = shared graph always; guest reads published shared cards; author=user login; closed slice not editor queue; access-level entitlement; admin sees closed | 6 + next wave + ADR-016 | guest graph + published card; session opens own/closed in filter |
| 5.6.4 «Два графа» = shared + own overlay on one graph; «ризома автора» = closed-slice view after entitlement; «загрузить» = open in-app | next wave + ADR-016 amendment 2026-09-05 | same `closed_paths`; no second repo/index/ZIP; open-personal-as-public not accepted |

## Functional requirements

| PRODUCT_SPEC section | Requirement group | Owning Stage |
| --- | --- | --- |
| 6.1 | UUID account, password hash, session, active state, global RBAC | 2 |
| 6.1.2 | SMTP: register sends `#/auth/confirm?token=` + 6-digit code; no session until confirm; Login tab «Войти письмом» (TZ 2.81) | 2 |
| 5.5 | Account settings: required email; optional phone/Telegram; author contract; Obsidian plugin token; **no** «Свой git» tab (TZ **3.38**); chrome: name in header opens settings, logout at bottom | shipped cabinet without git connect; leftover `/api/personal/connect`; token TZ 2.68–2.76 |
| 5.5.4 | Light/dark Theme Switcher (sliding sun/moon pill, not text buttons); localStorage | 6 (graph UX) |
| 5.6 | Start graph always (`/graph` = rhizome by default; no «Мой граф» / `/my_graph`, TZ 3.00); guest reads published shared cards + side local graph; closed slice not editor queue; access-level entitlement (ADR-016) | 6 |
| 5.6.4 | Two graphs = overlay filter; author view of closed slice; load = open in app; not a second repo | next wave |
| 5.6.5 | Write grants in shared DB (TZ 3.21 / **3.30** / **3.33**): `(user_id, card_path)` or `(user_id, tag)` or `(user_id, path_prefix)`; eval per request; **empty-list change:** empty = no extra shared write, not whole queue; editor empty → UI «Нет грантов»; admin bypasses queue filter; same primitive for editor slice and user N-cards; **one server file NOW**; personal = ungranted drafts; vault = client; admin «Доступы» search-by-nick / card list / tag list | `access_grants` + admin CRUD + catalog `?q=` this wave; two-table copies leftover |
| 5.6.6 | Personal store = ungranted drafts; shared lives **apart** from every account (TZ 3.30 rejects «editor account is the rhizome» and «three copies then collapse»); TZ **3.25** two operations after accept onto the **same** server file; one plugin TZ **3.26**; do not dump the whole rhizome | vault-first Save & Resolve + plugin `GET/PUT /granted*` this wave; two-table copies leftover |
| 5.6.7 | Card API + DB grant `(user, path)` or `(user, tag)` or `(user, prefix)` (TZ **3.30** narrows 3.24); missing grant → 404/403; Differ = ungranted publish gate; write-grant = right on one shared file; OPEN: read-without-write for queue; OPEN: grant by original author | grant filter shipped; two-table copies leftover; needs ADR |
| 6.1.1 | Author legal contract in Settings only (§5.5.3); About `#/about` is credits, not contract (§5.5.8 / TZ 2.78) | shipped copy on feature/08-graph-diff |
| 6.1.3 | vsepsy.ru email+password opens rhizome.vsepsy.ru; no second register; no catalog merge; no /ops roles | next wave + ADR (identity) |
| 6.1.4 | Opt-in rhizome achievement (graph and/or counts) for vsepsy.ru and own site; card fields for the public internet TBD | next wave + ADR |
| 5.3 | Admin-only tab «Администрирование»: «Пользователи» (search by nick, rights on the row, roles, block, set password), «Доступы» (search lists of cards/tags, TZ 3.33), journal | 2 |
| 17.5 | Invite map page `#/invites` (`http://172.16.13.14:8080/#/invites`); Code Writer deploys to rhizome-test; `invited_count`; currently admin (TZ 2.98) | 2 |
| 13.4 | Product TZ → technical TZ → rhizome-test (TZ 2.99); do not deploy first | process |
| 5.3.1 | Admin sets a new password for any account; plaintext never stored/logged; sessions of target end | 2 |
| 5.4.2 | User sees own contribution stats; public person card `#/users/{login}` with achievement counters; TZ 3.34 proposed-edit list (path, volume, state) | 6 |
| 6.4.1 | Card «История правок» on demand (TZ 2.94 / 3.34): last 30 revisions + text diff; **proposer** of the edit (not only accepter); actor name opens `#/users/{login}`; `rhizome_events` stay body-less for contribution | 6 |
| 6.2 | local personal + shared stores; plugin ingest (TZ **3.35** / **3.37**); leftover git host unfinished; no product clone/ZIP of shared | leftover |
| 6.3 | no download of published shared; personal working copy is GraphNotes store; plugin writes `.md`; leftover git copy-in TZ 3.35 | plugin, 7 (Differ vs local copy) |
| 6.3.4 / 5.5.7 | GraphNotes Publisher + API: **free** copy of the local graph into the same personal store (TZ 2.90: queue locally; write on sidebar ItemView «Передать правки на сервер» / ribbon paper-plane / file close / idle minutes / interval, not every keystroke; first dump = send all); after copy, sidebar lists outbound Differ and «Предложить в ризому» creates a proposal (TZ 3.20); TZ **3.32** file-explorer / editor context menu proposes **one** markdown path (sync that file, then POST /proposals; user Bearer `gnp_`, no login/password; editor 403); personal API key stored and shown again in Settings, copied into plugin `data.json` (TZ 2.76); access log / revoke; not `shared_notes` | plugin write triggers 2.90; token/API shipped 2.79; offer list 3.20; file-menu 3.32 |
| 6.3.2 | Graph personal overlay: from GraphNotes store (plugin); layer menu/legend «ваша ризома», never «ваш git» | 6 |
| 6.3.1 | Upload history in GraphNotes (who/when/hash), not user git log | next wave |
| 6.4 | revisioned shared/personal/proposal derived index and rebuild | 5 |
| 6.5 | bounded shared Graph API, personal overlay, local ego-graph view (весь / локальный, depth 1–4, «Показать всё»), Cytoscape UI, **fCoSE** live layout, Obsidian-like canvas settings (TZ **3.39**: tags/orphans, groups, display, forces; `localStorage`); TZ **3.41** test tab `#/graph-test` Pixi+d3-force, same Graph API, not a second canvas canon | 5, 6 |
| 6.5.2 | `#/search` role-scoped search; `#/card/{path}` **read-only** (TZ 2.93: no website editor until reverse sync); `#/users/{login}` person card | 6, 7, 8 |
| 6.5.3 | Elasticsearch next search (ADR-015); SQL until then; questions 1–9 unanswered (TZ 2.83) | **only after the first approved rhizome production deploy**; not this branch |
| 16 | Guest anti-scrape of published cards (1 IP → many unique paths); after `rhizome` prod only; not `rhizome-test` (TZ 2.80) | after first production deploy; ADR before code |
| 17 | Invite email link; no Register tab; person card «Приглашен %date% по приглашению от @user»; same on vsepsy.ru (TZ 2.85–2.87) | shipped on rhizome-test (TZ 2.89); Alembic 0020 attributes existing accounts except efimov to @efimov |
| 6.6 | Differ entity; outbound personal → shared (TZ 3.11) and inbound shared → personal for previously published paths (TZ 3.13); `#/differ`; not merge; local stores only (TZ **3.35**) | 7 |
| 6.6 | Leftover git poller/webhook: not canon (TZ **3.35**). Differ **list** reads store hashes (TZ **3.31**) | leftover |
| 6.6.2 | Author contribution; Differ extended, not replaced; three states personal/proposed/accepted | next wave |
| 6.6.3 | Differ lists personal → shared **path/hash** diffs (TZ **3.31**, no bodies/git on list) and itself offers personal cards missing from shared; chrome tab `#/differ` proposes (TZ 3.11); plugin sidebar may propose the same outbound list after personal copy (`GET /api/differ?include_inbound=false`, TZ 3.20 / 3.31); inbound watch of already-published paths (TZ 3.13 / §6.6.5); Card Merge editor queue does not read author Differ (3.04–3.07 withdrawn); plugin does not write `shared_notes` (TZ 2.82 / 2.88 / 3.20) | shipped outbound list + propose on site and plugin; leftover UI still on `#/offer` + «Текст сверки» |
| 6.6.4 | Same plugin sidebar: editor access = website `/queue` New tab via `GET /api/proposals` shown when Obsidian opens (TZ 3.10 / 3.12 / 3.16 / 3.17 / 3.18 / 3.19 / **3.25** / **3.26**); no editor access → queue UI off; queue of **others’** edits through editor; one card in work; `GET /proposals/{id}/files/{path}` → `{path,before,body}` into work-cache scratchpad; Save & Resolve is **not** `POST /resolve`; TZ **3.25** two operations: (1) always write accepted `.md` into local vault and **open that local note** (`createLeafBySplit` / `getLeaf(true)`; never MergeView; accept unfinished if write fails); (2) update rhizome store from editor account only if local ≠ store (Differ write gate; skip if same); siblings stay on the open proposal (3.18); manual editor edit = same sync as participant | shipped in `obsidian-card-merge/` (sync + offer + queue); leftover `OpenMergeModal` still GETs `/differ`; leftover catalog `obsidian-plugin/` | |
| 6.6.5 | Inbound Differ: watched accepted-proposal paths; `#/differ` «Из ризомы»; accept copies published shared → personal store; hide same path from outbound (TZ 3.13); one Settings toggle «Получать уведомления об изменениях в карточках, которые вы правили» (TZ 3.15, `notify_card_changes`) | TZ only; ADR-009 superseded |
| 6.6.6 | Card API + grant canon (TZ **3.30** narrows 3.24); **one plugin canon (TZ 3.26)**; editor-slice and user N-cards are one primitive; path/tag/prefix; one server file NOW; `obsidian-plugin/` leftover | `access_grants` + Доступы + plugin `/granted*` this wave; two-table copies leftover; needs ADR |
| 6.5 | Author focus «мой вклад» and provenance on shared graph | next wave (after 6 overlay) |
| 6.7 | proposal queue tabs New / In progress / Rejected; text and links first, then Graph Diff; reject/return with author comment | 7, 8 |
| 6.7 | textual and graph impact before publication | 7, 8 |
| 6.8 | Action log in GraphNotes DB (admin-readable); no passwords/tokens; history, idempotency, recovery | 2, 3, 5, 7, 9 |
| 7 | API MVP surface including personal ingest and Obsidian plugin personal transfer | 2–8 |

## API ownership

| Endpoint group | Stage |
| --- | --- |
| auth, current user, admin user/role/password-set, admin action log | 2 |
| account settings: email (required), phone/telegram optional, author contract | next wave (2 if register already collects email) |
| repository status/connect/webhook; personal git connect from settings | 3 |
| take-from-shared (historical); ZIP/MD fallback into personal git | 4 |
| Differ outbound + inbound accept; leftover pair `GET /differ/files/{path}`; proposals + `{id}/files/{path}` + `resolve` | 7 |
| author contribution / provenance | next wave |
| personal/shared Graph API and rebuild | 5 |
| search cards; card page payload; on-demand revisions (`GET /api/cards/{path}/revisions`) | 6 |
| shared graph UI and personal overlay | 6 |
| proposals, decisions, rollback | 7 |
| proposal graph diff | 8 |
| operational/release controls | 9 |
| Obsidian plugin personal transfer (`/api/integrations/obsidian/v1`, token CRUD) | 8 (TZ 2.68–2.76); personal store only |

## MVP acceptance criteria

| Criterion | Stage proving it |
| --- | --- |
| Register/login with required email; no plaintext password | 2 |
| rhizome.vsepsy.ru: vsepsy.ru email+password login without second register; no catalog/hash migration | next wave + ADR |
| Admin sets any user's password; target sessions end; event in DB log | 2 |
| Action log in GraphNotes DB; admin can read; no secrets in records | 2 |
| Global `user/editor/admin` hierarchy | 2 |
| Isolated connected personal git | 3, 4 |
| One shared rhizome readable in-app (graph/cards/Markdown); no product ZIP/clone of corpus | 3, 5, 6 |
| No GraphNotes write of selected shared notes into personal git; no ZIP download of shared | 7; Stage 4 take-from-shared historical only |
| Website MD/ZIP upload UI off (TZ 2.96); plugin writes store; future upload API must sync to local store; last 30 versions for rollback; index/graph/Differ = latest only | 4 |
| White-noise personal ingest rejected; account locked; admins mailed; existing notes kept (TZ 2.67) | 4 |
| User creates proposal from Differ selection | 7 |
| Differ git input is the latest pulled public HEAD | 7 |
| Author contribution: wrote / linked / proposed / accepted; empty Differ keeps accepted | next wave |
| Links/tags/properties/unresolved projection | 4, 5 |
| Revision-linked rebuildable index; no note bodies in PostgreSQL | 5 |
| Shared graph + personal overlay UX; fCoSE live layout; Obsidian-like `#/graph` settings (TZ **3.39**) | 6 |
| Editor queue: tabs New / In progress / Rejected; text then Graph Diff; comment on reject/return | 7, 8 |
| Editor sees textual and graph impact | 7, 8 |
| Author cannot self-approve | 7 |
| Shared publication is atomic to readers | 7 |
| Shared index reaches merged SHA | 7 |
| No parallel canonical graph file | 5, 8 |
| Security/migration/backup/deployment gates | every Stage; final proof 9 |

## Non-functional requirements

| Requirement | Owning Stage(s) |
| --- | --- |
| Authentication, role and personal ownership enforcement | 2, then every protected Stage |
| No secrets in Git/API/logs | every Stage; final scan 9 |
| Traversal/archive-bomb protection | 4 |
| Verified/idempotent webhook and reconciliation | 3, 7 |
| Least-privilege leftover git-host credentials | leftover |
| Git wins over derived index | 5, 7, 8 |
| Migration testing | every DB Stage; final rehearsal 9 |
| Persistent DB and verified backup/restore | 1, 9 |
| Audit actor/role/layer/proposal/revision | 2, 3, 5, 7, 9 |
| Bounded subgraphs and pagination | 5, 6, 8 |
| Incremental re-index and scale baseline | 5, 8, 9 |
| Proposal/history retention and recovery | 7, 9 |

## Open decisions

| Question | Latest decision point |
| --- | --- |
| Selected changes vs whole personal diff | Differ subset (ADR-009); closed |
| Take-from-shared vs ZIP download | neither: no file takeaway of published shared (PRODUCT_SPEC 2.5); ADR still required |
| Local overlay/provenance/visual states | provenance accepted in PRODUCT_SPEC 2.0; next wave + ADR |
| Author as unit of contribution; Differ extended | owner decision 2026-08-29; ADR still required |
| How personal remote is connected (fork vs separate repo) | **Withdrawn TZ 3.35.** Ingest is the Obsidian plugin. Historical fixture leftover |
| Editing through graph | excluded unless new ADR before implementation |
| In-app Obsidian-class editor | excluded (SPEC **3.40** / MASTER; ADR-008 superseded) |
| Real-time collaboration | post-MVP unless roadmap changes |
| Which author/psychologist card fields are world-visible (achievement/embed) | PRODUCT_SPEC 2.21 §6.1.4: skeleton accepted, field list open |
| Elasticsearch next-search questions 1–9 (§6.5.3) | When is closed (TZ 2.83): **only after the first approved rhizome production deploy**. Answers 1–9 stay open; do not invent. SQL until then |
| Open personal repo as a public catalog (search/find/comment by everyone, bypassing editor queue) | Not accepted. PRODUCT_SPEC 2.41 §5.6.4 / §12.9; needs owner decision + ADR vs ADR-007 / §3.3 |
| Editor accept line compare (Wikipedia two-column / one-column) | Closed TZ 3.02 for `/queue` (and the same proposal body). Author Differ line UX still open (§12.10) |
| Editor accept engine is MediaWiki wikidiff2 | Closed TZ 3.03 / ADR-018 amendment. Not `difflib`. Canon runtime: pinned wikidiff2 C++ 1.14.2 as a native helper (shipped 2026-09-21). `php-cli` / `php-wikidiff2` leave this path only. |
| Queue accordion + buttons under each card | Closed TZ 3.08. One proposal, one card body. Buttons still decide the whole proposal |
| Merge Publisher + Card Merge into one plugin | **Closed TZ 3.26 / 3.27 runtime 2026-09-16:** `obsidian-card-merge/` is the one client (participant sync; offer gated by `can_propose_to_rhizome`; editor queue gated by `can_see_queue`). `obsidian-plugin/` leftover catalog. Grant API lives in MASTER; ADR-007 superseded. |
| Editor local copy of accepted cards | Closed TZ 3.25 / **3.30**: two operations after accept onto the **same** server file, not one «Save & Resolve = POST shared». (1) Always write the accepted file to the editor local vault; opening is that local note; if write fails, accept is unfinished. (2) Update the rhizome store from the editor account only if local ≠ store; skip if same. Differ stays the ungranted shared write gate. GraphNotes stays the canonical shared store. TZ 3.22 narrowed (no corpus dump / no second canonical rhizome). **Shipped:** vault-first; POST `/resolve` second if local ≠ store. |
| Per-card display API + card rights | TZ **3.24** narrowed by **3.30**: endpoints per card; authorization is DB grant `(user, path)` / `(user, tag)` / `(user, prefix)`, not «rights live on the card». Grant filter / `access_grants` this wave. ADR-007 **superseded**. Open (next stage): verbs; paid maker vs user/editor; ADR-016 vs grant; read-without-write for queue; grant-write to already-shared; grant by original author. |

## Final completeness rule

`v0.1.0` запрещён, пока каждая MVP строка не имеет evidence в completion
artifact и итоговой Technical Observer matrix для exact release SHA.
