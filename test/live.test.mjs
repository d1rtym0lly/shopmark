import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/coach.js';
import '../src/live.js';
const live = globalThis.ShopmarkLive;
const data = { heroes:[{id:1,name:'Infernus'}, {id:2,name:'Haze'}], items:[
  {id:10,name:'Opening',cost:800}, {id:11,name:'Core',cost:3200,components:[10]},
  {id:12,name:'Metal Skin',cost:3200}, {id:13,name:'Health',cost:800,roles:['health']}
], builds:[{id:1,heroId:1,name:'Build',categories:[{items:[{id:10},{id:11},{id:13}]}]}] };
function raw(extra={}) { return {capturedAt:1000,playing:true,heroId:1,inventoryKnown:true,purchased:[],budget:800,
  seconds:180,ownSouls:4000,friendlySouls:20000,enemySouls:20000,allies:[{hero:'Infernus',sameLane:true,souls:4000}],enemies:[],...extra}; }
function engine() { return live.create(globalThis.ShopmarkCoach); }
test('native localized economy and timer parsing preserves unknown values', () => {
  assert.equal(live.number('12,5k'),12500); assert.equal(live.number('1\u202f600'),1600);
  assert.equal(live.number('<b>0</b>'),0); assert.equal(live.number('--'),null);
  assert.equal(live.number(''),null); assert.equal(live.clock('12:30'),750); assert.equal(live.clock('12:90'),null);
});
test('automatic is opt-in and stops on missing, stale, future or spectator snapshots', () => {
  const e=engine();
  assert.equal(e.evaluate(data,raw(),{},1000).status,'off');
  for(const r of [raw({inventoryKnown:false}),raw({heroId:null}),raw({playing:false}),raw({spectating:true}),raw({capturedAt:1001}),raw({capturedAt:-4000})]) {
    assert.equal(e.evaluate(data,r,{enabled:true},1000).status,'waiting');
  }
});
test('real purchases, consumed components, sales and upgrade cost change the next step', () => {
  const e=engine(), on={enabled:true};
  assert.equal(e.evaluate(data,raw(),on,1000).recommendations[0].id,10);
  const bought=e.evaluate(data,raw({purchased:[10],budget:2400}),on,1000);
  assert.equal(bought.recommendations[0].id,11); assert.equal(bought.recommendations[0].cost,2400);
  const upgraded=e.evaluate(data,raw({purchased:[11]}),on,1000);
  assert.deepEqual(upgraded.recommendations.map(x=>x.id),[13]);
  assert.equal(e.evaluate(data,raw({purchased:[]}),on,1000).recommendations[0].id,10);
});
test('visible dangerous enemy changes priority with explicit matchup evidence', () => {
  const e=engine();
  const r=e.evaluate(data,raw({purchased:[10],budget:4000,enemies:[{hero:'Haze',souls:5500,sameLane:true}]}),{enabled:true},1000);
  assert.equal(r.recommendations[0].id,13);
  assert.match(r.recommendations.find(x=>x.id===12).why,/Haze/);
  assert.equal(r.lane,'behind'); assert.equal(r.mode,'automatic');
  const early=e.evaluate(data,raw({ownSouls:800,enemies:[{hero:'Haze',souls:900,sameLane:true}]}),{enabled:true},1000);
  assert.equal(early.recommendations[0].id,10);
});
test('unobserved lane stays unknown and lane estimate resets on a new match', () => {
  const e=engine(), on={enabled:true};
  assert.equal(e.evaluate(data,raw(),on,1000).lane,'unknown');
  e.evaluate(data,raw({seconds:300,enemies:[{hero:'Haze',souls:7000,sameLane:true}]}),on,1000);
  assert.equal(e.evaluate(data,raw({seconds:900}),on,1000).lane,'behind');
  assert.equal(e.evaluate(data,raw({seconds:20}),on,1000).lane,'unknown');
});
test('a selected build for another hero never leaks into the live hero', () => {
  const d={...data,builds:data.builds.concat({id:2,heroId:2,name:'Other',categories:[]})};
  assert.equal(engine().evaluate(d,raw(),{enabled:true,buildId:2},1000).build.id,1);
});
