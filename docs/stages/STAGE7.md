# Stage 7 - Editor proposal queue / merge / rollback

Status: PLANNED / DECISION-GATED
Branch: `feature/07-publish-merge`
Depends on: accepted Stage 6
Product model: ADR-007, ADR-008

Это **ядро editor-продукта**, не тонкая обёртка GitHub PR. Обычный UX:
предложить / принять / отклонить / вернуть / откатить. Несколько предложений
по одному файлу остаются параллельными, пока editor не сольёт.

## User outcome

User предлагает изменения из своего git в единую общую ризому. Editor/admin
видит автора, человеческий текстовый diff и structural preview, принимает,
отклоняет, возвращает или откатывает с причиной. Читатели никогда не видят
частично применённое изменение. Откат общей ризомы — Git history.

## Blocking product detail

До реализации определить:

- proposal включает выбранные изменения или весь current personal diff;
- как immutable scope фиксируется base/head SHA;
- что происходит с personal changes после создания proposal.

Решение не может вводить workspace, второй shared graph, PostgreSQL note store
или last-write-wins.

## Scope

- proposal: author, immutable base/head SHAs, scope, status, reason, timestamps;
- proposal может менять Markdown и производные nodes, edges, direction/type,
  tags and properties;
- GitHub Pull Request (or equivalent Git merge) through backend, hidden in UX;
- list/detail/human text diff for author and editor/admin;
- editor/admin approve, reject, request changes, rollback;
- strict self-approval prohibition by author user ID regardless of role;
- optional audited shared Git commit for editor/admin without Obsidian-class UI;
- audit for proposal, decision, shared commit, role and revision;
- verified webhook and periodic/manual reconciliation;
- idempotent state transitions and concurrency/mergeability checks;
- shared revision publication pointer/state;
- frontend user/editor/admin flows without GitHub credentials.

## API baseline

```text
POST /api/proposals
GET  /api/proposals
GET  /api/proposals/{id}
POST /api/proposals/{id}/approve
POST /api/proposals/{id}/reject
POST /api/proposals/{id}/request-changes
POST /api/webhooks/github
```

## Atomic publication boundary

GitHub and PostgreSQL do not share an ACID transaction. Product atomicity is
provided by a durable state machine, for example:

```text
open
  -> accepted_pending_merge
  -> merged_indexing
  -> published
```

Failure states remain recoverable and reconcilable. After Git merge, the new
shared revision is indexed separately. The visible shared revision changes only
after full successful indexing. Requests see old-complete or new-complete, never
a mixture. Duplicate/out-of-order webhooks cannot publish twice or regress
state.

## Authorization, history and recovery

- user writes only via own personal git and creates own proposal;
- editor/admin decides others' proposals and may commit to shared;
- proposal author cannot approve own proposal, including admin author;
- role and active status checked on every privileged action;
- Git records technical content history;
- audit records actor, role, action, target, reason and exact revisions;
- rejected/requested-changes proposal never changes shared revision;
- missed webhook repaired by reconciliation;
- failed indexing leaves previous shared revision visible;
- admin recovery is explicit and audited, never an untracked graph edit.

## Out of scope

- custom three-way merge engine/UI;
- automatic semantic conflict resolution;
- graph diff visualization details (Stage 8);
- multiple proposal destinations/shared rhizomes;
- Obsidian-class editor;
- PostgreSQL canonical note bodies.

## Verification

- user proposal from correct personal revision;
- user cannot direct-edit shared;
- editor/admin review other proposal;
- self-approval rejected for editor and admin authors;
- role escalation and inactive account rejected;
- approve merges once; reject/request changes never merges;
- parallel proposals on the same file remain distinct until merge;
- stale target/conflict visible;
- webhook invalid/duplicate/replay/out-of-order tests;
- reconciliation repairs missed event;
- indexing failure keeps old shared revision visible;
- final shared index equals merged SHA;
- rollback restores a previous shared Git revision and re-indexes;
- end-to-end test repository flow on `rhizome-test`.

## Definition of Done

- user/editor/admin workflows work through frontend in product language;
- self-approval is impossible;
- proposal publication is atomic to readers;
- history/audit/reconciliation evidence exists;
- no workspace/multi-shared/Postgres-vault model introduced;
- `STAGE7_COMPLETED.md` records state machine and failure tests.
