# GraphNotes - MASTER CONTEXT

Updated: 2026-08-17
Status: canonical architecture baseline

This file is the canonical handoff context for GraphNotes across ChatGPT/Codex sessions.

## 1. Product
GraphNotes is a multi-user system for Markdown knowledge bases and relationship graphs (rhizomes).

Core data flow:

```text
Markdown -> Parser -> PostgreSQL index -> Graph API -> Web UI
```

Users eventually have personal changes/graphs and can propose selected changes into a shared knowledge base. Editors review and merge those changes.

## 2. Critical data rule
Markdown is the primary/canonical knowledge data.

The graph is derived data.

Do not merge graph files. Merge Markdown/Git changes, then re-index affected notes and links.

```text
GitHub Markdown
      -> parser
      -> note index / links / tags in PostgreSQL
      -> graph representation
```

## 3. MVP architecture
Target application stack:

```text
Internet
   -> Nginx (Rhizome host)
       -> React frontend
       -> FastAPI backend
           -> PostgreSQL
           -> GitHub API (later stage)
```

Technologies:
- FastAPI / Python
- React + TypeScript
- PostgreSQL
- SQLAlchemy 2.x async
- Alembic
- Docker Engine + Docker Compose
- Nginx on target host
- Cytoscape.js later for graph visualization

## 4. GitHub role in the product
GitHub is planned as the Git engine for the Markdown knowledge repositories.

GitHub should handle:
- Git repositories
- branches
- commits
- history
- textual diff
- Pull Requests
- mergeability/conflicts
- merge

GraphNotes should handle:
- application users and permissions
- Markdown import
- mapping users/workspaces to Git resources
- graph indexing
- personal/shared rhizome UX
- review workflow in human language
- graph diff / merge preview

Do not build a custom Git/version/3-way-merge engine for the MVP.

Initial product branch concept:

```text
main           = approved shared knowledge base
user/<uuid>    = a user's proposed/personal changes
```

This is an MVP model, not a permanent security boundary. If direct Git access or stricter isolation is introduced later, private repositories per user/workspace may replace this model.

## 5. Authentication - accepted decision
MVP authentication is owned by GraphNotes and uses username/password.

MVP requirements planned for Stage 2:
- internal user ID: UUID
- username/login
- secure password hash (Argon2 preferred unless implementation constraints require another modern choice)
- access/refresh token or an equivalently secure session model
- `/me`
- logout
- roles: user / editor / admin
- email can be nullable/reserved initially for future recovery/notifications

Telegram is NOT removed from the roadmap.
Telegram remains a future optional identity provider linked to the existing internal user UUID.
Telegram is not part of the MVP implementation unless this decision is explicitly changed.

## 6. Scope discipline
Not needed for the initial MVP unless actual load/features justify them:
- Neo4j
- Elasticsearch
- Redis
- Celery / RabbitMQ
- MinIO / S3
- Gitea / GitLab / self-hosted Git
- Kubernetes

Start simple. Add infrastructure only for measured/observed needs.

## 7. Development model
The canonical environment topology is:
- `nord`: Ubuntu development workstation with Codex and VS Code; primary source authoring
- `rhizome-test`: Debian 13 KVM at `172.16.13.14`; integration, deployment, migration and destructive testing
- `rhizome`: Debian 13 stable target for approved builds and early user testing

The canonical delivery workflow is:

```text
nord
  -> Git remote
      -> rhizome-test
          -> approved revision
              -> rhizome
```

Git is the primary delivery mechanism. SSH/rsync is a fallback or bootstrap mechanism only. Every new feature revision must pass the applicable integration, deployment and migration checks on `rhizome-test` before the same approved revision is deployed to `rhizome`. Do not use `rhizome` for destructive experiments or as the first test target for new code.

## 8. Stage roadmap
- Stage 0 - Infrastructure - DONE
- Stage 1 - Project Bootstrap - CURRENT
- Stage 2 - Password Authentication
- Stage 3 - GitHub Integration
- Stage 4 - Markdown Import
- Stage 5 - Graph Engine
- Stage 6 - Personal Graph
- Stage 7 - Publish / Pull Request / Merge
- Stage 8 - Graph Diff
- Stage 9 - Production Hardening / CI/CD

## 9. Stage branches
Recommended source-code branches:

```text
main
feature/01-project-bootstrap
feature/02-password-auth
feature/03-github-integration
feature/04-markdown-import
feature/05-graph-engine
feature/06-personal-graph
feature/07-publish-merge
feature/08-graph-diff
feature/09-production
```

## 10. Architectural-change rule
If implementation discovers a reason to change this architecture:
1. state the concrete problem;
2. propose the change;
3. explain tradeoffs/migration impact;
4. obtain an explicit decision;
5. update this file and, when appropriate, add an ADR.
