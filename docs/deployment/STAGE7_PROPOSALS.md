# Stage 7 proposal queue

Users pick Markdown files from their connected git and propose them into the
one shared rhizome. GraphNotes copies those files onto a hidden branch of the
shared repository. Editors accept, reject, return or roll back in product
language. GitHub pull-request URLs, branch names and SHAs stay out of public
JSON.

## Scope of a proposal

The proposal is the selected paths, not the entire personal vault.

- `base` is the shared revision observed when the proposal is created
- `head` is the commit GraphNotes creates with only those files
- the personal git is not rewritten

Identical files are skipped. If nothing differs, the proposal is rejected.

## Publication

Approve merges the hidden branch into the shared default branch, then rebuilds
the derived index. Readers keep seeing the previous complete shared graph until
that rebuild finishes. A conflicted second proposal on the same file stays a
separate request.

Rollback writes a new shared commit whose tree matches the pre-merge revision.

## API

```text
POST /api/proposals
GET  /api/proposals
GET  /api/proposals/{id}
POST /api/proposals/{id}/approve
POST /api/proposals/{id}/reject
POST /api/proposals/{id}/request-changes
POST /api/proposals/{id}/rollback
```

Reject, return and rollback require a reason. Authors cannot decide on their
own proposal, including admin authors.

Alembic revision: `0005_proposals`.
