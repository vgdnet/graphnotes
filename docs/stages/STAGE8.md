# Stage 8 - Proposal Graph Diff

Status: PLANNED
Branch: `feature/08-graph-diff`
Depends on: accepted Stage 7

## User outcome

Proposal author and editor/admin see how an immutable proposal changes the one
shared rhizome: added, removed or modified notes, links, directions/types, tags
and properties before publication.

## Scope

- deterministic diff between proposal base/head Git revisions;
- added/removed/modified nodes;
- added/removed/direction-or-type-changed edges;
- tag/property changes and resolved↔unresolved transitions;
- relation to textual Markdown diff and proposal ID;
- bounded/paginated API with summary/counts/completeness;
- Cytoscape preview, legend, non-color markers and affected neighborhood;
- stale/outdated/incomplete/conflict/no-structural-change states;
- derived cache keyed by exact revisions/proposal, never canonical graph.

## API baseline

```text
GET /api/graph/diff?proposal_id=...
```

## Correctness and authorization

- diff is derived from canonical Markdown/Git states;
- identical revisions produce empty diff;
- failed parsing/indexing is incomplete, never silently empty;
- proposal author sees own diff;
- editor/admin sees proposal review diff;
- unrelated user cannot access another proposal;
- arbitrary SHA comparison is not exposed;
- response has size/time bounds and explicit truncation;
- self-approval prohibition remains enforced by Stage 7 decision endpoint.

## Scale risks

- large diffs provide summary before detail;
- changed-neighborhood loading avoids full shared graph transfer;
- indexes/cache retention prevent unbounded proposal-version growth;
- correctness is checked against clean rebuild of both revisions;
- measured baseline precedes any new infrastructure.

## Out of scope

- custom merge engine;
- graph-based canonical editing;
- multiple shared comparison targets;
- semantic truth/quality scoring.

## Verification

- fixtures for node/link/direction/type/tag/property/unresolved changes;
- rename/content-only/no-change cases;
- diff equals clean re-index comparison;
- incomplete/stale result visible;
- author/editor/admin authorization and unrelated-user rejection;
- large diff bounds/truncation;
- accessible visual details;
- end-to-end proposal preview on `rhizome-test` exact SHA.

## Definition of Done

- editor/admin sees textual and graph impact before decision;
- author sees own proposal impact;
- preview is tied to immutable base/head SHA;
- incomplete/truncated state cannot look complete;
- Stage 2–8 satisfy feature-complete MVP criteria;
- `STAGE8_COMPLETED.md` records correctness and scale evidence;
- alpha tag requires Observer PASS and owner authorization.
