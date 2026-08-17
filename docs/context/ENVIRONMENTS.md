# GraphNotes - Environments

Updated: 2026-08-17

## 1. nord - development workstation
Platform and tools:
- Ubuntu
- address: `172.16.13.205/24`
- user: `efimov`
- hostname: `nord`
- Codex is installed locally
- VS Code is used for review/manual edits

Role:
- primary source-code authoring environment
- local Git repository
- GitHub write access
- branches, commits and pushes
- Codex runs against the local repository
- user reviews/modifies code in VS Code

Project location:
- local repository: `~/Projects/graphnotes`

## 2. rhizome-test - integration and test environment
Platform and address:
- Debian 13 KVM
- address: `172.16.13.14/24`
- currently reachable from `nord` on the shared `172.16.13.0/24` network

Role:
- integration and deployment testing
- database migration testing
- Docker/Compose and end-to-end validation
- destructive experiments
- validation of the exact Git revision proposed for promotion

Rules:
- every new feature revision must be tested here before deployment to `rhizome`
- failures and destructive experiments belong here, not on `rhizome`
- normally consume the GitHub repository read-only
- clone, fetch and check out candidate revisions from GitHub
- do not treat this environment or its working tree as canonical source
- use `compose.yaml` together with `deploy/compose.rhizome-test.yaml`
- expose frontend to `nord` at `http://172.16.13.14:8080`
- keep backend bound only to `127.0.0.1:8000`
- do not publish a PostgreSQL host port
- local `compose.override.yaml` files are non-canonical and must not be required

Canonical integration command:

```bash
docker compose \
  -f compose.yaml \
  -f deploy/compose.rhizome-test.yaml \
  up -d
```

The frontend bind address can be changed through `GRAPHNOTES_TEST_BIND_IP`; its
canonical default is `172.16.13.14`.

Because Docker may restore containers before Debian assigns that address,
`rhizome-test` uses the committed `deploy/graphnotes-rhizome-test.service` unit.
It waits for the exact configured bind IP and force-recreates only the frontend
container from an existing image. This preserves the restricted LAN binding;
it does not widen exposure to `0.0.0.0`.

## 3. rhizome - stable target
Platform and known facts:
- Debian 13
- target host name: `rhizome`
- GraphNotes directory exists at `/opt/graphnotes`
- `/opt/graphnotes` is owned/usable as established during Stage 0
- Stage 0 is complete

Role:
- stable target for approved builds
- early user testing

Rules:
- deploy only a revision already validated on `rhizome-test`
- Git repository access must be read-only
- do not configure GitHub credentials capable of push
- receive only approved commits or tags
- do not use this host for destructive experiments
- do not use this host as the first environment for migrations or new feature code
- do not make ad-hoc source edits

Important:
- exact Stage 0 package versions, Nginx configuration, firewall rules, ports and files are NOT fully recorded in this context package
- inspect Rhizome before writing deployment-specific commands
- do not invent missing Stage 0 details

## 4. Canonical delivery workflow

```text
nord
  -> GitHub
      -> rhizome-test
          -> approved revision
              -> rhizome
```

Canonical public repository:
`https://github.com/vgdnet/graphnotes`

Git is the primary delivery mechanism. SSH/rsync is permitted only as a fallback
or bootstrap mechanism when Git delivery is not yet available. A fallback copy
does not remove the requirement to identify, test and approve the deployed Git
revision on `rhizome-test` before promotion to `rhizome`.

## 5. Source-of-truth rule
Once the local repository is established, source edits should normally originate from the Git working tree on `nord`, not from direct ad-hoc editing in `/opt/graphnotes` on Rhizome.

The public GitHub repository and approved revision are the source of truth for delivery across environments. Promote the same reviewed commit or tag from `rhizome-test` to `rhizome`; do not rebuild an untracked variant directly on the stable target.
