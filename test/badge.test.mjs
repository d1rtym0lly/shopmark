import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
test("badges resolve names without native item classes and update recycled cards", () => {
  const classes = new Set();
  let name = "Toxic Bullets",
    tick;
  const root = {
    IsValid: () => true,
    FindChildrenWithClassTraverse: () => [
      {
        get text() {
          return name;
        },
      },
    ],
    BHasClass: (c) => classes.has(c),
    AddClass: (c) => classes.add(c),
    SetHasClass: (c, v) => (v ? classes.add(c) : classes.delete(c)),
  };
  const $ = {
    GetContextPanel: () => root,
    ShopmarkMarks: { "toxic bullets": "buff", "духовная защита": "nerf" },
    Schedule: (_, fn) => {
      tick = fn;
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      new URL("../src/panorama/shopmark_badge.js", import.meta.url),
      "utf8",
    ),
    { $ },
  );
  tick();
  assert(classes.has("sm-mark-buff"));
  name = "Духовная защита";
  tick();
  assert(classes.has("sm-mark-nerf"));
  assert(!classes.has("sm-mark-buff"));
  name = "Unknown future item";
  tick();
  assert(!classes.has("sm-mark-nerf"));
  assert(classes.has("ShopmarkResolved"));
});
