# ADR-004 - Local-first development, Rhizome as target

Status: Accepted

## Decision
Current code authoring happens on `nord` with Codex + VS Code. `rhizome` is the integration/early user-test target.

After the first usable release, create a dedicated KVM dev/test VM and use it for feature integration before deploying to Rhizome.

## Consequences
- avoid editing source directly on Rhizome once the local Git workflow is established
- preserve Rhizome stability for users
- deployment mechanism will be chosen after Stage 1 facts are known
