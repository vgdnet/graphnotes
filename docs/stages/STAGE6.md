# Stage 6 - Shared graph + personal overlay

Status: CURRENT
Branch: `feature/06-personal-graph`
Depends on: accepted Stage 5
Product model: ADR-007, ADR-008

Имя ветки историческое. Продуктовый смысл — живой граф **общей** ризомы и
overlay того, как git пользователя связан с ней. Не клон локального графа
Obsidian.

## User outcome

User исследует граф общей ризомы, видит unresolved links и открывает исходный
Markdown из узла. При подключённом git видит, какие свои заметки/связи относятся
к общей ризоме. Если knowledge repository публичный, граф общей может быть
доступен без аккаунта.

## Scope

- React/TypeScript/Cytoscape.js shared graph;
- personal overlay: links from connected personal git to shared;
- явное обозначение слоя и indexed commit SHA/status;
- nodes, directed edges, isolated notes, unresolved nodes;
- note opening as **read** of source Markdown;
- filters by title/tag/link state;
- bounded initial graph and neighborhood expansion;
- loading, empty, stale, partial, truncated and error states;
- keyboard navigation and baseline accessibility;
- layout coordinates remain UI state, not canonical knowledge;
- no GitHub PR vocabulary required from ordinary user.

## Security and scale

- frontend is not a security boundary;
- backend permits shared read (public graph if repo is public) and own-personal
  overlay read only;
- URL/query cannot select another user's personal overlay;
- Markdown/labels sanitized;
- private personal content not publicly cached;
- UI never requires loading the entire shared rhizome;
- bounds/truncation are visible to user;
- representative large graph remains responsive within recorded baseline.

## Out of scope

- proposals/merge/graph diff;
- graph-based editing without separate decision;
- multiple shared/personal rhizomes;
- workspace navigation;
- Obsidian-class editor, backlinks panel, local-note graph as vault replacement.

## Verification

- shared graph browser flow, including unauthenticated public read if enabled;
- overlay flow for a connected personal git;
- empty, one-node, disconnected, cyclic, unresolved and large fixtures;
- node opens correct source Markdown;
- filters and bounded expansion;
- another user's personal overlay rejected;
- XSS inert;
- accessibility/keyboard smoke;
- frontend and exact-SHA integration on `rhizome-test`.

## Definition of Done

- user can live in the shared graph;
- overlay of personal-to-shared links is understandable;
- states/limits/staleness are understandable;
- shared graph is bounded by default;
- ownership isolation is proven;
- `STAGE6_COMPLETED.md` records flows and performance dataset.
