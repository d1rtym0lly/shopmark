import fs from "node:fs/promises";
import { at, readJSON } from "./lib.mjs";
import { assertSnapshot, shortlist } from "../src/core.mjs";
export async function generate() {
  const s = assertSnapshot(await readJSON("data/snapshot.json"));
  const shortlists = Object.fromEntries(
    s.heroes.map((h) => [
      h.id,
      shortlist(s.builds, h.id, 4).map((b) => ({
        ...b,
        categories: undefined,
        description: undefined,
      })),
    ]),
  );
  const proShortlists = Object.fromEntries(
    s.heroes.map((h) => [
      h.id,
      shortlist(
        s.builds.filter((b) => b.pro),
        h.id,
        4,
      ).map((b) => ({ ...b, categories: undefined, description: undefined })),
    ]),
  );
  const dir = at(".build/generated/panorama");
  await fs.mkdir(dir + "/scripts", { recursive: true });
  await fs.mkdir(dir + "/styles", { recursive: true });
  await fs.writeFile(
    dir + "/scripts/shopmark_data.js",
    "$.ShopmarkData = " +
      JSON.stringify({
        heroes: s.heroes.map((h) => ({ id: h.id, name: h.name })),
        patch: s.patch,

        meta: Object.fromEntries(
          Object.entries(s.meta ?? {}).map(([hero, ranks]) => [
            hero,
            Object.fromEntries(
              Object.entries(ranks).map(([rank, builds]) => [
                rank,
                builds.map(({ categories, description, ...b }) => b),
              ]),
            ),
          ]),
        ),
        ranks: s.ranks ?? [],
        recentPatches: s.recentPatches,
        changes: s.items
          .filter(
            (i) =>
              !["unchanged", "unknown"].includes(
                s.marks[i.id]?.status ?? "unknown",
              ),
          )
          .map((i) => ({ name: i.name, ...s.marks[i.id] })),
      })
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029") +
      ";\n",
  );
  const title = (status) => status[0].toUpperCase() + status.slice(1);
  const rules = s.items.map((item) => {
    if (!/^[a-z0-9_]+$/.test(item.class_name)) throw Error("Unsafe item class");
    const mark = s.marks[item.id]?.status ?? "unknown";
    return `.${item.class_name} .ShopmarkUnknown { visibility: collapse; }\n.${item.class_name} .Shopmark${title(mark)} { visibility: visible; }`;
  });
  await fs.writeFile(
    dir + "/styles/shopmark_marks.css",
    "/* 0.2 resolves item names at runtime; no assumption about native CSS item classes. */\n",
  );
  const names = {};
  for (const item of s.items) {
    const m = s.marks[item.id];
    for (const name of [item.name, ...(item.aliases ?? [])])
      names[name.trim().toLowerCase()] = m?.status ?? "unknown";
  }
  await fs.writeFile(
    dir + "/scripts/shopmark_marks_data.js",
    "$.ShopmarkMarks = " + JSON.stringify(names) + ";",
  );
  console.log(
    `Generated ${s.items.length} static item rules; ${Object.values(shortlists).flat().length} build cards.`,
  );
}
if (process.argv[1]?.endsWith("generate.mjs")) await generate();
