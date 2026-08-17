# GraphNotes - Stage Status

Updated: 2026-08-17

## Stage 0 - Infrastructure
Status: DONE
Environment: `rhizome`

Do not repeat Stage 0.
Do not assume undocumented Stage 0 details.
If deployment needs an exact host fact, inspect Rhizome.

## Stage 1 - Project Bootstrap
Status: CURRENT / IN PROGRESS
Branch: `feature/01-project-bootstrap`
Primary authoring environment: `nord`
Target integration environment: `rhizome-test` (`172.16.13.14`)
Stable deployment target: `rhizome`
Delivery path: `nord -> Git remote -> rhizome-test -> approved revision -> rhizome`

Goal:
Create a minimal, clean, testable GraphNotes application repository and application stack.

Implemented locally on `nord` as of 2026-08-17:
- FastAPI application with process and database health endpoints
- SQLAlchemy async engine/session and declarative base
- Alembic async environment with Stage 1 baseline revision
- React/TypeScript frontend with a real proxied backend health request
- backend and frontend Dockerfiles
- Compose topology for PostgreSQL, backend and frontend
- loopback-only host bindings for frontend/backend and no PostgreSQL host port
- Git-primary deployment instructions, SSH/rsync fallback instructions and an Nginx location example

Still required before Stage 1 completion:
- initialize/reconcile the real Git repository and Stage 1 branch
- configure the Git remote used by all three environments
- deploy the candidate Git revision to `rhizome-test`
- run Docker image builds and the full Compose stack on `rhizome-test`
- verify a real backend-to-PostgreSQL connection and Alembic upgrade on `rhizome-test`
- approve the tested Git revision before promotion
- inspect and reconcile `/opt/graphnotes` on `rhizome`
- deploy only the approved revision to `rhizome`
- inspect, test and integrate the existing Rhizome Nginx configuration without destructive experiments
- write `docs/stages/STAGE1_COMPLETED.md` with observed runtime facts

Expected components:
- FastAPI skeleton
- React + TypeScript skeleton
- PostgreSQL
- SQLAlchemy async
- Alembic
- Dockerfiles / Docker Compose
- `.env.example` and secret hygiene
- health endpoint and DB connectivity check
- basic frontend-to-backend connectivity
- documentation and tests/checks
- deployment/integration path to the already-prepared Rhizome host

Explicitly out of scope:
- registration/login implementation
- Telegram
- GitHub product integration
- Markdown import/parser
- graph engine/UI
- PR/merge workflow

## Stage 2 - Password Authentication
Status: PLANNED
Branch: `feature/02-password-auth`

MVP auth:
- username/password
- secure password hashing
- access/refresh auth or secure session equivalent
- `/me`
- logout
- user/editor/admin roles

Telegram remains future scope.
