# ADR-008 - Authoring in Git/Obsidian, GraphNotes as shared rhizome layer

Status: Superseded / leftover vs TZ **3.37** (owner 2026-09-21). Git as
personal remote / merge engine is not living product. Authors write in
Obsidian; the plugin copies `.md`. GitHub is source delivery (ADR-006)
only. Do not invent new ADR text here.
Accepted: 2026-08-19
Refines: ADR-007 (personal rhizome location and ingest); ADR-003 (Git remains the merge engine)
Partially superseded by: ADR-009 (Differ and ZIP download replace take-into-git);
  TZ 2.61 / amendment 2026-09-11 (hosted personal store is the default; git XOR)

## Context

Earlier drafts treated GraphNotes as a second Markdown editor and vault
(Obsidian-like preview, wikilink autocomplete, backlinks, local graph, in-app
note CRUD). That duplicates Obsidian. Users already write notes in a local
folder and can version them with tools such as
[obsidian-git](https://github.com/vinzent03/obsidian-git).

A short-lived implementation stored note bodies in PostgreSQL and copied
personal notes into a shared list. That is not the product: rhizomes are
graphs of Markdown in Git, not note lists in a database.

The owner decided GraphNotes is not another Obsidian. GraphNotes exists so
that:

- a **group of editors** can assemble **one shared rhizome** from proposed
  Git changes, with history and rollback;
- a **reader/user** can view that rhizome as a graph, download its published
  Markdown as a ZIP, and see how their notes connect to the shared graph;
- anyone may **read** the shared knowledge Git repository without an account
  when that repository is public;
- writing into the shared rhizome requires GraphNotes registration, a
  connected personal Git remote, a proposal, and editor acceptance.

## Decision

### Source of truth and versioning

Markdown in Git remains the only canonical knowledge content. GraphNotes does
not store a parallel note corpus and does not implement a custom merge engine.
GitHub remains the Git engine (ADR-003). Rollback of the shared rhizome is Git
history on the shared default branch.

### Two Gits, one shared rhizome

- **Shared rhizome:** exactly one knowledge repository per GraphNotes
  installation (ADR-007). It may be public for clone/fetch. Opening it for
  read is how the rhizome is given to the world.
- **Personal rhizome:** the user's own Git repository, typically an Obsidian
  vault synced by obsidian-git (or equivalent). GraphNotes does not host a
  second personal vault as a product database. The earlier `user/<uuid>`
  branch-on-the-shared-repo recipe is an implementation sketch, not the
  long-term product story.

A contributor registers, connects that personal Git remote, and proposes
changes against the shared repository. Several people may propose edits to
the same file; each proposal is a separate Git-backed request. Editors merge
or reject in GraphNotes. Conflicts are resolved in the editor flow, not by
last-write-wins in PostgreSQL.

### What GraphNotes is

1. Graph of the shared rhizome (and how the viewer's connected git relates to
   it).
2. User action: download the published shared rhizome as a ZIP (ADR-009).
3. User action: Differ, then propose selected differences into the shared
   rhizome (ADR-009).
4. Editor/admin action: human-friendly queue of proposals (text + structural
   impact), accept / reject / return, merge into one shared rhizome, rollback.

There must be more than one editor in the intended operating model; filling
the shared rhizome is a group editorial process.

### What GraphNotes is not (MVP)

- an Obsidian-class editor (live preview, `[[wikilink]]` autocomplete,
  backlinks panel, local graph as an editor feature);
- a PostgreSQL markdown store that users copy between layers;
- a requirement that anonymous readers log in to clone or fetch public shared
  knowledge.

ZIP/folder upload remains a fallback ingest into the connected personal git,
not the primary path. Primary ingest is git.

### PostgreSQL

Application users, roles, proposal metadata (author, status, base/head SHA,
decision), audit, and the **derived** graph index. Not canonical note bodies.

### Authentication boundary

Password accounts are required to connect a personal git, propose from Differ
into the shared rhizome, and act as editor/admin.

Public clone/fetch of a public shared knowledge repository does not require a
GraphNotes account. If that repository is public, GraphNotes may also show the
shared graph without login. Write actions always require an account.

GitHub App credentials stay on the backend. Ordinary users are not given those
credentials. A public knowledge repository is still cloneable with ordinary Git.

### Delivery waves (product, not a license to skip stages)

1. Live shared graph, then overlay of how a connected personal git relates to
   it.
2. Proposals and the editor merge queue after people can live in the two
   graph layers.
3. Graph Diff as an editor tool after the queue exists.
4. Obsidian-class in-app editing is out of MVP on purpose.

Stage numbers stay sequential. Stage 7 is the **core editor product**, not a
thin wrapper around GitHub PR vocabulary.

## Consequences

- `PRODUCT_SPEC` 1.3, `MASTER_CONTEXT`, Observer context, stage index and
  Stages 3, 4, 6, 7 must describe two Gits and must not demand an in-app
  Obsidian editor.
- Stage 3 binds one shared knowledge repository and a **connected personal
  remote** per user, not a GraphNotes-hosted vault.
- Stage 4 historically delivered take-from-shared; ADR-009 removes that as
  the product path. ZIP/MD **upload** remains fallback ingest.
- Stage 7 is Differ, ZIP download, the editor proposal queue, merge and
  rollback; hide GitHub PR jargon from ordinary UX.
- Stage 8 is Graph Diff: structural view of Differ/proposal.
- Do not implement PostgreSQL note CRUD or an Obsidian-like editor unless a
  later ADR explicitly reverses this decision.
- ADR-007 still holds: one shared rhizome, global `user < editor < admin`,
  no workspaces, atomic publication, no self-approval.

## Amendment 2026-09-11 (TZ 2.61)

Owner decision: GraphNotes **does** host each person's Markdown as the default
store. Product analog is [Obsidian Publish](https://publish.obsidian.md): hosted
graph + cards, plus **access rights**, plus **exactly one** shared rhizome
assembled through Differ → editor queue.

The sentence «GraphNotes does not host a second personal vault» is leftover
against this product. Hosting personal notes is the product. Becoming a
**second Obsidian-class editor** (live preview + `[[ ]]` autocomplete +
backlinks as the product) remains forbidden.

Git ingest is an **optional XOR**, not primary. ZIP/MD upload and the thin
in-app editor of **own personal cards** are the default path. Do not merge
two stores. Do not copy published shared bodies into PostgreSQL as a second
canon that bypasses Differ.

«Two Gits» is leftover for the current shared-merge stack (ADR-003), not the
user story. Source delivery `nord → GitHub → rhizome-test → rhizome` is
unchanged (ADR-006). Do not add MinIO/S3/Gitea in this wave.

## Amendment 2026-09-11 (TZ 2.62)

Owner: the GraphNotes personal store is **always** the working copy.
External disks (git now; Dropbox / Google Drive later) are **connectors**:
they **copy** the user's `.md` into that store. Differ, graph and cards read
the copy, not the remote live. XOR of two live stores is withdrawn. One
active connector at a time; do not merge Dropbox+git without a new decision.
Disconnecting a connector does not delete already copied files.
Do not implement Dropbox/Drive in this wave. Current git live-read / wipe on
disconnect / in-app commit to GitHub are leftover vs this amendment.

## Amendment 2026-09-11 (TZ 2.63)

GitHub is **only a source** for knowledge Markdown, including the published
shared rhizome. GraphNotes always keeps the working copy locally
(`personal_uploads`, `shared_notes`). Cards, Differ and shared index rebuild
read those copies. Editor accept may still push via the GitHub App as leftover
merge, then copy-in. «No hosted vault» does not forbid these local stores.
Do not add MinIO/S3/Gitea. Do not rip the GitHub App this wave.
