# ADR-006 - GitHub delivery and read-only production access

Status: Accepted

## Context
GraphNotes needs a reproducible promotion path from development through
integration testing to the stable user-test environment. Deployment hosts must
not become competing sources of truth, and compromise of the stable host must
not provide credentials capable of changing the canonical repository.

The canonical public repository is:

`https://github.com/vgdnet/graphnotes`

## Decision
The canonical delivery workflow is:

```text
nord
  -> GitHub
      -> rhizome-test
          -> approved revision
              -> rhizome
```

Git is the canonical source delivery mechanism. SSH/rsync is permitted only as a
fallback or bootstrap mechanism.

Environment roles and access are:

- `nord` owns source development and may use GitHub write access for branches,
  commits and pushes.
- `rhizome-test` is an integration environment. It normally consumes the public
  repository read-only by cloning, fetching and checking out candidate
  revisions. It is not a canonical source repository.
- `rhizome` is the stable/user-test environment. Its repository access must be
  read-only. It must not contain GitHub credentials capable of push and receives
  only commits or tags already approved on `rhizome-test`.

No ad-hoc source edits are permitted on `rhizome`.

## Consequences
- promotion is tied to an identifiable Git commit or tag
- the same approved revision moves from `rhizome-test` to `rhizome`
- production credentials cannot push even if the stable host is compromised
- fixes originate on `nord`, are pushed to GitHub and repeat the test/promotion
  path instead of being patched directly on a deployment host
- any bootstrap copy must be reconciled with a canonical GitHub revision before
  approval and promotion

This decision supersedes earlier delivery assumptions in ADR-004 where they
conflict with the now-established three-environment GitHub workflow.
