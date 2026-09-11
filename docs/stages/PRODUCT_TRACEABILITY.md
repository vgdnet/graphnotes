# Product requirements to Stage traceability

Статус: DERIVED / MAINTAINED
Источник: `docs/product/PRODUCT_SPEC.md` version 2.76

Матрица маршрутизирует канонические требования в Stage-файлы и не изменяет
`PRODUCT_SPEC.md`.

## Product model and roles

| Requirement | Owning Stage | Acceptance evidence |
| --- | --- | --- |
| Exactly one shared rhizome | 3, 5, 6 | singleton Git binding; one shared revision pointer/API |
| Exactly one personal rhizome per user | 3, 4, 5, 6 | hosted store; git/plugin copy-in; derived overlay |
| No workspace/multiple shared graphs | every Stage | absence of workspace entities/routes/IDs |
| Published shared working copy is local after copy-in; Differ is the write gate; `note_index` has no bodies | every Stage | Markdown remains source of truth; GitHub is connector (TZ 2.63) |
| Markdown source of truth | 4, 5, 7, 8 | hosted stores + git copy-in, rebuild equivalence, no graph merge file |
| `user` outcome | 2, 6, 7, next wave | auth, shared graph, Differ, proposal E2E; no ZIP/clone of published shared; author contribution view |
| `editor` outcome | 2, 7, 8, next wave | proposal queue, human diff, author notes/links, merge/rollback |
| `admin` outcome | 2, 5, 7, 9 | user/role/block/password-set on «Администрирование» → «Пользователи»; action log in GraphNotes DB, admin-readable; inherited editor/user rights |
| Self-approval forbidden | 7 | editor/admin author negative tests |
| Author as unit of contribution; provenance on notes/links | next wave (owner Stage file; not Stage 9) | author sees notes, links, personal/proposed/accepted; empty Differ does not erase accepted work |
| No note bodies in PostgreSQL for author history | every Stage | Git/store remains canonical text; provenance is derived |
| 5.4 Author status; legal contract; commenter tier; closed-segment visibility model | next wave (owner Stage file; requires ADR if security/permission boundary changes) | contract checkbox enables author status; author profile; commenter tier; visibility rules for closed segments |
| 5.4.1 Closed/paid access level in personal store only (mark paths; no second repo); shared shows lock stub not body | next wave + ADR-016 | not in Differ; no product ZIP/clone of shared; author card sees closed; shared graph lock |
| 5.4.2 Per-user contribution stats: self only on `/contribution`; public `#/users/{uuid}` achievements; editor review stats; admin sees all | 6, next wave | user: cards/added/accepted/links; public: proposals/created/edits; editor: which proposals/links decided; admin: all users |
| 5.6 Start = shared graph always; guest reads published shared cards; author=user login; closed slice not editor queue; access-level entitlement; admin sees closed | 6 + next wave + ADR-016 | guest graph + published card; session opens own/closed in filter |
| 5.6.4 «Два графа» = shared + own overlay on one graph; «ризома автора» = closed-slice view after entitlement; «загрузить» = open in-app | next wave + ADR-016 amendment 2026-09-05 | same `closed_paths`; no second repo/index/ZIP; open-personal-as-public not accepted |

## Functional requirements

| PRODUCT_SPEC section | Requirement group | Owning Stage |
| --- | --- | --- |
| 6.1 | UUID account, password hash, session, active state, global RBAC | 2 |
| 6.1.2 | SMTP: register sends `#/auth/confirm?token=` + 6-digit code; no session until confirm | 2 |
| 5.5 | Account settings: required email; optional phone/Telegram; git; author contract; Obsidian plugin token; chrome: name in header opens settings, logout at bottom | next wave; email at register; token TZ 2.68–2.76 |
| 5.5.4 | Light/dark Theme Switcher (sliding sun/moon pill, not text buttons); localStorage | 6 (graph UX) |
| 5.6 | Start graph always; guest reads published shared cards + side local graph; closed slice not editor queue; access-level entitlement (ADR-016) | 6 |
| 5.6.4 | Two graphs = overlay filter; author view of closed slice; load = open in app; not a second repo | next wave |
| 6.1.1 | Author legal contract in Settings only (§5.5.3); About `#/about` is credits, not contract (§5.5.8 / TZ 2.78) | shipped copy on feature/08-graph-diff |
| 6.1.3 | vsepsy.ru email+password opens rhizome.vsepsy.ru; no second register; no catalog merge; no /ops roles | next wave + ADR (identity) |
| 6.1.4 | Opt-in rhizome achievement (graph and/or counts) for vsepsy.ru and own site; card fields for the public internet TBD | next wave + ADR |
| 5.3 | Admin-only tab «Администрирование»: «Пользователи» (roles, block, set password) and action log | 2 |
| 5.3.1 | Admin sets a new password for any account; plaintext never stored/logged; sessions of target end | 2 |
| 5.4.2 | User sees own contribution stats; public person card `#/users/{uuid}` with achievement counters | 6 |
| 6.2 | local personal + shared stores; GitHub copy-in (TZ 2.63); leftover merge-out; no product clone/ZIP of shared | 3 |
| 6.3 | no download of published shared; personal working copy is GraphNotes store; git/Dropbox/Drive = copy-in, not a second canon | 4 (upload copies in), 7 (Differ vs local copy) |
| 6.3.4 / 5.5.7 | GraphNotes Publisher (this repo) + API copy selected vault files into the same personal store; personal API key stored and shown again in Settings, copied into plugin `data.json` (TZ 2.76); access log / revoke; not shared, not Differ | 8 (TZ 2.68–2.76) |
| 6.3.2 | Graph personal overlay: from git if connected else server store; layer menu/legend «ваша ризома», never «ваш git» | 6 |
| 6.3.1 | Upload history in GraphNotes (who/when/hash), not user git log | next wave |
| 6.4 | revisioned shared/personal/proposal derived index and rebuild | 5 |
| 6.4.1 | Rhizome card change stats (who/when/which link); actor name opens `#/users/{uuid}`; personal in-app edits owner-scoped; no bodies in PostgreSQL | 6 |
| 6.5 | bounded shared Graph API, personal overlay, local ego-graph view (весь / локальный, depth 1–4, «Показать всё»), Cytoscape UI, **fCoSE** live layout | 5, 6 |
| 6.5.2 | `#/search` role-scoped search; `#/card/{path}` view-first; `#/users/{uuid}` person card; own personal edit after «Отредактировать карточку» | 6, 7, 8 |
| 6.6 | Differ entity; one-way personal → published shared; merge-into-shared rules | 7 |
| 6.6 | Connected git: Differ/proposal read **current public HEAD** (Obsidian push); poller/webhook backup; no second clone | 7 |
| 6.6.2 | Author contribution; Differ extended, not replaced; three states personal/proposed/accepted | next wave |
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
| Differ; proposals; connected git HEAD refresh on GET /differ; no shared ZIP archive UX | 7 |
| author contribution / provenance | next wave |
| personal/shared Graph API and rebuild | 5 |
| search cards; card page payload; card feed (`GET /api/cards/{path}/feed`) | 6 |
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
| Safe MD/ZIP upload (≤10 000 ZIP members; zip-bomb size/ratio guards); never into connected git | 4 |
| White-noise personal ingest rejected; account locked; admins mailed; existing notes kept (TZ 2.67) | 4 |
| User creates proposal from Differ selection | 7 |
| Differ git input is the latest pulled public HEAD | 7 |
| Author contribution: wrote / linked / proposed / accepted; empty Differ keeps accepted | next wave |
| Links/tags/properties/unresolved projection | 4, 5 |
| Revision-linked rebuildable index; no note bodies in PostgreSQL | 5 |
| Shared graph + personal overlay UX; fCoSE live layout | 6 |
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
| Least-privilege GitHub credentials | 3, 9 |
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
| How personal remote is connected (fork vs separate repo) | separate GitHub repo (2026-08-19); first fixture `vgdnet/guide_psy` for user `efimov` |
| Editing through graph | excluded unless new ADR before implementation |
| In-app Obsidian-class editor | excluded (ADR-008) |
| Real-time collaboration | post-MVP unless roadmap changes |
| Which author/psychologist card fields are world-visible (achievement/embed) | PRODUCT_SPEC 2.21 §6.1.4: skeleton accepted, field list open |
| Open personal repo as a public catalog (search/find/comment by everyone, bypassing editor queue) | Not accepted. PRODUCT_SPEC 2.41 §5.6.4 / §12.9; needs owner decision + ADR vs ADR-007 / §3.3 |

## Final completeness rule

`v0.1.0` запрещён, пока каждая MVP строка не имеет evidence в completion
artifact и итоговой Technical Observer matrix для exact release SHA.
