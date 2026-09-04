import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import cytoscape from "cytoscape";
import type { Core, EventObject } from "cytoscape";
import {
  GRAPH_STYLESHEET,
  applyDegreeScores,
  bindNeighborhoodHighlight,
  highlightNeighborhood,
  runFcoseLayout,
} from "./cytoscapeFcose";

export type GraphNode = {
  path: string;
  title: string;
  tags: string[];
  isolated: boolean;
  unresolved: boolean;
  locked?: boolean;
  origin?: string;
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

type FilterKind = "all" | "unresolved" | "isolated" | "overlay";

const STATUS_LABEL: Record<string, string> = {
  empty: "индекс пуст",
  current: "актуален",
  updating: "обновляется",
  error: "ошибка индекса",
};

function originLabel(origin: string | undefined): string {
  if (origin === "personal") return "ваш git";
  if (origin === "both") return "общая и ваш git";
  if (origin === "overlay") return "связь с общей";
  return "общая";
}

export function GraphView({
  graph,
  loading,
  selectedPath,
  onOpen,
  onExpand,
  canReadNotes = true,
  onNeedAuth,
}: {
  graph: GraphResponse | null;
  loading?: boolean;
  selectedPath?: string | null;
  onOpen: (path: string, origin: string) => void;
  onExpand: (path: string) => void;
  canReadNotes?: boolean;
  onNeedAuth?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FilterKind>("all");
  const [tag, setTag] = useState("");
  const [focusPath, setFocusPath] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!graph) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    const q = query.trim().toLowerCase();
    const tagQ = tag.trim().toLowerCase();
    const nodes = graph.nodes.filter((node) => {
      if (kind === "unresolved" && !node.unresolved) return false;
      if (kind === "isolated" && !node.isolated) return false;
      if (kind === "overlay" && node.origin !== "personal" && node.origin !== "both") return false;
      if (q && !node.title.toLowerCase().includes(q) && !node.path.toLowerCase().includes(q)) return false;
      if (tagQ && !node.tags.some((item) => item.toLowerCase().includes(tagQ))) return false;
      return true;
    });
    const allowed = new Set(nodes.map((node) => node.path));
    const edges = graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target));
    return { nodes, edges };
  }, [graph, query, kind, tag]);

  const focusPathRef = useRef<string | null>(null);
  focusPathRef.current = focusPath || selectedPath || null;

  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const cy = cytoscape({
      container: host,
      elements: [],
      minZoom: 0.15,
      maxZoom: 3,
      wheelSensitivity: 0.25,
      style: GRAPH_STYLESHEET,
    });
    cyRef.current = cy;
    bindNeighborhoodHighlight(cy, () => focusPathRef.current);
    const onTap = (event: EventObject) => {
      if (event.target === cy || typeof event.target.isNode !== "function") {
        setFocusPath(null);
        return;
      }
      if (event.target.isNode()) setFocusPath(event.target.id());
    };
    const onDouble = (event: EventObject) => {
      if (typeof event.target.isNode !== "function" || !event.target.isNode()) return;
      const node = event.target;
      onOpenRef.current(String(node.id()), String(node.data("origin") || "shared"));
    };
    cy.on("tap", onTap);
    cy.on("dbltap", onDouble);
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

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
        },
      })),
      ...visible.edges.map((edge, index) => ({
        group: "edges" as const,
        data: {
          id: `${edge.source}->${edge.target}:${edge.type}:${index}`,
          source: edge.source,
          target: edge.target,
          origin: edge.origin || "shared",
          unresolved: edge.unresolved ? 1 : 0,
          locked: edge.locked ? 1 : 0,
        },
      })),
    ]);
    applyDegreeScores(cy);
    if (visible.nodes.length > 0) {
      runFcoseLayout(cy);
    }
  }, [visible]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    const path = selectedPath || focusPath;
    if (path && cy.getElementById(path).nonempty()) {
      cy.getElementById(path).select();
      highlightNeighborhood(cy, path);
    } else {
      highlightNeighborhood(cy, null);
    }
  }, [selectedPath, focusPath, visible]);

  function currentNode(): GraphNode | null {
    const path = focusPath || selectedPath;
    if (!path || !graph) return null;
    return graph.nodes.find((node) => node.path === path) ?? null;
  }

  function moveFocus(step: number) {
    if (visible.nodes.length === 0) return;
    const paths = visible.nodes.map((node) => node.path);
    const current = focusPath || selectedPath;
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
      if (node) onOpen(node.path, node.origin || "shared");
    } else if (event.key === "e" || event.key === "E") {
      const node = currentNode();
      if (node && !node.unresolved && !node.locked && !node.path.startsWith("personal:")) onExpand(node.path);
    } else if (event.key === "Escape") {
      setFocusPath(null);
    }
  }

  const selected = currentNode();
  const status = graph ? STATUS_LABEL[graph.index_status] || graph.index_status : "загрузка";

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <label>
          Поиск
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="название или путь" />
        </label>
        <label>
          Слой
          <select value={kind} onChange={(event) => setKind(event.target.value as FilterKind)}>
            <option value="all">все узлы</option>
            <option value="unresolved">нет заметки</option>
            <option value="isolated">отдельно</option>
            {canReadNotes && <option value="overlay">ваш git</option>}
          </select>
        </label>
        <label>
          Тег
          <input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="тег" />
        </label>
      </div>
      <p className="admin-panel__hint" role="status">
        Слой: {graph?.layer === "overlay" ? "общая ризома и связи вашего git" : "общая ризома"}. Состояние: {status}.
        {graph?.truncated ? " Показана часть узлов — выберите узел и нажмите «Соседи»." : ""}
        {loading ? " Обновляем граф…" : ""}
      </p>
      {(!graph || graph.nodes.length === 0) && !loading ? (
        <p className="admin-panel__hint">Граф пока пуст.</p>
      ) : null}
      <div
        ref={containerRef}
        className="graph-canvas"
        tabIndex={0}
        role="application"
        aria-label="Граф общей ризомы"
        onKeyDown={handleKey}
      />
      <div className="graph-legend" aria-hidden="true">
        <span><i className="swatch swatch--shared" /> общая</span>
        <span><i className="swatch swatch--both" /> есть у вас</span>
        <span><i className="swatch swatch--personal" /> ваш git</span>
        <span><i className="swatch swatch--missing" /> нет заметки</span>
      </div>
      {selected && (
        <div className="graph-selection">
          <p>
            <strong>{selected.title}</strong>
            <small> {originLabel(selected.origin)} · {selected.locked ? "замок" : selected.unresolved ? "нет заметки" : selected.path}</small>
          </p>
          <div className="graph-actions">
            <button
              className="button button--primary"
              type="button"
              disabled={selected.unresolved}
              onClick={() => {
                if (!canReadNotes) {
                  onNeedAuth?.();
                  return;
                }
                onOpen(selected.path, selected.origin || "shared");
              }}
            >
              {canReadNotes ? "Открыть карточку" : "Войдите, чтобы читать"}
            </button>
            <button
              className="button button--quiet"
              type="button"
              disabled={selected.unresolved || Boolean(selected.locked) || selected.path.startsWith("personal:")}
              onClick={() => onExpand(selected.path)}
            >
              Соседи
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
