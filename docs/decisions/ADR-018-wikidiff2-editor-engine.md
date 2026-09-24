# ADR-018 - wikidiff2 is the editor text-diff engine

Status: Accepted (living). Native C++ helper; **not PHP as the engine**.
ADR-009 (path list / circulation) is superseded; living Differ is
PRODUCT_SPEC **3.40** + MASTER_CONTEXT. This ADR still names the
`/queue` text-diff engine.
Accepted: 2026-09-12

## Context

Owner 2026-09-12: editor accept must look like Wikipedia, and the engine
must be **their** engine — MediaWiki **wikidiff2** — not Python
`difflib.SequenceMatcher`. TZ 3.02 already locked the two-column table.
TZ 3.03 locks the engine.

wikidiff2 is GPL-2.0-or-later. GraphNotes uses the Wikimedia C++ core
(`src/lib`: `Wikidiff2` + `TableFormatter`). We do not vendor a second
alignment algorithm. System-package / compiled use is compatible with
AGPL-3.0 (ADR-005).

## Decision

1. **Canon.** Line alignment, moved-line detection, and word-level
   highlights for editor review come from **wikidiff2**
   (`Wikidiff2::execute` + `TableFormatter`, same table HTML as
   `wikidiff2_do_diff`). `difflib` is not the review engine.
2. **Surface.** `/queue` and the same proposal body on `/offer` render
   that table: «В ризоме» | «В предложении». A new card is the same
   engine with an empty left side. No inline/unified toggle.
3. **Runtime.** The backend image compiles pinned Wikimedia wikidiff2
   `src/lib` plus a thin GraphNotes CLI. FastAPI calls that native
   helper (JSON stdin `before` / `after` → `table_html`). HTML is
   allow-listed before JSON. If the engine is missing, proposal detail
   is HTTP 503, not a silent `difflib` fallback. **`php-cli` /
   `php-wikidiff2` is not the install path.**
4. **Not this.** Author Differ stays a path-checkbox list. Graph Diff is
   unchanged. Card history unified diffs may still use `difflib`.
   Elasticsearch, Redis, and other out-of-MVP infra stay out.

## Consequences

- Operators compile or install the native helper in the backend
  container (and on `nord` for local pytest).
- Editor review HTML is engine output plus GraphNotes captions/CSS, not
  a second alignment algorithm.

## Amendment 2026-09-12 (owner: native C++, not PHP)

Owner: keep the MediaWiki engine, drop PHP from the runtime story.
Compile pinned `src/lib` as a native helper; do not keep `php-cli` /
`php-wikidiff2` as the install path.

Until that helper ships, the working tree may still call leftover
`wikidiff2_table.php` via `php-cli` + `php-wikidiff2`. That is
unfinished code — a hole in the runtime, not a second spec and not
«this deploy runs PHP». When the helper ships, those packages leave
the image.

## Amendment 2026-09-21 (helper shipped)

Native CLI `graphnotes-wikidiff2` is compiled in the backend image from
pinned Wikimedia **1.14.2** (`src/lib` + GraphNotes `main.cpp`).
`php-cli` / `php-wikidiff2` / `wikidiff2_table.php` leave this path
(they were only the old editor-diff helper). Missing helper → 503.
This is not a project-wide PHP ban.
