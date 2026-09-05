# Stage 4 ingest operations

Published shared is **not** obtained by ZIP or product clone (TZ 2.5).
ZIP / one `.md` **upload** is a personal-layer ingest: into connected personal
git if bound, otherwise no-git staging for the same Differ (TZ 2.6). Upload
is not a download of shared and not a write into published shared.

`POST /api/personal/take-from-shared` is gone (HTTP 410): GraphNotes does not
write published shared notes into the personal layer. Canonical **published**
note bodies are not stored in PostgreSQL. Unpublished upload bytes may live in
the owner's staging layer.

## GitHub App permission

Stage 3 used Contents **read**. Live writes into a **connected personal git**
need Contents **Read and write** on that repository (`vgdnet/guide_psy` on
`rhizome-test`). After changing the permission, approve the installation
update on GitHub.

Upload-without-git does not need write to a user repository.

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

Hidden paths, `..`, absolute paths, symlinks, encrypted ZIP entries and
extreme compression ratios are rejected. Connected personal git is never
overwritten silently (conflict). Upload-without-git replaces the staged path
and records a new history event.

## API

- `GET /api/shared/notes` — public listing of shared Markdown (in-app read)
- `GET /api/personal/notes` — logged-in projection of the caller's personal layer
- `GET /api/personal/uploads` — upload history (path, hash, time)
- `POST /api/personal/take-from-shared` — gone (HTTP 410)
- `POST /api/personal/import-md` — multipart field `file` (`.md` or `.zip`)
