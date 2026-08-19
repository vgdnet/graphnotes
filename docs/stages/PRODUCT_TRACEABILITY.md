# Product requirements to Stage traceability

Статус: DERIVED / MAINTAINED
Источник: `docs/product/PRODUCT_SPEC.md` version 1.3

Матрица маршрутизирует канонические требования в Stage-файлы и не изменяет
`PRODUCT_SPEC.md`.

## Product model and roles

| Requirement | Owning Stage | Acceptance evidence |
| --- | --- | --- |
| Exactly one shared rhizome | 3, 5, 6 | singleton Git binding; one shared revision pointer/API |
| Exactly one personal rhizome per user | 3, 4, 5, 6 | connected personal git remote and derived overlay |
| No workspace/multiple shared graphs | every Stage | absence of workspace entities/routes/IDs |
| No canonical note bodies in PostgreSQL | every Stage | Git/Markdown remains source of truth (ADR-008) |
| Markdown/Git source of truth | 4, 5, 7, 8 | committed Markdown, rebuild equivalence, no graph merge file |
| `user` outcome | 2, 4, 6, 7 | auth, take-from-shared, shared graph, proposal E2E |
| `editor` outcome | 2, 7, 8 | proposal queue, human diff, merge/rollback |
| `admin` outcome | 2, 5, 7, 9 | user/role/block management plus inherited editor/user rights and audited operations |
| Self-approval forbidden | 7 | editor/admin author negative tests |

## Functional requirements

| PRODUCT_SPEC section | Requirement group | Owning Stage |
| --- | --- | --- |
| 6.1 | UUID account, password hash, session, active state, global RBAC | 2 |
| 6.2 | one GitHub knowledge repository; connect personal git; public read allowed | 3 |
| 6.3 | take-from-shared; ZIP/MD fallback ingest | 4 |
| 6.4 | revisioned shared/personal/proposal derived index and rebuild | 5 |
| 6.5 | bounded shared Graph API, personal overlay, Cytoscape UI | 5, 6 |
| 6.6 | proposal queue, review, atomic publication, reconciliation, rollback | 7 |
| 6.6 | textual and graph impact before publication | 7, 8 |
| 6.7 | audit, history, idempotency and recovery | 2, 3, 5, 7, 9 |

## API ownership

| Endpoint group | Stage |
| --- | --- |
| auth, current user, admin user/role management | 2 |
| repository status/connect/webhook; personal git connect | 3 |
| take-from-shared; ZIP/MD fallback; read-only personal notes | 4 |
| personal/shared Graph API and rebuild | 5 |
| shared graph UI and personal overlay | 6 |
| proposals, decisions, rollback | 7 |
| proposal graph diff | 8 |
| operational/release controls | 9 |

## MVP acceptance criteria

| Criterion | Stage proving it |
| --- | --- |
| Register/login; no plaintext password | 2 |
| Global `user/editor/admin` hierarchy | 2 |
| Isolated connected personal git | 3, 4 |
| One shared rhizome readable (clone without account if public) | 3, 5, 6 |
| Take selected shared pieces into personal git | 4 |
| Safe MD/ZIP fallback committed to personal git | 4 |
| Links/tags/properties/unresolved projection | 4, 5 |
| Revision-linked rebuildable index; no note bodies in PostgreSQL | 5 |
| Shared graph + personal overlay UX | 6 |
| User creates proposal | 7 |
| Editor queue: approve/reject/return/rollback | 7 |
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
| Selected changes vs whole personal diff | before Stage 7 |
| Local overlay/provenance/visual states | Stage 6/8 UX finalization |
| How personal remote is connected (fork vs separate repo) | before Stage 3 implementation |
| Editing through graph | excluded unless new ADR before implementation |
| In-app Obsidian-class editor | excluded (ADR-008) |
| Real-time collaboration | post-MVP unless roadmap changes |

## Final completeness rule

`v0.1.0` запрещён, пока каждая MVP строка не имеет evidence в completion
artifact и итоговой Technical Observer matrix для exact release SHA.
