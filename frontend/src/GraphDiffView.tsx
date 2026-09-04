import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import cytoscape from "cytoscape";
import type { Core, EventObject } from "cytoscape";
import {
  applyDegreeScores,
  bindNeighborhoodHighlight,
  diffStylesheet,
  runFcoseLayout,
} from "./cytoscapeFcose";
import type { ThemeName } from "./theme";

export type GraphDiffNode = {
  path: string;
  title: string;
  tags: string[];
  change: string;
  marker: string;
  unresolved: boolean;
  isolated: boolean;
  from_path: string | null;
};

export type GraphDiffEdge = {
  source: string;
  target: string;
  type: string;
  change: string;
  unresolved: boolean;
};

export type GraphDiffChange = {
  kind: string;
  path: string;
  detail: string;
};

export type GraphDiffSummary = {
  nodes_added: number;
  nodes_removed: number;
  nodes_modified: number;
  nodes_renamed: number;
  nodes_content_only: number;
  edges_added: number;
  edges_removed: number;
  edges_type_changed: number;
  unresolved_resolved: number;
  resolved_unresolved: number;
  tags_added: number;
  tags_removed: number;
};

export type GraphDiffResponse = {
  proposal_id: string;
  status: string;
  complete: boolean;
  truncated: boolean;
  stale: boolean;
  conflicted: boolean;
  empty: boolean;
  no_structural_change: boolean;
  summary: GraphDiffSummary;
  nodes: GraphDiffNode[];
  edges: GraphDiffEdge[];
  changes: GraphDiffChange[];
};

function changeLabel(change: string): string {
  switch (change) {
    case "added":
      return "появится";
    case "removed":
      return "исчезнет";
    case "modified":
      return "изменится";
    case "renamed":
      return "переименование";
    case "unresolved":
      return "нет заметки";
    default:
      return "сосед";
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "added":
      return "узел появится";
    case "removed":
      return "узел исчезнет";
    case "modified":
      return "узел изменится";
    case "renamed":
      return "переименование";
    case "tags":
      return "теги";
    case "edge_added":
      return "связь появится";
    case "edge_removed":
      return "связь исчезнет";
    case "type_changed":
      return "тип связи";
    case "unresolved_resolved":
      return "ссылка найдёт заметку";
    case "resolved_unresolved":
      return "ссылка потеряет заметку";
    case "incomplete":
      return "неполный расчёт";
    default:
      return kind;
  }
}

function summaryLine(summary: GraphDiffSummary): string {
  return [
    summary.nodes_added ? `+${summary.nodes_added} узлов` : "",
    summary.nodes_removed ? `−${summary.nodes_removed} узлов` : "",
    summary.nodes_modified ? `${summary.nodes_modified} изменены` : "",
    summary.nodes_renamed ? `${summary.nodes_renamed} переименованы` : "",
    summary.edges_added ? `+${summary.edges_added} связей` : "",
    summary.edges_removed ? `−${summary.edges_removed} связей` : "",
    summary.edges_type_changed ? `${summary.edges_type_changed} тип связи` : "",
    summary.unresolved_resolved ? `${summary.unresolved_resolved} ссылок найдут заметку` : "",
    summary.tags_added || summary.tags_removed
      ? `теги +${summary.tags_added}/−${summary.tags_removed}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function GraphDiffView({
  diff,
  loading,
  theme,
}: {
  diff: GraphDiffResponse | null;
  loading?: boolean;
  theme: ThemeName;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const focusPathRef = useRef<string | null>(null);
  focusPathRef.current = focusPath;

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const cy = cytoscape({
      container: host,
      elements: [],
      minZoom: 0.15,
      maxZoom: 3,
      wheelSensitivity: 0.25,
      style: diffStylesheet(),
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
    cy.on("tap", onTap);
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style().fromJson(diffStylesheet()).update();
  }, [theme]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.stop();
    cy.elements().remove();
    if (!diff) return;
    cy.add([
      ...diff.nodes.map((node) => ({
        group: "nodes" as const,
        data: {
          id: node.path,
          label: node.title,
          marker: node.marker,
          change: node.change,
        },
      })),
      ...diff.edges.map((edge, index) => ({
        group: "edges" as const,
        data: {
          id: `${edge.source}->${edge.target}:${edge.type}:${index}`,
          source: edge.source,
          target: edge.target,
          change: edge.change,
        },
      })),
    ]);
    applyDegreeScores(cy);
    if (diff.nodes.length > 0) {
      runFcoseLayout(cy);
    }
  }, [diff]);

  function moveFocus(step: number) {
    if (!diff || diff.nodes.length === 0) return;
    const paths = diff.nodes.map((node) => node.path);
    const index = focusPath ? Math.max(0, paths.indexOf(focusPath)) : 0;
    setFocusPath(paths[(index + step + paths.length) % paths.length]);
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "Escape") {
      setFocusPath(null);
    }
  }

  const selected = diff?.nodes.find((node) => node.path === focusPath) ?? null;
  const line = diff ? summaryLine(diff.summary) : "";

  return (
    <div className="graph-diff">
      <p className="admin-panel__hint" role="status">
        Graph Diff — структурный вид этого предложения, не второй корпус знаний.
        {loading ? " Считаем влияние…" : ""}
        {diff && !diff.complete ? " Расчёт неполный — нельзя считать, что изменений нет." : ""}
        {diff?.stale ? " Основание устарело относительно опубликованной общей ризомы." : ""}
        {diff?.conflicted ? " Предложение в конфликте." : ""}
        {diff?.truncated ? " Показана окрестность изменений, не весь граф." : ""}
        {diff?.empty ? " Структурных отличий нет." : ""}
        {diff?.no_structural_change ? " Есть только правка текста, без узлов, связей и тегов." : ""}
        {line ? ` ${line}.` : ""}
      </p>
      {(!diff || (diff.complete && diff.nodes.length === 0 && !loading)) && diff?.empty ? (
        <p className="admin-panel__hint">Предложение не меняет граф.</p>
      ) : null}
      <div
        ref={containerRef}
        className="graph-canvas graph-canvas--diff"
        tabIndex={0}
        role="application"
        aria-label="Graph Diff предложения"
        onKeyDown={handleKey}
      />
      <div className="graph-legend" aria-hidden="true">
        <span><i className="marker marker--triangle" /> появится</span>
        <span><i className="marker marker--octagon" /> исчезнет</span>
        <span><i className="marker marker--rectangle" /> изменится</span>
        <span><i className="marker marker--diamond" /> переименование</span>
        <span><i className="marker marker--star" /> нет заметки</span>
        <span><i className="marker marker--ellipse" /> сосед</span>
      </div>
      {selected && (
        <p>
          <strong>{selected.title}</strong>
          <small>
            {" "}
            {changeLabel(selected.change)}
            {selected.from_path ? ` · было ${selected.from_path}` : ""}
            {selected.unresolved ? "" : ` · ${selected.path}`}
          </small>
        </p>
      )}
      {diff && diff.changes.length > 0 && (
        <ul className="graph-diff-changes">
          {diff.changes.map((item, index) => (
            <li key={`${item.kind}:${item.path}:${index}`}>
              <strong>{kindLabel(item.kind)}</strong>
              {item.path ? ` · ${item.path}` : ""}
              {item.detail ? ` — ${item.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
