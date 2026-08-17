# ADR-003 - GitHub as the knowledge Git engine

Status: Accepted for MVP direction

## Decision
Use GitHub rather than building/self-hosting a Git engine for the first product version.

GitHub handles Git repositories, branches, commits, diffs, Pull Requests and merge.
GraphNotes builds the knowledge-specific UX and graph indexing/diff layer.

## Consequences
- no custom Git/merge implementation in MVP
- no Gitea/GitLab requirement initially
- product integration is scheduled for Stage 3
