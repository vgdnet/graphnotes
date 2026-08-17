# GraphNotes - Codex repository instructions

## Canonical context
Before making architectural or cross-cutting changes, read:

1. `docs/context/MASTER_CONTEXT.md`
2. `docs/context/ENVIRONMENTS.md`
3. `docs/context/STAGE_STATUS.md`
4. the active file in `docs/stages/`

If code or an old document conflicts with these files, do not silently choose a new architecture. Report the conflict and ask for a decision when it materially changes the project.

## Product principle
GraphNotes is a multi-user Markdown knowledge system with personal and shared rhizomes.

Markdown is the source of truth for knowledge content.
The graph is derived from Markdown and indexed for fast display/querying.
Do not introduce a second canonical graph file such as `graph.json`.

## MVP stack
- Backend: FastAPI / Python
- Frontend: React + TypeScript
- Database: PostgreSQL
- ORM: SQLAlchemy 2.x async
- Migrations: Alembic
- Runtime packaging: Docker + Docker Compose
- Reverse proxy on target server: Nginx on the host
- Graph UI later: Cytoscape.js
- Git backend for knowledge repositories later: GitHub API / GitHub App

## Authentication
MVP authentication is local username/password authentication.
Telegram is future scope only and must be designed as an optional identity provider attached to the existing internal user UUID.
Do not implement Telegram in Stage 1 or Stage 2 unless the project context is explicitly changed.

## Explicitly out of MVP unless approved
Do not add these just because they are common infrastructure choices:
- Neo4j
- Elasticsearch
- Redis
- Celery
- RabbitMQ
- MinIO/S3
- Gitea/GitLab
- Kubernetes

Introduce them only after a documented need and explicit approval.

## Git / Stage workflow
- One development stage per feature branch.
- Current stage determines scope.
- Git is the primary delivery mechanism between environments.
- The canonical delivery path is `nord -> Git remote -> rhizome-test -> approved revision -> rhizome`.
- Every new feature revision must pass integration, deployment and migration testing on `rhizome-test` before deployment to `rhizome`.
- SSH/rsync is a fallback or bootstrap delivery mechanism only.
- Do not implement later-stage features early unless necessary for the current stage.
- Keep changes reviewable and logically grouped.
- Before editing, inspect existing files and `git status`.
- Do not overwrite user edits silently.
- Do not commit secrets.
- Do not force-push or rewrite history unless explicitly requested.

## Validation
After each logical block, run the most relevant checks available in the repository.
At minimum before declaring a stage complete:
- backend tests/checks pass
- frontend build/checks pass when frontend exists
- Docker Compose config validates when Compose exists
- migration state is valid when DB migrations exist
- no unexpected public ports are exposed

If a check cannot run because the local environment lacks a dependency, say exactly what is missing; do not fake success.

## Documentation handoff
At the end of each stage:
- update `docs/context/STAGE_STATUS.md`
- create/update `docs/stages/STAGE<N>_COMPLETED.md`
- record actual versions, paths, ports, services, migrations and known issues
- update `MASTER_CONTEXT.md` only for accepted architectural decisions

## Environments
Do not confuse the environments:
- `nord`: Ubuntu development workstation with Codex and VS Code; primary source authoring location
- `rhizome-test`: Debian 13 KVM at `172.16.13.14`; integration, deployment, migration and destructive testing environment
- `rhizome`: Debian 13 stable target for approved builds and early user testing

Code is authored and reviewed on `nord`, delivered through the Git remote to `rhizome-test`, and promoted to `rhizome` only as an approved revision. Do not use `rhizome` for destructive experiments or bypass `rhizome-test` for new feature code. Avoid ad-hoc source edits directly on either target.
