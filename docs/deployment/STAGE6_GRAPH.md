# Stage 6 graph UI

The shared rhizome is shown as a Cytoscape.js graph. Layout coordinates are UI
state only and are not stored as knowledge.

`GET /api/graph/shared` is readable without login. Logged-in users with a
connected personal git get `GET /api/graph/personal-overlay`: the same bounded
shared page plus personal notes that link into it. Another user's overlay
cannot be selected by query.

Opening a node reads source Markdown (`GET /api/shared/notes/{path}` or the
caller's personal note). Titles and bodies are shown as text, not HTML.

Light and dark themes are browser-local (`localStorage` `graphnotes-theme`,
else `prefers-color-scheme`). The UI control is a Theme Switcher (sliding
sun/moon pill, `role="switch"`), not text buttons. Cytoscape label color and
outline follow CSS theme tokens so graph text stays readable on both canvases.
No server config.

## Bounds

Same as Stage 5: default page 50, max 200, neighborhood `center` + `depth` 0–4.
The UI shows truncation and can expand neighbors of a selected shared node.

## Status language

The graph shows layer and `index_status` (`empty` / `current` / `updating` /
`error`). Public JSON still does not include Git SHA, `html_url` or secrets.
