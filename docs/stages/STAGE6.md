# Stage 6 - Personal and Shared Graph UX

Status: PLANNED
Branch: `feature/06-personal-graph`
Depends on: accepted Stage 5

## User outcome

User переключается между своей единственной личной ризомой и единой общей,
исследует граф, видит unresolved links и открывает заметку из узла.

## Scope

- React/TypeScript/Cytoscape.js personal/shared views;
- явное обозначение слоя и indexed commit SHA/status;
- nodes, directed edges, isolated notes, unresolved nodes;
- note opening, filters by title/tag/link state;
- bounded initial graph and neighborhood expansion;
- loading, empty, stale, partial, truncated and error states;
- keyboard navigation and baseline accessibility;
- layout coordinates remain UI state, not canonical knowledge;
- no GitHub/workspace terminology required from ordinary user.

## Security and scale

- frontend is not a security boundary;
- backend permits shared read and own-personal read only;
- URL/query cannot select another user's personal layer;
- Markdown/labels sanitized;
- private content not publicly cached;
- UI never requires loading the entire shared rhizome;
- bounds/truncation are visible to user;
- representative large graph remains responsive within recorded baseline.

## Out of scope

- proposals/merge/graph diff;
- graph-based editing without separate decision;
- multiple shared/personal rhizomes;
- workspace navigation.

## Verification

- personal/shared browser flows;
- empty, one-node, disconnected, cyclic, unresolved and large fixtures;
- node opens correct note;
- filters and bounded expansion;
- another user's personal layer rejected;
- XSS inert;
- accessibility/keyboard smoke;
- frontend and exact-SHA integration on `rhizome-test`.

## Definition of Done

- user clearly distinguishes personal and shared layers;
- states/limits/staleness are understandable;
- shared graph is bounded by default;
- ownership isolation is proven;
- `STAGE6_COMPLETED.md` records flows and performance dataset.
