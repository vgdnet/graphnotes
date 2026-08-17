# First prompt for Codex - GraphNotes Stage 1

Open Codex from the local GraphNotes repository root and send this prompt:

---

Read these files before changing anything:

- `AGENTS.md`
- `docs/context/MASTER_CONTEXT.md`
- `docs/context/ENVIRONMENTS.md`
- `docs/context/STAGE_STATUS.md`
- `docs/stages/STAGE0_COMPLETED.md`
- `docs/stages/STAGE1.md`

We are starting GraphNotes Stage 1.
Stage 0 on Rhizome is already complete; do not redo it.

First, inspect the current local directory and Git state. Do not create or overwrite application files until you have determined whether this is already a repository and whether project files already exist.

Then give me a concise Stage 1 implementation plan based on the actual filesystem and the stage specification.

Development rules:
- primary coding happens locally on `nord`;
- I review your edits in VS Code and may edit files myself;
- never overwrite my edits silently;
- stay within Stage 1 scope;
- do not implement authentication, Telegram, GitHub product integration, Markdown import or graph features yet;
- use FastAPI + React/TypeScript + PostgreSQL + SQLAlchemy async + Alembic + Docker Compose;
- do not add Neo4j, Redis, Celery, RabbitMQ, Elasticsearch, MinIO or Kubernetes;
- make changes in logical, reviewable blocks and run the relevant checks after each block;
- do not deploy to Rhizome or alter its Nginx until I provide/confirm the current Rhizome files/configuration;
- do not commit or push unless I explicitly approve it during this session.

After your inspection and plan, begin with the repository/bootstrap foundation and keep the project runnable at each checkpoint.

---
