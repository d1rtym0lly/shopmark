import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/coach.js';
import '../src/live.js';
const receipt=JSON.parse(fs.readFileSync(new URL('./fixtures/native-6839.json',import.meta.url),'utf8'));
const data=JSON.parse(fs.readFileSync(new URL('../data/snapshot.json',import.meta.url),'utf8'));

test('recorded native sandbox purchase, upgrade, undo, closed-shop sale and hero switch stay coherent',()=>{
  const engine=globalThis.ShopmarkLive.create(globalThis.ShopmarkCoach), results=[];
  for(const {checkpoint,snapshot} of receipt.frames){
    const result=engine.evaluate(data,snapshot,{enabled:true},snapshot.capturedAt);
    results.push(result);
    if(!snapshot.playing||!snapshot.inventoryKnown){assert.equal(result.status,'waiting');continue;}
    assert.equal(result.status,'live',checkpoint);assert.equal(result.hero.id,snapshot.heroId);
    assert(!result.recommendations.some(r=>snapshot.purchased.includes(r.id)),checkpoint);
    assert.equal(result.budget,snapshot.budget);
  }
  assert(receipt.frames.find(f=>f.checkpoint==='purchase').snapshot.purchased.includes(1548066885));
  const upgraded=receipt.frames.find(f=>f.checkpoint==='upgrade').snapshot;
  assert(upgraded.purchased.includes(2356412290));assert(!upgraded.purchased.includes(1548066885));
  assert.deepEqual(receipt.frames.find(f=>f.checkpoint==='undo upgrade').snapshot.purchased,[1548066885]);
  assert.deepEqual(receipt.frames.find(f=>f.checkpoint==='full sale outside shop').snapshot.purchased,[]);
  assert.deepEqual(receipt.frames.find(f=>f.checkpoint==='purchase outside build').snapshot.purchased,[3862866912]);
  assert.equal(results.at(-1).hero.name,'Haze');assert(receipt.frames.at(-1).snapshot.enemies.length>0);
});
