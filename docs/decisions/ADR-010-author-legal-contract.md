# ADR-010 - Author legal contract for contributing

Status: Accepted (living). Git-connect as a contributing act is leftover
vs PRODUCT_SPEC **3.40** / MASTER_CONTEXT (plugin ingest). Author flag
on the UUID remains. ADR-007 is superseded; RBAC still lives in MASTER.
Accepted: 2026-09-03
Owner decision: remaining TZ waves approved 2026-09-03
Refines: ADR-002 (account remains username/password)

## Context

PRODUCT_SPEC §5.4 and §6.1.1 require a product **author** status that is
distinct from the global RBAC hierarchy. Contributing into the shared rhizome
(connect personal git, upload Markdown as contribution, Differ, propose) is an
author act. The legal checkbox must record who accepted, when, and that the
person took responsibility for content, agreed to deposit/fixation of
authorship in the product, and knows how to withdraw/reclaim author status.

Closed corpus, GitHub-style user cards, a provenance/interaction feed, a
commenter tier, and payment processing are **not** this decision. They still
need their own ADRs before implementation.

## Decision

Author status is a boolean product flag on the existing GraphNotes user UUID,
not a new RBAC role and not a second identity.

1. **Acceptance is required to contribute.** A user becomes an active author
   only after accepting the current author contract (checkbox at registration
   **or** a dedicated accept step while signed in). Until then they may
   register, log in, read the shared rhizome in the app, and use editor/admin
   tools that are not contribution.
2. **What is stored.** GraphNotes records `is_author`, contract version, last
   acceptance timestamp, and last withdrawal timestamp on the user row, plus
   ordinary audit events. Who/when is the fixation. There is no second
   Markdown canon, no deposit file in git, and no payment processing.
3. **Contract copy** covers three product obligations, not a legal-department
   CMS:
   - responsibility for the content of notes and related links the person
     proposes;
   - deposit/fixation: the recorded acceptance is the product proof of
     authorship of that contributing status;
   - withdraw/reclaim: the author may withdraw author status; GraphNotes
     records the time; new contributing actions are blocked until they
     re-accept. Already published notes remain in shared git (Markdown is
     source of truth). This slice does not auto-delete published Markdown.
4. **Gated actions** (active author required):
   - `POST /personal/connect` (git as contribution);
   - `POST /personal/import-md` (upload as contribution);
   - `GET /differ`;
   - `POST /proposals`.
5. **Not gated:** login, `/users/me`, reading shared graph/notes, own
   contribution **counts** (TZ 2.7), editor/admin proposal review, admin
   user/role management, connecting the installation shared repository.
   Editors and admins still cannot approve their own proposals (ADR-007).
6. **Withdraw and re-accept.** An active author may withdraw. Withdrawal
   clears `is_author` and stamps `author_contract_withdrawn_at`. They may
   accept again; a new `author_contract_accepted_at` restores contributing.

One shared rhizome per install (ADR-007). Canonical note bodies stay in
Markdown/Git (ADR-001, ADR-008). GraphNotes is not an Obsidian-class editor.

## Consequences

- Registration may create a plain `user` with `is_author=false`; contributing
  is a later checkbox, not a silent grant.
- Existing accounts start without author status until they accept.
- Public JSON still omits Git SHAs, branches and GitHub PR URLs.
- Closed corpus, user cards, provenance feed and commenter remain unimplemented.
