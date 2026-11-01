import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/live.js';
import '../src/panorama/shopmark_hud.js';
const { ShopmarkHUD:hud, ShopmarkLive:live } = globalThis;
// Small fixture of native build 6839's actual routes/classes. This tests the
// adapter contract; it is deliberately not presented as a runtime game test.
class Panel {
  constructor(id='',type='Panel',classes=[],text='') { Object.assign(this,{id,paneltype:type,text,nodes:[],classes:new Set(classes)}); }
  add(...children) { for(const p of children){p.parent=this;this.nodes.push(p);} return this; }
  IsValid(){return true;} Children(){return this.nodes;} GetParent(){return this.parent||null;}
  GetChildCount(){return this.nodes.length;} GetChild(i){return this.nodes[i];} BHasClass(c){return this.classes.has(c);}
  FindChild(id){return this.nodes.find(p=>p.id===id)||null;}
  FindChildTraverse(id){return this.FindChild(id)||this.nodes.map(p=>p.FindChildTraverse(id)).find(Boolean)||null;}
  FindChildrenWithClassTraverse(c){return this.nodes.flatMap(p=>[...(p.BHasClass(c)?[p]:[]),...p.FindChildrenWithClassTraverse(c)]);}
}
function label(id,text,classes=[]){return new Panel(id,'Label',classes,text);}
function fixture() {
  const local=new Panel('player1','CitadelHudTopBarPlayer',['LocalPlayer']).add(label('','Инфернус',['HeroName']),label('SoulsValue','4,2k'));
  const enemy=new Panel('player2','CitadelHudTopBarPlayer',['IsInLocalPlayerLane']).add(label('','Haze',['HeroName']),label('SoulsValue','6000'));
  const team=new Panel('TeamFriendly','CitadelHudTopBarTeam').add(new Panel('PlayersContainer').add(local));
  const rivals=new Panel('TeamEnemy','CitadelHudTopBarTeam',['enemy']).add(new Panel('PlayersContainer').add(enemy));
  const top=new Panel('TopBar').add(new Panel('TeamsContainer').add(team,rivals),label('GameTime','3:20'),
    new Panel('TeamScoreFriendly').add(label('','24k')),new Panel('TeamScoreEnemy').add(label('','32k')));
  const icon=new Panel('ModIcon0','CitadelModIcon').add(new Panel('mod_icon'));
  const stats=new Panel('StatsAndModsContainer').add(new Panel('gold_and_ap_container').add(label('hudCurGoldLabel','1 600')),
    new Panel('ModPurchasedPanelUniversal').add(icon),new Panel('ModPurchasedPanelUniversalLocked'));
  const card=new Panel('ShopMod','CitadelShopMod',['mod_view']).add(label('','Увеличенный магазин',['modName']));
  const shop=new Panel('CitadelHudHeroShop').add(card);
  const root=new Panel('Hud').add(new Panel('','Panel',['HudCore']).add(top,shop,stats));
  const data={heroes:[{id:1,name:'Infernus',className:'hero_inferno'},{id:2,name:'Haze',className:'hero_haze'}],
    items:[{id:10,name:'Extended Magazine',aliases:['Увеличенный магазин'],className:'upgrade_clip_size'}]};
  const adapter=hud.create(root,data,live,token=>token==='#hero_inferno'?'Инфернус':token);
  return {adapter,local,enemy,icon,card,stats};
}
test('HUD adapter reads local hero, public teams, lane, currency and clock from native scopes',()=>{
  const {adapter}=fixture(), r=adapter.read();
  assert.equal(r.heroId,1);assert.equal(r.playing,true);assert.equal(r.budget,1600);assert.equal(r.seconds,200);
  assert.equal(r.friendlySouls,24000);assert.equal(r.enemySouls,32000);assert.equal(r.ownSouls,4200);
  assert.equal(r.enemies[0].hero,'Haze');assert.equal(r.enemies[0].sameLane,true);assert.equal(r.inventoryKnown,true);
});
test('owned cards resolve an active slot, and a sale removes the item',()=>{
  const f=fixture();f.icon.classes.add('hasAbility');f.card.classes.add('owned');
  assert.deepEqual(f.adapter.read().purchased,[10]);assert.equal(f.adapter.read().inventoryKnown,true);
  f.card.classes.delete('owned');f.icon.classes.delete('hasAbility');
  assert.deepEqual(f.adapter.read().purchased,[]);assert.equal(f.adapter.read().inventoryKnown,true);
});
test('an unidentified purchase or a missing inventory is unknown, never an empty inventory',()=>{
  const f=fixture();f.icon.classes.add('hasAbility');
  assert.equal(f.adapter.read().inventoryKnown,false);
  f.stats.nodes=f.stats.nodes.filter(p=>!p.id.startsWith('ModPurchased'));
  assert.equal(f.adapter.read().inventoryKnown,false);
});
test('native icon classes resolve items even when the shop is on another build',()=>{
  const f=fixture();f.icon.classes.add('hasAbility');f.icon.FindChild('mod_icon').classes.add('upgrade_clip_size');
  assert.deepEqual(f.adapter.read().purchased,[10]);assert.equal(f.adapter.read().inventoryKnown,true);
});
test('spectating a hero does not become the local player',()=>{
  const f=fixture();f.local.classes.delete('LocalPlayer');f.local.classes.add('SpectatorTarget');
  assert.equal(f.adapter.read().playing,false);assert.equal(f.adapter.read().heroId,null);
});
