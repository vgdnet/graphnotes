import assert from "node:assert/strict";
import { test } from "node:test";

import { GRAPH_SETTINGS_DEFAULTS } from "../test-out/graphSettings.js";
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
} from "../test-out/pixiGraph.js";

test("toForceSeeds maps GraphNotes nodes/edges to id/label/links", () => {
  const seeds = toForceSeeds({
    nodes: [
      { path: "1", title: "Заметка" },
      { path: "2", title: "Сосед" },
      { path: "2", title: "дубль" },
    ],
    edges: [
      { source: "1", target: "2" },
      { source: "1", target: "missing" },
      { source: "2", target: "1" },
    ],
  });
  assert.deepEqual(seeds.nodes, [
    { id: "1", label: "Заметка" },
    { id: "2", label: "Сосед" },
  ]);
  assert.deepEqual(seeds.links, [{ source: "1", target: "2" }]);
  assert.equal(nodeDegree("1", seeds.links), 1);
  assert.ok(nodeRadius(8) > nodeRadius(1));
});

test("labelAlpha hides until zoom or hover", () => {
  assert.equal(labelAlpha(1, false, false), 0);
  assert.equal(labelAlpha(1.2, false, false), 1);
  assert.equal(labelAlpha(1, true, false), 1);
  assert.equal(labelAlpha(1, false, true), 0.9);
});

test("seedCircularLayout fills a disk around the center", () => {
  const nodes = [{}, {}, {}, {}];
  seedCircularLayout(nodes, 100, 80, 40);
  assert.equal(nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)), true);
  const rs = nodes.map((node) => Math.hypot(node.x - 100, node.y - 80));
  assert.ok(Math.max(...rs) <= 41);
  assert.ok(rs.some((value) => value > 5));
});

test("pixi forces and zoom follow the shared graph settings", () => {
  const params = pixiForceParams(GRAPH_SETTINGS_DEFAULTS);
  assert.ok(params.charge < -150);
  assert.ok(params.linkDistance > 50);
  assert.ok(params.centerStrength > 0);
  assert.ok(params.radialStrength > 0);
  assert.equal(hexToPixi("#086ddd"), 0x086ddd);
  assert.ok(wheelZoomStep(2) > wheelZoomStep(1));
  assert.ok(labelZoomThreshold(10) > labelZoomThreshold(5));
});

test("hover dims unrelated nodes and idle links stay faint", () => {
  assert.equal(nodeFillAlpha(true, false, false), 0.18);
  assert.equal(nodeFillAlpha(true, true, false), 1);
  assert.equal(linkStrokeAlpha(false, false), 0.25);
  assert.equal(linkStrokeAlpha(true, true), 0.85);
  assert.equal(linkStrokeAlpha(true, false), 0.06);
});
