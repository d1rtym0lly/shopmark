import { cachedJSON, readJSON, writeJSON, at, mapLimit } from "./lib.mjs";
import { normalizeBuild, wilson } from "../src/core.mjs";
const s = await readJSON("data/snapshot.json");
const api = "https://api.deadlock-api.com";
const get = (p) => cachedJSON(api + p);
const localized = await get("/v1/assets/items?language=russian");
for (const i of s.items)
  i.aliases = [localized.find((x) => x.id === i.id)?.name].filter(Boolean);
const ranks = await get("/v1/assets/ranks");
s.ranks = ranks
  .filter((r) => r.tier > 0)
  .map((r) => ({ id: r.tier, name: r.name }));
console.log("Ranks:", s.ranks);
s.meta = {};
let ids = new Map();
await mapLimit(
  s.heroes,
  async (h, index) => {
    const rows = await get(
      `/v1/analytics/hero-build-stats/${h.id}?bucket=avg_badge&min_matches=1&min_unix_timestamp=${Math.floor(Date.parse(s.patch.date) / 1000)}&match_mode=ranked`,
    );
    if (!Array.isArray(rows)) throw Error("Invalid rank statistics");
    const groups = {};
    for (const r of rows) {
      if (
        r.hero_id !== h.id ||
        !Number.isSafeInteger(r.wins) ||
        !Number.isSafeInteger(r.matches) ||
        r.wins > r.matches
      )
        continue;
      const rank = Math.floor(r.bucket / 10);
      if (rank < 1 || rank > 11) continue;
      for (const tier of [0, rank]) {
        groups[tier] ??= {};
        const g = (groups[tier][r.hero_build_id] ??= {
          id: r.hero_build_id,
          wins: 0,
          matches: 0,
        });
        g.wins += r.wins;
        g.matches += r.matches;
      }
    }
    s.meta[h.id] = {};
    for (const [rank, builds] of Object.entries(groups)) {
      s.meta[h.id][rank] = Object.values(builds)
        .filter((b) => b.matches >= 20)
        .sort(
          (a, b) =>
            wilson(b.wins, b.matches) - wilson(a.wins, a.matches) ||
            b.matches - a.matches,
        )
        .slice(0, 3);
      for (const b of s.meta[h.id][rank]) ids.set(b.id, h.id);
    }
    if (index % 10 === 0) console.log("Heroes:", index + 1);
  },
  1,
);
const known = new Map(s.builds.map((b) => [b.id, b]));
console.log("Loading", ids.size, "ranked builds");
await mapLimit(
  [...ids],
  async ([id, hero]) => {
    if (known.has(id)) return;
    const rows = await get(
      `/v1/builds?hero_id=${hero}&build_id=${id}&only_latest=true&limit=1`,
    );
    const b = normalizeBuild(rows?.[0], []);
    if (b && b.heroId === hero && b.id === id) known.set(id, b);
  },
  2,
);
for (const h of Object.values(s.meta))
  for (const rank of Object.keys(h))
    h[rank] = h[rank]
      .filter((b) => known.has(b.id))
      .map((b) => ({
        ...known.get(b.id),
        stats: { wins: b.wins, matches: b.matches },
        pro: false,
      }));
s.builds = [...known.values()];
s.metaUpdatedAt = new Date().toISOString();
await writeJSON(at("data/snapshot.json"), s);
console.log("Rank meta saved; no author filter.");
