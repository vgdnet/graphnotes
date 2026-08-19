# ADR-009 - Differ and Markdown circulation

Status: Accepted
Accepted: 2026-08-19
Refines: ADR-008 (how Markdown moves between personal git and the shared rhizome)
Supersedes in part: the ADR-008 user action «take selected shared notes into
the user's git» as a GraphNotes write into personal git

## Context

Stage 4 taught GraphNotes to copy selected shared Markdown into the connected
personal git (`take-from-shared`). Stage 7 then asked the user to pick personal
files and type a summary to propose them back. That UI does not match how
people actually work:

- they write in their own vault/git;
- they need the current shared corpus as files, not a second GraphNotes commit
  into their remote;
- they need GraphNotes to **find what they have that the shared rhizome does
  not**, propose that set, and stop nagging when there is nothing left.

The owner decided the circulation of Markdown is one product loop, with a named
comparison entity — **Differ** — and a simple download of the published shared
rhizome as a ZIP. Putting that ZIP into the user's git is out of scope for now.

## Decision

### Circulation

```text
write Markdown in personal git
  -> Differ(personal, published shared)
      -> user selects differences
          -> proposal
              -> editor queue
                  -> accept / reject / return / rollback
                      -> merge into shared default branch
                          -> index
                              -> Differ again
                                  -> empty when nothing remains to publish
```

The opposite direction is not a GraphNotes git write. The user downloads a ZIP
of the **published** shared rhizome (the same Markdown the graph shows). A
public clone of the knowledge repository remains valid and does not need an
account.

### Differ

Differ is a first-class product entity, not a GitHub PR and not a stored second
corpus.

- Inputs: the caller's connected personal git revision and the **published**
  shared revision (the revision readers and the graph currently see).
- Direction: **personal → shared only**. It answers «what can this user offer
  the shared rhizome?»
- A difference is a personal Markdown path that is missing from shared, or
  present in both with different content.
- Files that exist only in shared are **not** Differ results. Those are
  obtained by downloading the ZIP (or cloning git).
- Empty Differ means this personal git has nothing unpublished toward shared.
- Differ is derived from Git Markdown. It is not canonical. It is not a
  `graph.json`. PostgreSQL must not store note bodies to compute it.
- The user proposes a **selected subset** of Differ results, not the entire
  personal vault and not a mandatory free-text summary as the primary control.
- After editor acceptance and successful shared indexing, Differ for those
  paths is empty.

Graph Diff (Stage 8) is the **structural** view of a proposal / Differ set
(nodes, edges, unresolved). Differ itself is the comparison that feeds the
queue; it must exist as a list/text product before graph visualization.

### Download

`Скачать` returns a ZIP of Markdown for the current published shared revision.
It is a read of shared knowledge, not an editor action. Writing that archive
into the user's git from GraphNotes is deferred; the link at the bottom of the
shared view is enough for MVP.

ZIP/MD **upload** into personal git remains an optional fallback ingest, not
the download path and not an in-app vault.

### What this does not change

- Markdown in Git is still the source of truth (ADR-001).
- One shared rhizome, one personal git per user, global RBAC (ADR-007).
- GraphNotes is not a second Obsidian (ADR-008).
- Editors still cannot approve their own proposals.
- Publication remains atomic: readers see old-complete or new-complete shared
  revision.
- No custom three-way merge engine.

## Consequences

- `PRODUCT_SPEC` 1.6 describes Differ, ZIP download, and the circulation loop.
- Stage 4 `take-from-shared` remains historically delivered; it is no longer
  the product path for «get shared Markdown».
- Stage 7 owns Differ (list of differences + create proposal from selection)
  and the shared ZIP download in the UI.
- Stage 8 visualizes Differ/proposal as Graph Diff; it does not invent a second
  comparison model.
- GraphNotes must not require the user to understand branch, SHA or Pull
  Request to download, compare, propose or decide.
