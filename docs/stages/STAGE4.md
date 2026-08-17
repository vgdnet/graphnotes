# Stage 4 - Markdown Import

Status: PLANNED
Branch: `feature/04-markdown-import`
Depends on: accepted Stage 3

## User outcome

Пользователь безопасно загружает один Markdown-файл или ZIP-набор, получает
понятный отчёт и видит импортированные заметки в своём личном Git-состоянии.

## Scope

- upload одного `.md` и ZIP с Markdown;
- явно заданные лимиты размера запроса, архива, распакованных данных, числа и
  глубины файлов;
- безопасная нормализация UTF-8 имён и Git paths;
- защита от absolute paths, `..`, symlink/hardlink и archive bombs;
- детерминированное разрешение конфликтов имён без тихой перезаписи;
- извлечение title, YAML frontmatter, aliases, tags, wikilinks и Markdown links;
- сохранение исходного Markdown без превращения БД в источник истины;
- unresolved links сохраняются как производное состояние;
- commit импортированных изменений в personal Git state пользователя;
- import report: accepted, rejected, skipped, conflicted и warnings;
- просмотр списка заметок и конкретной заметки в пределах workspace.

## API baseline

```text
POST /api/workspaces/{id}/upload-md
GET  /api/workspaces/{id}/notes
GET  /api/notes/{id}
```

## Parser contract

- frontmatter обрабатывается безопасным YAML parser без object construction;
- title precedence фиксируется тестами;
- wikilinks и Markdown links сохраняют исходное представление;
- external links не превращаются во внутренние edges;
- aliases/tags нормализуются детерминированно;
- parser не исполняет HTML, JavaScript, templates или embedded code;
- ошибки одного файла не должны скрывать результат остальных файлов.

## Security and authorization

- import разрешён только active workspace member;
- пользователь пишет только в собственное personal state;
- MIME/extension/content validation не полагается только на имя файла;
- временные файлы очищаются, права минимальны;
- Markdown при отображении санитизируется против XSS;
- Git paths не могут выйти за разрешённый root;
- логи не содержат полный private content без отдельной необходимости.

## Consistency

- успешный отчёт связан с resulting commit SHA;
- частичный failure не сообщает ложный полный успех;
- повторная загрузка имеет определённое поведение;
- БД-состояние можно перестроить из committed Markdown;
- Git commit failure не оставляет утверждённый индекс без канонического файла.

## Out of scope

- Cytoscape и graph UI;
- shared merge/PR;
- graph diff;
- Notion/Roam/Logseq import и attachments без отдельного решения;
- real-time editing.

## Verification

- single MD и ZIP happy paths;
- empty, invalid encoding, malformed YAML и unsupported files;
- traversal, absolute path, symlink, duplicate path и decompression bomb cases;
- лимиты на размер/число/глубину;
- XSS payload остаётся неисполняемым;
- workspace/user isolation;
- rollback при Git/API/DB failure;
- resulting Markdown и commit SHA проверены в test repository;
- migration и full integration flow на `rhizome-test`.

## Definition of Done

- пользователь завершает импорт через frontend;
- отчёт точно отражает каждый файл;
- imported Markdown находится в personal Git state;
- parser contract покрыт fixtures и негативными тестами;
- secrets/private content не протекают;
- создан `STAGE4_COMPLETED.md` с observed limits и test corpus summary.
