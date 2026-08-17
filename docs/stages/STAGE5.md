# Stage 5 - Graph Engine

Status: PLANNED
Branch: `feature/05-graph-engine`
Depends on: accepted Stage 4

## User outcome

Импортированное Markdown-состояние преобразуется в быстрый, согласованный и
восстановимый граф знаний. Ошибка индекса не повреждает канонический Markdown.

## Scope

- производные модели `note_index`, `note_links`, `tags`, `note_tags` и
  `sync_jobs`;
- workspace, layer/owner, Git path, content hash и commit SHA в индексе;
- resolved и unresolved directed links;
- полная безопасная rebuild и инкрементальная re-index affected notes;
- идемпотентные sync jobs с observed status/error/timestamps;
- обнаружение расхождения indexed SHA и Git SHA;
- Graph API contract для nodes/edges и ограниченного подграфа;
- базовые filters/pagination/limits;
- admin-triggered rebuild с audit event;
- тестовые fixtures для пустого, изолированного, циклического и частично
  разрешённого графа.

## API baseline

```text
GET  /api/workspaces/{id}/graph/personal
GET  /api/workspaces/{id}/graph/shared
POST /api/workspaces/{id}/index/rebuild   # authorized admin operation
GET  /api/workspaces/{id}/repo/status     # includes index consistency
```

Stage 5 создаёт backend contract; полноценная Cytoscape UX относится к Stage 6.

## Source-of-truth rules

- PostgreSQL не хранит канонический Markdown вместо Git;
- узлы/edges не редактируются как самостоятельное знание;
- rebuild из конкретного Git SHA воспроизводит эквивалентный индекс;
- при конфликте Git и БД побеждает Git/Markdown;
- запрещён canonical `graph.json`;
- индекс не считается current без matching commit SHA.

## Security and scale

- все graph queries ограничены workspace membership;
- owner/personal layer другого пользователя недоступен;
- запрос имеет bounded node/edge limit;
- rebuild защищён ролью, concurrency guard и понятным status;
- parser/index errors не раскрывают чужой content;
- N+1 и загрузка всей базы по умолчанию исключены тестом/профилированием.

## Out of scope

- production graph UI;
- proposal/PR/merge;
- graph diff между Git-состояниями;
- Neo4j/Elasticsearch;
- редактирование Markdown через graph.

## Verification

- deterministic full rebuild twice produces same logical result;
- incremental result equals clean full rebuild;
- unresolved link становится resolved после появления target;
- удаление/rename не оставляет stale edges;
- cyclic/self/duplicate links handled deterministically;
- index SHA mismatch visible and recoverable;
- workspace/personal isolation negative tests;
- bounded subgraph and query-count/performance baseline;
- migration and rebuild tested on `rhizome-test` exact SHA.

## Definition of Done

- индекс полностью восстанавливается из Git/Markdown;
- Graph API возвращает корректные nodes/edges для edge-case fixtures;
- stale/failed sync наблюдаем и не выдаётся за current;
- ограничения размера запроса зафиксированы;
- создан `STAGE5_COMPLETED.md` с schema, rebuild evidence и performance baseline.
