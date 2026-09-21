# ADR-003 - GitHub as the knowledge Git engine

Status: Superseded / leftover vs TZ **3.37** (owner 2026-09-21). Not living
product. GitHub remains **source-code delivery only** (ADR-006:
`nord → GitHub → rhizome-test`). Do not treat this file as ingest/merge canon.

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
