# Deployment

These notes are for a person who clones GraphNotes and runs it. They are not
a product specification.

| Order | File | What it covers |
| --- | --- | --- |
| 1 | [STAGE1_DEPLOYMENT.md](STAGE1_DEPLOYMENT.md) | Compose, ports, Git vs SSH delivery, `rhizome-test` overlay |
| 2 | [STAGE2_AUTH.md](STAGE2_AUTH.md) | First admin bootstrap, sessions, roles |
| 3 | [STAGE3_GITHUB.md](STAGE3_GITHUB.md) | GitHub App key, env names, shared repository |
| 4 | [STAGE4_INGEST.md](STAGE4_INGEST.md) | ZIP/Markdown upload fallback and historical take-from-shared |
| 5 | [STAGE5_INDEX.md](STAGE5_INDEX.md) | Derived graph index and rebuild |
| 6 | [STAGE6_GRAPH.md](STAGE6_GRAPH.md) | Shared graph UI and personal overlay |
| 7 | [STAGE7_PROPOSALS.md](STAGE7_PROPOSALS.md) | Differ, ZIP download, editor queue |
| 8 | [STAGE8_GRAPH_DIFF.md](STAGE8_GRAPH_DIFF.md) | Graph Diff of a proposal |

Keep secrets out of git. The GitHub App private key belongs in `.secrets/` on
the host, never in this repository.
