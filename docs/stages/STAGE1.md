# Stage 1 - Project Bootstrap

Status: COMPLETED
Branch: `feature/01-project-bootstrap`
Primary coding environment: `nord`
Target integration host: `rhizome-test`

Owner decision on 2026-08-17: deployment to production `rhizome`
(`172.16.13.13`) is deferred until a separate explicit request. Stage 1 is
accepted based on reproducible integration and reboot validation on
`rhizome-test` (`172.16.13.14`). This does not remove the promotion gate for a
future production deployment.

## Goal
Build the minimal GraphNotes source repository and runnable application skeleton without implementing product business features early.

Expected end-to-end baseline:

```text
Browser / curl
   -> Nginx on Rhizome
       -> frontend
       -> FastAPI
           -> PostgreSQL
```

Local development may use direct local ports when appropriate; production/integration exposure must remain controlled.

## Required repository baseline
Expected shape (adjust only when a concrete technical reason exists):

```text
graphnotes/
├── AGENTS.md
├── README.md
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   ├── migrations/
│   ├── tests/
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   ├── public/
│   ├── Dockerfile
│   └── package.json
├── deploy/
├── docs/
├── compose.yaml
├── .env.example
└── .gitignore
```

## Backend
Use:
- FastAPI
- current supported Python chosen for the project after checking local/container compatibility
- Pydantic settings
- SQLAlchemy 2.x async
- asyncpg
- Alembic

Minimum API:
- `GET /health` - application health
- database connectivity should be verifiably testable, either as part of health or through a separate internal/simple endpoint during bootstrap

Do not create full GraphNotes domain models merely to make Stage 1 look complete.

## PostgreSQL
- run via Compose for the application stack
- persistent volume
- not publicly exposed on Rhizome
- credentials through environment/secrets, never committed
- FastAPI connects through Docker networking in the target stack
- Alembic can run successfully

## Frontend
Use React + TypeScript.
Keep Stage 1 UI minimal.
It should make a real request to the backend health endpoint and display actual connectivity state rather than a hard-coded fake status.

## Docker / Compose
Minimum services:
- backend
- frontend
- postgres

Do not add Redis/Neo4j/Celery/etc.

Validate Compose configuration and container health/startup.

## Nginx / Rhizome integration
Nginx already belongs to Stage 0 on Rhizome.
Before changing Nginx:
- inspect existing configuration
- preserve working Stage 0 setup
- validate with `nginx -t` before reload

Do not assume domain names or current proxy paths.

## Local-first workflow
Stage 1 code is authored on `nord`.
Codex should work inside the local repository.
The user reviews diffs/files in VS Code and may make manual edits.

Before deploying to Rhizome, inspect `/opt/graphnotes` so existing Stage 0 material is not overwritten blindly.

## Git workflow
If the local source repository does not yet exist:
1. inspect the chosen working directory;
2. initialize Git only after confirming it is the correct project root;
3. establish a clean `main` baseline containing context/docs as appropriate;
4. create `feature/01-project-bootstrap`;
5. implement Stage 1 on that branch.

Do not destroy an existing repository/history if one is discovered.

## Out of scope
Do NOT implement:
- registration or login
- JWT/refresh/session business logic
- Telegram auth
- GitHub App/product integration
- Markdown upload/import/parser
- wikilinks/tags
- graph engine
- Cytoscape product UI
- Pull Requests / knowledge merge
- Graph Diff

## Verification
Before declaring Stage 1 complete, run and record the applicable checks:
- backend unit/smoke tests
- backend import/startup check
- frontend type/build checks
- Docker image builds
- `docker compose config`
- Compose stack startup
- backend -> PostgreSQL real connectivity
- Alembic state/migration check
- frontend -> backend real request
- Rhizome Nginx config test and end-to-end request once deployed

## Definition of Done
- repository initialized and documented
- correct Stage 1 feature branch used
- FastAPI skeleton works
- PostgreSQL connection works
- SQLAlchemy async baseline works
- Alembic works
- React + TypeScript skeleton builds/works
- frontend talks to backend
- Compose stack is valid and starts
- PostgreSQL is persistent and not public on Rhizome
- secrets are not committed
- `rhizome-test` integration is verified, including reboot behavior
- production `rhizome` is inventoried read-only and left unchanged until deployment
  is explicitly requested
- stage completion handoff is written

## Required completion artifact
Create `docs/stages/STAGE1_COMPLETED.md` with:
- exact implemented structure
- versions actually used
- commands/tests run and results
- Docker services/networks/volumes
- local ports and Rhizome exposure
- Nginx routing actually used
- environment variable names without secret values
- migrations
- known issues/technical debt
- any accepted architecture changes
- information Stage 2 needs
