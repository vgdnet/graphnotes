import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAdminRights, formatGrant, visibleGrants } from "../test-out/adminRights.js";

test("admin rights line names role, author, lock and grants", () => {
  const text = formatAdminRights({
    role: "editor",
    is_author: true,
    is_active: true,
    editor_tags: ["src"],
    grants: [
      { kind: "path", value: "card.md" },
      { kind: "tag", value: "src" },
      { kind: "prefix", value: "психология/" },
    ],
  });
  assert.match(text, /роль editor/);
  assert.match(text, /автор/);
  assert.match(text, /активен/);
  assert.match(text, /карточка card\.md/);
  assert.match(text, /тег src/);
  assert.match(text, /папка психология\//);
});

test("admin rights fall back to editor tags and say when grants are empty", () => {
  assert.deepEqual(
    visibleGrants({ role: "editor", is_author: false, is_active: true, editor_tags: ["clinic"] }),
    [{ kind: "tag", value: "clinic" }],
  );
  assert.equal(formatGrant({ kind: "tag", value: "clinic" }), "тег clinic");
  const empty = formatAdminRights({
    role: "user",
    is_author: false,
    is_active: false,
  });
  assert.match(empty, /роль user/);
  assert.match(empty, /не автор/);
  assert.match(empty, /заблокирован/);
  assert.match(empty, /грантов нет/);
});
