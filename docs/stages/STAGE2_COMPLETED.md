# Stage 2 - Password Authentication - COMPLETED

Status: DONE
Completed: 2026-08-19
Branch: `feature/02-password-auth`
Tested integration revision: `c883b2fcae62cc5ceb5e85467399dacc45857e26`
Integration host: `rhizome-test` (`172.16.13.14`)

Production deployment to `rhizome` (`172.16.13.13`) remains deferred.

## Delivered baseline

- UUID user model, unique normalized username, Argon2 password hashing
- opaque PostgreSQL-backed sessions; only token hashes stored
- HttpOnly SameSite=Lax cookies; Secure disabled only for HTTP `rhizome-test`
- register, login, logout, session continuation, `GET /api/users/me`
- global hierarchical roles `user < editor < admin`
- admin user list and role/active-state management through a protected UI
- initial-admin bootstrap CLI that refuses escalation when an admin exists
- last-active-admin protection
- audit events for registration, login success/failure, logout, role and
  blocking changes without passwords or session secrets
- Alembic revision `0002_password_auth`
- frontend registration/login/session UX and admin panel

## Observed runtime versions

Observed on Debian 13 `rhizome-test` at the tested revision:

- Docker Engine `29.7.2`
- Docker Compose `v5.4.0`
- Python `3.12.14`
- FastAPI `0.141.1`
- SQLAlchemy `2.0.52`
- Alembic `1.19.1`
- asyncpg `0.31.0`
- pydantic-settings `2.15.0`
- argon2-cffi `25.1.0`
- PostgreSQL `17.11`
- frontend runtime Nginx `1.28.3`
- React `19.2.8`
- TypeScript `7.0.2`
- Vite `8.2.1`
- pnpm `11.19.0`

## Runtime topology

Compose project: `graphnotes`

- services: `postgres`, `backend`, `frontend`
- `127.0.0.1:8000 -> backend:8000`
- `127.0.0.1:8080 -> frontend:80`
- `172.16.13.14:8080 -> frontend:80` through the test overlay
- PostgreSQL `5432` is internal only and has no host binding
- backend remains unreachable from `nord` at `172.16.13.14:8000`

`graphnotes-rhizome-test.service` is enabled and active.

Alembic and PostgreSQL both report `0002_password_auth (head)`.

Tables: `alembic_version`, `users`, `auth_sessions`, `audit_events`. No
canonical note-body table remains after downgrading leftover `0003_pre_git_notes`.

## Verification results

The following passed on `rhizome-test` at `c883b2f`:

- backend tests: `8 passed` in a disposable `python:3.12-slim` container
- frontend production build inside the Compose image build (`tsc` + `vite build`)
- merged Compose configuration validation
- published ports: frontend loopback + LAN `8080`; backend loopback `8000` only
- all three service health checks
- `GET /api/health` returned HTTP 200 from `nord`
- `GET /api/health/db` returned HTTP 200 and `database: reachable`
- frontend `/` returned HTTP 200 from `nord`
- disposable Alembic upgrade / downgrade to `0001_bootstrap` / re-upgrade to
  `0002_password_auth`
- live API from `nord` through `http://172.16.13.14:8080`: register always
  creates `user`; session cookie; `/api/users/me`; logout revokes continuation;
  bad password rejected; duplicate username `409`; `user` cannot list users or
  patch roles (`403`); responses omit password hashes
- frontend bundle contains login/register and the admin panel

## Configuration

Tracked configuration names, without secret values:

- `GRAPHNOTES_ENVIRONMENT`
- `GRAPHNOTES_TEST_BIND_IP`
- `GRAPHNOTES_SESSION_TTL_HOURS`
- `GRAPHNOTES_COOKIE_SECURE`
- `GRAPHNOTES_DATABASE_URL`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

Runtime secrets remain in the untracked `.env` on the host. Bootstrap procedure
is documented in `docs/deployment/STAGE2_AUTH.md`.

## Known technical debt

- frontend dependency specifiers still use `latest`; the lockfile pins tested
  versions
- leftover integration user rows from earlier experiments remain in the test
  database; they are not production data
- authenticated workspace copy still talks about upcoming in-app notes; that
  copy is superseded by ADR-008 and belongs to later UI stages
- production deployment, read-only Git credential verification, Nginx setup,
  and end-to-end production routing remain future deployment work

## Stage 3 handoff

Stage 3 is GitHub Integration and is access-gated. Do not start it without the
owner's GitHub App test installation, shared repository identifier, personal
remote binding choice, and webhook secret for `rhizome-test`. Product model is
ADR-007 plus ADR-008: one shared knowledge repository, connected personal git
per user, public read allowed, no PostgreSQL vault, no Obsidian-class editor.
