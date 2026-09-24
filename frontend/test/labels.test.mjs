import assert from "node:assert/strict";
import { test } from "node:test";

import {
  contributionIsEmpty,
  graphIndexStatusLabel,
  roleLabel,
  ruNotes,
} from "../test-out/labels.js";

test("role labels are Russian", () => {
  assert.equal(roleLabel("user"), "участник");
  assert.equal(roleLabel("editor"), "редактор");
  assert.equal(roleLabel("admin"), "администратор");
});

test("note pluralization", () => {
  assert.equal(ruNotes(1), "1 заметка");
  assert.equal(ruNotes(2), "2 заметки");
  assert.equal(ruNotes(5), "5 заметок");
  assert.equal(ruNotes(22), "22 заметки");
});

test("contribution empty looks at accepted stats too", () => {
  assert.equal(contributionIsEmpty({ notes: [], stats: { accepted: 2 } }), false);
  assert.equal(contributionIsEmpty({ notes: [], stats: { accepted: 0, notes: 0 } }), true);
});

test("index error status is not technical jargon", () => {
  assert.match(graphIndexStatusLabel("error"), /не обновилась/);
  assert.equal(graphIndexStatusLabel("current"), "актуален");
});
