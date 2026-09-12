# Stage 7 proposals, Differ and download

Differ compares the caller's connected git to the **published** shared rhizome
and lists what can be offered: paths missing from shared, or paths whose
content differs. The user selects those rows and creates a proposal. GraphNotes
copies only those files onto a hidden branch of the shared repository. The
personal git is not rewritten. After the editor accepts and the index catches
up, those paths disappear from Differ.

`Скачать` is a ZIP of the same published shared Markdown the graph shows. It is
not a GraphNotes commit into the user's git.

Editors accept, reject, return or roll back in product language. GitHub
pull-request URLs, branch names and SHAs stay out of public JSON.

## API

```text
GET  /api/differ
GET  /api/shared/archive
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

Alembic revision: `0005_proposals`. See ADR-009.
