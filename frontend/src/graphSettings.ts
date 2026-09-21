export const GRAPH_SETTINGS_STORAGE_KEY = "graphnotes-graph-settings";
export const TAG_NODE_PREFIX = "gn-tag:";

export const GROUP_PALETTE = [
  "#e93147",
  "#ea7d00",
  "#e0ac00",
  "#08b94e",
  "#00bfbc",
  "#086ddd",
  "#7852ee",
] as const;

export type GraphGroup = {
  id: string;
  query: string;
  color: string;
};

export type GraphSettings = {
  showTags: boolean;
  showOrphans: boolean;
  groups: GraphGroup[];
  arrows: boolean;
  textFade: number;
  nodeSize: number;
  linkThickness: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  /** Multiplier of the old Cytoscape 0.25 wheel step. Default 2 = twice as fast. */
  zoomSpeed: number;
};

export type GraphElementNode = {
  path: string;
  title: string;
  tags: string[];
  isolated: boolean;
  unresolved: boolean;
  locked?: boolean;
  origin?: string;
  kind?: "note" | "tag";
};

export type GraphElementEdge = {
  source: string;
  target: string;
  type: string;
  unresolved: boolean;
  locked?: boolean;
  origin?: string;
};

export type GraphFilterKind = "all" | "unresolved" | "isolated" | "overlay" | "personal";

export type GraphStylesheetOptions = {
  arrows: boolean;
  labelScoreCutoff: number;
  minZoomedFontSize: number;
  nodeMin: number;
  nodeMax: number;
  edgeWidth: number;
};

export type GraphForceLayout = {
  gravity: number;
  nodeRepulsion: number;
  edgeElasticity: number;
  idealEdgeLength: number;
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const GRAPH_SETTINGS_DEFAULTS: GraphSettings = {
  showTags: true,
  showOrphans: true,
  groups: [],
  arrows: false,
  textFade: 5,
  nodeSize: 1,
  linkThickness: 1,
  centerForce: 25,
  repelForce: 40,
  linkForce: 45,
  linkDistance: 33,
  zoomSpeed: 2,
};

export const WHEEL_SENSITIVITY_BASE = 0.25;

export function wheelSensitivityValue(zoomSpeed: number): number {
  return WHEEL_SENSITIVITY_BASE * clamp(zoomSpeed, 1, 4);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isTagNodePath(path: string): boolean {
  return path.startsWith(TAG_NODE_PREFIX);
}

export function tagNodePath(tag: string): string {
  return `${TAG_NODE_PREFIX}${tag.trim().toLowerCase()}`;
}

export function nextGroupColor(existingCount: number): string {
  return GROUP_PALETTE[existingCount % GROUP_PALETTE.length];
}

export function createGraphGroup(existingCount: number, query = ""): GraphGroup {
  return {
    id: `g-${existingCount}-${Math.random().toString(36).slice(2, 8)}`,
    query,
    color: nextGroupColor(existingCount),
  };
}

export function parseGraphSettings(raw: unknown): GraphSettings {
  if (!raw || typeof raw !== "object") return { ...GRAPH_SETTINGS_DEFAULTS };
  const value = raw as Partial<GraphSettings>;
  const groups = Array.isArray(value.groups)
    ? value.groups.flatMap((group, index): GraphGroup[] => {
        if (!group || typeof group !== "object") return [];
        const item = group as Partial<GraphGroup>;
        const color = typeof item.color === "string" && isHexColor(item.color)
          ? item.color
          : nextGroupColor(index);
        return [{
          id: typeof item.id === "string" && item.id ? item.id : `g-${index}`,
          query: typeof item.query === "string" ? item.query : "",
          color,
        }];
      })
    : [];
  return {
    showTags: value.showTags !== false,
    showOrphans: value.showOrphans !== false,
    groups,
    arrows: Boolean(value.arrows),
    textFade: value.textFade == null ? GRAPH_SETTINGS_DEFAULTS.textFade : clamp(Number(value.textFade), 0, 10),
    nodeSize: value.nodeSize == null ? GRAPH_SETTINGS_DEFAULTS.nodeSize : clamp(Number(value.nodeSize), 0.4, 2.5),
    linkThickness: value.linkThickness == null ? GRAPH_SETTINGS_DEFAULTS.linkThickness : clamp(Number(value.linkThickness), 0.4, 3),
    centerForce: value.centerForce == null ? GRAPH_SETTINGS_DEFAULTS.centerForce : clamp(Number(value.centerForce), 0, 100),
    repelForce: value.repelForce == null ? GRAPH_SETTINGS_DEFAULTS.repelForce : clamp(Number(value.repelForce), 0, 100),
    linkForce: value.linkForce == null ? GRAPH_SETTINGS_DEFAULTS.linkForce : clamp(Number(value.linkForce), 0, 100),
    linkDistance: value.linkDistance == null ? GRAPH_SETTINGS_DEFAULTS.linkDistance : clamp(Number(value.linkDistance), 0, 100),
    zoomSpeed: value.zoomSpeed == null ? GRAPH_SETTINGS_DEFAULTS.zoomSpeed : clamp(Number(value.zoomSpeed), 1, 4),
  };
}

function memoryStorage(): StorageLike | undefined {
  try {
    const store = (globalThis as { localStorage?: StorageLike }).localStorage;
    return store;
  } catch {
    return undefined;
  }
}

export function loadGraphSettings(storage?: StorageLike): GraphSettings {
  const store = storage ?? memoryStorage();
  if (!store) return { ...GRAPH_SETTINGS_DEFAULTS, groups: [] };
  try {
    const raw = store.getItem(GRAPH_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...GRAPH_SETTINGS_DEFAULTS, groups: [] };
    return parseGraphSettings(JSON.parse(raw) as unknown);
  } catch {
    return { ...GRAPH_SETTINGS_DEFAULTS, groups: [] };
  }
}

export function persistGraphSettings(settings: GraphSettings, storage?: StorageLike): void {
  const store = storage ?? memoryStorage();
  if (!store) return;
  try {
    store.setItem(GRAPH_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode can block storage; the session still keeps the panel.
  }
}

export function nodeMatchesGroupQuery(node: GraphElementNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const tags = node.tags.map((tag) => tag.toLowerCase());
  if (q.startsWith("tag:")) {
    const needle = q.slice(4).replace(/^#/, "").trim();
    return needle ? tags.some((tag) => tag.includes(needle)) : false;
  }
  if (q.startsWith("#")) {
    const needle = q.slice(1).trim();
    return needle ? tags.some((tag) => tag.includes(needle)) : false;
  }
  if (q.startsWith("file:")) {
    const needle = q.slice(5).trim();
    if (!needle) return false;
    return node.title.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle);
  }
  return (
    node.title.toLowerCase().includes(q)
    || node.path.toLowerCase().includes(q)
    || tags.some((tag) => tag.includes(q))
  );
}

export function colorForNode(node: GraphElementNode, groups: GraphGroup[]): string | null {
  let color: string | null = null;
  for (const group of groups) {
    if (nodeMatchesGroupQuery(node, group.query)) color = group.color;
  }
  return color;
}

export function groupColorByPath(nodes: GraphElementNode[], groups: GraphGroup[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const node of nodes) {
    const color = colorForNode(node, groups);
    if (color) colors.set(node.path, color);
  }
  return colors;
}

export function stylesheetOptions(settings: GraphSettings): GraphStylesheetOptions {
  return {
    arrows: settings.arrows,
    labelScoreCutoff: Math.round(settings.textFade * 0.6),
    minZoomedFontSize: 4 + settings.textFade * 2,
    nodeMin: Math.round(22 * settings.nodeSize),
    nodeMax: Math.round(56 * settings.nodeSize),
    edgeWidth: Math.round(16 * settings.linkThickness) / 10,
  };
}

export function forceLayoutOptions(settings: GraphSettings): GraphForceLayout {
  return {
    gravity: 0.05 + (settings.centerForce / 100) * 0.95,
    nodeRepulsion: 500 + (settings.repelForce / 100) * 10000,
    edgeElasticity: 0.05 + (settings.linkForce / 100) * 0.9,
    idealEdgeLength: 20 + (settings.linkDistance / 100) * 180,
  };
}

export function buildVisibleGraph(
  graph: { nodes: GraphElementNode[]; edges: GraphElementEdge[] },
  options: {
    kind: GraphFilterKind;
    showTags: boolean;
    showOrphans: boolean;
  },
): { nodes: GraphElementNode[]; edges: GraphElementEdge[] } {
  const notes = graph.nodes.filter((node) => {
    if (node.kind === "tag" || isTagNodePath(node.path)) return false;
    if (options.kind === "unresolved" && !node.unresolved) return false;
    if (options.kind === "isolated" && !node.isolated) return false;
    if (options.kind === "overlay" && node.origin !== "personal" && node.origin !== "both") return false;
    if (!options.showOrphans && node.isolated) return false;
    return true;
  });
  const allowed = new Set(notes.map((node) => node.path));
  const edges = graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target));
  if (!options.showTags) return { nodes: notes, edges };

  const tagNodes = new Map<string, GraphElementNode>();
  const tagEdges: GraphElementEdge[] = [];
  for (const node of notes) {
    for (const raw of node.tags) {
      const label = raw.trim();
      if (!label) continue;
      const path = tagNodePath(label);
      if (!tagNodes.has(path)) {
        tagNodes.set(path, {
          path,
          title: `#${label}`,
          tags: [label],
          isolated: false,
          unresolved: false,
          origin: "tag",
          kind: "tag",
        });
      }
      tagEdges.push({
        source: node.path,
        target: path,
        type: "tag",
        unresolved: false,
      });
    }
  }
  return {
    nodes: [...notes, ...tagNodes.values()],
    edges: [...edges, ...tagEdges],
  };
}
