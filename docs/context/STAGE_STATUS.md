# GraphNotes - Stage Status

Updated: 2026-08-19

Product model ADR-008 (2026-08-19): GraphNotes is not an Obsidian clone.
Personal knowledge is the user's git. Canonical note bodies are not stored in
PostgreSQL. Current implementation stage remains Stage 2.

## Stage 0 - Infrastructure
Status: DONE
Environment: `rhizome`

Do not repeat Stage 0.
Do not assume undocumented Stage 0 details.
If deployment needs an exact host fact, inspect Rhizome.

## Stage 1 - Project Bootstrap
Status: DONE
Branch: `feature/01-project-bootstrap`
Primary authoring environment: `nord`
Target integration environment: `rhizome-test` (`172.16.13.14`)
Production deployment target: `rhizome`
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

Deferred until production deployment is explicitly requested:
- reconcile the old uncommitted `/opt/graphnotes` worktree without overwriting
  unmanaged files
- configure read-only Git access with no push-capable credentials
- deploy only a revision validated on `rhizome-test`
- install or configure host Nginx, validate with `nginx -t`, and verify the
  end-to-end route

Resolved integration issue:
- the initial Compose-only deployment could lose the frontend LAN binding when
  Docker restored containers before `172.16.13.14` appeared during boot; the
  versioned systemd unit now waits for the address and repairs the frontend
  bindings, as verified by a real VM reboot on revision `aad3eb0`

Completion decision:
- the owner accepted revision `0152937` after integration validation
- production deployment to `rhizome` (`172.16.13.13`) is explicitly deferred; the
  host was inventoried read-only and remains untouched
- Stage 1 is complete as a reproducible bootstrap validated on
  `rhizome-test`; eventual production deployment retains the normal promotion gate

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
Status: DONE
Branch: `feature/02-password-auth`
Completed: 2026-08-19
Tested integration revision: `c883b2fcae62cc5ceb5e85467399dacc45857e26`
Primary authoring environment: `nord`
Target integration environment: `rhizome-test` (`172.16.13.14`)

MVP auth delivered:
- username/password with Argon2
- opaque PostgreSQL-backed sessions
- HttpOnly SameSite cookies; Secure disabled only for HTTP `rhizome-test`
- `/me`, logout, registration always `user`
- global hierarchical roles `user < editor < admin`
- admin user list, role/blocking UI, bootstrap CLI, last-admin protection
- audit events without authentication secrets

Telegram remains future scope.

Observed on `rhizome-test` at the tested revision:
- PASS: backend tests (`8 passed`)
- PASS: frontend production build
- PASS: Compose config; frontend LAN `8080`; backend loopback-only; no PostgreSQL host port
- PASS: health, db health, frontend from `nord`
- PASS: Alembic `0002_password_auth` upgrade/downgrade/re-upgrade
- PASS: live register/login/logout/RBAC API flow from `nord`
- leftover `0003_pre_git_notes` was downgraded and removed; notes table is gone

See `docs/stages/STAGE2_COMPLETED.md`.

Production deployment to `rhizome` remains deferred.

## Stage 3 - GitHub Integration
Status: CURRENT / ACCESS OPEN
Branch: `feature/03-github-integration`

Accepted test bindings (2026-08-19):

- shared: `https://github.com/vgdnet/rhizome` (public, `main`)
- personal remote model: separate GitHub repository
- first personal fixture for GraphNotes user `efimov`:
  `https://github.com/vgdnet/guide_psy` (public, `main`)

GitHub App `rhizome-absorber` (owner `@vgdnet`, App ID `4646628`, Client ID
`Iv23liXB3caRQOOi0vtK`, Installation ID `154874395`) was verified against the
GitHub API. Repositories have commits: `vgdnet/rhizome` (`b675b76dca9a…`) and
`vgdnet/guide_psy` (`2656006c2308…`). Webhook remains disabled until a public
HTTPS URL exists. Private key is on disk outside git.

Follow ADR-007 and ADR-008.
