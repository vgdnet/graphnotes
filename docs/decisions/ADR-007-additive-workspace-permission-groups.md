# ADR-007 - Additive workspace permission groups

Status: Accepted
Accepted: 2026-08-18

## Context

The original MVP model used one global hierarchical role value:
`user`, `editor`, or `admin`. That model combined two independent duties:
editing the shared rhizome and reviewing other users' proposals. It also made a
global role responsible for workspace-scoped permissions.

GraphNotes needs least-privilege assignments that reflect how collaborative
knowledge systems work. MediaWiki provides the useful precedent of assigning
rights to groups, allowing a user to belong to multiple groups and receive the
union of their permissions. GraphNotes adopts that principle without copying
MediaWiki's full operational role catalogue.

## Decision

GraphNotes MVP uses additive permission groups and explicit capabilities.

| Group | Scope | Capabilities |
| --- | --- | --- |
| `member` | workspace, implicit for active membership | read accessible shared rhizome; create/read/edit own personal rhizome; create proposals |
| `editor` | workspace, assignable | all `member` capabilities plus direct editing of the shared rhizome |
| `reviewer` | workspace, assignable | inspect proposal text/graph diff and approve, reject, or request revision |
| `admin` | system-wide, tightly assigned | all capabilities in all workspaces plus user, group, workspace, Git binding, system-setting, audit and recovery administration |

`editor` and `reviewer` are independent. A user may hold either or both in a
workspace. Effective permissions are the union of active group assignments.

The backend authorizes capabilities, not UI labels and not a numeric role
ordering. Workspace assignments never grant system `admin`.

All shared-rhizome writes, including direct `editor` and `admin` edits, remain
Markdown/Git commits, produce audit events, and trigger derived-index
reconciliation. No group may bypass the Markdown source-of-truth rule.

Only `reviewer` or `admin` may decide proposals. A proposal author may not
approve their own proposal. Any exceptional admin intervention must be explicit
and audited.

Only `admin` may assign/revoke privileged groups in the MVP. Group changes and
privileged actions are audited. The last-active-admin safety/recovery rule
remains mandatory.

## Consequences

- the single global `user/editor/admin` enum is no longer the canonical
  authorization model;
- Stage 2 owns account authentication and the system-admin bootstrap, but must
  not encode workspace `editor/reviewer` as mutually exclusive global roles;
- Stage 3 adds workspace membership and additive `editor/reviewer` assignments;
- Stage 7 separates direct shared editing from proposal review;
- Stage 8 exposes graph diff to proposal author, assigned reviewer, and admin;
- authorization tests require a capability matrix, multi-group cases,
  cross-workspace isolation, self-review rejection, and revocation behavior;
- existing Stage 2 role-enum implementation must be reconciled before Stage 2
  is accepted or migrated safely at the start of Stage 3;
- additional MediaWiki-style groups such as bot, bureaucrat, suppressor, or
  interface administrator are out of MVP until a measured product need and an
  explicit decision exist.
