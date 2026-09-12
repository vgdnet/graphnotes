# Stage 3 - GitHub Integration - COMPLETED

Status: DONE
Completed: 2026-08-19
Branch: `feature/03-github-integration`
Tested integration revision: `d8322d425cd97b157d6f7214f2e859e227f8fd87`
Integration host: `rhizome-test` (`172.16.13.14`)

Production deployment to `rhizome` (`172.16.13.13`) remains deferred.

## Delivered baseline

- GitHub App authentication on the backend (JWT + installation token)
- singleton shared knowledge-repository binding (`shared_repository` id=1)
- one connected personal Git remote per GraphNotes user
- public `GET /api/repository/status` for shared; personal only when logged in
- admin `POST /api/repository/connect` uses configured owner/name, not the request
- authenticated `POST /api/personal/connect` (`owner/name` or GitHub URL)
- HMAC-verified idempotent `POST /api/webhooks/github` (disabled until HTTPS)
- status labels without SHA, `html_url`, node id or secrets
- Alembic revision `0003_github_bindings`
- frontend shared status and personal-connect UX in product language

## Observed bindings on rhizome-test

- shared: `vgdnet/rhizome` (public, default branch `main`), status `connected`,
  has content
- personal fixture: GraphNotes user bound to `vgdnet/guide_psy` (public, `main`)
- GitHub App `rhizome-absorber`, App ID `4646628`, Installation ID `154874395`
- installation permissions at close: `contents:read`, `metadata:read`,
  `repository_selection=selected`
- webhook remains disabled (GitHub cannot reach the LAN)
- private key stays on disk outside git (`/run/secrets/github-app.pem` in the
  backend container)

Owner verified in the UI: admin sees «Общая ризома доступна.»; a logged-in user
sees that plus «Связан git vgdnet/guide_psy.» Public `/api/repository/status`
does not require login for the shared side.

## Runtime topology

Unchanged from Stage 2:

- frontend `127.0.0.1:8080` and `172.16.13.14:8080`
- backend `127.0.0.1:8000` only
- PostgreSQL has no host port

Alembic reports `0003_github_bindings (head)`.

Tables added: `shared_repository`, `personal_repositories`,
`github_webhook_deliveries`. No canonical note-body table.

## Verification results

Passed on `rhizome-test` at `d8322d4`:

- backend tests locally before deploy (`12 passed`, including repository tests)
- frontend production build inside the Compose image
- Compose config; health of postgres/backend/frontend
- live `GET /api/health` and `GET /api/repository/status` from `nord`
- live admin connect of `vgdnet/rhizome`
- live personal connect of `vgdnet/guide_psy`
- cross-user personal-remote steal rejected in unit tests (`409`)
- invalid/SSRF-like remote refs rejected in unit tests
- webhook invalid signature rejected; duplicate delivery idempotent in unit tests

Not exercised live (LAN): GitHub webhook push. The receiver is in code; the
secret is empty until a public HTTPS URL exists.

## Configuration

Tracked names, without secret values: see `docs/deployment/STAGE3_GITHUB.md`
and `.env.example`.

## Known technical debt

- GitHub App Contents permission is still read-only; Stage 4 take-from-shared
  needs Contents read and write on the personal remote
- leftover Stage 2 integration users remain in the test database
- test-only accounts `admin`/`editor` exist on `rhizome-test` and are not
  production data
- production deployment remains deferred

## Stage 4 handoff

Stage 4 is take selected shared Markdown into the connected personal git;
ZIP/one `.md` is fallback ingest. Canonical note bodies stay out of PostgreSQL.
Do not start live writes until the GitHub App can write to the personal remote.
