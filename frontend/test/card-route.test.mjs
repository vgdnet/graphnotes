import assert from "node:assert/strict";
import { test } from "node:test";

import { cardApiUrl, cardHash, cardSearchHash, parseCardRoute, pathFromCardHash, isOwnPersonalCard, canShowCardEditButton, normalizeCardPath } from "../test-out/cardRoute.js";
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

test("own personal card is the only in-app editable layer", () => {
  assert.equal(isOwnPersonalCard("personal:notes/mine.md"), true);
  assert.equal(isOwnPersonalCard("personal:tag_психиатрия.md"), true);
  assert.equal(isOwnPersonalCard("personal:Компульсия.md"), true);
  assert.equal(isOwnPersonalCard("personal:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:secret.md"), false);
  assert.equal(isOwnPersonalCard("card.md"), false);
  assert.equal(isOwnPersonalCard("proposal:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:card.md"), false);
});

test("any #/card/personal: hash stays own-personal after : is encoded as %3A", () => {
  const samples = ["personal:tag_психиатрия.md", "personal:Компульсия.md", "personal:notes/mine.md"];
  for (const path of samples) {
    const encoded = cardHash(path);
    assert.match(encoded, /personal%3A/);
    assert.equal(normalizeCardPath(encoded.slice("#/card/".length)), path);
    assert.deepEqual(parseCardRoute(encoded), { kind: "card", path });
    assert.equal(isOwnPersonalCard(pathFromCardHash(encoded)), true);
    assert.equal(canShowCardEditButton(pathFromCardHash(encoded), true), true);
    assert.equal(canShowCardEditButton(path, false), false);
  }
  assert.equal(isOwnPersonalCard("вариант А — карточки/Паранойя (А).md"), false);
  assert.equal(canShowCardEditButton("вариант А — карточки/Паранойя (А).md", true), false);
});

test("edit button only for own personal when the author contract is accepted", () => {
  assert.equal(canShowCardEditButton("personal:notes/mine.md", true), true);
  assert.equal(canShowCardEditButton("personal:notes/mine.md", false), false);
  assert.equal(canShowCardEditButton("card.md", true), false);
  assert.equal(canShowCardEditButton("personal:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:secret.md", true), false);
  assert.equal(canShowCardEditButton("proposal:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:card.md", true), false);
  assert.equal(canShowCardEditButton(null, true), false);
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
