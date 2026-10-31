import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  normalizeBuild,
  patchMarks,
  itemSection,
  shortlist,
  wilson,
  assertSnapshot,
} from "../src/core.mjs";
import { crc32, packVpk, readVpk } from "../tools/vpk.mjs";
const item = { id: 1, class_name: "upgrade_test", name: "Test" };
const patch = {
  link: "https://example.com/patch",
  content:
    "<b>Items:</b><br>- Test: Cooldown increased from 5s to 7s<br><b>Heroes:</b><br>- Someone: Changed",
};
test("unreviewed and modified patch content never reports unchanged", () => {
  const review = {
    source: patch.link,
    complete: true,
    reviewedLines: itemSection(patch),
    items: { upgrade_test: { status: "nerf", reason: "Longer cooldown" } },
  };
  assert.equal(patchMarks([item], patch, review).marks[1].status, "nerf");
  assert.equal(patchMarks([item], patch, null).marks[1].status, "unknown");
  assert.equal(
    patchMarks(
      [item],
      { ...patch, content: patch.content + "<br>- another change" },
      review,
    ).trusted,
    true,
  ); // Outside the reviewed item section.
  assert.equal(
    patchMarks(
      [item],
      { ...patch, content: patch.content.replace("5s", "4s") },
      review,
    ).marks[1].status,
    "unknown",
  );
  assert.equal(
    patchMarks([item], { ...patch, link: "other" }, review).marks[1].status,
    "unknown",
  );
});
test("unknown item names in a supposedly complete review disable equals blanket", () => {
  const changed = {
    ...patch,
    content: patch.content.replace("Test:", "Renamed:"),
  };
  const review = {
    source: patch.link,
    complete: true,
    reviewedLines: itemSection(changed),
    items: {},
  };
  assert.equal(patchMarks([item], changed, review).trusted, false);
});
test("untouched and reviewed mixed items have distinct statuses", () => {
  const review = {
    source: patch.link,
    complete: true,
    reviewedLines: itemSection(patch),
    items: { upgrade_test: { status: "mixed" } },
  };
  const result = patchMarks(
    [item, { id: 2, name: "Other", class_name: "upgrade_other" }],
    patch,
    review,
  );
  assert.equal(result.marks[1].status, "mixed");
  assert.equal(result.marks[2].status, "unchanged");
});
test("a copied pro name does not verify the author", () => {
  const raw = {
    hero_build: {
      hero_id: 1,
      hero_build_id: 10,
      author_account_id: 99,
      name: "Famous Pro build",
      details: {
        mod_categories: [{ name: "early", mods: [{ ability_id: 1 }] }],
      },
    },
  };
  assert.equal(
    normalizeBuild(raw, [{ accountId: 98, name: "Famous Pro" }]).pro,
    false,
  );
  assert.equal(
    normalizeBuild(raw, [{ accountId: 99, name: "Famous Pro" }]).pro,
    true,
  );
});
test("shortlist diversifies authors and keeps fresh pro builds ahead of stale copies", () => {
  const b = { heroId: 1, authorId: 1, pro: true, stale: false, updated: 100 };
  const list = shortlist(
    [
      { ...b, id: 1 },
      { ...b, id: 2, updated: 101 },
      { ...b, id: 3, authorId: 2, stale: true },
      { ...b, id: 4, authorId: 3, heroId: 2 },
      { ...b, id: 5, authorId: 4 },
    ],
    1,
  );
  assert.deepEqual(
    list.map((b) => b.id),
    [2, 5, 3],
  );
});
test("confidence scoring penalizes tiny win-rate samples", () => {
  assert(wilson(60, 100) > wilson(7, 10));
  assert.equal(wilson(0, 0), 0);
  assert.equal(wilson(5, 4), 0);
});
test("VPK roundtrip verifies CRC and detects payload corruption", async () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const data = Buffer.from("resource payload");
  const key = "panorama/scripts/test.vjs_c";
  const artifact = packVpk(new Map([[key, data]]));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "shopmark-test-"));
  const file = path.join(dir, "test.vpk");
  try {
    await fs.writeFile(file, artifact);
    assert.deepEqual(await (await readVpk(file)).read(key), data);
    artifact[artifact.length - 1] ^= 1;
    await fs.writeFile(file, artifact);
    await assert.rejects((await readVpk(file)).read(key), /CRC/);
  } finally {
    await fs.unlink(file);
    await fs.rmdir(dir);
  }
});
test("package rejects unrelated files and snapshot rejects duplicate IDs", () => {
  assert.throws(
    () => packVpk(new Map([["gameinfo.gi", Buffer.from("bad")]])),
    /Unexpected/,
  );
  assert.throws(
    () =>
      assertSnapshot({
        schema: 1,
        heroes: [{ id: 1 }, { id: 1 }],
        items: [{ id: 2 }],
        builds: [],
      }),
    /duplicate/,
  );
});
