import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../src/live.js';

// Exercise the shipped service, especially the old recommendation after a
// read failure and price updates that must not rebuild a clicked explanation.
function harness() {
  const jobs=[], logs=[], nodes=new Map(); let result, fail=false, reads=0;
  class Panel {
    constructor(id='') { Object.assign(this,{id,nodes:[],classes:new Set(),attrs:{},handlers:{},valid:true,text:'',images:[]}); }
    IsValid(){return this.valid;} GetParent(){return this.parent;}
    FindChildTraverse(id){return nodes.get(id)||null;}
    GetChild(i){return this.nodes[i];}
    AddClass(c){this.classes.add(c);} BHasClass(c){return this.classes.has(c);}
    SetHasClass(c,value){value?this.classes.add(c):this.classes.delete(c);}
    GetAttributeInt(k,fallback){return this.attrs[k]??fallback;} SetAttributeInt(k,v){this.attrs[k]=v;}
    SetAttributeString(k,v){this.attrs[k]=v;}
    SetPanelEvent(k,fn){this.handlers[k]=fn;}
    SetImage(src){this.images.push(src);}
    RemoveAndDeleteChildren(){this.nodes.forEach(p=>p.valid=false);this.nodes=[];}
  }
  const hud=new Panel('Hud'),host=new Panel('ShopmarkLiveRoot');host.parent=hud;
  const xml=fs.readFileSync(new URL('../src/panorama/shopmark_live.xml',import.meta.url),'utf8');
  for(const [,id] of xml.matchAll(/id="([^"]+)"/g))nodes.set(id,new Panel(id));
  const $={GetContextPanel:()=>host,ShopmarkData:{items:[{id:10,icon:'s2r://native/10'}]},
    ShopmarkHUD:{create:()=>({read:()=>{reads++;if(fail)throw Error('HUD gone');return {purchased:[]};}})},
    ShopmarkLive:{numberText:globalThis.ShopmarkLive.numberText,create:()=>({evaluate:()=>result})},
    CreatePanel:(type,parent,id)=>{const p=new Panel(id);p.parent=parent;parent.nodes.push(p);return p;},
    Localize:t=>t,Schedule:(delay,fn)=>jobs.push(fn),Msg:msg=>logs.push(msg)};
  vm.runInNewContext(fs.readFileSync(new URL('../src/panorama/shopmark_live.js',import.meta.url),'utf8'),{$});
  function next(extra={}){result={status:'live',hero:{id:1,name:'Infernus'},build:{id:1,name:'Build',author:'Author'},
    advantage:'even',lane:'unknown',budget:600,recommendations:[{id:10,name:'Magazine',cost:800,kind:'build',affordable:false,
      why:'Full explanation',shortWhy:'Upgrade an owned component',when:'When',tradeoff:'Tradeoff'}],...extra};}
  next();
  return {hud,host,nodes,logs,next,tick:()=>jobs.shift()(),click:id=>nodes.get(id).handlers.onactivate(),
    setFail:()=>{fail=true;},get reads(){return reads;}};
}

test('compact recommendation updates price without recreating explanations or resetting the icon',()=>{
  const h=harness();h.hud.SetAttributeInt('shopmark_auto',1);h.tick();
  assert(h.host.BHasClass('sm-auto-playing'));
  assert.equal(h.nodes.get('ShopmarkNextWhy').text,'Upgrade an owned component');
  assert.match(h.nodes.get('ShopmarkNextPrice').text,/ещё 200/);
  const body=h.nodes.get('ShopmarkLiveBody'),child=body.nodes[0];
  h.next({budget:750});h.tick();
  assert.match(h.nodes.get('ShopmarkNextPrice').text,/ещё 50/);
  assert.equal(body.nodes[0],child);
  assert.equal(h.nodes.get('ShopmarkNextIcon').images.length,1);
  h.click('ShopmarkSideToggle');h.click('ShopmarkCompactToggle');
  assert(h.host.BHasClass('sm-live-right'));assert(h.host.BHasClass('sm-live-compact'));
  h.click('ShopmarkAutoToggle');h.next({status:'off',recommendations:[]});h.tick();
  assert(!h.host.BHasClass('sm-auto-enabled'));assert(!h.host.BHasClass('sm-auto-playing'));
});

test('missing facts or adapter failure hide the combat card and clear the shop highlight',()=>{
  const h=harness();h.hud.SetAttributeInt('shopmark_auto',1);h.tick();
  h.next({status:'waiting',reason:'Inventory unknown',recommendations:[]});h.tick();
  assert(!h.host.BHasClass('sm-auto-playing'));assert.equal(h.hud.attrs.shopmark_next,'');
  h.next();h.tick();h.setFail();h.tick();
  assert(!h.host.BHasClass('sm-auto-playing'));assert.equal(h.hud.attrs.shopmark_next,'');assert.equal(h.logs.length,1);
  h.host.valid=false;const reads=h.reads;h.tick();assert.equal(h.reads,reads);
});
