import { GRAPH_SETTINGS_DEFAULTS, forceLayoutOptions } from "./graphSettings.js";

export const FORCE_CHARGE = -150;
export const LINK_DISTANCE = 50;
export const LINK_ALPHA = 0.25;
export const LABEL_ZOOM = 1.15;

export type ForceNodeSeed = {
  id: string;
  label: string;
};

export type ForceLinkSeed = {
  source: string;
  target: string;
};

export type ForceGraphSeeds = {
  nodes: ForceNodeSeed[];
  links: ForceLinkSeed[];
};

export function nodeDegree(id: string, links: ForceLinkSeed[]): number {
  let count = 0;
  for (const link of links) {
    if (link.source === id || link.target === id) count += 1;
  }
  return count;
}

export function nodeRadius(degree: number): number {
  return 4 + Math.min(degree, 24) * 0.7;
}

/** Labels stay hidden until zoom or hover (Obsidian-like). */
export function labelZoomThreshold(textFade: number): number {
  return LABEL_ZOOM + (Math.min(10, Math.max(0, textFade)) - 5) * 0.12;
}

export function labelAlpha(
  zoom: number,
  hot: boolean,
  near: boolean,
  threshold = LABEL_ZOOM,
): number {
  if (hot) return 1;
  if (near) return 0.9;
  if (zoom >= threshold) return 1;
  return 0;
}

export function hexToPixi(color: string): number {
  const value = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return 0x6b7c93;
  return Number.parseInt(value.slice(1), 16);
}

export function wheelZoomStep(zoomSpeed: number): number {
  return 1 + 0.05 * Math.min(4, Math.max(1, zoomSpeed));
}

export type PixiForceParams = {
  charge: number;
  linkDistance: number;
  linkStrength: number;
  centerStrength: number;
  radialStrength: number;
  collidePadding: number;
};

export function pixiForceParams(settings: {
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}): PixiForceParams {
  const layout = forceLayoutOptions({
    ...GRAPH_SETTINGS_DEFAULTS,
    ...settings,
  });
  return {
    charge: -(80 + (settings.repelForce / 100) * 320),
    linkDistance: layout.idealEdgeLength,
    linkStrength: layout.edgeElasticity,
    centerStrength: layout.gravity,
    radialStrength: 0.04 + layout.gravity * 0.1,
    collidePadding: 4,
  };
}

/** Obsidian-like filled disk: sunflower around the canvas center. */
export function seedCircularLayout(
  nodes: Array<{ x?: number | null; y?: number | null }>,
  cx: number,
  cy: number,
  radius: number,
): void {
  const n = nodes.length;
  if (n === 0) return;
  if (n === 1) {
    nodes[0].x = cx;
    nodes[0].y = cy;
    return;
  }
  const golden = Math.PI * (3 - Math.sqrt(5));
  const span = Math.max(40, radius);
  for (let i = 0; i < n; i += 1) {
    const r = span * Math.sqrt((i + 0.5) / n);
    const angle = i * golden;
    nodes[i].x = cx + Math.cos(angle) * r;
    nodes[i].y = cy + Math.sin(angle) * r;
  }
}

export function nodeFillAlpha(hovering: boolean, hot: boolean, near: boolean): number {
  if (!hovering) return 1;
  if (hot || near) return 1;
  return 0.18;
}

export function linkStrokeAlpha(hovering: boolean, hot: boolean): number {
  if (!hovering) return LINK_ALPHA;
  return hot ? 0.85 : 0.06;
}

export function toForceSeeds(graph: {
  nodes: Array<{ path: string; title?: string }>;
  edges: Array<{ source: string; target: string }>;
}): ForceGraphSeeds {
  const nodes: ForceNodeSeed[] = [];
  const seen = new Set<string>();
  for (const item of graph.nodes) {
    const id = item.path.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    nodes.push({
      id,
      label: item.title?.trim() || id,
    });
  }
  const links: ForceLinkSeed[] = [];
  const linkSeen = new Set<string>();
  for (const edge of graph.edges) {
    const source = edge.source.trim();
    const target = edge.target.trim();
    if (!source || !target || source === target) continue;
    if (!seen.has(source) || !seen.has(target)) continue;
    const key = source < target ? `${source}\0${target}` : `${target}\0${source}`;
    if (linkSeen.has(key)) continue;
    linkSeen.add(key);
    links.push({ source, target });
  }
  return { nodes, links };
}
