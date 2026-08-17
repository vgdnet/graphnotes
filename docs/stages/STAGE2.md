# Stage 2 - Password Authentication

Status: CURRENT
Branch: `feature/02-password-auth`
Primary coding environment: `nord`
Integration host: `rhizome-test` (`172.16.13.14`)

## User outcome

A new user can register with a username and password, sign in, reload the
application without losing the authenticated state, view their identity, and
sign out. An inactive account cannot authenticate or continue using an existing
session.

## Scope

- user model with UUID primary key
- unique normalized username
- nullable email and display name
- roles: `user`, `editor`, `admin`
- `is_active`, `created_at`, and `updated_at`
- Argon2 password hashing
- registration, login, logout, refresh/session continuation, and current user
- frontend registration/login/authenticated-state UX
- Alembic migration and backend/frontend tests
- deployment and migration verification on `rhizome-test`

## API baseline

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/users/me
```

Exact request/response schemas and error codes may be refined within this stage
without an ADR as long as the product and security model remains unchanged.

## Security requirements

- never store or log plaintext passwords
- enforce a bounded password length before Argon2 processing
- use short-lived access credentials and rotating refresh credentials, or an
  equivalently secure cookie-based session model
- store refresh/session secrets only as non-reversible hashes
- use HttpOnly cookies with appropriate SameSite and Secure behavior by
  environment
- revoke the active refresh/session credential on logout
- reject inactive users on login, refresh, and authenticated requests
- do not expose password hashes or credential secrets in API responses
- keep backend and PostgreSQL exposure unchanged

## Out of scope

- Telegram or OAuth identity providers
- password recovery/email delivery
- workspace membership and permissions
- GitHub product integration
- Markdown import, notes, graph, proposals, and moderation
- production deployment to `rhizome` unless separately requested

## Verification

- registration persists a user and hashes the password
- duplicate normalized usernames are rejected safely
- correct credentials authenticate; incorrect credentials do not
- refresh/session continuation survives a page reload
- logout revokes continuation credentials
- inactive users are rejected
- `/api/users/me` requires authentication and returns no secrets
- migration upgrade and downgrade are valid on disposable/test data
- frontend production build passes
- full Compose deployment, migration, health, ports, and real browser/API flow
  pass on `rhizome-test`

## Definition of Done

- the complete user outcome works through the frontend, not only through curl
- backend authentication tests cover success and failure paths
- secrets and password hashes do not leak into logs or responses
- the exact revision passes integration and migration checks on
  `rhizome-test`
- `docs/context/STAGE_STATUS.md` and `docs/stages/STAGE2_COMPLETED.md` record
  observed results before the stage is declared complete
