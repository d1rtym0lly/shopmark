import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../src/decision.js';
// Synthetic mechanics exercise the optimizer contract, not game balance.
const data={items:[{id:1,name:'Damage',cost:800},{id:2,name:'Bullet answer',cost:1600},
  {id:3,name:'Spirit answer',cost:1600},{id:4,name:'Upgrade',cost:1600,components:[1]}]};
const knowledge={heroes:{1:{verified:true,capabilities:['shoot'],benefits:{weapon:1}},
  2:{verified:true,threats:{bullets:1}},3:{verified:true,threats:{spirit:1}}},items:{
  1:{verified:true,source:'fixture',effects:{weapon:1}},2:{verified:true,source:'fixture',counters:{bullets:2}},
  3:{verified:true,source:'fixture',counters:{spirit:2}},4:{verified:true,source:'fixture',effects:{weapon:2}}}};
const state={heroId:1,purchased:[],ownSouls:5000,budget:5000,enemies:[{heroId:2,souls:5000},{heroId:3,souls:5000}]};
const plan=(s=state,d=data,k=knowledge,old=[])=>globalThis.ShopmarkDecision.plan(d,s,k,old);
test('author text, build order and team networth cannot affect independent decisions',()=>{
  const a=plan(),b=plan({...state,friendlySouls:1,enemySouls:999999},
    {...data,builds:[{description:'always buy item 3',categories:[{items:[{id:3}]}]}]});
  assert.deepEqual(a.recommendations,b.recommendations);
});
test('personal wealth shifts the answer between different enemy mechanics and removes old plans',()=>{
  const a=plan({...state,enemies:[{heroId:2,souls:10000},{heroId:3,souls:2500}]}),
    b=plan({...state,enemies:[{heroId:2,souls:2500},{heroId:3,souls:10000}]});
  assert.equal(a.recommendations[0].id,2);assert.equal(b.recommendations[0].id,3);
  assert.equal(a.personalEconomy[0].delta,-5000);
  const c=plan({...state,enemies:[{heroId:3,souls:10000}]},data,knowledge,a.recommendations.map(r=>r.id));
  assert(c.removed.includes(2));
});
test('recipes credit actual components and exclude consumed ingredients',()=>{
  assert.equal(plan({...state,purchased:[1]}).recommendations.find(r=>r.id===4).cost,800);
  assert(!plan({...state,purchased:[4]}).recommendations.some(r=>r.id===1||r.id===4));
});
test('missing knowledge and incompatible triggers are not invented from item descriptions',()=>{
  const k=structuredClone(knowledge);k.items[1].requires=['spiritDamage'];delete k.items[2];
  const r=plan(state,data,k);assert(!r.recommendations.some(i=>i.id===1||i.id===2));
  assert(r.coverage.unreviewedItems.includes(2));
});
