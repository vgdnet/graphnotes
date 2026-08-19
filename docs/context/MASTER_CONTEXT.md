# GraphNotes - MASTER CONTEXT

Updated: 2026-08-19
Status: canonical architecture baseline

This file is the canonical handoff context for GraphNotes across ChatGPT/Codex sessions.

The canonical product requirements are maintained in
`docs/product/PRODUCT_SPEC.md`. This file defines the accepted architecture that
implements those requirements. Cross-cutting decisions and rationale are stored
in `docs/decisions/ADR-*.md`.

## 1. Product
GraphNotes is the shared-rhizome layer over Markdown in Git, not a second
Obsidian. People author notes in their own vault/git. GraphNotes shows the one
shared rhizome as a graph, lets a user take selected pieces into their git, and
lets a group of editors merge proposals into that shared rhizome. See ADR-008.

Core data flow:

```text
user git / shared git Markdown
  -> Parser
      -> PostgreSQL derived index
          -> Graph API
              -> Web UI
```

## 2. Critical data rule
Markdown is the primary/canonical knowledge data.

The graph is derived data.

Do not merge graph files. Merge Markdown/Git changes, then re-index affected notes and links.

```text
shared git Markdown and user git Markdown
      -> parser
      -> note index / links / tags in PostgreSQL
      -> graph representation
```

## 2.1 Project license
GraphNotes is open-source software licensed under GNU Affero General Public
License v3.0 (`AGPL-3.0`). The canonical license text is the repository-root
`LICENSE` file. See `docs/decisions/ADR-005-agpl-3-license.md`.

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
- binding one shared knowledge repository and connected personal git remotes
- taking selected shared notes into the user's git
- graph indexing
- shared-graph UX and personal overlay (links to shared)
- editor proposal queue in human language
- graph diff / merge preview for editors

Do not build a custom Git/version/3-way-merge engine for the MVP.
Do not build an Obsidian-class in-app editor.
Do not store canonical note bodies in PostgreSQL.

Initial product git concept:

```text
shared knowledge repo default branch  = approved shared rhizome
user's own git remote                 = personal rhizome (Obsidian/obsidian-git)
proposal                              = Git-backed request into shared, queued for editors
```

The `user/<uuid>` branch-on-shared-repo sketch is not the product story.
The current product does not contain workspaces or multiple shared knowledge
repositories.

## 5. Authentication - accepted decision
MVP authentication is owned by GraphNotes and uses username/password.

MVP requirements planned for Stage 2:
- internal user ID: UUID
- username/login
- secure password hash (Argon2 preferred unless implementation constraints require another modern choice)
- access/refresh token or an equivalently secure session model
- `/me`
- logout
- global roles: `user`, `editor`, `admin`
- email can be nullable/reserved initially for future recovery/notifications

Telegram is NOT removed from the roadmap.
Telegram remains a future optional identity provider linked to the existing internal user UUID.
Telegram is not part of the MVP implementation unless this decision is explicitly changed.

## 5.1 Permission and rhizome model - accepted decision

Authorization uses global `user`, `editor`, and `admin` RBAC. There is exactly
one shared rhizome and exactly one personal rhizome per user. `editor` includes
direct shared editing and proposal review. `admin` includes all editor/user
rights plus system administration.

All shared writes remain audited Markdown/Git changes followed by revisioned
re-indexing. Editors/admins cannot approve their own proposals. There are no
workspace, organization, team or multi-shared-rhizome entities. See ADR-007
and ADR-008.

Personal knowledge is the user's git, not a GraphNotes-hosted vault. Public
read of the shared knowledge repository does not require a GraphNotes account.
Proposing and editorial merge do.

Derived data explicitly separates `shared`, per-owner `personal`, and immutable
`proposal` revisions. Accepted publication switches the visible shared revision
only after the merged revision is fully indexed, so readers never see partial
proposal application.

## 5.2 Single shared rhizome growth

One shared rhizome is a fixed product boundary, not a reason to load all data in
one request. Scale through bounded/paginated Graph APIs, PostgreSQL indexes,
incremental affected-set re-indexing, immutable revision references and
proposal/audit retention policies. Record performance/capacity baselines before
adding infrastructure excluded from the MVP.

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
- `nord`: Ubuntu development workstation at `172.16.13.205/24` with Codex and VS Code; primary source authoring
- `rhizome-test`: Debian 13 KVM at `172.16.13.14/24`;
  development-runtime, integration, deployment, migration and destructive
  testing
- `rhizome`: Debian 13 at `172.16.13.13/24`; production target for approved
  revisions only

`nord` and `rhizome-test` are currently reachable on the same
`172.16.13.0/24` network. The canonical integration deployment combines
`compose.yaml` with `deploy/compose.rhizome-test.yaml`. This exposes only the
frontend to the shared network at `http://172.16.13.14:8080`; backend remains on
`127.0.0.1:8000`, and PostgreSQL has no published host port. The bind IP is
configurable through `GRAPHNOTES_TEST_BIND_IP` with `172.16.13.14` as its
default. Local `compose.override.yaml` files are not canonical and are not
required for deployment.

The integration host uses the versioned
`deploy/graphnotes-rhizome-test.service` boot unit to wait for the configured
LAN address before force-recreating the frontend container. This prevents a
Docker host-port bind race during reboot without widening the frontend binding
to `0.0.0.0`.

The canonical delivery workflow is:

```text
nord
  -> GitHub
      -> rhizome-test
          -> approved revision
              -> rhizome
```

The canonical public repository is `https://github.com/vgdnet/graphnotes`.

Git is the primary delivery mechanism. SSH/rsync is a fallback or bootstrap mechanism only. `nord` owns source authoring and GitHub write operations. `rhizome-test` is the development-runtime and test environment; it normally consumes candidate revisions read-only and is never canonical source. `rhizome` is production. Its Git access must be read-only, with no credentials capable of push, and it receives only commits or tags approved on `rhizome-test`. Every new feature revision must pass the applicable integration, deployment and migration checks on `rhizome-test` before the same approved revision is deployed to `rhizome`. Do not use `rhizome` for destructive experiments, first-run migrations or ad-hoc source edits. See `docs/decisions/ADR-006-production-git-readonly.md`.

## 8. Stage roadmap
- Stage 0 - Infrastructure - DONE
- Stage 1 - Project Bootstrap - DONE
- Stage 2 - Password Authentication - DONE
- Stage 3 - GitHub Integration - DONE
- Stage 4 - Take from shared / ZIP fallback - DONE
- Stage 5 - Graph Engine - CURRENT
- Stage 6 - Shared graph + personal overlay (links to shared)
- Stage 7 - Editor proposal queue / merge / rollback (core product)
- Stage 8 - Graph Diff for editors
- Stage 9 - Production Hardening / CI/CD

## 9. Stage branches
Recommended source-code branch **names** stay historical so later stages do not
rename remotes. Product meaning of Stages 4, 6 and 7 is ADR-008, not the old
branch titles.

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
