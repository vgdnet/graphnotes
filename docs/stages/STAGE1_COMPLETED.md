# Stage 1 - Project Bootstrap - COMPLETED

Status: DONE
Completed: 2026-08-17
Branch: `feature/01-project-bootstrap`
Accepted integration revision: `01529372d116e9b66c3108d420c839a3534d3308`
Integration host: `rhizome-test` (`172.16.13.14`)

## Delivered baseline

- FastAPI process and database health endpoints
- SQLAlchemy 2.x async engine/session and declarative base
- Alembic async migration environment and `0001_bootstrap` baseline
- React/TypeScript frontend with a real backend health request
- PostgreSQL, backend, and frontend Compose services
- production-safe loopback bindings and no PostgreSQL host port
- committed `rhizome-test` overlay for the frontend-only LAN binding
- boot-safe systemd unit that waits for the configured LAN address before
  repairing frontend port bindings
- AGPL-3.0 license, architecture ADRs, deployment documentation, and canonical
  product specification

## Observed runtime versions

Observed on Debian 13 `rhizome-test`:

- Docker Engine `29.7.2`
- Docker Compose `v5.4.0`
- Python `3.12.14`
- FastAPI `0.141.1`
- SQLAlchemy `2.0.52`
- Alembic `1.19.1`
- asyncpg `0.31.0`
- pydantic-settings `2.15.0`
- PostgreSQL `17.11`
- frontend runtime Nginx `1.28.3`
- React `19.2.8`
- TypeScript `7.0.2`
- Vite `8.2.1`
- pnpm `11.19.0`

## Runtime topology

Compose project: `graphnotes`

- services: `postgres`, `backend`, `frontend`
- network: `graphnotes_app`
- persistent volume: `graphnotes_postgres_data`
- `127.0.0.1:8000 -> backend:8000`
- `127.0.0.1:8080 -> frontend:80`
- `172.16.13.14:8080 -> frontend:80` through the test overlay
- PostgreSQL `5432` is internal only and has no host binding

The frontend Nginx proxies `/api/` to the backend through the internal Compose
network. Stable-host Nginx routing was not configured because deployment to
`rhizome` is explicitly deferred.

## Configuration and secrets

Tracked configuration names, without secret values:

- `GRAPHNOTES_ENVIRONMENT`
- `GRAPHNOTES_TEST_BIND_IP`
- `GRAPHNOTES_DATABASE_URL`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

Runtime secrets remain in untracked `.env` files. No secret values are recorded
in this handoff.

## Verification results

The following passed on `rhizome-test`:

- backend tests: `2 passed`
- backend and frontend image builds
- merged Compose configuration validation
- all three service health checks
- `GET /health` returned HTTP 200
- `GET /health/db` returned HTTP 200 with database reachable
- frontend `/api/health` returned HTTP 200 from `nord`
- Alembic and PostgreSQL both reported `0001_bootstrap (head)`
- PostgreSQL volume persistence across Compose down/up
- PostgreSQL had no published host port
- backend remained unavailable through the LAN address
- two real VM reboot tests restored all services and both expected frontend
  bindings; the committed systemd unit waited for the LAN address before
  recreating frontend

## Stable host inventory and deferral

Read-only inspection confirmed `rhizome` at `172.16.13.13`, hostname `rhizome`,
Debian 13. `/opt/graphnotes` is an old Git worktree with no commits and untracked
files; its `.env` is empty. Docker Engine `29.7.2` and Compose `v5.4.0` are
installed, but no GraphNotes containers run and host Nginx is not installed.

The owner explicitly deferred stable deployment. No files, services, Git state,
or network configuration were changed on `rhizome`.

## Known technical debt

- frontend dependency specifiers use `latest`; the lockfile pins the tested
  versions, but package constraints should be made explicit during product work
- backend tests emit a Starlette deprecation warning about the current test
  client integration
- stable-host deployment, read-only Git credential verification, Nginx setup,
  and end-to-end stable routing remain future deployment work

## Stage 2 handoff

Stage 2 may add only password authentication scope: user persistence, password
hashing, session/token handling, registration, login, logout, current-user API,
roles, active-state enforcement, frontend auth flows, migration, and tests.
Telegram and later product stages remain out of scope.
