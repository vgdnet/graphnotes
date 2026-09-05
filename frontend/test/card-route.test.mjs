import assert from "node:assert/strict";
import { test } from "node:test";

import { cardApiUrl, cardHash, cardSearchHash, parseCardRoute, pathFromCardHash } from "../test-out/cardRoute.js";
import { renderBlocks } from "../test-out/markdownRender.js";

const UNICODE_PATH = "personal:вариант Б — конспекты/Паранойя (Б).md";
const emptyNote = { links: [], unresolved_links: [] };

test("empty #/card/ is the rhizome search hub, not a card path", () => {
  assert.deepEqual(parseCardRoute("#/card/"), { kind: "search" });
  assert.deepEqual(parseCardRoute("#/card"), { kind: "search" });
  assert.equal(pathFromCardHash("#/card/"), null);
  assert.equal(cardSearchHash(), "#/card/");
});

test("card hash round-trips encoded personal unicode paths with slash", () => {
  const hash = cardHash(UNICODE_PATH);
  assert.equal(hash.startsWith("#/card/"), true);
  assert.equal(hash.includes("%3A"), true);
  assert.equal(hash.includes("%2F"), true);
  assert.equal(pathFromCardHash(hash), UNICODE_PATH);
  assert.equal(
    pathFromCardHash(
      "#/card/personal%3A%D0%B2%D0%B0%D1%80%D0%B8%D0%B0%D0%BD%D1%82%20%D0%91%20%E2%80%94%20%D0%BA%D0%BE%D0%BD%D1%81%D0%BF%D0%B5%D0%BA%D1%82%D1%8B%2F%D0%9F%D0%B0%D1%80%D0%B0%D0%BD%D0%BE%D0%B9%D1%8F%20(%D0%91).md",
    ),
    UNICODE_PATH,
  );
  assert.equal(pathFromCardHash(`#/card/${UNICODE_PATH}`), UNICODE_PATH);
});

test("card API URL keeps slash so nested paths reach FastAPI", () => {
  const url = cardApiUrl(UNICODE_PATH);
  assert.equal(url.startsWith("/api/cards/personal:"), true);
  assert.equal(url.includes("/Паранойя") || url.includes("/%D0%9F%D0%B0%D1%80%D0%B0%D0%BD%D0%BE%D0%B9%D1%8F"), true);
  assert.equal(url.includes("%2F"), false);
});

test("hashtags and hash-only lines do not hang the markdown renderer", () => {
  const html = renderBlocks(
    "# Паранойя (Б)\n\n#inline-tag\n#tag with stuff\n####\nplain\n",
    emptyNote,
    [],
    cardHash,
  );
  assert.match(html, /<h1>/);
  assert.match(html, /#inline-tag/);
  assert.match(html, /plain/);
});
