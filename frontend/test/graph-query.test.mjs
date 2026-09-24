import assert from "node:assert/strict";
import { test } from "node:test";

import { graphCenterForRequest, graphNodePath, graphRequestParams } from "../test-out/graphQuery.js";

test("local graph query keeps overlay personal center and strips own personal layer", () => {
  const overlay = graphRequestParams({
    scope: "local",
    center: "personal:mine.md",
    depth: 2,
  });
  assert.equal(overlay.center, "personal:mine.md");
  assert.equal(overlay.depth, "2");

  const personal = graphRequestParams({
    scope: "local",
    center: "personal:mine.md",
    depth: 1,
    personalLayer: true,
  });
  assert.equal(personal.center, "mine.md");
  assert.equal(graphCenterForRequest("personal:mine.md", true), "mine.md");
  assert.equal(graphCenterForRequest("personal:mine.md", false), "personal:mine.md");
});

test("whole graph query has no center", () => {
  const params = graphRequestParams({
    scope: "full",
    center: "card.md",
    depth: 4,
  });
  assert.equal(params.center, undefined);
  assert.equal(params.limit, "50");
});

test("back-to-graph focus uses the personal git path on the personal layer", () => {
  assert.equal(graphNodePath("personal:notes/mine.md", true), "notes/mine.md");
  assert.equal(graphNodePath("personal:notes/mine.md", false), "personal:notes/mine.md");
  assert.equal(graphNodePath("card.md", false), "card.md");
});
