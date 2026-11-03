import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import '../src/conditions.js';import '../src/decision.js';
import{compileConditionals}from'../tools/conditional-model.mjs';
const knowledge=JSON.parse(fs.readFileSync(new URL('../data/knowledge.json',import.meta.url)));
const data=JSON.parse(fs.readFileSync(new URL('../data/snapshot.json',import.meta.url)));
const item=name=>knowledge.items[data.items.find(i=>i.name===name).id];
test('all 170 nonzero conditional properties retain source, trigger and semantic classification',()=>{
 const terms=Object.values(knowledge.items).flatMap(i=>i.conditionalEffects||[]);
 assert.equal(terms.length,170);assert.equal(Object.values(knowledge.items).filter(i=>i.conditionalEffects.length).length,90);
 for(const t of terms){assert(t.source&&t.property&&t.trigger&&t.label);assert(Number.isFinite(t.value));
  assert(Object.keys(t.effects).length+Object.keys(t.counters).length+Object.keys(t.penalties).length+t.constraints.length>0);}
 assert(Object.values(knowledge.items).every(i=>!i.partial&&i.unmodelled.length===0));
});
test('low-health Frenzy bonuses switch with observed health, and missing health stays estimated',()=>{
 const t=item('Frenzy').conditionalEffects[0],hero=knowledge.heroes[1],c=globalThis.ShopmarkConditions;
 assert.equal(c.evaluate(t,{healthPercent:49},hero).state,'observed');
 assert.equal(c.evaluate(t,{healthPercent:51},hero).factor,0);
 const unknown=c.evaluate(t,{},hero);assert.equal(unknown.state,'estimated');assert(unknown.factor>0&&unknown.factor<1);
});
test('parry is not assumed successful, sacrifice requires explicit intent, and damage penalties stay penalties',()=>{
 const c=globalThis.ShopmarkConditions,h=knowledge.heroes[1],parry=item('Counterspell').conditionalEffects[0];
 assert.equal(c.evaluate(parry,{},h).state,'estimated');assert.equal(c.evaluate(parry,{observations:{parry:false}},h).factor,0);
 assert.equal(c.evaluate(item('Unstable Concoction').conditionalEffects[0],{},h).factor,0);
 const curse=item('Cursed Relic').conditionalEffects.find(t=>t.property==='OutgoingDamagePenaltyPercent');
 assert(curse.penalties.weapon>0&&curse.penalties.spirit>0);assert.equal(Object.keys(curse.effects).length,0);
 const cheat=item('Cheat Death').conditionalEffects.find(t=>t.property==='HealAmpReceivePenaltyPercent');
 assert(cheat.penalties.sustain>0);assert.equal(Object.keys(cheat.counters).length,0);
});
test('a new unclassified property stops import instead of silently clearing partial coverage',()=>{
 assert.throws(()=>compileConditionals({name:'Frenzy',class_name:'test',properties:{NewEffect:{value:5,usage_flags:['ConditionallyApplied'],provided_property_type:'NEW_UNKNOWN'}}},String,{}),/Unclassified/);
});
test('conditional damage and fire rate both count, while alternate fire and antiheal channels do not double count',()=>{
 const c=globalThis.ShopmarkConditions,h=knowledge.heroes[1];
 const vest=c.aggregate(item('Battle Vest'),{healthPercent:100},h);assert(Math.abs(vest.effects.weapon-(22/20+7/20))<1e-9);
 const express=c.aggregate(item('Express Shot'),{observations:{active:true}},h);assert.equal(express.effects.weapon,125/20);
 const heal=c.aggregate(item('Healbane'),{observations:{spirit_hit:true}},h);assert.equal(heal.counters.healing,35/25);
});
test('future upgrades consume projected components once and the planner does not mutate live inventory',()=>{
 const k={heroes:{1:{verified:true,benefits:{weapon:1},capabilities:[]}},items:{
  1:{verified:true,source:'fixture',effects:{weapon:1}},2:{verified:true,source:'fixture',effects:{weapon:1.6}}}};
 const d={items:[{id:1,name:'Component',cost:800},{id:2,name:'Upgrade',cost:1600,components:[1]}]};
 const state={heroId:1,purchased:[],budget:800,enemies:[]},before=structuredClone(state);
 const r=globalThis.ShopmarkDecision.plan(d,state,k,[]);assert.deepEqual(r.recommendations.map(i=>i.id),[1,2]);
 assert.equal(r.recommendations[1].cost,800);assert(r.recommendations[1].projected);assert.deepEqual(state,before);
});
