# GraphNotes

GraphNotes is a shared-rhizome layer over Markdown in Git (see
`docs/product/PRODUCT_SPEC.md` and ADR-008). Stage 1 in this tree is the
application skeleton; later product features follow the staged roadmap.

## Backend development

Requires Python 3.12.

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/uvicorn app.main:app --reload
```

The application exposes:

- `GET /health` for process health;
- `GET /health/db` for a real PostgreSQL connectivity check.

Configuration uses `GRAPHNOTES_`-prefixed environment variables. Copy
`.env.example` to `.env` for local development and replace placeholder values.

## Full stack

Docker Compose runs PostgreSQL, the backend, and the frontend. PostgreSQL has no
published host port; application ports bind to loopback only.

```bash
cp .env.example .env
# replace the placeholder password in both matching variables
docker compose config
docker compose up --build
```

Open `http://127.0.0.1:8080`. The page requests `/api/health` through the
frontend proxy and displays the backend's real state.

Deployment by Git or SSH copy is documented in
`docs/deployment/STAGE1_DEPLOYMENT.md`.
