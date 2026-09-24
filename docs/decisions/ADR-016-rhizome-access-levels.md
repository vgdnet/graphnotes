# ADR-016 — Rhizome access levels (not a paid-consumer role)

Status: Accepted (living). Personal-git storage wording below is leftover
vs PRODUCT_SPEC **3.40** / MASTER_CONTEXT (plugin personal store). ADR-007
is superseded; one shared rhizome and three RBAC roles still live in MASTER.
Accepted: 2026-09-04
Owner decision: canonical name «уровни доступа к ризоме»; paid level = closed
slice that requires that level. Refines ADR-011 (closed corpus stays
personal), ADR-002 (RBAC stays three roles).

## Context

Product text used «платный потребитель» as if it were a sixth kind of user.
That collides with `user < editor < admin` and with ADR-011, which already
keeps **closed** Markdown in the author's personal layer. Payment is only
how someone later **obtains** a restricted access level. The hard question
is storage: mark files in the same git, or add a second repository.

## Decision

1. **Canonical name.** Visibility of rhizome slices is **уровни доступа к
   ризоме** (rhizome access levels). It is not an RBAC role, not a second
   login, and not a product noun «потребитель».
2. **What a paid level is.** A **платный уровень доступа** is a **closed
   slice of content**. The body is visible only to the author, to UUIDs that
   hold that access level for that slice, and to `admin`. Everyone else sees
   a lock, not the body. Editor queue and Differ never take this slice into
   published shared (ADR-011).
3. **Where the files live.** Closed / paid-level notes stay in the **author's
   existing personal git** (or upload-without-git store). GraphNotes does
   **not** create a second shared rhizome and does **not** bind a second
   GitHub knowledge repository as «the paid rhizome».
4. **How they are marked.** Canon is Markdown in that git: path convention
   and/or frontmatter that names the access level. PostgreSQL stores only a
   **derived** flag (today `closed_paths`; later a level id). Unmarking does
   not publish.
5. **How others see them.** Entitlement is a derived list: which UUID may
   read which author's closed paths / which access level. Payment gateway is
   a later way to write that list, not a different storage model. `admin` may
   grant the level without a gateway (ops). SMTP login and vsepsy identity
   stay separate ADRs.

## Why not a second repository

A second GitHub repo as paid corpus would be a second knowledge rhizome:
second index, second Differ, broken `[[wikilinks]]` across public and paid,
and a clone/ZIP of that repo would leak the closed bodies. ADR-007 forbids
that product entity. Marking paths in the vault the author already uses
keeps one personal layer and one published shared.

## Consequences

- Replace «потребитель платного» in product language with «есть уровень
  доступа к закрытому срезу» / «нет уровня».
- Implement entitlements only after this ADR; do not ship a payment gateway
  in the same slice.
- Frontmatter vs folder (`paid/…`) is an implementation choice inside this
  decision, not a new ADR, as long as Git remains canon and shared git stays
  free of closed bodies.

## Amendment (2026-09-05) — two screens, same storage

Owner + product observer (2026-09-04) refined UX without a second repository.

1. **«Два графа» is a layer filter, not two worlds.** The start map is the
   one shared rhizome (git → index → graph, cards, search, editor queue;
   editor may also commit into that same shared git). A signed-in user
   already has their own overlay on that graph (Stage 6). This is one graph
   with a layer filter, not a second shared rhizome and not a second index.
2. **«Ризома автора» is a VIEW** of the marked closed slice after entitlement:
   that slice's graph and cards. Same personal git (or upload store), same
   derived `closed_paths`. Not a second knowledge repository, not a clone,
   not a ZIP, not the author's whole vault (drafts and Differ candidates stay
   private).
3. **«Загрузить»** in this contour means **open that view in GraphNotes**
   after the access level is granted. It does not mean download into the
   payer's vault / Obsidian.
4. **Open personal as a public catalog** (everyone searches, finds, and
   comments on another person's unmarked personal notes) is **not** accepted
   here. That would be a second public surface past the editor queue and
   would contradict product principle §3.3. It stays an open product
   question until an explicit owner decision and a new ADR.

SMTP login, vsepsy identity, payment gateway, and Elasticsearch remain
separate leftover ADRs. This amendment does not ship them.
