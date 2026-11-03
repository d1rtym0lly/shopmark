(function(){
  'use strict';
  function valid(p){return !!p&&p.IsValid();}
  function create(hud,data){
    var shop=null,view=null,nav=null,cache=null,grids={},cards={},last='',pending=false,latest=null,wasEnabled=false,tabs='';
    var idsByName={},items={};
    data.items.forEach(function(i){items[i.id]=i;[i.name].concat(i.aliases||[]).forEach(function(n){idsByName[String(n).trim().toLowerCase()]=i.id;});});
    function label(parent,text,cls){var p=$.CreatePanel('Label',parent,'');p.text=text;p.html=false;p.AddClass(cls);return p;}
    function tabState(){return ['showingFavorites','showingAllItems','showingWeapon','showingTech','showingArmor','showingRecommendations'].filter(function(c){return shop.BHasClass(c);}).join('|');}
    function close(){hud.SetAttributeInt('shopmark_shop_view',0);if(valid(view))view.visible=false;if(valid(nav)){nav.SetHasClass('ShopmarkShopSelected',false);nav.style.backgroundColor='#101018';}return false;}
    function section(parent,id,title){var p=$.CreatePanel('Panel',parent,'');p.AddClass('ShopmarkShopSection');label(p,title,'ShopmarkShopTitle');var grid=$.CreatePanel('Panel',p,id);grid.AddClass('ShopmarkShopGrid');return grid;}
    function mount(){
      if(valid(view)&&valid(nav))return true;
      shop=hud.FindChildTraverse('CitadelHudHeroShop');
      if(!valid(shop))return false;
      var navigation=shop.FindChildTraverse('ShopNavigation'),content=shop.FindChildTraverse('ShopModListsContainer');
      if(!valid(navigation)||!valid(content))return false;
      nav=$.CreatePanel('Button',navigation,'ShopmarkShopNav');nav.AddClass('ShopmarkShopNav');var title=label(nav,'SHOPMARK','ShopmarkShopNavLabel');
      nav.style.width='110px';nav.style.minHeight='42px';nav.style.margin='6px 8px';nav.style.padding='10px 5px';nav.style.backgroundColor='#101018';
      title.style.color='#ff9aa7';title.style.fontSize='14px';title.style.fontWeight='bold';title.style.horizontalAlign='center';
      nav.SetPanelEvent('onactivate',function(){if(!valid(hud))return;var open=!hud.GetAttributeInt('shopmark_shop_view',0);hud.SetAttributeInt('shopmark_shop_view',open?1:0);tabs=tabState();if(valid(view))view.visible=open;nav.SetHasClass('ShopmarkShopSelected',open);nav.style.backgroundColor=open?'#492632':'#101018';});
      ['FavoritesNav','RecommendedNav','FilteredNav','WeaponNav','TechNav','ArmorNav'].forEach(function(id){
        var button=shop.FindChildTraverse(id);if(valid(button))$.RegisterEventHandler('Activated',button,close);
      });
      view=$.CreatePanel('Panel',content,'ShopmarkShopView');view.AddClass('ShopmarkShopView');
      if(!view.BLoadLayout('s2r://panorama/layout/shopmark_shop.vxml_c',false,false))throw Error('Shopmark shop layout failed to load');
      grids.now=view.FindChildTraverse('ShopmarkShopNow');grids.later=view.FindChildTraverse('ShopmarkShopLater');grids.owned=view.FindChildTraverse('ShopmarkShopOwned');
      cache=view.FindChildTraverse('ShopmarkShopCache');
      cache.hittest=false;cache.hittestchildren=false;cache.style.width='1px';cache.style.height='1px';cache.style.opacity='0';
      $.CreatePanel('CitadelShopModsFiltered',cache,'ShopmarkShopNativeItems');
      // Item objects keep their native handlers and data. They are moved,
      // never destroyed/recreated while a purchase event owns the widget.
      cards={};last='';tabs=tabState();return true;
    }
    function readCards(){
      [cache,grids.now,grids.later,grids.owned].forEach(function(root){if(!valid(root))return;
        root.FindChildrenWithClassTraverse('mod_view').forEach(function(p){var labels=p.FindChildrenWithClassTraverse('modName'),id=labels.length?idsByName[String(labels[0].text).trim().toLowerCase()]:null;if(id)cards[id]=p;});});
    }
    function move(ids,parent,used){
      ids.slice().reverse().forEach(function(id){var p=cards[id];if(!valid(p)||used[id])return;used[id]=true;
        if(p.GetParent()!==parent)p.SetParent(parent);
        var first=parent.GetChildCount()?parent.GetChild(0):null;
        if(valid(first)&&first!==p)parent.MoveChildBefore(p,first);
        var item=items[id];p.SetHasClass('ShopmarkLiveShopItem',true);
        ['buff','nerf','mixed','changed','unchanged'].forEach(function(s){p.SetHasClass('sm-mark-'+s,item&&item.status===s);});
      });
    }
    function render(){
      pending=false;if(!valid(hud)||!latest||!hud.GetAttributeInt('shopmark_auto',0)||!mount())return;
      readCards();
      var result=latest,ids=result.status==='live'?result.recommendations.map(function(r){return r.id;}):[],owned=result.purchased||[],used={};
      move(ids.slice(0,3),grids.now,used);move(ids.slice(3),grids.later,used);move(owned,grids.owned,used);
      Object.keys(cards).forEach(function(id){var p=cards[id];if(valid(p)&&!used[id]&&p.GetParent()!==cache)p.SetParent(cache);});
      last=JSON.stringify([ids,owned]);
      if(hud.GetAttributeInt('shopmark_diagnostics',0))$.Msg('[SHOPMARK-SHOP] '+JSON.stringify({next:ids,owned:owned,resolved:Object.keys(cards).filter(function(id){return valid(cards[id]);}).length}));
    }
    function update(result,enabled){
      latest=result;
      if(!enabled){wasEnabled=false;close();if(valid(nav))nav.visible=false;return;}
      if(!valid(view)&&!pending){pending=true;$.Schedule(0.03,render);return;}
      if(!valid(view))return;
      nav.visible=true;
      if(!wasEnabled){hud.SetAttributeInt('shopmark_shop_view',1);tabs=tabState();wasEnabled=true;}
      else if(tabState()!==tabs){close();tabs=tabState();}
      var open=!!hud.GetAttributeInt('shopmark_shop_view',0)&&!shop.BHasClass('gEditingBuilds');
      view.visible=open;nav.SetHasClass('ShopmarkShopSelected',open);
      nav.style.backgroundColor=open?'#492632':'#101018';
      var key=JSON.stringify([result.status==='live'?result.recommendations.map(function(r){return r.id;}):[],result.purchased||[]]);
      if(key!==last&&!pending){pending=true;$.Schedule(0.03,render);}
    }
    return {update:update};
  }
  if(typeof $!=='undefined')$.ShopmarkShop={create:create};
  if(typeof globalThis!=='undefined')globalThis.ShopmarkShop={create:create};
})();
