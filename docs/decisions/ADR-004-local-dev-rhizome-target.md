# ADR-004 - Local-first development, Rhizome as target

Status: Superseded by ADR-006

## Decision
Current code authoring happens on `nord` with Codex + VS Code. At the time of
this decision, `rhizome` was considered the integration/early user-test target.

After the first usable release, create a dedicated KVM dev/test VM and use it for feature integration before deploying to Rhizome.

ADR-006 supersedes the environment and delivery parts of this decision. The
dedicated `rhizome-test` environment now handles development-runtime,
integration, migration and destructive testing. `rhizome` is production and
receives only an approved revision already validated on `rhizome-test`.

## Consequences
- avoid editing source directly on Rhizome once the local Git workflow is established
- preserve Rhizome stability for users
- deployment mechanism will be chosen after Stage 1 facts are known
