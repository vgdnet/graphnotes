# Stage 4 - Markdown Import and Personal Editing

Status: PLANNED
Branch: `feature/04-markdown-import`
Depends on: accepted Stage 3

## User outcome

User безопасно импортирует один Markdown-файл или ZIP, видит отчёт и создаёт,
читает, редактирует, переименовывает или удаляет заметки только в своей личной
ризоме. Каждое успешное изменение связано с personal Git commit SHA.

## Scope

- upload одного `.md` и ZIP с Markdown;
- limits для request/archive/unpacked bytes/file count/depth;
- защита от traversal, absolute paths, symlink/hardlink и archive bombs;
- детерминированные UTF-8 Git paths и conflict handling без тихой перезаписи;
- title, YAML frontmatter, aliases, tags, wikilinks и Markdown links;
- unresolved links как производное состояние;
- personal note create/read/update/rename/delete;
- optimistic concurrency по expected personal revision;
- commit только в personal state authenticated user;
- import report: accepted, rejected, skipped, conflicted, warnings;
- audit import/edit/delete с actor, path и resulting SHA без полного private
  content.

## API baseline

```text
POST /api/personal/import-md
GET  /api/personal/notes
POST /api/personal/notes
GET  /api/personal/notes/{id}
PUT  /api/personal/notes/{id}
DELETE /api/personal/notes/{id}
```

## Security and consistency

- user cannot write shared state or another user's personal state;
- MIME/extension/content validation does not trust filename alone;
- safe YAML parser performs no object construction;
- rendered Markdown is sanitized against XSS;
- parser executes no HTML/JS/templates/embedded code;
- stale edit returns conflict instead of overwriting newer Git state;
- Git failure cannot leave an accepted derived record without canonical file;
- successful response includes/links resulting personal revision.

## Out of scope

- direct shared editing (Stage 7, editor/admin only);
- graph UI;
- proposals/merge/graph diff;
- workspace or multiple personal rhizomes per user;
- external import formats/attachments without explicit scope change.

## Verification

- single MD/ZIP happy paths and note CRUD;
- malformed YAML/encoding, unsupported files and duplicates;
- traversal/symlink/absolute path/archive bomb/limit cases;
- XSS payload remains inert;
- two-user ownership isolation;
- stale-edit conflict and Git/API/DB failure rollback;
- Git history/resulting SHA verified in test repository;
- full frontend/integration flow on `rhizome-test`.

## Definition of Done

- user has exactly one editable personal rhizome;
- user cannot modify shared or another personal rhizome;
- Markdown/Git remains source of truth;
- import report and edit conflicts are accurate;
- `STAGE4_COMPLETED.md` records limits, fixtures and observed results.
