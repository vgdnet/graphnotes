import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const appSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/App.tsx"),
  "utf8",
);
const adminSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/AdminPanel.tsx"),
  "utf8",
);

test("settings cabinet has no personal-git connect UI", () => {
  assert.equal(
    appSrc.includes("Личный git не связан — можно загрузить .md в локальный склад."),
    false,
  );
  assert.equal(appSrc.includes("Свой git"), false);
  assert.equal(appSrc.includes("Связать личный git"), false);
  assert.equal(appSrc.includes("Отключить git"), false);
  assert.equal(appSrc.includes("/api/personal/connect"), false);
  assert.equal(appSrc.includes("/api/repository/connect"), false);
  assert.equal(appSrc.includes("Подключить общую ризому"), false);
  assert.equal(adminSrc.includes("Подключить общую ризому"), false);
  assert.equal(adminSrc.includes("/api/repository/connect"), false);
  assert.equal(appSrc.includes('settingsBlock === "git"'), false);
  assert.match(appSrc, /settingsBlock === "profile"/);
  assert.match(appSrc, /settingsBlock === "contract"/);
  assert.match(appSrc, /settingsBlock === "integrations"/);
  assert.match(appSrc, /settingsBlock === "invite"/);
});
