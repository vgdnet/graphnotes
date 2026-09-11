# Stage 4 ingest operations

Published shared is **not** obtained by ZIP or product clone (TZ 2.5).
ZIP / one `.md` **upload** copies into the local personal store
(`personal_uploads`), including when git is connected (TZ 2.62). Upload
is not a download of shared and not a write into published shared.

`POST /api/personal/take-from-shared` is gone (HTTP 410): GraphNotes does not
write published shared notes into the personal layer. Published shared
working copies live in `shared_notes` after copy-in; `note_index` is the
search/graph index, not a second corpus.

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
| Files in one ZIP | 10 000 |
| Path depth | 8 |
| Path length | 180 |

Hidden paths, `..`, absolute paths, symlinks, encrypted ZIP entries and
extreme compression ratios are rejected. The file-count cap is 10 000 so an
Obsidian vault or personal git dump (thousands of notes; ~120 files must
succeed) is accepted; over the cap the API returns HTTP 400
`archive has too many files`. Raising the count does not remove zip-bomb
guards (compressed size, unpacked size, per-file size, compression ratio).
Connected personal git is never overwritten silently (conflict).
Upload-without-git replaces the staged path and records a new history event.

## API

- `GET /api/shared/notes` — public listing of shared Markdown (in-app read)
- `GET /api/personal/notes` — logged-in projection of the caller's personal layer
- `GET /api/personal/notes/{path}` — personal card body (`source` is the full file)
- `PUT /api/personal/notes/{path}` — own personal only; `source` + `expected_hash`;
  404 if the path is missing, 409 if the hash is stale; writes git XOR upload store;
  records `rhizome_events` (`edited` / `linked` / `unlinked`) with `owner_user_id`
  and no Markdown bodies (Alembic `0014_personal_edit_events`)
- `GET /api/cards/{path}/feed` — card history; personal in-app edits are owner-scoped
  and do not mix into `GET /api/shared/notes/{path}/feed` for the same git path
- `GET /api/personal/uploads` — upload history (path, hash, time)
- `POST /api/personal/take-from-shared` — gone (HTTP 410)
- `POST /api/personal/import-md` — multipart field `file` (`.md` or `.zip`)
