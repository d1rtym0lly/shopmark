import { at, cachedJSON, mapLimit, readJSON, writeJSON } from './lib.mjs';

const snapshot = await readJSON('data/snapshot.json');
const start = Math.floor(Date.parse(snapshot.patch.date) / 1000);
const minBadge = 91; // Phantom I and above, by both teams' average badge.
const itemIds = new Set(snapshot.items.map(item => item.id));
const profiles = await mapLimit(snapshot.heroes, async hero => {
  const url = 'https://api.deadlock-api.com/v1/analytics/item-flow-stats?' +
    new URLSearchParams({hero_ids:hero.id, min_average_badge:minBadge, min_matches:30,
      min_unix_timestamp:start, game_mode:'normal', match_mode:'ranked'});
  const flow = await cachedJSON(url);
  if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges) ||
      flow.reached_per_column?.length !== 4 || !Number.isSafeInteger(flow.baseline?.matches))
    throw Error('Invalid purchase flow for ' + hero.name);
  const items = {}, following = {}, counts = {};
  for (const n of flow.nodes) {
    const total = flow.reached_per_column[n.column];
    if (!itemIds.has(n.item_id) || !Number.isFinite(total) || !total ||
        !Number.isFinite(n.avg_net_worth_at_buy) || n.matches < 30) continue;
    const baseline = flow.reached_wins_per_column?.[n.column] / total;
    const delta = Number.isFinite(n.adjusted_win_rate) && Number.isFinite(baseline)
      ? Math.round(1000 * (n.adjusted_win_rate - baseline) * n.matches / (n.matches + 150)) : 0;
    (items[n.item_id] ??= [null,null,null,null])[n.column] = [
      Math.min(1000, Math.round(1000 * n.matches / total)), Math.round(n.avg_net_worth_at_buy), delta,
    ];
    counts[n.column + ':' + n.item_id] = n.matches;
  }
  for (const e of flow.edges) {
    const source = counts[e.from_column + ':' + e.from_item_id];
    const target = items[e.to_item_id]?.[e.from_column + 1];
    if (!source || !target || e.matches < 50) continue;
    const lift = e.matches / source - target[0] / 1000;
    if (lift < 0.04) continue;
    const from = following[e.from_item_id] ??= {};
    from[e.to_item_id] = Math.max(from[e.to_item_id] ?? 0, Math.min(300, Math.round(1000 * lift)));
  }
  console.log(hero.name, flow.baseline.matches, Object.keys(items).length);
  return [hero.id, {matches:flow.baseline.matches, items, following}];
}, 2);

await writeJSON(at('data/purchase-flow.json'), {
  source:'https://api.deadlock-api.com/docs#tag/Analytics/GET/v1/analytics/item-flow-stats',
  patchDate:snapshot.patch.date, minBadge, fetchedAt:new Date().toISOString(),
  heroes:Object.fromEntries(profiles),
});
