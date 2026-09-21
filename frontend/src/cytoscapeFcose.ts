import cytoscape from "cytoscape";
import type { Core, EventObject, LayoutOptions, StylesheetJson } from "cytoscape";
import fcose from "cytoscape-fcose";
import { GRAPH_SETTINGS_DEFAULTS, stylesheetOptions } from "./graphSettings";
import type { GraphForceLayout, GraphSettings, GraphStylesheetOptions } from "./graphSettings";
import { cssToken } from "./theme";

cytoscape.use(fcose);

function graphTokens() {
  return {
    label: cssToken("--gn-graph-label", "#f4f7fa"),
    outline: cssToken("--gn-graph-label-outline", "#070b10"),
    shared: cssToken("--gn-shared", "#3ecf8e"),
    personal: cssToken("--gn-personal", "#6b8cff"),
    both: cssToken("--gn-both", "#c9a227"),
    missing: cssToken("--gn-missing", "#ff6b6b"),
    removed: cssToken("--gn-removed-node", "#5d6b78"),
    lockedBorder: cssToken("--gn-locked-border", "#4d3e12"),
    edge: cssToken("--gn-edge", "#8b98a6"),
    halo: cssToken("--gn-halo", "#aad8ff"),
    searchHit: cssToken("--gn-search-hit", "#fff4b8"),
  };
}

function labelStyle(
  tokens: ReturnType<typeof graphTokens>,
  minZoomedFontSize = 14,
) {
  return {
    color: tokens.label,
    "font-size": 13,
    "font-weight": 600,
    "text-outline-color": tokens.outline,
    "text-outline-width": 3,
    "text-outline-opacity": 1,
    "min-zoomed-font-size": minZoomedFontSize,
  };
}

export const FCOSE_LAYOUT = {
  name: "fcose",
  quality: "default",
  randomize: false,
  animate: true,
  animationDuration: 1000,
  fit: true,
  padding: 32,
  nodeDimensionsIncludeLabels: true,
  packComponents: true,
  tile: true,
  nodeRepulsion: () => 4500,
  idealEdgeLength: () => 80,
  edgeElasticity: () => 0.45,
  gravity: 0.25,
  numIter: 2500,
} as LayoutOptions;

function resolvedStylesheetOptions(
  options?: GraphStylesheetOptions | GraphSettings,
): GraphStylesheetOptions {
  if (!options) return stylesheetOptions(GRAPH_SETTINGS_DEFAULTS);
  if ("showTags" in options) return stylesheetOptions(options);
  return options;
}

export function graphStylesheet(options?: GraphStylesheetOptions | GraphSettings): StylesheetJson {
  const tokens = graphTokens();
  const display = resolvedStylesheetOptions(options);
  const edgeArrows = display.arrows
    ? {
        "curve-style": "bezier" as const,
        "target-arrow-shape": "triangle",
        "target-arrow-color": tokens.edge,
      }
    : {
        "curve-style": "haystack" as const,
        "haystack-radius": 0.5,
        "target-arrow-shape": "none",
      };
  const cutoff = display.labelScoreCutoff;
  return [
    {
      selector: "node",
      style: {
        width: `mapData(score, 0, 8, ${display.nodeMin}, ${display.nodeMax})`,
        height: `mapData(score, 0, 8, ${display.nodeMin}, ${display.nodeMax})`,
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "wrap",
        "text-max-width": "80px",
        "background-color": tokens.shared,
        ...labelStyle(tokens, display.minZoomedFontSize),
        "overlay-padding": 6,
        "z-index": 10,
        "border-width": 0,
      },
    },
    {
      selector: `node[score < ${cutoff}]`,
      style: { "text-opacity": 0 },
    },
    {
      selector: `node[score < ${cutoff}]:selected, node[score < ${cutoff}].highlighted, node[score < ${cutoff}][searchHit = 1]`,
      style: { "text-opacity": 1 },
    },
    {
      selector: "node[origin = 'personal']",
      style: { "background-color": tokens.personal },
    },
    {
      selector: "node[origin = 'both']",
      style: { "background-color": tokens.both },
    },
    {
      selector: "node[unresolved = 1]",
      style: { "background-color": tokens.missing },
    },
    {
      selector: "node[kind = 'tag']",
      style: {
        shape: "diamond",
        "background-color": tokens.personal,
        "z-index": 8,
      },
    },
    {
      selector: "node[groupColor]",
      style: { "background-color": "data(groupColor)" },
    },
    {
      selector: "node[locked = 1]",
      style: {
        "background-color": tokens.both,
        "border-width": 3,
        "border-style": "double",
        "border-color": tokens.lockedBorder,
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 6,
        "border-color": tokens.halo,
        "border-opacity": 0.5,
      },
    },
    {
      selector: "edge",
      style: {
        ...edgeArrows,
        opacity: 0.45,
        "line-color": tokens.edge,
        width: display.edgeWidth,
        "overlay-padding": 3,
      },
    },
    {
      selector: "edge[origin = 'overlay']",
      style: {
        "curve-style": "bezier",
        "line-style": "dashed",
        "line-color": tokens.personal,
        "target-arrow-shape": "triangle",
        "target-arrow-color": tokens.personal,
      },
    },
    {
      selector: "edge[unresolved = 1]",
      style: {
        "curve-style": "bezier",
        "line-style": "dotted",
        "line-color": tokens.missing,
        "target-arrow-shape": "triangle",
        "target-arrow-color": tokens.missing,
      },
    },
    {
      selector: "edge[locked = 1]",
      style: {
        "curve-style": "bezier",
        "line-style": "dotted",
        "line-color": tokens.both,
        "target-arrow-shape": "triangle",
        "target-arrow-color": tokens.both,
      },
    },
    {
      selector: "edge[type = 'tag']",
      style: {
        opacity: 0.28,
        "line-style": "dashed",
        "target-arrow-shape": display.arrows ? "triangle" : "none",
      },
    },
    { selector: "node.unhighlighted", style: { opacity: 0.2 } },
    { selector: "edge.unhighlighted", style: { opacity: 0.05 } },
    { selector: ".highlighted", style: { "z-index": 999999 } },
    {
      selector: "node.highlighted",
      style: {
        "border-width": 6,
        "border-color": tokens.halo,
        "border-opacity": 0.5,
      },
    },
    {
      selector: "node[searchHit = 1]",
      style: {
        "border-width": 5,
        "border-color": tokens.searchHit,
        "border-opacity": 0.9,
      },
    },
  ];
}

export function diffStylesheet(): StylesheetJson {
  const tokens = graphTokens();
  return [
    {
      selector: "node",
      style: {
        width: "mapData(score, 0, 8, 22, 52)",
        height: "mapData(score, 0, 8, 22, 52)",
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "wrap",
        "text-max-width": "80px",
        ...labelStyle(tokens),
        "background-color": tokens.removed,
        "overlay-padding": 6,
        "border-width": 0,
        shape: "ellipse",
      },
    },
    {
      selector: "node[marker = 'triangle']",
      style: { shape: "triangle", "background-color": tokens.shared },
    },
    {
      selector: "node[marker = 'octagon']",
      style: { shape: "octagon", "background-color": tokens.removed },
    },
    {
      selector: "node[marker = 'rectangle']",
      style: { shape: "rectangle", "background-color": tokens.both },
    },
    {
      selector: "node[marker = 'diamond']",
      style: { shape: "diamond", "background-color": tokens.personal },
    },
    {
      selector: "node[marker = 'star']",
      style: { shape: "star", "background-color": tokens.missing },
    },
    {
      selector: "node:selected, node.highlighted",
      style: {
        "border-width": 6,
        "border-color": tokens.halo,
        "border-opacity": 0.5,
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.6,
        "curve-style": "haystack",
        "haystack-radius": 0.5,
        opacity: 0.45,
        "line-color": tokens.edge,
      },
    },
    {
      selector: "edge[change = 'added']",
      style: {
        "curve-style": "bezier",
        width: 2.4,
        "line-color": tokens.shared,
        "target-arrow-shape": "triangle",
        "target-arrow-color": tokens.shared,
      },
    },
    {
      selector: "edge[change = 'removed']",
      style: {
        "curve-style": "bezier",
        "line-style": "dashed",
        "line-color": tokens.removed,
        "target-arrow-shape": "triangle",
        "target-arrow-color": tokens.removed,
      },
    },
    {
      selector: "edge[change = 'type_changed']",
      style: {
        "curve-style": "bezier",
        "line-style": "dotted",
        width: 2,
        "line-color": tokens.both,
        "target-arrow-shape": "triangle",
        "target-arrow-color": tokens.both,
      },
    },
    {
      selector: "edge[change = 'unresolved_changed']",
      style: {
        "curve-style": "bezier",
        "line-style": "dotted",
        "line-color": tokens.missing,
        "target-arrow-shape": "triangle",
        "target-arrow-color": tokens.missing,
      },
    },
    { selector: "node.unhighlighted", style: { opacity: 0.2 } },
    { selector: "edge.unhighlighted", style: { opacity: 0.05 } },
    { selector: ".highlighted", style: { "z-index": 999999 } },
  ];
}

export function applyDegreeScores(cy: Core): void {
  cy.nodes().forEach((node) => {
    node.data("score", Math.min(8, node.degree()));
  });
}

export function runFcoseLayout(cy: Core, forces?: GraphForceLayout) {
  cy.stop();
  if (cy.nodes().empty()) return undefined;
  cy.layout({ name: "grid", animate: false, fit: false, padding: 24 }).run();
  const layout = cy.layout({
    ...FCOSE_LAYOUT,
    ...(forces
      ? {
          gravity: forces.gravity,
          nodeRepulsion: () => forces.nodeRepulsion,
          idealEdgeLength: () => forces.idealEdgeLength,
          edgeElasticity: () => forces.edgeElasticity,
        }
      : {}),
  } as LayoutOptions);
  layout.run();
  return layout;
}

export function highlightNeighborhood(cy: Core, nodeId: string | null | undefined): void {
  cy.elements().removeClass("highlighted unhighlighted");
  if (!nodeId) return;
  const node = cy.getElementById(nodeId);
  if (node.empty() || !node.isNode()) return;
  const neighborhood = node.closedNeighborhood();
  cy.elements().addClass("unhighlighted");
  neighborhood.removeClass("unhighlighted").addClass("highlighted");
}

export function bindNeighborhoodHighlight(cy: Core, selectedId?: () => string | null): void {
  cy.on("mouseover", "node", (event: EventObject) => {
    const node = event.target;
    if (typeof node.isNode !== "function" || !node.isNode()) return;
    highlightNeighborhood(cy, node.id());
  });
  cy.on("mouseout", "node", () => {
    highlightNeighborhood(cy, selectedId?.() ?? null);
  });
}
