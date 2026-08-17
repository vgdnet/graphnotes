# Stage 6 - Personal and Shared Graph

Status: PLANNED
Branch: `feature/06-personal-graph`
Depends on: accepted Stage 5

## User outcome

Пользователь открывает workspace и визуально исследует личный и доступный
общественный граф, различает unresolved links и переходит от узла к заметке.

## Scope

- React + TypeScript + Cytoscape.js visualization;
- personal и shared graph views на основе Graph API;
- явное обозначение текущего layer и indexed commit SHA/status;
- nodes, directed edges, isolated notes и unresolved nodes;
- открытие/просмотр заметки из узла;
- базовые фильтры по title/tag/link state;
- bounded initial graph и загрузка ограниченного подграфа;
- loading, empty, stale, partial и error states;
- keyboard navigation и базовая accessibility;
- устойчивое поведение layout без превращения координат в источник истины;
- понятный UX без требования знания GitHub branches/SHA.

## Product boundary

Stage 6 показывает существующее Markdown-состояние. Редактирование узла или
edge через graph не входит в scope без отдельного продуктового решения и ADR.

## Security and privacy

- frontend не является security boundary;
- backend повторно проверяет workspace и layer access;
- URL/query parameters не позволяют открыть personal graph другого user;
- private Markdown/content не кэшируется публично;
- rendered Markdown и labels санитизированы;
- ошибки не раскрывают существование недоступных workspaces/notes.

## Performance and UX requirements

- UI не требует загрузки всего workspace graph;
- node/edge limits и truncation объясняются пользователю;
- взаимодействие остаётся отзывчивым на согласованном test dataset;
- смена фильтра/layer не показывает stale data как current;
- refresh корректно восстанавливает выбранный workspace/view;
- цвет не является единственным способом различать критические состояния.

## Out of scope

- proposal creation и merge;
- graph diff;
- collaborative editing;
- provenance/цветовая система сверх необходимой базовой различимости;
- прямое изменение Markdown через canvas.

## Verification

- real browser flows для personal/shared views;
- empty, one-node, disconnected, cyclic и unresolved fixtures;
- node opens correct note;
- filters and bounded expansion;
- forbidden workspace/personal layer rejected by backend;
- XSS content remains inert;
- accessibility smoke checks и keyboard path;
- frontend build/tests и exact-SHA integration на `rhizome-test`;
- browser не обращается напрямую к GitHub.

## Definition of Done

- пользователь видит личный и общественный граф через frontend;
- состояния слоя, загрузки, ошибки и stale index понятны;
- большой граф не загружается целиком без ограничения;
- isolation подтверждена негативными тестами;
- создан `STAGE6_COMPLETED.md` с UX flows и performance dataset.
