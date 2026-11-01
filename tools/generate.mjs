import fs from "node:fs/promises";
import { at, readJSON } from "./lib.mjs";
import { assertSnapshot } from "../src/core.mjs";
export async function generate() {
  const s = assertSnapshot(await readJSON("data/snapshot.json"));
  const dir = at(".build/generated/panorama");
  await fs.mkdir(dir + "/scripts", { recursive: true });
  await fs.mkdir(dir + "/styles", { recursive: true });
  await fs.writeFile(
    dir + "/scripts/shopmark_data.js",
    "$.ShopmarkData = " +
      JSON.stringify({
        heroes: s.heroes.map((h) => ({ id: h.id, name: h.name, className: h.className })),
        patch: s.patch,
        catalog: s.builds,
        shopItemIds: s.items.filter((i) => i.tier >= 1 && i.tier <= 4).map((i) => i.id),
        items: s.items.map(({ id, name, class_name, cost, effect, roles, components, aliases, image }) => ({
          id,
          name,
          className: class_name,
          cost,
          effect,
          roles,
          components,
          aliases,
          icon: image && /\/images\/items\/.+\.(webp|png)$/.test(image)
            ? 's2r://panorama/images/items/' + image.split('/images/items/')[1].replace(/\.(webp|png)$/, '_psd.vtex') : null,
        })),

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
  await fs.writeFile(
    dir + "/styles/shopmark_marks.css",
    "/* 0.2 resolves item names at runtime; no assumption about native CSS item classes. */\n",
  );
  const names = {};
  const ids = {};
  for (const item of s.items) {
    const m = s.marks[item.id];
    for (const name of [item.name, ...(item.aliases ?? [])]) {
      names[name.trim().toLowerCase()] = m?.status ?? "unknown";
      ids[name.trim().toLowerCase()] = item.id;
    }
  }
  await fs.writeFile(
    dir + "/scripts/shopmark_marks_data.js",
    "$.ShopmarkMarks = " + JSON.stringify(names) + ";\n$.ShopmarkItemIds = " + JSON.stringify(ids) + ";",
  );
  console.log(
    `Generated ${s.items.length} name mappings and ${s.builds.length} catalog builds.`,
  );
}
if (process.argv[1]?.endsWith("generate.mjs")) await generate();
