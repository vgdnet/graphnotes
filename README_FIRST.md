# GraphNotes Codex context package (historical bootstrap instructions)

> Stage 1 bootstrap is complete. Current workers must use
> `docs/context/STAGE_STATUS.md` and the active Stage file. Technical Observer
> workers should start with `START_TECHNICAL_OBSERVER.md`.

This package is intended to be copied/extracted into the root of the LOCAL GraphNotes source repository on `nord`.

## Recommended local layout
A dedicated source directory is cleaner than using loose files directly on the Desktop, for example:

```text
/home/efimov/Projects/graphnotes
```

This is only a recommendation; use another path if desired.

## Important
Do not extract this package blindly over an existing GraphNotes repository without reviewing file conflicts.

If the local repository is new:
1. create/open the intended GraphNotes directory;
2. extract this package into that directory;
3. open that directory in VS Code;
4. start Codex from that repository root;
5. send the prompt in `START_CODEX.md`.

If there is already a local repository, copy the context files deliberately and review diffs first.

## Rhizome
Do NOT copy this package into `/opt/graphnotes` as a deployment yet just because the directory exists there.
Stage 1 will first establish the source repository locally and then inspect/reconcile the existing Rhizome directory before deployment.
