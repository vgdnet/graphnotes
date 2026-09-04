# Stage 6 graph UI

The shared rhizome is shown as a Cytoscape.js graph with the **fCoSE** layout
(`cytoscape-fcose`). Layout coordinates are UI state only and are not stored
as knowledge. Ordinary edges use haystack; overlay / unresolved / locked edges
stay directed. Hover highlights the closed neighborhood.

`GET /api/graph/shared` is readable without login. Logged-in users get
`GET /api/graph/personal-overlay`: the same bounded shared page plus **ваша
ризома** notes that link into it (connected git, or server uploads if git is
not connected). Another user's overlay cannot be selected by query.

Opening a node for a signed-in viewer with access goes to the **card page**
(`#/card/{path}`): rendered Markdown on read, not an editor and not a raw
`<pre>` dump. Guests do not receive card bodies.

Card URLs: `#/card/` opens rhizome search (words and tags from the derived
index). `#/card/{path}` opens the card page. The chrome tab is «Карточки».
MVP search is PostgreSQL (`GET /api/search`). Elasticsearch is the next
iteration (ADR-015), not this Stage 6 stack.

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
The layer filter option, personal-origin legend and node origin copy say
«ваша ризома», not «ваш git». Git vs server store is a settings fact, not
the layer name.
