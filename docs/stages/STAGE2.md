# Stage 2 - Password Authentication

Status: CURRENT
Branch: `feature/02-password-auth`
Primary coding environment: `nord`
Integration host: `rhizome-test` (`172.16.13.14`)

## User outcome

A new user can register with a username and password, sign in, reload the
application without losing the authenticated state, view their identity, and
sign out. An inactive account cannot authenticate or continue using an existing
session. A system admin can safely inspect users, grant/revoke system admin and
block or reactivate an account without accessing password/session secrets.

## Scope

- user model with UUID primary key
- unique normalized username
- nullable email and display name
- non-privileged registered account plus tightly controlled system `admin`
- no single mutually exclusive `user/editor/admin` authorization enum
- `is_active`, `created_at`, and `updated_at`
- Argon2 password hashing
- registration, login, logout, refresh/session continuation, and current user
- protected admin user list and system-admin/active-state management
- explicit initial-admin bootstrap procedure without public self-escalation
- security audit events for registration, login failure/success, logout,
  blocking and role changes without password/token values
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
GET  /api/admin/users
PATCH /api/admin/users/{id}
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
- registration always creates the non-privileged default role
- only an authenticated active admin can grant/revoke system admin or change
  active state
- prevent accidental removal/blocking of the last active admin, or document and
  test an equivalently safe recovery procedure
- do not expose password hashes or credential secrets in API responses
- auth audit logs do not contain passwords, cookies or reusable session tokens
- keep backend and PostgreSQL exposure unchanged

## Out of scope

- Telegram or OAuth identity providers
- password recovery/email delivery
- workspace membership and `editor`/`reviewer` assignments (Stage 3)
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
- non-admin cannot list users, grant admin or block accounts
- admin/active-state changes take effect on existing sessions as defined
  by the session model
- public registration cannot request `editor`, `reviewer` or `admin`
- last-admin safety/recovery path is tested
- audit events identify actor/target/action without authentication secrets
- `/api/users/me` requires authentication and returns no secrets
- migration upgrade and downgrade are valid on disposable/test data
- frontend production build passes
- full Compose deployment, migration, health, ports, and real browser/API flow
  pass on `rhizome-test`

## Definition of Done

- the complete user outcome works through the frontend, not only through curl
- minimal admin user/role/blocking outcome works through a protected interface;
  a documented admin-only operational interface is acceptable if admin UI is
  explicitly deferred without weakening the product role
- backend authentication tests cover success and failure paths
- secrets and password hashes do not leak into logs or responses
- the exact revision passes integration and migration checks on
  `rhizome-test`
- `docs/context/STAGE_STATUS.md` and `docs/stages/STAGE2_COMPLETED.md` record
  observed results before the stage is declared complete
