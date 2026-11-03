import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
function harness(){
 const jobs=[],events=[];let allocations=0;
 class P{
  constructor(type='Panel',id='',parent=null){Object.assign(this,{paneltype:type,id,parent,nodes:[],classes:new Set(),handlers:{},attrs:{},style:{},visible:true,valid:true,text:''});if(parent)parent.nodes.push(this);}
  IsValid(){return this.valid;}GetParent(){return this.parent;}GetChildCount(){return this.nodes.length;}GetChild(i){return this.nodes[i]||null;}
  AddClass(c){this.classes.add(c);}BHasClass(c){return this.classes.has(c);}SetHasClass(c,b){b?this.classes.add(c):this.classes.delete(c);}
  FindChildTraverse(id){return this.nodes.find(n=>n.id===id)||this.nodes.map(n=>n.FindChildTraverse(id)).find(Boolean)||null;}
  FindChildrenWithClassTraverse(c){return this.nodes.flatMap(n=>[...(n.BHasClass(c)?[n]:[]),...n.FindChildrenWithClassTraverse(c)]);}
  SetAttributeInt(k,v){this.attrs[k]=v;}GetAttributeInt(k,d){return this.attrs[k]??d;}SetPanelEvent(k,v){this.handlers[k]=v;}
  SetParent(parent){this.parent.nodes=this.parent.nodes.filter(n=>n!==this);this.parent=parent;parent.nodes.push(this);}
  MoveChildBefore(p,b){assert(p.parent===this&&b.parent===this);this.nodes=this.nodes.filter(n=>n!==p);this.nodes.splice(this.nodes.indexOf(b),0,p);}
  BLoadLayout(){for(const id of['ShopmarkShopNow','ShopmarkShopLater','ShopmarkShopOwned','ShopmarkShopCache'])new P('Panel',id,this);this.FindChildTraverse('ShopmarkShopCache').AddClass('ShopmarkInventorySource');return true;}
 }
 const hud=new P('Panel','Hud'),shop=new P('Panel','CitadelHudHeroShop',hud),nav=new P('Panel','ShopNavigation',shop),content=new P('Panel','ShopModListsContainer',shop);
 const original=new P('Panel','OriginalBuild',content),originalItem=new P('Panel','ForeignItem',original),nativeNav=new P('Button','WeaponNav',nav);
 nativeNav.handlers.onactivate=()=>events.push('native');
 const $={CreatePanel(type,parent,id){const p=new P(type,id,parent);if(type==='CitadelShopModsFiltered')for(let i=1;i<=4;i++){allocations++;const c=new P('CitadelShopMod','native'+i,p);c.AddClass('mod_view');const l=new P('Label','',c);l.AddClass('modName');l.text='Item '+i;}return p;},
  RegisterEventHandler(event,p,fn){p.additional=fn;},Schedule(d,fn){jobs.push(fn);},Msg(){}};
 vm.runInNewContext(fs.readFileSync(new URL('../src/panorama/shopmark_shop.js',import.meta.url),'utf8'),{$});
 const view=$.ShopmarkShop.create(hud,{items:[1,2,3,4].map(id=>({id,name:'Item '+id}))});hud.SetAttributeInt('shopmark_auto',1);
 const update=(ids,owned=[])=>{view.update({status:'live',recommendations:ids.map(id=>({id})),purchased:owned},true);while(jobs.length)jobs.shift()();};
 return{hud,view,update,original,originalItem,nativeNav,events,get allocations(){return allocations;}};
}
test('own shop build reorders native cards without replacing or deleting the selected community build',()=>{
 const h=harness();h.update([1,2,3,4]);h.update([1,2,3,4]);
 const card=h.hud.FindChildTraverse('native1');h.update([3,2,4],[1]);
 const grid=h.hud.FindChildTraverse('ShopmarkShopNow');assert.deepEqual(grid.nodes.map(p=>p.id),['native3','native2','native4']);
 assert.equal(h.hud.FindChildTraverse('ShopmarkShopOwned').nodes[0],card);
 assert.equal(h.original.nodes[0],h.originalItem);assert(h.originalItem.valid);assert.equal(h.allocations,4);
 for(let i=0;i<100;i++)h.update(i%2?[2,3,4]:[3,2,4],[1]);assert.equal(h.allocations,4);
});
test('switching to a stock tab and disabling the coach restore the stock view and native handlers',()=>{
 const h=harness();h.update([1,2]);h.update([1,2]);assert(h.hud.FindChildTraverse('ShopmarkShopView').visible);
 h.nativeNav.handlers.onactivate();assert.equal(h.nativeNav.additional(),false);assert.deepEqual(h.events,['native']);
 assert.equal(h.hud.FindChildTraverse('ShopmarkShopView').visible,false);
 h.view.update({status:'off',recommendations:[]},false);assert.equal(h.hud.FindChildTraverse('ShopmarkShopNav').visible,false);
 assert.equal(h.original.visible,true);assert(h.originalItem.valid);
});
