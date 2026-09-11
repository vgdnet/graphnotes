import assert from "node:assert/strict";
import { test } from "node:test";

import { cardApiUrl, cardHash, cardSearchHash, canonicalCardHash, parseCardRoute, pathFromCardHash, isOwnPersonalCard, canShowCardEditButton, normalizeCardPath, qualifyCardPath, wikiCardHash, missingNotePath, missingNoteTitle } from "../test-out/cardRoute.js";
import { parseAppRoute, routeToView, viewHash, personCardHash } from "../test-out/appRoute.js";
import { renderBlocks } from "../test-out/markdownRender.js";

const UNICODE_PATH = "personal:вариант Б — конспекты/Паранойя (Б).md";
const emptyNote = { links: [], unresolved_links: [] };

test("empty #/card/ is legacy search; #/card is the start card", () => {
  assert.deepEqual(parseCardRoute("#/card/"), { kind: "search" });
  assert.deepEqual(parseCardRoute("#/card"), { kind: "none" });
  assert.equal(pathFromCardHash("#/card/"), null);
  assert.equal(cardSearchHash(), "#/search");
  assert.deepEqual(parseAppRoute("#/card"), { kind: "start_card" });
  assert.deepEqual(parseAppRoute("#/search"), { kind: "search" });
  assert.equal(routeToView(parseAppRoute("#/offer")), "offer");
  assert.equal(routeToView(parseAppRoute("#/queue")), "queue");
  assert.equal(routeToView(parseAppRoute("#/user")), "settings");
  assert.equal(routeToView(parseAppRoute("#/my_graph")), "my_graph");
  assert.equal(routeToView(parseAppRoute("#/contribution")), "contribution");
  assert.deepEqual(parseAppRoute("#/users/efimov"), {
    kind: "person",
    login: "efimov",
  });
  assert.deepEqual(parseAppRoute("#/users/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), {
    kind: "person",
    login: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  });
  assert.equal(routeToView(parseAppRoute("#/users/efimov")), "person");
  assert.equal(parseAppRoute("#/user").kind, "user");
  assert.equal(personCardHash("efimov"), "#/users/efimov");
  assert.equal(personCardHash("@Efimov"), "#/users/efimov");
  assert.equal(viewHash("graph"), "#/graph");
  assert.equal(canonicalCardHash("personal:notes/mine.md"), cardHash("notes/mine.md"));
  assert.match(canonicalCardHash("proposal:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:card.md"), /proposal/);
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

test("wikilinks on a personal card keep the personal layer (same path can exist in shared)", () => {
  assert.equal(qualifyCardPath("personal:Индекс.md", "часы терапии.md"), "personal:часы терапии.md");
  assert.equal(qualifyCardPath("personal:Индекс.md", "часы терапии"), "personal:часы терапии");
  assert.equal(
    wikiCardHash("personal:Индекс.md", "часы терапии.md"),
    cardHash("personal:часы терапии.md"),
  );
  assert.equal(qualifyCardPath("Индекс.md", "часы терапии.md"), "часы терапии.md");
  assert.equal(
    qualifyCardPath("personal:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:Индекс.md", "peer.md"),
    "personal:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:peer.md",
  );
  assert.equal(qualifyCardPath("personal:Индекс.md", "personal:already.md"), "personal:already.md");
  const html = renderBlocks("See [[часы терапии]]", { links: ["часы терапии.md"], unresolved_links: [] }, [], (path) =>
    wikiCardHash("personal:Индекс.md", path),
  );
  assert.match(html, /personal%3A/);
  assert.match(html, /%D1%87%D0%B0%D1%81%D1%8B/);
});

test("missing wikilink becomes a card hash and unresolved graph path is a file", () => {
  assert.equal(missingNotePath("Ризома"), "Ризома.md");
  assert.equal(missingNotePath("unresolved:Ризома"), "Ризома.md");
  assert.equal(missingNotePath("folder/note.md"), "folder/note.md");
  assert.equal(missingNoteTitle("unresolved:Ризома"), "Ризома");
  const html = renderBlocks(
    "See [[missing]]",
    { links: [], unresolved_links: ["missing"] },
    [],
    cardHash,
  );
  assert.match(html, /wiki-link--missing/);
  assert.match(html, /#\/card\//);
  assert.match(html, /data-missing-path="missing.md"/);
  assert.doesNotMatch(html, /нет заметки ·/);
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
