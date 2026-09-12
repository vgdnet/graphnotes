# Stage 4 - Take from shared / ZIP fallback - COMPLETED

Status: DONE
Completed: 2026-08-19
Branch: `feature/04-markdown-import`
Tested integration revision: `003638259909c42eedb4fb4973dd9a45d1f0a3e1`
Integration host: `rhizome-test` (`172.16.13.14`)

Production deployment to `rhizome` (`172.16.13.13`) remains deferred.

## Delivered baseline

- take selected shared Markdown into the connected personal Git remote
- ZIP / one `.md` fallback ingest into the same personal remote
- conflict handling without silent overwrite
- optimistic concurrency via expected personal revision
- read-only note projection from Git, not PostgreSQL bodies
- public listing of shared Markdown
- GitHub App Contents write on the selected installation

## Observed on rhizome-test

- shared `vgdnet/rhizome` connected with content
- personal `vgdnet/guide_psy` connected
- owner take-from-shared: accepted 1, skipped 0, conflicted 0
- resulting personal commit `fbabd7529700`
  (`Take notes from the shared rhizome`)
- GitHub App installation permissions: `contents: write`, `metadata: read`
- Alembic remained `0003_github_bindings` (no Stage 4 schema for note bodies)
- frontend LAN `172.16.13.14:8080`; backend loopback-only; no Postgres host port

Owner authoring path for later stages: Obsidian +
[obsidian-git](https://github.com/Vinzent03/obsidian-git) pushing to the
personal remote. GraphNotes does not replace that editor.

## Limits

See `docs/deployment/STAGE4_INGEST.md`.

## Stage 5 handoff

Stage 5 indexes Markdown from shared and personal Git revisions into a derived
PostgreSQL graph. Canonical bodies stay in Git. Webhook is still disabled on
the LAN; index refresh must follow observed Git SHA (page load / rebuild).
