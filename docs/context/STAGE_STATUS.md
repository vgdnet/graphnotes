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
Canonical repository: `https://github.com/vgdnet/graphnotes` (public)
Delivery path: `nord -> GitHub -> rhizome-test -> approved revision -> rhizome`

Accepted project decisions:
- canonical license: GNU Affero General Public License v3.0 (`AGPL-3.0`)
- GitHub is the canonical source delivery mechanism
- `rhizome-test` normally consumes candidate revisions read-only
- `rhizome` Git access is read-only and must not use push-capable credentials
- SSH/rsync is fallback/bootstrap only

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
- canonical AGPL-3.0 license and license ADR
- GitHub delivery/read-only production security ADR
- canonical `rhizome-test` Compose overlay with configurable frontend LAN bind
- versioned `rhizome-test` boot unit that waits for the configured LAN address
  and repairs the frontend port bindings without exposing `0.0.0.0`

Stage 1 integration results on `rhizome-test`:
- initial integration revision: `5c9ec1b`
- boot-race fix tested revision: `aad3eb0766b6952e9d9c87cbf2d98c0f5812fbad`
- PASS: clean clone from the public GitHub repository
- PASS: canonical public remote
  `https://github.com/vgdnet/graphnotes.git` resolves the tested Stage 1 branch
- PASS: `docker compose config` validated
- PASS: backend image builds
- PASS: frontend image builds
- PASS: PostgreSQL healthy
- PASS: backend healthy
- PASS: frontend healthy
- PASS: `GET /health` returned HTTP 200
- PASS: `GET /health/db` returned HTTP 200 and confirmed database reachable
- PASS: frontend `/api/health` proxy returned HTTP 200
- PASS: Alembic current revision is `0001_bootstrap (head)`
- PASS: PostgreSQL `alembic_version` is `0001_bootstrap`
- PASS: PostgreSQL Docker volume persistence verified across `docker compose down/up`
- PASS: frontend accessed from `nord` by browser and curl at `http://172.16.13.14:8080`
- PASS: backend remains bound only to `127.0.0.1:8000`
- PASS: PostgreSQL has no published host port
- PASS: backend test suite passed (`2 passed`) in a disposable container
- PASS: backend and frontend images built for the tested revision
- PASS: committed systemd unit is enabled and active
- PASS: reboot test reproduced a six-second delay before
  `172.16.13.14` appeared; the unit waited, force-recreated frontend, and
  restored both expected frontend bindings automatically
- PASS: after reboot all three containers became healthy, Alembic remained at
  `0001_bootstrap`, and frontend plus `/api/health` returned HTTP 200 from
  `nord`
- PASS: after reboot backend remained unavailable through
  `172.16.13.14:8000`; PostgreSQL still had no published host port

Still required before Stage 1 completion:
- approve the tested Git revision before promotion
- inspect and reconcile `/opt/graphnotes` on `rhizome`
- ensure `rhizome` has no GitHub credentials capable of push
- deploy only the approved revision to `rhizome`
- inspect, test and integrate the existing Rhizome Nginx configuration without destructive experiments
- write `docs/stages/STAGE1_COMPLETED.md` with observed runtime facts

Resolved integration issue:
- the initial Compose-only deployment could lose the frontend LAN binding when
  Docker restored containers before `172.16.13.14` appeared during boot; the
  versioned systemd unit now waits for the address and repairs the frontend
  bindings, as verified by a real VM reboot on revision `aad3eb0`

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
