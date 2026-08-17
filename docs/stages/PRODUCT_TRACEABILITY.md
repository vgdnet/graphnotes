# Product requirements to Stage traceability

Статус: DERIVED / MAINTAINED
Источник: `docs/product/PRODUCT_SPEC.md` version 1.0

Эта таблица маршрутизирует канонические продуктовые требования в исполнимые
Stage-файлы. Она не изменяет `PRODUCT_SPEC.md`.

## Principles and roles

| Product requirement | Owning Stage | Acceptance evidence |
| --- | --- | --- |
| Markdown/Git is source of truth | 4, 5, 7, 8 | committed Markdown, rebuild equivalence, no canonical graph file |
| Personal/shared layers | 3, 5, 6 | Git state mapping, indexed layer, isolated UI/API |
| GitHub hidden behind product UX | 3, 7 | backend GitHub App operations, user-facing workflow |
| Graph is not security boundary | 3, 5, 6, 8 | backend workspace/owner authorization negatives |
| User role outcome | 2, 4, 6, 7 | auth + import + graph + proposal E2E |
| Editor role outcome | 3, 7, 8 | membership + review/decision + diff E2E |
| Admin role outcome | 2, 3, 5, 9 | user/role/blocking management, repository binding, rebuild, operations audit |

## Functional requirements

| PRODUCT_SPEC section | Requirement group | Owning Stage |
| --- | --- | --- |
| 6.1 | UUID user, username/password, hash, session, inactive user, roles | 2 |
| 6.2 | workspace ↔ GitHub resource, branches/state, App operations, SHA/status | 3 |
| 6.3 | safe MD/ZIP import, parsing, unresolved links, Git commit, report | 4 |
| 6.4 | note/link/tag/sync derived index and rebuildability | 5 |
| 6.5 | personal/shared Graph API and Cytoscape visualization | 5, 6 |
| 6.6 | proposal, textual review, PR/merge, conflict, re-index | 7 |
| 6.6 | graph consequences before merge | 8 |
| 6.7 | business audit, idempotent webhook, manual rebuild | 3, 5, 7, 9 |

## API ownership

| Endpoint group | Stage |
| --- | --- |
| `/api/auth/*`, `/api/users/me` | 2 |
| workspaces, repository status, initial webhook receiver | 3 |
| upload, notes list/detail | 4 |
| personal/shared Graph API | 5 |
| graph UI consuming Graph API | 6 |
| proposals, approve/reject, merge reconciliation | 7 |
| graph diff endpoint and preview | 8 |
| operational/health/release controls | 9 |

## MVP acceptance criteria

| Criterion from PRODUCT_SPEC §8 | Stage that proves it |
| --- | --- |
| Register/login; plaintext password absent | 2 |
| Isolated editable personal Markdown state | 3, 4 |
| Safe `.md`/ZIP import committed to Git | 4 |
| Wikilinks, Markdown links, tags, unresolved links | 4, 5 |
| Index tied to Git revision and rebuildable | 5 |
| Personal graph | 6 |
| Accessible shared graph | 6 |
| User creates proposal | 7 |
| Editor sees textual diff | 7 |
| Editor sees graph diff/preview | 8 |
| Editor approves/rejects | 7 |
| Shared index reaches merged SHA | 7 |
| No parallel canonical graph file | 5, 8 |
| Security/migration/backup/deployment gates | every Stage; final proof in 9 |

## Non-functional requirements

| PRODUCT_SPEC section | Requirement | Owning Stage(s) |
| --- | --- | --- |
| 9.1 | auth, role and workspace scope | 2, 3, then every protected feature |
| 9.1 | no secrets in Git/API/logs | every Stage; release scan in 9 |
| 9.1 | traversal/archive-bomb protection | 4 |
| 9.1 | cryptographic webhook verification | 3, 7 |
| 9.1 | least-privilege GitHub credentials | 3, 9 |
| 9.1 | production read-only Git, private backend/DB | 1, every Stage, 9 |
| 9.2 | observable sync errors | 3, 5, 7 |
| 9.2 | idempotent webhook/reconciliation | 3, 7 |
| 9.2 | Git wins over index | 5, 7, 8 |
| 9.2 | migration testing | every DB Stage; final rehearsal in 9 |
| 9.2 | persistent DB and verified backup | 1, 9 |
| 9.3 | process vs integration health | 1, maintained through 9 |
| 9.3 | safe correlation/context | 3, 5, 7, 9 |
| 9.3 | business audit linked to actor/workspace/SHA | 3, 7, 9 |

## Decision gates from open questions

| Open question | Latest decision point |
| --- | --- |
| Local graph depth | before expanding Stage 6 beyond bounded subgraph |
| Editing through graph | excluded from MVP unless ADR before Stage 6 |
| Visual colors/states | Stage 6 baseline; complete proposal/diff legend in Stage 8 |
| Node/edge provenance | decide before Stage 6/8 UI finalization if beyond base SHA/layer |
| Selected changes vs whole personal diff | mandatory before Stage 7 |
| GitHub workspace repository isolation | mandatory ADR before Stage 3 |
| Real-time collaboration | post-MVP unless roadmap/ADR changes |

## Final completeness rule

`v0.1.0` нельзя выпускать, пока каждая строка MVP acceptance criteria не имеет
конкретного доказательства в соответствующем completion artifact и итоговой
Technical Observer matrix для exact release SHA.
