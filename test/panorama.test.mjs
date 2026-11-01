import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// A strict lifecycle harness, not a claim of running the native client. It
// rejects deleting a panel while a native event still owns it, and rejects
// every operation on stale references. These are real native UI constraints.
function harness() {
  const jobs=[], errors=[], events=[], nodes=[];
  let active=null, nextJob=0, destructiveEvents=0;
  class Panel {
    constructor(type,parent,id='') {
      Object.assign(this,{paneltype:type,parent,id,nodes:[],classes:new Set(),attributes:{},handlers:{},valid:true,selected:null,style:{},_text:''});
      if(parent) parent.nodes.push(this);nodes.push(this);
    }
    check(){if(!this.valid)throw Error('Stale panel: '+this.id);}
    IsValid(){return this.valid;}
    GetParent(){this.check();return this.parent;}
    get text(){this.check();return this._text;}
    set text(value){this.check();this._text=String(value);}
    AddClass(c){this.check();this.classes.add(c);}
    SetHasClass(c,v){this.check();v?this.classes.add(c):this.classes.delete(c);}
    BHasClass(c){this.check();return this.classes.has(c);}
    SetAttributeString(k,v){this.check();this.attributes[k]=String(v);}
    GetAttributeString(k,fallback){this.check();return this.attributes[k]??fallback;}
    SetAttributeInt(k,v){this.check();this.attributes[k]=Number(v);}
    GetAttributeInt(k,fallback){this.check();return this.attributes[k]??fallback;}
    GetChild(i){this.check();return this.nodes[i];}
    FindChildTraverse(id){this.check();return this.nodes.find(p=>p.id===id)||this.nodes.map(p=>p.FindChildTraverse(id)).find(Boolean)||null;}
    FindChildrenWithClassTraverse(c){this.check();return this.nodes.flatMap(p=>[...(p.BHasClass(c)?[p]:[]),...p.FindChildrenWithClassTraverse(c)]);}
    SetPanelEvent(name,handler){this.check();this.handlers[name]=handler;}
    AddOption(p){this.check();p.check();}
    SetSelected(id){this.check();this.selected=this.FindChildTraverse(id);}
    GetSelected(){this.check();return this.selected;}
    destroy(){this.valid=false;this.nodes.forEach(p=>p.destroy());}
    RemoveAndDeleteChildren(){
      this.check();
      for(let p=active;p;p=p.parent)if(p!==this&&p.parent===this){destructiveEvents++;throw Error('Deleting the active native event target');}
      this.nodes.forEach(p=>p.destroy());this.nodes=[];
    }
  }
  const root=new Panel('CitadelHud',null,'Hud');
  const ctx=new Panel('CitadelHeroBuildsSelector',root,'Selector');
  new Panel('Panel',ctx,'ShopmarkMount');
  const tab=new Panel('Panel',ctx,'NativePublicTab');tab.AddClass('PublicBuilds');
  let nativeEntry=new Panel('TextEntry',ctx,'SearchTextEntry');
  const refresh=new Panel('Panel',ctx,'RefreshButton');
  tab.handlers.onactivate=()=>{
    nativeEntry.destroy();ctx.nodes=ctx.nodes.filter(p=>p!==nativeEntry);
    nativeEntry=new Panel('TextEntry',ctx,'SearchTextEntry');
  };
  refresh.handlers.onactivate=()=>events.push(['search',nativeEntry.text]);
  function invoke(p,name='onactivate'){
    p.check();const old=active;active=p;
    try{p.handlers[name]?.();}finally{active=old;}
  }
  const data={heroes:[{id:1,name:'Infernus'},{id:2,name:'Haze'}],ranks:[{id:1,name:'Initiate'},{id:2,name:'Seeker'}],
    items:[{id:10,name:'Core',cost:800},{id:11,name:'Healbane',cost:1600},{id:12,name:'Boots',cost:800}],
    catalog:[1,2,3,4].map(id=>({id,heroId:1,name:'Build '+id,author:'Author',updated:id,pro:id===1,
      categories:[{name:'Start',items:[{id:10},{id:12}]},{name:'Options',optional:true,items:[{id:11}]}]})),
    meta:{},changes:[],recentPatches:[{date:'2026-10-30',title:'Patch',excerpt:'Updates'}]};
  const $={ShopmarkData:data,GetContextPanel:()=>ctx,CreatePanel:(type,parent,id)=>new Panel(type,parent,id),
    Schedule:(delay,fn)=>{const id=++nextJob;jobs.push({id,fn});return id;},
    Msg:message=>errors.push(message),
    DispatchEvent:(name,p,source)=>{p.check();events.push([name,p.id,source]);invoke(p);}
  };
  const context=vm.createContext({$});
  vm.runInContext(fs.readFileSync(new URL('../src/coach.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(process.env.SHOPMARK_UI_SOURCE || new URL('../src/panorama/shopmark.js',import.meta.url),'utf8'),context);
  function flush(){let count=0;while(jobs.length){if(++count>40)throw Error('Unbounded scheduling');jobs.shift().fn();}}
  function button(text){const p=nodes.find(p=>p.valid&&p.paneltype==='Button'&&p.nodes.some(n=>n.valid&&n._text===text));assert(p,'Missing button '+text);return p;}
  function click(text,{flushAfter=true}={}){invoke(button(text));if(flushAfter)flush();}
  function choose(id,value,{flushAfter=true}={}){const p=ctx.FindChildTraverse(id);assert(p,'Missing dropdown '+id);p.SetSelected(id+'-'+value);invoke(p,'oninputsubmit');if(flushAfter)flush();}
  function texts(){return nodes.filter(p=>p.valid&&p.paneltype==='Label').map(p=>p.text);}
  flush();
  return {root,ctx,$,nodes,jobs,events,errors,flush,click,choose,button,invoke,texts,get destructiveEvents(){return destructiveEvents;}};
}

test('all catalogue controls and manual coach actions preserve native event targets',()=>{
  const h=harness();
  h.click('→');h.click('←');h.click('Все сборки');h.click('Известные авторы');
  h.click('Патчи');assert(h.texts().some(s=>s.includes('Patch')));h.click('Патчи');
  h.click('Разобрать сборку');
  h.choose('sm-adv','behind');h.choose('sm-lane','lost');
  h.click('+ Враг много лечится');h.click('✓ Враг много лечится');
  h.choose('sm-enemy',2);h.click('Добавить врага');assert(h.texts().some(s=>s.includes('Враги: Haze')));
  h.ctx.FindChildTraverse('sm-budget').text='1600';h.click('Учесть бюджет (souls)');
  const bought=h.button('Отметить купленным');h.invoke(bought);h.invoke(bought);h.flush();
  assert(h.texts().some(s=>s.startsWith('Отмечено покупок: 1.')));
  h.click('Сбросить сценарий');h.click('Помощник');
  h.choose('sm-rank',2);h.choose('sm-hero',2);h.choose('sm-hero',1);
  assert.equal(h.destructiveEvents,0);assert.deepEqual(h.errors,[]);
});

test('native search reacquires the replaced field and activates the refresh button',()=>{
  const h=harness(),before=h.ctx.FindChildTraverse('SearchTextEntry');
  h.click('Найти в игре →');
  assert.equal(before.IsValid(),false);
  const searches=h.events.filter(e=>e[0]==='search');assert.equal(searches.length,1);assert.match(searches[0][1],/^\d+$/);
  assert(!h.events.some(e=>e[0]==='Activated'&&e[1]==='SearchTextEntry'));
  assert.deepEqual(h.errors,[]);
});

test('rapid changes coalesce, and closing the popup cancels queued work safely',()=>{
  const h=harness();
  h.click('→',{flushAfter:false});h.click('←',{flushAfter:false});assert.equal(h.jobs.length,1);h.flush();
  h.click('Найти в игре →',{flushAfter:false});h.ctx.destroy();h.flush();
  assert.equal(h.events.filter(e=>e[0]==='search').length,0);assert.deepEqual(h.errors,[]);
});
test('every advantage/lane combination and each threat toggle is safe to change repeatedly',()=>{
  const h=harness();h.click('Помощник');
  for(const advantage of ['even','ahead','behind']) for(const lane of ['even','won','lost']) {
    h.choose('sm-adv',advantage);h.choose('sm-lane',lane);
    for(const situation of Object.values(h.$.ShopmarkCoach.situations)) {
      h.click('+ '+situation.name);h.click('✓ '+situation.name);
    }
    assert.equal(h.ctx.FindChildTraverse('sm-adv').GetSelected().GetAttributeString('value',''),advantage);
    assert.equal(h.ctx.FindChildTraverse('sm-lane').GetSelected().GetAttributeString('value',''),lane);
  }
  assert.equal(h.destructiveEvents,0);assert.deepEqual(h.errors,[]);
});
