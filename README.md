# GraphNotes

GraphNotes indexes Markdown from Git and shows one shared knowledge graph.
People write notes in their own git (often Obsidian). Editors merge selected
notes into the shared repository. PostgreSQL holds a derived index, not the
canonical note bodies.

This repository is licensed under GNU Affero General Public License v3.0.
See `LICENSE`.

## Requirements

- Docker and Docker Compose (full stack)
- Python 3.12 (backend development without Compose)
- a GitHub App if you connect knowledge repositories (see `docs/deployment/STAGE3_GITHUB.md`)

## Run the stack

Copy `.env.example` to `.env` and replace placeholder secrets. Do not commit
`.env` or `.secrets/`.

```bash
cp .env.example .env
docker compose config
docker compose up --build
```

Open `http://127.0.0.1:8080`. Compose binds the frontend and backend to
loopback only. PostgreSQL has no host port. Put Nginx (or another proxy) in
front of `http://127.0.0.1:8080` if you need a public URL.

Operator notes, in order, are in [`docs/deployment/`](docs/deployment/README.md).

## Backend only

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/uvicorn app.main:app --reload
```

- `GET /health` — process health
- `GET /health/db` — PostgreSQL connectivity

Configuration uses `GRAPHNOTES_`-prefixed variables from `.env`.
