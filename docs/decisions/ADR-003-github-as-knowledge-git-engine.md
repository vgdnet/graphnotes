# ADR-003 - GitHub as the knowledge Git engine

**Status: Superseded** (owner 2026-09-21). Not living canon. Do not read
this file as ingest, store, or merge spec.

Living product: `docs/product/PRODUCT_SPEC.md` **3.40** +
`docs/context/MASTER_CONTEXT.md`. GitHub is **source-code delivery only**
(ADR-006). Knowledge ingest is Obsidian →
plugin → GraphNotes stores. GitHub **`https://github.com/vgdnet/rhizome`**
is **private** (owner 2026-09-21): not ingest, not a public product.
Index: `docs/decisions/README.md`.

## Decision
Use GitHub rather than building/self-hosting a Git engine for the first product version.

GitHub handles Git repositories, branches, commits, diffs, Pull Requests and merge.
GraphNotes builds the knowledge-specific UX and graph indexing/diff layer.

## Consequences
- no custom Git/merge implementation in MVP
- no Gitea/GitLab requirement initially
- product integration is scheduled for Stage 3

## Amendment 2026-09-11 (TZ 2.61)

Owner decision: the **user's** knowledge store is GraphNotes, not GitHub.
Product analog is [Obsidian Publish](https://publish.obsidian.md): hosted graph
and cards per person, plus access rights, plus exactly one shared rhizome.

GitHub remains:

1. delivery of **GraphNotes source** (`nord → GitHub → rhizome-test → rhizome`,
   ADR-006) — unchanged;
2. **optional** personal git (XOR with the hosted store), not the default path;
3. leftover Git engine for **shared** merge in the current stack. Do not rip
   the GitHub App out of the running product in the 2.61 documentation wave.

Do not add MinIO/S3/Gitea because of this amendment. Ordinary UX is «мой граф»,
«общая ризома», Differ — not «your GitHub disk».

## Amendment 2026-09-11 (TZ 2.63)

GitHub is **only a source** for knowledge Markdown: personal connector and the
shared knowledge repo **copy** `.md` into GraphNotes local stores
(`personal_uploads`, `shared_notes`). Cards, graph rebuild and Differ read
those copies. Editor accept may still **push** through the GitHub App as
leftover merge, then copy-in again. Do not rip the App this wave. Do not add
Gitea/MinIO.
