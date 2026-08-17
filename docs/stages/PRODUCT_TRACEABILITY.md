# Product requirements to Stage traceability

Статус: DERIVED / MAINTAINED
Источник: `docs/product/PRODUCT_SPEC.md` version 1.2

Матрица маршрутизирует канонические требования в Stage-файлы и не изменяет
`PRODUCT_SPEC.md`.

## Product model and roles

| Requirement | Owning Stage | Acceptance evidence |
| --- | --- | --- |
| Exactly one shared rhizome | 3, 5, 6 | singleton Git binding; one shared revision pointer/API |
| Exactly one personal rhizome per user | 3, 4, 5, 6 | UUID-owned Git state and derived personal layer |
| No workspace/multiple shared graphs | every Stage | absence of workspace entities/routes/IDs |
| Markdown/Git source of truth | 4, 5, 7, 8 | committed Markdown, rebuild equivalence, no graph merge file |
| `user` outcome | 2, 4, 6, 7 | auth, personal edit, shared read, proposal E2E |
| `editor` outcome | 2, 7, 8 | direct shared edit plus review/diff E2E |
| `admin` outcome | 2, 5, 7, 9 | user/role/block management plus inherited editor/user rights and audited operations |
| Self-approval forbidden | 7 | editor/admin author negative tests |

## Functional requirements

| PRODUCT_SPEC section | Requirement group | Owning Stage |
| --- | --- | --- |
| 6.1 | UUID account, password hash, session, active state, global RBAC | 2 |
| 6.2 | one GitHub repository, shared branch, one personal state per user | 3 |
| 6.3 | safe import and personal Markdown editing | 4 |
| 6.4 | revisioned shared/personal/proposal derived index and rebuild | 5 |
| 6.5 | bounded personal/shared Graph API and Cytoscape UI | 5, 6 |
| 6.6 | proposal, direct shared edit, review, atomic publication, reconciliation | 7 |
| 6.6 | textual and graph impact before publication | 7, 8 |
| 6.7 | audit, history, idempotency and recovery | 2, 3, 5, 7, 9 |

## API ownership

| Endpoint group | Stage |
| --- | --- |
| auth, current user, admin user/role management | 2 |
| repository status/connect/webhook | 3 |
| personal import/note CRUD | 4 |
| personal/shared Graph API and rebuild | 5 |
| personal/shared graph UI | 6 |
| proposals, decisions and editor/admin shared CRUD | 7 |
| proposal graph diff | 8 |
| operational/release controls | 9 |

## MVP acceptance criteria

| Criterion | Stage proving it |
| --- | --- |
| Register/login; no plaintext password | 2 |
| Global `user/editor/admin` hierarchy | 2 |
| Isolated editable personal rhizome | 3, 4 |
| One shared rhizome readable by users | 3, 5, 6 |
| Safe MD/ZIP import committed to personal Git state | 4 |
| Links/tags/properties/unresolved projection | 4, 5 |
| Revision-linked rebuildable index | 5 |
| Personal/shared graph UX | 6 |
| User creates proposal | 7 |
| Editor/admin direct shared editing | 7 |
| Editor/admin sees textual and graph impact | 7, 8 |
| Editor/admin approves/rejects/returns with reason | 7 |
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
| Local graph depth/provenance/visual states | Stage 6/8 UX finalization |
| Editing through graph | excluded unless new ADR before implementation |
| Real-time collaboration | post-MVP unless roadmap changes |

## Final completeness rule

`v0.1.0` запрещён, пока каждая MVP строка не имеет evidence в completion
artifact и итоговой Technical Observer matrix для exact release SHA.
