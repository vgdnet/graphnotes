import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { Core, EventObject } from "cytoscape";
import {
  bindNeighborhoodHighlight,
  graphStylesheet,
  runFcoseLayout,
} from "./cytoscapeFcose";
import { personCardHash } from "./appRoute";

export type InviteGraphNode = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  invited_by_id: string | null;
  invited_at: string | null;
  invited_count: number;
};

export type InviteGraphEdge = {
  source: string;
  target: string;
};

export type InviteGraphPayload = {
  nodes: InviteGraphNode[];
  edges: InviteGraphEdge[];
};

export function InviteGraph({
  graph,
  loading,
}: {
  graph: InviteGraphPayload | null;
  loading?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const cy = cytoscape({
      container: host,
      elements: [],
      minZoom: 0.15,
      maxZoom: 3,
      wheelSensitivity: 0.25,
      style: [
        ...graphStylesheet(),
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            width: 1.8,
            opacity: 0.7,
            "target-arrow-shape": "triangle",
            "arrow-scale": 1.1,
          },
        },
        {
          selector: "node",
          style: { "text-max-width": "110px" },
        },
        {
          selector: "node[root = 1]",
          style: { shape: "diamond" },
        },
        {
          selector: "node[inactive = 1]",
          style: { opacity: 0.45 },
        },
      ],
    });
    cyRef.current = cy;
    bindNeighborhoodHighlight(cy);
    const onTap = (event: EventObject) => {
      if (event.target === cy || typeof event.target.isNode !== "function") return;
      if (!event.target.isNode()) return;
      const username = event.target.data("username") as string | undefined;
      window.location.hash = personCardHash(username || event.target.id());
    };
    cy.on("tap", "node", onTap);
    return () => {
      cy.stop();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graph) return;
    cy.elements().remove();
    cy.add(
      graph.nodes.map((node) => ({
        group: "nodes" as const,
        data: {
          id: node.id,
          username: node.username,
          label: `@${node.username} · ${node.invited_count ?? 0}`,
          title: `${node.display_name}: пригласил ${node.invited_count ?? 0}`,
          score: Math.min(8, node.invited_count ?? 0),
          root: node.invited_by_id ? 0 : 1,
          inactive: node.is_active ? 0 : 1,
        },
      })),
    );
    cy.add(
      graph.edges.map((edge) => ({
        group: "edges" as const,
        data: {
          id: `${edge.source}->${edge.target}`,
          source: edge.source,
          target: edge.target,
        },
      })),
    );
    runFcoseLayout(cy);
  }, [graph]);

  return (
    <div className="graph-view invite-graph">
      {loading ? <p className="admin-panel__hint">Загружаем карту инвайтов…</p> : null}
      {!loading && graph && graph.nodes.length === 0 ? (
        <p className="admin-panel__hint">Учёток пока нет.</p>
      ) : null}
      <div
        ref={containerRef}
        className="graph-canvas"
        role="img"
        aria-label="Карта инвайтов: кто кого пригласил и сколько связей"
      />
    </div>
  );
}
