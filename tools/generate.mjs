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
        shortlists,
        proShortlists,
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
    rules.join("\n") + "\n",
  );
  console.log(
    `Generated ${s.items.length} static item rules; ${Object.values(shortlists).flat().length} build cards.`,
  );
}
if (process.argv[1]?.endsWith("generate.mjs")) await generate();
