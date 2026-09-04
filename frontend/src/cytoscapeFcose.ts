import cytoscape from "cytoscape";
import type { Core, EventObject, LayoutOptions, StylesheetJson } from "cytoscape";
import fcose from "cytoscape-fcose";

cytoscape.use(fcose);

const HALO = "#AAD8FF";

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

export const GRAPH_STYLESHEET: StylesheetJson = [
  {
    selector: "node",
    style: {
      width: "mapData(score, 0, 8, 22, 56)",
      height: "mapData(score, 0, 8, 22, 56)",
      label: "data(label)",
      "font-size": 12,
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "wrap",
      "text-max-width": "72px",
      "background-color": "#3ecf8e",
      "text-outline-color": "#3ecf8e",
      "text-outline-width": 2,
      color: "#fff",
      "overlay-padding": 6,
      "z-index": 10,
      "border-width": 0,
    },
  },
  {
    selector: "node[origin = 'personal']",
    style: {
      "background-color": "#6b8cff",
      "text-outline-color": "#6b8cff",
    },
  },
  {
    selector: "node[origin = 'both']",
    style: {
      "background-color": "#c9a227",
      "text-outline-color": "#c9a227",
    },
  },
  {
    selector: "node[unresolved = 1]",
    style: {
      "background-color": "#ff6b6b",
      "text-outline-color": "#ff6b6b",
    },
  },
  {
    selector: "node[locked = 1]",
    style: {
      "background-color": "#c9a227",
      "text-outline-color": "#c9a227",
      "border-width": 3,
      "border-style": "double",
      "border-color": "#4d3e12",
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-width": 6,
      "border-color": HALO,
      "border-opacity": 0.5,
    },
  },
  {
    selector: "edge",
    style: {
      "curve-style": "haystack",
      "haystack-radius": 0.5,
      opacity: 0.4,
      "line-color": "#bbb",
      width: 1.6,
      "overlay-padding": 3,
    },
  },
  {
    selector: "edge[origin = 'overlay']",
    style: {
      "curve-style": "bezier",
      "line-style": "dashed",
      "line-color": "#6b8cff",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#6b8cff",
    },
  },
  {
    selector: "edge[unresolved = 1]",
    style: {
      "curve-style": "bezier",
      "line-style": "dotted",
      "line-color": "#ff6b6b",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#ff6b6b",
    },
  },
  {
    selector: "edge[locked = 1]",
    style: {
      "curve-style": "bezier",
      "line-style": "dotted",
      "line-color": "#c9a227",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#c9a227",
    },
  },
  {
    selector: "node.unhighlighted",
    style: { opacity: 0.2 },
  },
  {
    selector: "edge.unhighlighted",
    style: { opacity: 0.05 },
  },
  {
    selector: ".highlighted",
    style: { "z-index": 999999 },
  },
  {
    selector: "node.highlighted",
    style: {
      "border-width": 6,
      "border-color": HALO,
      "border-opacity": 0.5,
    },
  },
];

export const DIFF_STYLESHEET: StylesheetJson = [
  {
    selector: "node",
    style: {
      width: "mapData(score, 0, 8, 22, 52)",
      height: "mapData(score, 0, 8, 22, 52)",
      label: "data(label)",
      color: "#fff",
      "font-size": 12,
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "wrap",
      "text-max-width": "72px",
      "text-outline-width": 2,
      "text-outline-color": "#85919d",
      "background-color": "#85919d",
      "overlay-padding": 6,
      "border-width": 0,
      shape: "ellipse",
    },
  },
  {
    selector: "node[marker = 'triangle']",
    style: { shape: "triangle", "background-color": "#3ecf8e", "text-outline-color": "#3ecf8e" },
  },
  {
    selector: "node[marker = 'octagon']",
    style: { shape: "octagon", "background-color": "#5d6b78", "text-outline-color": "#5d6b78" },
  },
  {
    selector: "node[marker = 'rectangle']",
    style: { shape: "rectangle", "background-color": "#c9a227", "text-outline-color": "#c9a227" },
  },
  {
    selector: "node[marker = 'diamond']",
    style: { shape: "diamond", "background-color": "#6b8cff", "text-outline-color": "#6b8cff" },
  },
  {
    selector: "node[marker = 'star']",
    style: { shape: "star", "background-color": "#ff6b6b", "text-outline-color": "#ff6b6b" },
  },
  {
    selector: "node:selected, node.highlighted",
    style: {
      "border-width": 6,
      "border-color": HALO,
      "border-opacity": 0.5,
    },
  },
  {
    selector: "edge",
    style: {
      width: 1.6,
      "curve-style": "haystack",
      "haystack-radius": 0.5,
      opacity: 0.4,
      "line-color": "#bbb",
    },
  },
  {
    selector: "edge[change = 'added']",
    style: {
      "curve-style": "bezier",
      width: 2.4,
      "line-color": "#3ecf8e",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#3ecf8e",
    },
  },
  {
    selector: "edge[change = 'removed']",
    style: {
      "curve-style": "bezier",
      "line-style": "dashed",
      "line-color": "#85919d",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#85919d",
    },
  },
  {
    selector: "edge[change = 'type_changed']",
    style: {
      "curve-style": "bezier",
      "line-style": "dotted",
      width: 2,
      "line-color": "#c9a227",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#c9a227",
    },
  },
  {
    selector: "edge[change = 'unresolved_changed']",
    style: {
      "curve-style": "bezier",
      "line-style": "dotted",
      "line-color": "#ff6b6b",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#ff6b6b",
    },
  },
  { selector: "node.unhighlighted", style: { opacity: 0.2 } },
  { selector: "edge.unhighlighted", style: { opacity: 0.05 } },
  { selector: ".highlighted", style: { "z-index": 999999 } },
];

export function applyDegreeScores(cy: Core): void {
  cy.nodes().forEach((node) => {
    node.data("score", Math.min(8, node.degree()));
  });
}

export function runFcoseLayout(cy: Core): void {
  cy.stop();
  if (cy.nodes().empty()) return;
  cy.layout({ name: "grid", animate: false, fit: false, padding: 24 }).run();
  cy.layout(FCOSE_LAYOUT).run();
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
