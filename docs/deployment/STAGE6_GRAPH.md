# Stage 6 graph UI

The shared rhizome is shown as a Cytoscape.js graph with the **fCoSE** layout
(`cytoscape-fcose`). Layout coordinates are UI state only and are not stored
as knowledge. Ordinary edges use haystack; overlay / unresolved / locked edges
stay directed. Hover highlights the closed neighborhood.

`GET /api/graph/shared` is readable without login. Logged-in users get
`GET /api/graph/personal-overlay`: the same bounded shared page plus **ваша
часть ризомы** — personal notes that wikilink into the visible shared page
(connected git, or server uploads if git is not connected — **default** store,
TZ 2.61). This is the
stitch/intersection, not the whole personal git. `GET /api/graph/personal`
is **ваша личная ризома**: the full indexed personal tree (bounded). Both
layers are computed from `note_index` / `note_links`; the user does not
hand-curate which notes belong where. Cards and the change/diff record
(search, card GET, Graph Diff, interaction feed) follow that same
visibility. Another user's overlay cannot be selected by query.

Opening a published shared node (guest or signed-in) goes to the **card page**
(`#/card/{path}`): rendered Markdown, not a raw `<pre>` dump, with the local
neighborhood graph beside the article (TZ 2.64). The card opens
**view-first**. Own personal addresses are `#/card/personal:{path}` for any
own file (hash may show `personal%3A` — same route). Those URLs mount
`PersonalCardEditor` and show **«Отредактировать карточку»** only when the
viewer is the author (contract); then MDXEditor rich text + source
(GraphNotes preview on read; TZ 2.50 / 2.53). Before this ship the editor
was specified but not wired on the card page, so `personal:` hashes looked
read-only. In-app saves land in the card
interaction feed (`GET /api/cards/{path}/feed`), not as note bodies.
Shared, others' personal (`personal:{uuid}:…`), and proposal cards stay
read-only (no edit button, no author-contract tease on the card). Comments
stay on published shared. Actor names in that feed open the public person
card (`#/users/{uuid}`, TZ 2.60): achievement counters (proposals, created
shared cards, published edits, accepted notes/links), not another vault.
Guests may read published shared card bodies; personal, queue, feed and
comments still need a session. A missing wikilink or unresolved node opens
the card route without a body: guests see «карточки пока нет»; a signed-in
author may create a personal card there or from the hover hint on the missing link
(TZ 2.66). That create is not a shared write.
`[[wikilink]]` hrefs inherit the open card's layer (TZ 2.54): from
`#/card/personal:{path}` a wiki target becomes `personal:{file}` (foreign
personal keeps the owner UUID; proposal keeps the proposal id). The same
git path can exist in shared and personal; do not collapse wiki clicks
onto the unprefixed shared hash.

Card URLs: `#/card/` opens rhizome search (words and tags from the derived
index). Hits include `layer` (`shared` / `personal` / `proposal`) so the UI
can highlight the layer when a personal rhizome is connected. Default
`GET /api/search` is `layer=visible`: user searches own+shared; editor also
searches proposal notes given for review; admin searches every card they
can open. Graph overlay stitch (`layer=overlay`) is unchanged and still
used for canvas highlight. `#/card/{path}` opens the card page. The chrome
tab is «Карточки».
MVP search is PostgreSQL (`GET /api/search`) on the same `note_index`
revision as the graph. Proposal create also writes `layer=proposal` rows
(dropped on publish). A rebuild or SHA change updates graph and search
together; a hash to a path that is not in the current git tree does not
invent a card (API 404). Elasticsearch is the next iteration (ADR-015),
not this Stage 6 stack.

Light and dark themes are browser-local (`localStorage` `graphnotes-theme`,
else `prefers-color-scheme`). The UI control is a Theme Switcher (sliding
sun/moon pill, `role="switch"`), not text buttons. Cytoscape label color and
outline follow CSS theme tokens so graph text stays readable on both canvases.
No server config.

## Bounds

Same as Stage 5: default page 50, max 200, neighborhood `center` + `depth` 0–4.
The canvas has product names **весь граф** and **локальный граф** (depth 1–4,
«Показать всё»). Overlay-only personal nodes use `personal:{path}` as
`center` so the local view is that stitch, not the first shared page.
An unknown `center` returns an empty neighborhood, not the default page.
«К графу» from a card focuses the node on the whole graph.

## Status language

The graph shows layer and `index_status` (`empty` / `current` / `updating` /
`error`). Public JSON still does not include Git SHA, `html_url` or secrets.
The overlay filter, personal-origin legend and node origin copy say
«ваша часть ризомы». When the UI shows `GET /api/graph/personal`, the
layer/menu/status/legend say «ваша личная ризома». Neither name is
«ваш git». Git vs server store is a settings fact, not the layer name.
