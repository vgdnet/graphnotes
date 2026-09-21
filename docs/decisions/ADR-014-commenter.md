# ADR-014 - Commenter is not a fourth RBAC role

Status: Accepted (living). ADR-007 is superseded; roles still
`user < editor < admin` in MASTER.
Accepted: 2026-09-03
Refines: ADR-010

## Decision

Anyone with a GraphNotes account may leave a **comment** on a published
rhizome card. That is the PRODUCT_SPEC “below author” contour: commenting
does not require author-contract acceptance and does not publish Markdown.

Comments are stored as product rows (author UUID, path, text, status).
They are not note bodies and not a second Markdown canon.

New comments start as `pending`. Editors and admins moderate
(`approved` / `rejected`). Public read returns only approved comments.
Authors are not a new role; self-approval of proposals remains forbidden.
