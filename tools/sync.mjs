import fs from "node:fs/promises";
import { at, cachedJSON, mapLimit, readJSON, writeJSON } from "./lib.mjs";
import {
  assertSnapshot,
  normalizeBuild,
  patchMarks,
  itemSection,
  plainText,
  shortlist,
} from "../src/core.mjs";
const API = "https://api.deadlock-api.com";
const refresh = process.argv.includes("--refresh");
const get = (route) => cachedJSON(API + route, { refresh });
const authors = await readJSON("data/authors.json");
const [allHeroes, allItems, patches] = await Promise.all([
  get("/v1/assets/heroes?language=english"),
  get("/v1/assets/items?language=english"),
  get("/v2/patches"),
]);
if (![allHeroes, allItems, patches].every(Array.isArray))
  throw Error("Unexpected provider response; previous snapshot preserved.");
if (!patches.length)
  throw Error("Empty patch feed; previous snapshot preserved.");
const heroes = allHeroes
  .filter((h) => h.player_selectable && !h.disabled)
  .map((h) => ({
    id: h.id,
    className: h.class_name,
    name: h.name,
    image: h.images?.icon_hero_card_webp ?? h.images?.icon_hero_card ?? "",
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
const items = allItems
  .filter((i) => i.type === "upgrade" && i.shopable && !i.disabled)
  .map((i) => ({
    id: i.id,
    class_name: i.class_name,
    name: i.name,
    cost: i.cost,
    tier: i.item_tier,
    slot: i.item_slot_type,
    image: i.shop_image_webp ?? i.shop_image_small_webp ?? i.image_webp ?? i.image ?? "",
  }));
console.log(
  `Catalog: ${heroes.length} heroes, ${items.length} items. Fetching ${authors.length} roster authors…`,
);
let failures = [];
const proLists = await mapLimit(authors, async (author, i) => {
  try {
    // Search is read-only and does not trigger a live Game Coordinator crawl.
    const list = await get(
      `/v1/builds?author_id=${author.accountId}&only_latest=true&sort_by=updated_at&sort_direction=desc&limit=100`,
    );
    if (!Array.isArray(list)) throw Error("Expected build array");
    if (i % 10 === 0) console.log(`Authors: ${i + 1}/${authors.length}`);
    return list.filter(
      (b) => b.hero_build?.author_account_id === author.accountId,
    );
  } catch (e) {
    failures.push({ author: author.name, error: e.message });
    return [];
  }
});
let raw = proLists.flat();
const normalized = () =>
  raw.map((b) => normalizeBuild(b, authors)).filter(Boolean);
// Keep honest community alternatives for heroes without several recent roster builds.
const lacking = heroes.filter(
  (h) =>
    new Set(
      normalized()
        .filter((b) => b.heroId === h.id && !b.stale)
        .map((b) => b.authorId),
    ).size < 3,
);
console.log(`Fetching community alternatives for ${lacking.length} heroes…`);
const community = await mapLimit(lacking, async (hero) => {
  try {
    const since = Math.floor(Date.now() / 1000) - 30 * 86400;
    const list = await get(
      `/v1/builds?hero_id=${hero.id}&only_latest=true&sort_by=weekly_favorites&sort_direction=desc&min_unix_timestamp=${since}&limit=20`,
    );
    if (!Array.isArray(list)) throw Error("Expected build array");
    return list.filter((b) => b.hero_build?.hero_id === hero.id);
  } catch (e) {
    failures.push({ hero: hero.name, error: e.message });
    return [];
  }
});
raw.push(...community.flat());
const builds = [...new Map(normalized().map((b) => [b.id, b])).values()];
// An unstructured newer update must invalidate the old review, not silently
// carry forward '=' marks from an older patch.
const patch = [...patches].sort(
  (a, b) => Date.parse(b.pub_date) - Date.parse(a.pub_date),
)[0];
const reviews = await readJSON("data/patch-reviews.json");
const review = reviews.find((r) => r.source === patch?.link);
const { trusted, marks } = patchMarks(items, patch, review);
const statsSince = Math.floor(
  Date.parse(
    patch?.pub_date ?? new Date(Date.now() - 7 * 86400000).toISOString(),
  ) / 1000,
);
console.log(
  "Fetching build performance since the latest item patch (ranked, badge >= 106, 20+ matches)…",
);
const statistics = await mapLimit(
  heroes,
  async (hero, i) => {
    try {
      const rows = await get(
        `/v1/analytics/hero-build-stats/${hero.id}?min_unix_timestamp=${statsSince}&min_average_badge=106&min_matches=20&match_mode=ranked&bucket=no_bucket`,
      );
      if (!Array.isArray(rows)) throw Error("Expected stats array");
      if (i % 10 === 0) console.log(`Stats: ${i + 1}/${heroes.length}`);
      return rows
        .filter(
          (r) =>
            r.hero_id === hero.id &&
            Number.isSafeInteger(r.wins) &&
            Number.isSafeInteger(r.matches) &&
            r.matches >= 20 &&
            r.wins <= r.matches,
        )
        .map((r) => [
          r.hero_build_id,
          {
            wins: r.wins,
            matches: r.matches,
            since: statsSince,
            minBadge: 106,
          },
        ]);
    } catch (e) {
      console.warn(`Stats unavailable for ${hero.name}: ${e.message}`);
      return [];
    }
  },
  1,
);
const statsMap = new Map(statistics.flat());
for (const b of builds) {
  b.stats = statsMap.get(b.id) ?? null;
  b.prePatch = b.updated < statsSince;
}
if (failures.length && !process.argv.includes("--allow-partial"))
  throw Error(
    "Some build requests failed. Previous snapshot preserved; retry sync. Use --allow-partial to accept incomplete coverage.",
  );
// A new, unreviewed balance patch disables the old '=' blanket automatically.
const snapshot = assertSnapshot({
  schema: 1,
  generatedAt: new Date().toISOString(),
  provider: API,
  heroes,
  items,
  builds: heroes.flatMap((h) => shortlist(builds, h.id, 12)),
  sourceBuildCount: builds.length,
  marks,
  patch: patch
    ? {
        title: patch.title,
        date: patch.pub_date,
        url: patch.link,
        reviewed: trusted,
      }
    : null,
  recentPatches: patches
    .slice(0, 8)
    .map((p) => ({
      title: p.title,
      date: p.pub_date,
      url: p.link,
      excerpt: plainText(p.content).slice(0, 500),
    })),
  failures,
});
if (!builds.length)
  throw Error("No builds loaded; previous snapshot preserved.");
await writeJSON(at("data/snapshot.json"), snapshot);
await writeJSON(
  at("data/coverage.json"),
  heroes.map((h) => {
    const own = builds.filter((b) => b.heroId === h.id);
    return {
      hero: h.name,
      recentProAuthors: new Set(
        own.filter((b) => b.pro && !b.stale).map((b) => b.authorId),
      ).size,
      recentCommunityAuthors: new Set(
        own.filter((b) => !b.pro && !b.stale).map((b) => b.authorId),
      ).size,
    };
  }),
);
console.log(
  `Saved ${builds.length} builds. Patch reviewed: ${trusted}. Partial fetch failures: ${failures.length}.`,
);
