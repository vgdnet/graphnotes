# Stage 4 - Take from shared / ZIP fallback

Status: DONE
Branch: `feature/04-markdown-import`
Depends on: accepted Stage 3
Product model: ADR-007, ADR-008

Имя ветки историческое. Продуктовый смысл стадии — взять выбранное из общей
ризомы в git пользователя; ZIP/один `.md` — запасной ingest, не in-app vault.

## User outcome

User берёт выбранные заметки/связи из общей ризомы в свой подключённый git и
видит отчёт. Fallback: безопасный импорт одного Markdown-файла или ZIP в тот же
personal git. Каждое успешное изменение связано с personal Git commit SHA.

GraphNotes не предоставляет Obsidian-class CRUD-редактор.

## Scope

- take selected shared paths/notes into the connected personal remote;
- fallback upload одного `.md` и ZIP с Markdown;
- limits для request/archive/unpacked bytes/file count/depth;
- защита от traversal, absolute paths, symlink/hardlink и archive bombs;
- детерминированные UTF-8 Git paths и conflict handling без тихой перезаписи;
- title, YAML frontmatter, aliases, tags, wikilinks и Markdown links из
  принятых файлов (для последующего индекса);
- unresolved links как производное состояние;
- optimistic concurrency по expected personal revision;
- commit только в personal remote authenticated user;
- report: accepted, rejected, skipped, conflicted, warnings;
- audit take/import с actor, path и resulting SHA без полного private content.

## API baseline

```text
GET  /api/shared/notes                # public listing of shared Markdown
POST /api/personal/take-from-shared
POST /api/personal/import-md          # fallback
GET  /api/personal/notes              # read-only projection
GET  /api/personal/notes/{path}
```

## Security and consistency

- user cannot write shared state or another user's personal remote;
- MIME/extension/content validation does not trust filename alone;
- safe YAML parser performs no object construction;
- rendered Markdown, if shown, is sanitized against XSS;
- parser executes no HTML/JS/templates/embedded code;
- stale take/import returns conflict instead of overwriting newer Git state;
- Git failure cannot leave an accepted derived record without canonical file;
- successful response includes/links resulting personal revision;
- canonical note bodies are not stored in PostgreSQL.

## Out of scope

- editor merge queue (Stage 7);
- graph UI (Stage 6);
- graph engine (Stage 5) beyond whatever index hook Stage 4 must leave;
- workspace or multiple personal remotes per user;
- Obsidian-class in-app editor;
- external import formats/attachments without explicit scope change.

## Verification

- take-from-shared happy path into connected personal git;
- single MD/ZIP fallback happy paths;
- malformed YAML/encoding, unsupported files and duplicates;
- traversal/symlink/absolute path/archive bomb/limit cases;
- XSS payload remains inert;
- two-user ownership isolation;
- stale-revision conflict and Git/API/DB failure rollback;
- Git history/resulting SHA verified in test repository;
- full frontend/integration flow on `rhizome-test`.

## Definition of Done

- user has exactly one connected personal git;
- user can take selected shared pieces into that git;
- ZIP/MD remains fallback only;
- user cannot modify shared or another personal remote;
- Markdown/Git remains source of truth;
- reports and conflicts are accurate;
- `STAGE4_COMPLETED.md` records limits, fixtures and observed results.
