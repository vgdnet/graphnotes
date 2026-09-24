import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Circle, Container, Graphics, Text } from "pixi.js";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { cardHash, missingNotePath } from "./cardRoute";
import { GraphSettingsPanel } from "./GraphSettingsPanel";
import {
  buildVisibleGraph,
  groupColorByPath,
  isTagNodePath,
  loadGraphSettings,
  persistGraphSettings,
  type GraphSettings,
} from "./graphSettings";
import type { GraphResponse } from "./GraphView";
import {
  hexToPixi,
  labelAlpha,
  labelZoomThreshold,
  linkStrokeAlpha,
  nodeDegree,
  nodeFillAlpha,
  nodeRadius,
  pixiForceParams,
  seedCircularLayout,
  toForceSeeds,
  wheelZoomStep,
} from "./pixiGraph";

type SimNode = SimulationNodeDatum & {
  id: string;
  label: string;
  degree: number;
};

type SimLink = SimulationLinkDatum<SimNode>;

type NodeSprite = {
  node: SimNode;
  mark: Graphics;
  label: Text;
};

type Engine = {
  applyForces: (settings: GraphSettings) => void;
  applyLook: (settings: GraphSettings) => void;
  restartLayout: (settings: GraphSettings) => void;
};

const BG = 0x1a1a1a;
const NODE = 0x6b7c93;
const NODE_HOT = 0x9eb6ff;
const NODE_NEAR = 0x8aa0d8;
const LINK = 0x8b98a6;
const LABEL = 0xe8edf2;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;

function openCard(path: string): void {
  if (isTagNodePath(path) || path.startsWith("locked:")) return;
  if (path.startsWith("unresolved:")) {
    const filePath = missingNotePath(path);
    if (filePath) window.location.hash = cardHash(filePath);
    return;
  }
  window.location.hash = cardHash(path);
}

function drawMark(mark: Graphics, radius: number, color: number, alpha: number): void {
  mark.clear();
  mark.circle(0, 0, radius);
  mark.fill({ color, alpha });
  mark.hitArea = new Circle(0, 0, radius + 6);
}

function drawArrow(
  gfx: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  alpha: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 8) return;
  const ux = dx / len;
  const uy = dy / len;
  const tipX = x2 - ux * 3;
  const tipY = y2 - uy * 3;
  const backX = tipX - ux * (7 + width);
  const backY = tipY - uy * (7 + width);
  const px = -uy;
  const py = ux;
  gfx.moveTo(tipX, tipY);
  gfx.lineTo(backX + px * 3.4, backY + py * 3.4);
  gfx.lineTo(backX - px * 3.4, backY - py * 3.4);
  gfx.closePath();
  gfx.fill({ color: LINK, alpha });
}

export function PixiGraphView({
  graph,
  loading,
}: {
  graph: GraphResponse | null;
  loading: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const [settings, setSettings] = useState<GraphSettings>(() => loadGraphSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const visible = useMemo(() => {
    if (!graph) return { nodes: [] as GraphResponse["nodes"], edges: [] as GraphResponse["edges"] };
    return buildVisibleGraph(graph, {
      kind: "all",
      showTags: settings.showTags,
      showOrphans: settings.showOrphans,
    });
  }, [graph, settings.showTags, settings.showOrphans]);

  const visibleKey = `${visible.nodes.map((node) => node.path).join("\0")}|${visible.edges.map((edge) => `${edge.source}->${edge.target}`).join("\0")}`;

  const forceKey = `${settings.centerForce}|${settings.repelForce}|${settings.linkForce}|${settings.linkDistance}|${settings.nodeSize}`;

  useEffect(() => {
    persistGraphSettings(settings);
  }, [settings]);

  useEffect(() => {
    engineRef.current?.applyForces(settingsRef.current);
  }, [forceKey]);

  useEffect(() => {
    engineRef.current?.applyLook(settings);
  }, [settings]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !graph) return;
    const seeds = toForceSeeds(visible);
    let disposed = false;
    let app: Application | undefined;
    let simulation: Simulation<SimNode, SimLink> | undefined;
    const onWheel = { current: null as ((event: WheelEvent) => void) | null };

    void (async () => {
      const pixi = new Application();
      await pixi.init({
        background: BG,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        resizeTo: host,
      });
      if (disposed) {
        pixi.destroy(true);
        return;
      }
      app = pixi;
      host.replaceChildren(pixi.canvas);
      pixi.canvas.style.display = "block";
      pixi.canvas.style.width = "100%";
      pixi.canvas.style.height = "100%";

      const world = new Container();
      pixi.stage.addChild(world);
      pixi.stage.eventMode = "static";
      pixi.stage.hitArea = pixi.screen;

      const linksGfx = new Graphics();
      linksGfx.eventMode = "none";
      world.addChild(linksGfx);

      const nodes: SimNode[] = seeds.nodes.map((item) => ({
        id: item.id,
        label: item.label,
        degree: nodeDegree(item.id, seeds.links),
      }));
      const links: SimLink[] = seeds.links.map((item) => ({
        source: item.source,
        target: item.target,
      }));
      const neighbors = new Map<string, Set<string>>();
      for (const node of nodes) neighbors.set(node.id, new Set());
      for (const link of seeds.links) {
        neighbors.get(link.source)?.add(link.target);
        neighbors.get(link.target)?.add(link.source);
      }

      const sprites: NodeSprite[] = nodes.map((node) => {
        const mark = new Graphics();
        drawMark(mark, nodeRadius(node.degree), NODE, 1);
        mark.eventMode = "static";
        mark.cursor = "pointer";
        const label = new Text({
          text: node.label,
          style: {
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: 12,
            fill: LABEL,
          },
        });
        label.anchor.set(0.5, -0.25);
        label.alpha = 0;
        label.eventMode = "none";
        world.addChild(mark);
        world.addChild(label);
        return { node, mark, label };
      });

      const width = () => pixi.renderer.width;
      const height = () => pixi.renderer.height;
      const centerX = () => width() / 2;
      const centerY = () => height() / 2;
      const diskRadius = () => Math.min(width(), height()) * 0.42;

      seedCircularLayout(nodes, centerX(), centerY(), diskRadius());

      simulation = forceSimulation(nodes)
        .force("charge", forceManyBody())
        .force("link", forceLink<SimNode, SimLink>(links).id((node) => node.id))
        .force("center", forceCenter(centerX(), centerY()))
        .force("radial", forceRadial(diskRadius() * 0.55, centerX(), centerY()))
        .force("collide", forceCollide());

      let hoverId: string | null = null;
      let dragging: SimNode | null = null;
      let panning = false;
      let panLast = { x: 0, y: 0 };
      let downAt = { x: 0, y: 0 };

      const applyForces = (next: GraphSettings): void => {
        const params = pixiForceParams(next);
        const cx = centerX();
        const cy = centerY();
        const radius = diskRadius();
        (simulation?.force("charge") as ReturnType<typeof forceManyBody> | undefined)?.strength(params.charge);
        const linkForce = simulation?.force("link") as ReturnType<typeof forceLink<SimNode, SimLink>> | undefined;
        linkForce?.distance(params.linkDistance).strength(params.linkStrength);
        (simulation?.force("center") as ReturnType<typeof forceCenter> | undefined)?.x(cx).y(cy).strength(params.centerStrength);
        (simulation?.force("radial") as ReturnType<typeof forceRadial<SimNode>> | undefined)
          ?.radius(radius * 0.55).x(cx).y(cy).strength(params.radialStrength);
        (simulation?.force("collide") as ReturnType<typeof forceCollide<SimNode>> | undefined)
          ?.radius((node) => nodeRadius(node.degree) * next.nodeSize + params.collidePadding)
          .strength(0.75);
        simulation?.alpha(0.35).restart();
      };

      const applyLook = (next: GraphSettings): void => {
        const colors = groupColorByPath(visible.nodes, next.groups);
        const hovering = hoverId != null;
        for (const sprite of sprites) {
          const id = sprite.node.id;
          const hot = hoverId === id;
          const near = Boolean(hoverId && neighbors.get(hoverId)?.has(id));
          const tint = colors.get(id);
          drawMark(
            sprite.mark,
            nodeRadius(sprite.node.degree) * next.nodeSize * (hot ? 1.35 : 1),
            hot ? NODE_HOT : near ? NODE_NEAR : tint ? hexToPixi(tint) : NODE,
            nodeFillAlpha(hovering, hot, near),
          );
        }
        drawLinks();
      };

      const restartLayout = (next: GraphSettings): void => {
        seedCircularLayout(nodes, centerX(), centerY(), diskRadius());
        applyForces(next);
        simulation?.alpha(1).restart();
      };

      const drawLinks = (): void => {
        linksGfx.clear();
        const next = settingsRef.current;
        const hovering = hoverId != null;
        const widthScale = next.linkThickness;
        for (const link of links) {
          const source = link.source as SimNode;
          const target = link.target as SimNode;
          if (source.x == null || source.y == null || target.x == null || target.y == null) continue;
          const hot = Boolean(hoverId && (source.id === hoverId || target.id === hoverId));
          const alpha = linkStrokeAlpha(hovering, hot);
          const stroke = hot ? 1.6 * widthScale : 1 * widthScale;
          linksGfx.moveTo(source.x, source.y);
          linksGfx.lineTo(target.x, target.y);
          linksGfx.stroke({ width: stroke, color: LINK, alpha });
          if (next.arrows) {
            drawArrow(linksGfx, source.x, source.y, target.x, target.y, stroke, alpha);
          }
        }
      };

      applyForces(settingsRef.current);
      applyLook(settingsRef.current);

      simulation.on("tick", () => {
        drawLinks();
        for (const sprite of sprites) {
          sprite.mark.position.set(sprite.node.x ?? 0, sprite.node.y ?? 0);
          sprite.label.position.set(sprite.node.x ?? 0, sprite.node.y ?? 0);
        }
      });

      pixi.ticker.add(() => {
        const zoom = world.scale.x;
        const threshold = labelZoomThreshold(settingsRef.current.textFade);
        for (const sprite of sprites) {
          const hot = hoverId === sprite.node.id;
          const near = Boolean(hoverId && neighbors.get(hoverId)?.has(sprite.node.id));
          const target = labelAlpha(zoom, hot, near, threshold);
          sprite.label.alpha += (target - sprite.label.alpha) * 0.22;
        }
      });

      for (const sprite of sprites) {
        sprite.mark.on("pointerover", () => {
          hoverId = sprite.node.id;
          applyLook(settingsRef.current);
        });
        sprite.mark.on("pointerout", () => {
          if (hoverId === sprite.node.id && !dragging) {
            hoverId = null;
            applyLook(settingsRef.current);
          }
        });
        sprite.mark.on("pointerdown", (event) => {
          event.stopPropagation();
          dragging = sprite.node;
          downAt = { x: event.global.x, y: event.global.y };
          sprite.node.fx = sprite.node.x;
          sprite.node.fy = sprite.node.y;
          simulation?.alphaTarget(0.3).restart();
        });
      }

      pixi.stage.on("pointerdown", (event) => {
        if (event.target !== pixi.stage) return;
        panning = true;
        panLast = { x: event.global.x, y: event.global.y };
      });

      const onMove = (event: { global: { x: number; y: number } }): void => {
        if (dragging) {
          const local = world.toLocal(event.global);
          dragging.fx = local.x;
          dragging.fy = local.y;
          return;
        }
        if (!panning) return;
        world.x += event.global.x - panLast.x;
        world.y += event.global.y - panLast.y;
        panLast = { x: event.global.x, y: event.global.y };
      };

      const onUp = (event: { global: { x: number; y: number } }): void => {
        if (dragging) {
          const moved = Math.hypot(event.global.x - downAt.x, event.global.y - downAt.y);
          const id = dragging.id;
          dragging.fx = null;
          dragging.fy = null;
          simulation?.alphaTarget(0);
          dragging = null;
          if (moved < 12) openCard(id);
        }
        panning = false;
      };

      pixi.stage.on("pointermove", onMove);
      pixi.stage.on("pointerup", onUp);
      pixi.stage.on("pointerupoutside", onUp);

      const wheel = (event: WheelEvent): void => {
        event.preventDefault();
        const scale = world.scale.x;
        const step = wheelZoomStep(settingsRef.current.zoomSpeed);
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * (event.deltaY < 0 ? step : 1 / step)));
        const rect = pixi.canvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const wx = (mx - world.x) / scale;
        const wy = (my - world.y) / scale;
        world.scale.set(next);
        world.x = mx - wx * next;
        world.y = my - wy * next;
      };
      onWheel.current = wheel;
      pixi.canvas.addEventListener("wheel", wheel, { passive: false });

      const onResize = (): void => {
        pixi.stage.hitArea = pixi.screen;
        applyForces(settingsRef.current);
      };
      pixi.renderer.on("resize", onResize);

      engineRef.current = { applyForces, applyLook, restartLayout };
    })();

    return () => {
      disposed = true;
      engineRef.current = null;
      simulation?.stop();
      if (app) {
        if (onWheel.current) app.canvas.removeEventListener("wheel", onWheel.current);
        app.destroy(true);
      }
      host.replaceChildren();
    };
  }, [graph, visibleKey]);

  return (
    <div className="pixi-graph">
      {loading && !graph ? <p className="admin-panel__hint">Загружаем ризому…</p> : null}
      {!loading && graph && visible.nodes.length === 0 ? (
        <p className="admin-panel__hint">В индексе пока нет узлов.</p>
      ) : null}
      <div className="graph-stage">
        <div ref={hostRef} className="pixi-graph__canvas" tabIndex={0} />
        <GraphSettingsPanel
          settings={settings}
          onChange={setSettings}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onRestartLayout={() => engineRef.current?.restartLayout(settingsRef.current)}
        />
      </div>
    </div>
  );
}
