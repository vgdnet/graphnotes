# ADR-015 - Elasticsearch for the next search iteration

Status: Accepted (next iteration; not current MVP)
Accepted: 2026-09-04
Refines: ADR-001 (search is derived, Git/Markdown stays canon); ADR-008
(no second note corpus); ADR-011 (closed bodies stay out of other people's
search)

## Context

`#/card/` is the rhizome search hub and `#/card/{path}` is the card page
(PRODUCT_SPEC §6.5.2, TZ 2.25). The current engine is SQL against the
PostgreSQL derived index: title, path, slug, tags. That is enough for the
MVP tab.

The owner wants the next iteration to search **words, tags, and more**, as a
proper catalog, not only `ILIKE` on metadata. That is a new infrastructure
component (PRODUCT_SPEC §10 / §13.1). Elasticsearch is named for that wave.
It is not added to the current Compose stack.

## Decision

1. **When.** Elasticsearch is in scope for the **next product iteration**,
   not Stage 8/9 hardening and not the current MVP. Until that Stage file
   exists and this ADR's open questions are answered, `GET /api/search`
   stays PostgreSQL.
2. **What it is.** A **derived search replica**. Rebuildable from Git
   Markdown plus visibility flags. Not a second canon, not an editor, not
   a store of record. Authors keep writing in git / Obsidian (ADR-008).
3. **What it is not.** Not Neo4j. Not a reason to put canonical bodies in
   PostgreSQL. Not a public dump of closed or someone else's personal layer
   (ADR-011, §5.6).
4. **Product surface stays.** `#/card/` search, `#/card/{path}` card, access
   filter unchanged. ES must not invent a third URL scheme.
5. **Cutover.** SQL search remains until ES answers the same access tests.
   Search must not go empty during migration.

## Minimal requirements (settled)

These are the floor for the next-iteration Stage. They do not wait for the
open questions.

- Same visibility as §5.6: guest sees only published shared; a session sees
  that plus **own** personal overlay; closed/paid paths follow the lock
  rules; nobody else's personal corpus appears in hits.
- Guest still does not get the card **body** (page or API). Search snippets
  from the body are **off for guests** unless a later owner answer turns
  them on.
- Hits open `#/card/{path}` for those who may read that card.
- Index documents are keyed by rhizome path (and layer/owner where needed),
  tied to the same revision as the graph index, so a SHA move rebuilds
  search.
- Closed or unpublished paths are removed or filtered immediately; they
  must not linger in another user's hits.
- Operator: next-iteration Compose may add Elasticsearch (or a documented
  equivalent) bound like PostgreSQL — no extra public host port by default.

## Open questions (block implementation)

Do not start ES code until the owner answers these. Proposed defaults are
in parentheses; they are not accepted requirements.

1. **Bodies.** Index the Markdown **body** of published notes, or only
   richer metadata (title, path, tags, headings)? *(Proposal: published
   bodies yes — that is why ES exists.)*
2. **Own personal layer.** Index the caller's personal overlay in ES?
   *(Proposal: yes, only for that UUID's query.)*
3. **Guest snippets.** May the guest result list quote a sentence from a
   published body, or only title / path / tags? *(Proposal: no body quote
   for guests.)*
4. **Russian text.** Morphology / stemming / typo-tolerance in the first
   cutover, or exact tokens first? *(Proposal: Russian analyzer, no fuzzy
   ML.)*
5. **Several tags.** AND or OR? *(Proposal: AND.)*
6. **Facets besides tags.** Folders, author, date, graph degree? *(Proposal:
   tags only in the first ES cutover.)*
7. **Ranking.** Text score only, or recency / contribution / degree?
   *(Proposal: text score only at first.)*
8. **Where it runs.** Self-hosted in Compose on `rhizome-test` / `rhizome`,
   or a managed Elastic Cloud? OpenSearch if Elastic license is a problem?
   *(Proposal: self-hosted Elasticsearch in Compose, same environments as
   Postgres; license check before the Stage file.)*
9. **Freshness.** Rebuild on the same job as the graph SHA, or a separate
   near-real-time pipeline? *(Proposal: same revision job as the graph
   index.)*

## Consequences

- PRODUCT_SPEC §10: Elasticsearch leaves “no decision” and becomes
  “next iteration, ADR-015”.
- Current `#/card/` SQL search is the MVP engine and stays documented as
  such.
- A later Stage file owns Compose, secrets, rebuild, and tests that prove
  §5.6 on ES hits.
- If the owner later picks OpenSearch or managed Elastic, update this ADR;
  do not silently swap the engine.
