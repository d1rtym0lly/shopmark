import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import '../src/decision.js';import '../src/live.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/snapshot.json',import.meta.url)));
data.knowledge=JSON.parse(fs.readFileSync(new URL('../data/knowledge.json',import.meta.url)));
const available=data.items.filter(i=>i.tier<=4).map(i=>i.id);
test('recorded native purchases and hero changes remain coherent with the independent planner',()=>{
 const receipt=JSON.parse(fs.readFileSync(new URL('./fixtures/native-6839.json',import.meta.url))),e=engine();
 for(const {snapshot:s} of receipt.frames){const r=e.evaluate(data,{...s,availableItems:available},{enabled:true},s.capturedAt);
   if(!s.playing||!s.inventoryKnown){assert.equal(r.status,'waiting');continue;}
   assert.equal(r.status,'live');assert.equal(r.mode,'mechanics');
   assert(!r.recommendations.some(i=>s.purchased.includes(i.id)));}
});
function raw(heroId,enemies=[]){return{capturedAt:1000,playing:true,heroId,inventoryKnown:true,purchased:[],availableItems:available,ownSouls:8000,budget:3200,seconds:700,enemies};}
function engine(){return globalThis.ShopmarkLive.create({catalog(){throw Error('Author catalogue must never be read');}});}
test('every live hero works with an empty author catalogue and concrete sourced item profiles',()=>{
  for(const hero of data.heroes){const r=engine().evaluate({...data,builds:[],catalog:[],meta:{}},raw(hero.id,[{heroId:13,hero:'Haze',souls:12000}]),{enabled:true},1000);
    assert.equal(r.status,'live',hero.name);assert.equal(r.mode,'mechanics');assert(r.recommendations.length>0);
    assert(r.recommendations.every(i=>available.includes(i.id)&&i.source&&i.shortWhy));}
  assert.equal(Object.keys(data.knowledge.items).length,data.items.length);
});
test('the richest opponent is compared with the player, irrespective of team lead',()=>{
 const r=engine().evaluate(data,{...raw(1,[{heroId:13,hero:'Haze',souls:14000}]),friendlySouls:100000,enemySouls:20000},{enabled:true},1000);
 assert.equal(r.advantage,'behind');assert.equal(r.teamAdvantage,'ahead');assert.equal(r.personalEconomy[0].delta,-6000);
});
test('covering healing suppresses redundant antiheal recommendations rather than following a build',()=>{
 const e=engine(),enemy=[{heroId:6,hero:'Abrams',souls:12000}];
 const before=e.evaluate(data,raw(1,enemy),{enabled:true},1000);
 const after=e.evaluate(data,{...raw(1,enemy),purchased:[2603935618]},{enabled:true},1000);
 assert(!after.recommendations.some(i=>i.id===2603935618));
 assert(after.removed.includes(2603935618)||!before.recommendations.some(i=>i.id===2603935618));
});
