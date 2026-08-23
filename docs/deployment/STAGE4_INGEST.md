# Stage 4 take / ingest operations

Shared Markdown is obtained by ZIP download of the published revision
(`GET /api/shared/archive`) or by public clone. ZIP / one `.md` **upload**
remains fallback ingest into the connected personal git, not the download
path.

The take-from-shared API below is the historical write into the user's git.
Canonical note bodies are not stored in PostgreSQL. The APIs list and show
notes by reading Git.

## GitHub App permission

Stage 3 used Contents **read**. Stage 4 live writes need Contents **Read and
write** on the selected personal repository (`vgdnet/guide_psy` on
`rhizome-test`). After changing the permission, approve the installation
update on GitHub.

Until that is granted, take/import returns a forbidden status instead of
committing.

Webhook remains unused on the LAN.

## Limits

| Limit | Default |
| --- | --- |
| Markdown file | 256 KiB |
| ZIP upload | 2 MiB |
| Unpacked ZIP | 8 MiB |
| Files in one ZIP | 100 |
| Path depth | 8 |
| Path length | 180 |
| Paths in one take | 50 |

Hidden paths, `..`, absolute paths, symlinks, encrypted ZIP entries and
extreme compression ratios are rejected. Existing personal files are never
overwritten silently.

## API

- `GET /api/shared/notes` — public listing of shared Markdown
- `GET /api/personal/notes` — logged-in projection of the caller's git
- `POST /api/personal/take-from-shared` — `{ "paths": [...], "expected_sha": optional }`
- `POST /api/personal/import-md` — multipart field `file` (`.md` or `.zip`)
