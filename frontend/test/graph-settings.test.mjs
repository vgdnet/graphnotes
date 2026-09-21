import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GRAPH_SETTINGS_DEFAULTS,
  GRAPH_SETTINGS_STORAGE_KEY,
  buildVisibleGraph,
  colorForNode,
  forceLayoutOptions,
  isTagNodePath,
  loadGraphSettings,
  nodeMatchesGroupQuery,
  parseGraphSettings,
  persistGraphSettings,
  stylesheetOptions,
  tagNodePath,
} from "../test-out/graphSettings.js";

const graphViewSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/GraphView.tsx"),
  "utf8",
);
const panelSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/GraphSettingsPanel.tsx"),
  "utf8",
);

const sample = {
  nodes: [
    { path: "hub.md", title: "Hub", tags: ["psy", "child"], isolated: false, unresolved: false },
    { path: "lone.md", title: "Lone", tags: ["psy"], isolated: true, unresolved: false },
    { path: "other.md", title: "Other", tags: [], isolated: false, unresolved: false },
  ],
  edges: [
    { source: "hub.md", target: "other.md", type: "wikilink", unresolved: false },
  ],
};

test("page graph has Obsidian-like settings panel, not a toolbar tag box", () => {
  assert.match(graphViewSrc, /GraphSettingsPanel/);
  assert.match(panelSrc, /Теги/);
  assert.match(panelSrc, /Объекты без связей/);
  assert.match(panelSrc, /Группировка/);
  assert.match(panelSrc, /Новая группа/);
  assert.match(panelSrc, /Направление связей/);
  assert.match(panelSrc, /Порог исчезания текста/);
  assert.match(panelSrc, /Размер узла/);
  assert.match(panelSrc, /Толщина линий/);
  assert.match(panelSrc, /Сила притяжения/);
  assert.match(panelSrc, /Сила отталкивания/);
  assert.match(panelSrc, /Сила связи/);
  assert.match(panelSrc, /Расстояние между узлами/);
  assert.match(panelSrc, /Поисковый запрос/);
  assert.match(panelSrc, /Запустить анимацию/);
  assert.match(panelSrc, /role="switch"/);
  assert.match(panelSrc, /Сбросить настройки/);
  assert.equal(graphViewSrc.includes('placeholder="тег"'), false);
});

test("orphans toggle hides isolated notes", () => {
  const shown = buildVisibleGraph(sample, { kind: "all", showTags: false, showOrphans: true });
  const hidden = buildVisibleGraph(sample, { kind: "all", showTags: false, showOrphans: false });
  assert.equal(shown.nodes.some((node) => node.path === "lone.md"), true);
  assert.equal(hidden.nodes.some((node) => node.path === "lone.md"), false);
  assert.equal(hidden.nodes.some((node) => node.path === "hub.md"), true);
});

test("tags toggle adds tag nodes and leaves notes in place", () => {
  const off = buildVisibleGraph(sample, { kind: "all", showTags: false, showOrphans: true });
  assert.equal(off.nodes.some((node) => isTagNodePath(node.path)), false);

  const withTags = buildVisibleGraph(sample, { kind: "all", showTags: true, showOrphans: true });
  const psy = tagNodePath("psy");
  assert.equal(withTags.nodes.some((node) => node.path === psy), true);
  assert.equal(withTags.nodes.find((node) => node.path === psy)?.kind, "tag");
  assert.equal(withTags.edges.some((edge) => edge.type === "tag" && edge.target === psy), true);
});

test("group color last match wins and tag: query matches tags", () => {
  const hub = sample.nodes[0];
  assert.equal(nodeMatchesGroupQuery(hub, "tag:child"), true);
  assert.equal(nodeMatchesGroupQuery(hub, "#psy"), true);
  assert.equal(nodeMatchesGroupQuery(hub, "file:hub"), true);
  assert.equal(nodeMatchesGroupQuery(hub, ""), false);
  assert.equal(
    colorForNode(hub, [
      { id: "a", query: "hub", color: "#111111" },
      { id: "b", query: "tag:child", color: "#ff0000" },
    ]),
    "#ff0000",
  );
});

test("parse and persist keep slider defaults and clamp junk", () => {
  const parsed = parseGraphSettings({
    showTags: false,
    showOrphans: false,
    arrows: true,
    textFade: 99,
    nodeSize: 0.1,
    groups: [{ id: "g1", query: "psy", color: "red" }, { query: "x", color: "#00ff00" }],
  });
  assert.equal(parsed.showTags, false);
  assert.equal(parsed.showOrphans, false);
  assert.equal(parsed.arrows, true);
  assert.equal(parsed.textFade, 10);
  assert.equal(parsed.nodeSize, 0.4);
  assert.equal(parsed.centerForce, GRAPH_SETTINGS_DEFAULTS.centerForce);
  assert.equal(parsed.groups[0].color, "#e93147");
  assert.equal(parsed.groups[1].color, "#00ff00");

  const memory = new Map();
  const storage = {
    getItem(key) { return memory.get(key) ?? null; },
    setItem(key, value) { memory.set(key, value); },
  };
  persistGraphSettings(parsed, storage);
  const loaded = loadGraphSettings(storage);
  assert.equal(loaded.showTags, false);
  assert.equal(memory.has(GRAPH_SETTINGS_STORAGE_KEY), true);
});

test("default display and forces match the previous fCoSE look", () => {
  const display = stylesheetOptions(GRAPH_SETTINGS_DEFAULTS);
  assert.equal(display.arrows, false);
  assert.equal(display.labelScoreCutoff, 3);
  assert.equal(display.minZoomedFontSize, 14);
  assert.equal(display.nodeMin, 22);
  assert.equal(display.nodeMax, 56);
  assert.equal(display.edgeWidth, 1.6);

  const forces = forceLayoutOptions(GRAPH_SETTINGS_DEFAULTS);
  assert.equal(forces.nodeRepulsion, 4500);
  assert.equal(Math.round(forces.idealEdgeLength), 79);
});
