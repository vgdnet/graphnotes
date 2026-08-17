# Stage 7 - Publish / Pull Request / Merge

Status: PLANNED / DECISION-GATED
Branch: `feature/07-publish-merge`
Depends on: accepted Stage 6

## User outcome

Пользователь предлагает личные Markdown-изменения в общественную ризому.
Editor видит автора и текстовые последствия, принимает или отклоняет
предложение, а после merge shared index соответствует merged commit SHA.

## Blocking product decision

До реализации должен быть явно решён вопрос из `PRODUCT_SPEC.md`:

- пользователь публикует выбранные изменения или весь актуальный personal diff;
- как выбранный scope фиксируется и остаётся неизменным во время review;
- что происходит с новыми personal changes после создания proposal.

Если решение меняет ownership/merge workflow, оно оформляется ADR.

## Scope

- модель `proposal` с author, workspace, base/head SHA, scope, status и decision;
- immutable proposal revision или однозначная связь с Git commits;
- создание GitHub Pull Request через backend;
- список и detail proposal для разрешённых пользователей;
- понятный textual diff или безопасная ссылка в GitHub для editor;
- statuses: draft/open, reviewing, conflict, approved, rejected, merged, failed;
- editor approve/merge и reject без merge;
- optimistic/concurrency checks против изменения target branch;
- verified GitHub webhook и reconciliation after merge;
- идемпотентное обновление proposal/shared index;
- audit бизнес-событий с actor, workspace, proposal и Git SHA;
- frontend user/editor workflow без выдачи GitHub credentials.

## API baseline

```text
POST /api/workspaces/{id}/proposals
GET  /api/proposals
GET  /api/proposals/{id}
POST /api/proposals/{id}/approve
POST /api/proposals/{id}/reject
POST /api/webhooks/github
```

## Authorization

- user создаёт proposal только из собственного personal state;
- editor действует только в назначенном workspace;
- global admin не становится автоматически workspace editor;
- author не может подменить base/head SHA или workspace;
- approve/reject/merge идемпотентны и защищены от replay;
- backend проверяет актуальную mergeability перед merge.

## Consistency and failure handling

- proposal связан с точными immutable SHAs;
- conflict не скрывается и не разрешается автоматически потерей изменений;
- GitHub merge success без webhook восстанавливается reconciliation;
- duplicate/out-of-order webhook не откатывает status;
- shared re-index происходит до merged SHA;
- partial failure отображается как recoverable state;
- бизнес-аудит не заменяет GitHub technical history.

## Out of scope

- полноценный собственный three-way merge UI;
- автоматическое разрешение содержательных конфликтов;
- graph diff visualization (Stage 8);
- notifications/email;
- direct user GitHub access.

## Verification

- user creates proposal from correct personal state;
- cross-user/workspace and role escalation rejected;
- editor sees text diff and author;
- approve causes GitHub merge exactly once;
- reject never merges;
- stale target/conflict shown explicitly;
- webhook signature, duplicate, replay and out-of-order tests;
- reconciliation repairs missed webhook;
- shared index reaches merged SHA;
- audit trail contains actor/action/revision without secrets;
- end-to-end GitHub test repository flow on `rhizome-test`.

## Definition of Done

- blocking publication-scope decision accepted and documented;
- complete user/editor workflow works through frontend;
- merge and reject have safe idempotent semantics;
- shared index consistency with merged SHA is proven;
- conflicts are visible and non-destructive;
- создан `STAGE7_COMPLETED.md` с PR/merge/reconciliation evidence.
