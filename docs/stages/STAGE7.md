# Stage 7 - Editor proposal queue / merge / rollback

Status: CURRENT
Branch: `feature/07-publish-merge`
Depends on: accepted Stage 6
Product model: ADR-007, ADR-008

Это **ядро editor-продукта**, не тонкая обёртка GitHub PR. Обычный UX:
предложить / принять / отклонить / вернуть / откатить. Несколько предложений
по одному файлу остаются параллельными, пока editor не сольёт.

## Recorded decisions

Blocking product details (2026-08-19):

1. A proposal includes **selected files**, not the entire personal vault.
2. Immutable scope is `base` = shared SHA at create, `head` = commit GraphNotes
   creates on a hidden shared-repo branch with only those files.
3. Personal git is unchanged after creating a proposal.

GitHub Pull Request API is not required: contents-write plus `git/refs` and
`POST /repos/{owner}/{name}/merges` is enough. Public JSON hides branch names,
SHAs and GitHub URLs. Direct in-app shared commits by editors are out of this
stage. Deletions are out of MVP (adds and updates only). Self-approval is
forbidden by author user id, including admin authors.

## User outcome

User предлагает изменения из своего git в единую общую ризому. Editor/admin
видит автора, человеческий текстовый diff, принимает, отклоняет, возвращает
или откатывает с причиной. Читатели никогда не видят частично применённое
изменение. Откат общей ризомы — новый Git commit с деревом предыдущей revision.

## Scope

- proposal: author, immutable base/head SHAs, scope, status, reason, timestamps;
- Git merge through backend, hidden in UX;
- list/detail/human text diff for author and editor/admin;
- editor/admin approve, reject, request changes, rollback;
- strict self-approval prohibition by author user ID regardless of role;
- audit for proposal, decision and rollback;
- verified webhook and list/status reconciliation;
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
POST /api/proposals/{id}/rollback
POST /api/webhooks/github
```

## Atomic publication boundary

```text
open
  -> accepted_pending_merge
  -> merged_indexing
  -> published
```

Failure states: `rejected`, `changes_requested`, `conflicted`, `failed`. After
Git merge, the new shared revision is indexed separately. The visible shared
revision changes only after full successful indexing.

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
