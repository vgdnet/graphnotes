# Deployment

These notes are for a person who clones GraphNotes and runs it. They are not
a product specification. Delivery path and merge rules:
[INTEGRATOR.md](INTEGRATOR.md).

| Order | File | What it covers |
| --- | --- | --- |
| 1 | [STAGE1_DEPLOYMENT.md](STAGE1_DEPLOYMENT.md) | Compose, ports, Git vs SSH delivery, `rhizome-test` overlay |
| 2 | [STAGE2_AUTH.md](STAGE2_AUTH.md) | First admin bootstrap, sessions, roles, optional SMTP |
| 3 | [STAGE3_GITHUB.md](STAGE3_GITHUB.md) | leftover git-host App key/env (not canon ingest, TZ 3.35 / 3.37) |
| 4 | [STAGE4_INGEST.md](STAGE4_INGEST.md) | `.md`/ZIP upload into personal layer (git or no-git); shared is not downloadable |
| 5 | [STAGE5_INDEX.md](STAGE5_INDEX.md) | Derived graph index and rebuild |
| 6 | [STAGE6_GRAPH.md](STAGE6_GRAPH.md) | Shared graph UI and personal overlay |
| 7 | [STAGE7_PROPOSALS.md](STAGE7_PROPOSALS.md) | Differ (git or upload), editor queue; no shared ZIP |
| 8 | [STAGE8_GRAPH_DIFF.md](STAGE8_GRAPH_DIFF.md) | Graph Diff of a proposal |
| — | [OBSIDIAN_PLUGIN_API.md](OBSIDIAN_PLUGIN_API.md) | Obsidian plugin: retrievable `gnp_` token, capabilities, personal transfer; client TZ 2.82 auto-copies vault edits |

Keep secrets out of git. Leftover git-host App private key belongs in `.secrets/` on
the host, never in this repository.
