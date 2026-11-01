import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/coach.js";
const coach = globalThis.ShopmarkCoach;
const data = {
  items: [
    { id: 1, name: "Core", cost: 800 },
    { id: 2, name: "Healbane", cost: 1600 },
    { id: 3, name: "Optional", cost: 3200 },
  ],
  builds: [
    { id: 1, heroId: 1, name: "A", author: "Top", pro: true, updated: 1 },
    { id: 2, heroId: 1, name: "B", author: "Other", updated: 2 },
    { id: 3, heroId: 2, name: "C", author: "Other", updated: 2 },
  ],
  meta: { 1: { 0: [{ id: 2, stats: { wins: 30, matches: 50 } }] } },
};
const build = {
  categories: [
    { items: [{ id: 1 }, { id: 2 }] },
    { optional: true, items: [{ id: 3 }] },
  ],
};
test("catalog is not capped at three, isolates heroes and preserves rank evidence", () => {
  const many={...data,builds:Array.from({length:40},(_,id)=>({id:id+10,heroId:1,name:'Build '+id,author:'Author '+id,updated:id}))};
  assert.equal(coach.catalog(many,1,0,'all','').length,40);
  assert.equal(coach.catalog(data, 1, 0, "all", "").length, 2);
  assert.equal(coach.catalog(data, 1, 0, "pro", "")[0].id, 1);
  assert.equal(coach.catalog(data, 1, 1, "all", "")[0].stats, null);
  assert.equal(coach.catalog(data, 1, 0, "all", "")[0].id, 2);
});
test("owned items are excluded; optional items do not become mandatory", () => {
  const p = coach.plan(data, build, { purchased: [1], threats: [] });
  assert.deepEqual(
    p.recommendations.map((i) => i.id),
    [2],
  );
  assert.equal(p.optional[0].id, 3);
});
test("confirmed healing threat changes priority with explanation and tradeoff", () => {
  const p = coach.plan(data, build, {
    threats: ["heal"],
    advantage: "behind",
    budget: 2000,
  });
  assert.equal(p.recommendations[0].id, 2);
  assert.match(p.recommendations[0].when, /духовный/);
  assert.match(p.recommendations[0].tradeoff, /Core/);
  assert(p.warnings.length);
});
test("unaffordable counters do not displace affordable core blindly", () => {
  const p = coach.plan(data, build, { threats: ["heal"], budget: 800 });
  assert.equal(p.recommendations[0].id, 1);
  assert.equal(p.recommendations[1].affordable, false);
});
test("enemy name alone does not force a counter or claim automatic match state", () => {
  const p = coach.plan(data, build, { enemies: ["Abrams"] });
  assert.equal(p.recommendations[0].id, 1);
  assert.equal(p.mode, "manual");
  assert(p.watch.length);
});
