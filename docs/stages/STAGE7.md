# Stage 7 - Shared Editing, Proposals and Atomic Publication

Status: PLANNED / DECISION-GATED
Branch: `feature/07-publish-merge`
Depends on: accepted Stage 6

## User outcome

User предлагает личные изменения в единую общую ризому. Editor/admin видит
автора, textual diff и structural preview, принимает, отклоняет или возвращает
предложение с причиной. Editor/admin также может напрямую редактировать общую
ризому. Читатели никогда не видят частично применённое изменение.

## Blocking product detail

До реализации определить:

- proposal включает выбранные изменения или весь current personal diff;
- как immutable scope фиксируется base/head SHA;
- что происходит с personal changes после создания proposal.

Решение не может вводить workspace или второй shared graph.

## Scope

- proposal: author, immutable base/head SHAs, scope, status, reason, timestamps;
- proposal может менять Markdown и производные nodes, edges, direction/type,
  tags and properties;
- GitHub Pull Request through backend;
- list/detail/text diff for author and editor/admin;
- editor/admin approve, reject, request changes;
- strict self-approval prohibition by author user ID regardless of role;
- direct shared Markdown edit for editor/admin only;
- audit for proposal, decision, direct shared edit, role and revision;
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
POST /api/shared/notes               # editor/admin
PUT  /api/shared/notes/{id}          # editor/admin
DELETE /api/shared/notes/{id}        # editor/admin
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

Direct editor/admin shared edits use the same index-before-visible publication
boundary.

## Authorization, history and recovery

- user writes only personal and creates own proposal;
- editor/admin writes shared and decides others' proposals;
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
- multiple proposal destinations/shared rhizomes.

## Verification

- user proposal from correct personal revision;
- user cannot direct-edit shared;
- editor/admin direct edit produces Git commit, audit and atomic publication;
- editor/admin review other proposal;
- self-approval rejected for editor and admin authors;
- role escalation and inactive account rejected;
- approve merges once; reject/request changes never merges;
- stale target/conflict visible;
- webhook invalid/duplicate/replay/out-of-order tests;
- reconciliation repairs missed event;
- indexing failure keeps old shared revision visible;
- final shared index equals merged SHA;
- end-to-end test repository flow on `rhizome-test`.

## Definition of Done

- user/editor/admin workflows work through frontend;
- self-approval is impossible;
- proposal/direct-edit publication is atomic to readers;
- history/audit/reconciliation evidence exists;
- no workspace/multi-shared model introduced;
- `STAGE7_COMPLETED.md` records state machine and failure tests.
