import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import cytoscape from "cytoscape";
import type { Core, EventObject } from "cytoscape";
import {
  applyDegreeScores,
  bindNeighborhoodHighlight,
  graphStylesheet,
  highlightNeighborhood,
  runFcoseLayout,
} from "./cytoscapeFcose";
import { GraphSettingsPanel } from "./GraphSettingsPanel";
import {
  buildVisibleGraph,
  forceLayoutOptions,
  groupColorByPath,
  isTagNodePath,
  loadGraphSettings,
  persistGraphSettings,
} from "./graphSettings";
import type { GraphSettings } from "./graphSettings";
import { graphIndexStatusLabel } from "./labels";
import { cardHash, missingNotePath } from "./cardRoute";
import { graphNodePath, LOCAL_GRAPH_DEPTHS } from "./graphQuery";
import type { GraphScope } from "./graphQuery";
import type { ThemeName } from "./theme";

export type GraphNode = {
  path: string;
  title: string;
  tags: string[];
  isolated: boolean;
  unresolved: boolean;
  locked?: boolean;
  origin?: string;
  kind?: "note" | "tag";
};

export type GraphEdge = {
  source: string;
  target: string;
  type: string;
  unresolved: boolean;
  locked?: boolean;
  origin?: string;
};

export type GraphResponse = {
  layer: string;
  index_status: string;
  truncated: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type FilterKind = "all" | "unresolved" | "isolated" | "overlay" | "personal";

function originLabel(origin: string | undefined, personalLayer: boolean): string {
  if (origin === "tag") return "тег";
  if (origin === "personal") return personalLayer ? "ваша личная ризома" : "ваша часть ризомы";
  if (origin === "both") return "общая и ваша часть ризомы";
  if (origin === "overlay") return "связь с общей";
  return "общая";
}

function layerStatusLabel(graphLayer: string | undefined, kind: FilterKind): string {
  if (kind === "personal" || graphLayer === "personal") return "ваша личная ризома";
  if (kind === "overlay") return "ваша часть ризомы";
  if (graphLayer === "overlay") return "общая ризома и ваша часть ризомы";
  return "общая ризома";
}

function cardPathFor(node: GraphNode, _personalLayer: boolean): string {
  if (node.path.startsWith("unresolved:") || node.path.startsWith("locked:")) {
    return node.path;
  }
  if (node.path.startsWith("personal:")) {
    const rest = node.path.slice("personal:".length);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/i.test(rest)) {
      return node.path;
    }
    return rest;
  }
  return node.path;
}

export function GraphView({
  graph,
  loading,
  selectedPath,
  localCenter = null,
  localDepth = 1,
  onLocalCenterChange,
  onLocalDepthChange,
  canReadNotes = true,
  onNeedAuth,
  filterKind,
  onFilterKindChange,
  theme,
  variant = "page",
}: {
  graph: GraphResponse | null;
  loading?: boolean;
  selectedPath?: string | null;
  localCenter?: string | null;
  localDepth?: number;
  onLocalCenterChange: (path: string | null) => void;
  onLocalDepthChange?: (depth: number) => void;
  canReadNotes?: boolean;
  onNeedAuth?: () => void;
  filterKind?: FilterKind;
  onFilterKindChange?: (kind: FilterKind) => void;
  theme: ThemeName;
  variant?: "page" | "aside";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [query, setQuery] = useState("");
  const [localKind, setLocalKind] = useState<FilterKind>("all");
  const kind = filterKind ?? localKind;
  const [settings, setSettings] = useState<GraphSettings>(() => loadGraphSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const forceKey = `${settings.centerForce}|${settings.repelForce}|${settings.linkForce}|${settings.linkDistance}`;
  const prevForceKeyRef = useRef(forceKey);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const personalLayer = kind === "personal" || graph?.layer === "personal";
  const selectedNodePath = graphNodePath(selectedPath, personalLayer);
  const graphScope: GraphScope = localCenter ? "local" : "full";
  const searchLayer = personalLayer ? "personal" : "overlay";

  const visible = useMemo(() => {
    if (!graph) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    return buildVisibleGraph(graph, {
      kind,
      showTags: settings.showTags,
      showOrphans: settings.showOrphans,
    });
  }, [graph, kind, settings.showTags, settings.showOrphans]);

  const visibleKey = `${visible.nodes.map((node) => node.path).join("\0")}|${visible.edges.map((edge) => `${edge.source}->${edge.target}:${edge.type}`).join("\0")}`;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as GraphNode[];
    return visible.nodes.filter(
      (node) => node.title.toLowerCase().includes(q) || node.path.toLowerCase().includes(q),
    );
  }, [visible, query]);

  const [remoteHits, setRemoteHits] = useState<{ path: string; title: string }[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setRemoteHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(q)}&layer=${searchLayer}`, { signal: controller.signal })
        .then(async (response) => (response.ok ? (await response.json()) as { hits: { path: string; title: string }[] } : { hits: [] }))
        .then((body) => setRemoteHits(body.hits))
        .catch(() => undefined);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchLayer]);

  useEffect(() => {
    persistGraphSettings(settings);
  }, [settings]);

  const focusPathRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const personalLayerRef = useRef(personalLayer);
  const canReadNotesRef = useRef(canReadNotes);
  const onNeedAuthRef = useRef(onNeedAuth);
  focusPathRef.current = focusPath || selectedNodePath || localCenter || null;
  personalLayerRef.current = personalLayer;
  canReadNotesRef.current = canReadNotes;
  onNeedAuthRef.current = onNeedAuth;

  useEffect(() => {
    if (matches[0]) setFocusPath(matches[0].path);
  }, [query, matches]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const cy = cytoscape({
      container: host,
      elements: [],
      minZoom: 0.15,
      maxZoom: 3,
      wheelSensitivity: 0.25,
      style: graphStylesheet(settingsRef.current),
    });
    cyRef.current = cy;
    bindNeighborhoodHighlight(cy, () => focusPathRef.current);
    const onTap = (event: EventObject) => {
      if (event.target === cy || typeof event.target.isNode !== "function") {
        setFocusPath(null);
        return;
      }
      if (!event.target.isNode()) return;
      const path = event.target.id();
      setFocusPath(path);
      if (isTagNodePath(path) || event.target.data("kind") === "tag") return;
      if (path.startsWith("locked:")) return;
      if (path.startsWith("unresolved:")) {
        const filePath = missingNotePath(path);
        if (filePath) window.location.hash = cardHash(filePath);
        return;
      }
      const node = {
        path,
        title: "",
        tags: [],
        isolated: false,
        unresolved: false,
      };
      window.location.hash = cardHash(cardPathFor(node, personalLayerRef.current));
      if (
        !canReadNotesRef.current
        && (path.startsWith("personal:") || path.startsWith("proposal:"))
      ) {
        onNeedAuthRef.current?.();
      }
    };
    cy.on("tap", onTap);
    return () => {
      cy.stop();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style().fromJson(graphStylesheet(settings)).update();
  }, [theme, settings.arrows, settings.textFade, settings.nodeSize, settings.linkThickness]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.stop();
    cy.elements().remove();
    cy.add([
      ...visible.nodes.map((node) => ({
        group: "nodes" as const,
        data: {
          id: node.path,
          label: node.title,
          origin: node.origin || "shared",
          unresolved: node.unresolved ? 1 : 0,
          locked: node.locked ? 1 : 0,
          kind: node.kind === "tag" ? "tag" : "note",
        },
      })),
      ...visible.edges.map((edge, index) => ({
        group: "edges" as const,
        data: {
          id: `${edge.source}->${edge.target}:${edge.type}:${index}`,
          source: edge.source,
          target: edge.target,
          origin: edge.origin || "shared",
          type: edge.type,
          unresolved: edge.unresolved ? 1 : 0,
          locked: edge.locked ? 1 : 0,
        },
      })),
    ]);
    applyDegreeScores(cy);
    const colors = groupColorByPath(visible.nodes, settingsRef.current.groups);
    cy.nodes().forEach((node) => {
      const color = colors.get(node.id());
      if (color) node.data("groupColor", color);
      else node.removeData("groupColor");
    });
    const layout = visible.nodes.length > 0
      ? runFcoseLayout(cy, forceLayoutOptions(settingsRef.current))
      : undefined;
    return () => {
      layout?.stop();
      cy.stop();
    };
  }, [visibleKey, visible.nodes, visible.edges]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const colors = groupColorByPath(visible.nodes, settings.groups);
    cy.nodes().forEach((node) => {
      const color = colors.get(node.id());
      if (color) node.data("groupColor", color);
      else node.removeData("groupColor");
    });
  }, [settings.groups, visible.nodes]);

  useEffect(() => {
    if (prevForceKeyRef.current === forceKey) return;
    prevForceKeyRef.current = forceKey;
    const cy = cyRef.current;
    if (!cy || cy.nodes().empty()) return;
    const layout = runFcoseLayout(cy, forceLayoutOptions(settings));
    return () => {
      layout?.stop();
    };
  }, [forceKey, settings]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const hit = new Set(matches.map((item) => item.path));
    cy.nodes().forEach((node) => {
      node.data("searchHit", hit.has(node.id()) ? 1 : 0);
    });
  }, [matches, visible]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    const path = selectedNodePath || focusPath || localCenter;
    if (path && cy.getElementById(path).nonempty()) {
      cy.getElementById(path).select();
      highlightNeighborhood(cy, path);
    } else {
      highlightNeighborhood(cy, null);
    }
  }, [selectedNodePath, focusPath, localCenter, visible]);

  function currentNode(): GraphNode | null {
    const path = focusPath || selectedNodePath || localCenter;
    if (!path) return null;
    return visible.nodes.find((node) => node.path === path)
      ?? graph?.nodes.find((node) => node.path === path)
      ?? null;
  }

  function canOpenLocal(node: GraphNode | null): boolean {
    return Boolean(node && !node.unresolved && !node.locked && node.kind !== "tag" && !isTagNodePath(node.path));
  }

  function openLocalGraph(path: string) {
    onLocalCenterChange(path);
  }

  function showWholeGraph() {
    onLocalCenterChange(null);
  }

  function moveFocus(step: number) {
    if (visible.nodes.length === 0) return;
    const paths = visible.nodes.map((node) => node.path);
    const current = focusPath || selectedNodePath || localCenter;
    const index = current ? Math.max(0, paths.indexOf(current)) : 0;
    const next = paths[(index + step + paths.length) % paths.length];
    setFocusPath(next);
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "Enter") {
      const node = currentNode();
      if (!node || node.kind === "tag" || isTagNodePath(node.path)) return;
      if (node.unresolved) {
        const filePath = missingNotePath(node.path);
        if (filePath) window.location.hash = cardHash(filePath);
      } else if (node) {
        window.location.hash = cardHash(cardPathFor(node, personalLayer));
        if (!canReadNotes) onNeedAuth?.();
      }
    } else if (event.key === "e" || event.key === "E") {
      const node = currentNode();
      if (canOpenLocal(node) && node) openLocalGraph(node.path);
    } else if (event.key === "Escape") {
      setFocusPath(null);
    }
  }

  const selected = currentNode();
  const status = graph ? graphIndexStatusLabel(graph.index_status) : loading ? "загрузка" : "не загружен";
  const neighbors = (() => {
    if (!selected || !graph) return [] as GraphNode[];
    const seen = new Set<string>();
    const items: GraphNode[] = [];
    for (const edge of visible.edges) {
      const other = edge.source === selected.path ? edge.target : edge.target === selected.path ? edge.source : null;
      if (!other || seen.has(other)) continue;
      seen.add(other);
      items.push(
        visible.nodes.find((node) => node.path === other) ?? graph.nodes.find((node) => node.path === other) ?? {
          path: other,
          title: other,
          tags: [],
          isolated: false,
          unresolved: edge.unresolved,
        },
      );
    }
    return items;
  })();

  const aside = variant === "aside";

  return (
    <div className={aside ? "graph-view graph-view--aside" : "graph-view"}>
      <div className="graph-toolbar">
        {!aside && (
        <label>
          Поиск
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="название или путь" />
        </label>
        )}
        {!aside && (
        <label>
          Слой
          <select
            value={kind}
            onChange={(event) => {
              const next = event.target.value as FilterKind;
              if (filterKind === undefined) setLocalKind(next);
              onFilterKindChange?.(next);
            }}
          >
            <option value="all">все узлы</option>
            <option value="unresolved">нет заметки</option>
            <option value="isolated">отдельно</option>
            {canReadNotes && <option value="overlay">ваша часть ризомы</option>}
            {canReadNotes && <option value="personal">ваша личная ризома</option>}
          </select>
        </label>
        )}
        {!aside && (
        <label>
          Вид
          <select
            value={graphScope}
            onChange={(event) => {
              const next = event.target.value as GraphScope;
              if (next === "full") {
                showWholeGraph();
                return;
              }
              const node = currentNode();
              if (canOpenLocal(node) && node) openLocalGraph(node.path);
            }}
          >
            <option value="full">весь граф</option>
            <option value="local">локальный граф</option>
          </select>
        </label>
        )}
        <label>
          Глубина
          <select
            value={String(localDepth)}
            disabled={!aside && graphScope !== "local"}
            onChange={(event) => onLocalDepthChange?.(Number(event.target.value))}
          >
            {LOCAL_GRAPH_DEPTHS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {!aside && (
      <p className="admin-panel__hint" role="status">
        Слой: {layerStatusLabel(graph?.layer, kind)}.
        {graphScope === "local" ? ` Локальный граф, глубина ${localDepth}. ` : " Весь граф. "}
        Состояние: {status}.
        {graphScope === "local" && localCenter ? ` Центр: ${localCenter}.` : ""}
        {graphScope === "full" && graph?.truncated && graph.index_status !== "error"
          ? " Показана страница узлов. Выберите узел и откройте локальный граф."
          : ""}
        {loading ? " Обновляем граф…" : ""}
        {query.trim() && matches.length > 0 ? ` Совпадений на графе: ${matches.length}.` : ""}
        {query.trim() && matches.length === 0 ? " Совпадений нет — граф на месте." : ""}
      </p>
      )}
      {(!graph || graph.nodes.length === 0) && !loading ? (
        <p className="admin-panel__hint">
          {graphScope === "local"
            ? "Рядом пока нет связей, которые можно показать."
            : "Граф пока пуст."}
        </p>
      ) : null}
      <div className={aside ? "graph-stage graph-stage--aside" : "graph-stage"}>
        <div
          ref={containerRef}
          className="graph-canvas"
          tabIndex={0}
          role="application"
          aria-label={personalLayer ? "Граф вашей личной ризомы" : "Граф общей ризомы"}
          onKeyDown={handleKey}
        />
        {!aside && (
          <GraphSettingsPanel
            settings={settings}
            onChange={setSettings}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />
        )}
      </div>
      {!aside && (
      <div className="graph-legend" aria-hidden="true">
        <span><i className="swatch swatch--shared" /> общая</span>
        <span><i className="swatch swatch--both" /> есть у вас</span>
        <span><i className="swatch swatch--personal" /> {personalLayer ? "ваша личная ризома" : "ваша часть ризомы"}</span>
        <span><i className="swatch swatch--missing" /> нет заметки</span>
      </div>
      )}
      {query.trim() && remoteHits.length > 0 && (
        <ul className="search-hits">
          {remoteHits.slice(0, 8).map((hit) => (
            <li key={hit.path}>
              <a
                href={cardHash(hit.path)}
                onClick={() => {
                  if (!canReadNotes) onNeedAuth?.();
                }}
              >
                {hit.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      {selected && !aside && (
        <div className="graph-selection">
          <p>
            <strong>{selected.title}</strong>
            <small> {originLabel(selected.origin, personalLayer)} · {selected.locked ? "замок" : selected.unresolved ? "нет заметки" : selected.path}</small>
          </p>
          <div className="graph-actions">
            {graphScope === "local" ? (
              <button className="button button--quiet" type="button" onClick={() => showWholeGraph()}>
                Показать всё
              </button>
            ) : (
              <button
                className="button button--quiet"
                type="button"
                disabled={!canOpenLocal(selected)}
                onClick={() => openLocalGraph(selected.path)}
              >
                Локальный граф
              </button>
            )}
          </div>
          {neighbors.length > 0 && (
            <ul className="graph-selection__links">
              {neighbors.map((node) => (
                <li key={node.path}>
                  {node.kind === "tag" || isTagNodePath(node.path) ? (
                    <button type="button" className="button button--quiet" onClick={() => setFocusPath(node.path)}>
                      {node.title}
                    </button>
                  ) : node.unresolved ? (
                    <a href={cardHash(missingNotePath(node.path))}>{node.title} · нет заметки</a>
                  ) : (
                    <a
                      href={cardHash(cardPathFor(node, personalLayer))}
                      onClick={() => {
                        if (!canReadNotes) onNeedAuth?.();
                      }}
                    >
                      {node.title}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!aside && !selected.unresolved && selected.kind !== "tag" && !isTagNodePath(selected.path) && (
            <p className="graph-selection__link">
              <a
                href={cardHash(cardPathFor(selected, personalLayer))}
                onClick={() => {
                  if (!canReadNotes) onNeedAuth?.();
                }}
              >
                Открыть карточку · {selected.title}
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

