// Read-only adapter. All routes below come from the installed native layouts.
(function () {
  'use strict';
  function valid(p) { return !!p && p.IsValid(); }
  function child(p, id) { return valid(p) ? p.FindChild(id) : null; }
  function find(p, id) { return valid(p) ? p.FindChildTraverse(id) : null; }
  function walk(root, limit) {
    var out = [], queue = root ? [root] : [], index = 0;
    while (index < queue.length && out.length < limit) {
      var p = queue[index++];
      if (!valid(p)) continue;
      out.push(p);
      for (var i = 0; i < p.GetChildCount(); i++) queue.push(p.GetChild(i));
    }
    return out;
  }
  function text(p) { return valid(p) && p.paneltype === 'Label' ? String(p.text || '').replace(/<[^>]*>/g, '').trim() : ''; }
  function firstLabel(p) { return walk(p, 24).filter(function (n) { return n.paneltype === 'Label'; })[0]; }
  function create(root, data, live, localize) {
    var cache = {}, names = {}, heroes = {}, items = data.items || [], mirrorHero = null, mirrorWarmUntil = 0;
    items.forEach(function (item) { [item.name].concat(item.aliases || []).forEach(function (n) { names[String(n).trim().toLowerCase()] = item.id; }); });
    (data.heroes || []).forEach(function (h) {
      [h.name, localize('#' + h.className)].forEach(function (n) { if (n && n.charAt(0) !== '#') heroes[n.toLowerCase()] = h; });
    });
    function scope(id) {
      if (valid(cache[id])) return cache[id];
      // A shallow native HudCore lookup prevents traversing the whole HUD.
      var children = root.Children(), core = children.filter(function (p) { return p.BHasClass('HudCore'); })[0];
      var p = child(core, id);
      if (p) cache[id] = p;
      return p;
    }
    function identify(name) { return heroes[String(name).toLowerCase()] || null; }
    function read() {
      var top = scope('TopBar'), shop = scope('CitadelHudHeroShop'), stats = scope('StatsAndModsContainer');
      var raw = { capturedAt: Date.now(), playing: false, heroId: null, inventoryKnown: false, purchased: [], allies: [], enemies: [],
        budget: null, seconds: live.clock(text(find(top, 'GameTime'))), friendlySouls: null, enemySouls: null, ownSouls: null };
      var teams = child(top, 'TeamsContainer');
      var localPlayer = null, localTeam = null;
      walk(teams, 128).forEach(function (p) {
        if (p.paneltype !== 'CitadelHudTopBarPlayer') return;
        var name = p.FindChildrenWithClassTraverse('HeroName');
        var h = name.length ? identify(text(name[0])) : null;
        if (!h) return;
        var team = p.GetParent();
        for (var i = 0; valid(team) && i < 8 && team.paneltype !== 'CitadelHudTopBarTeam'; i++) team = team.GetParent();
        var entry = { hero:h.name, heroId:h.id, souls:live.number(text(find(p, 'SoulsValue'))), sameLane:p.BHasClass('IsInLocalPlayerLane') || p.BHasClass('LocalPlayer') };
        if (p.BHasClass('LocalPlayer')) { localPlayer = entry; localTeam = team; }
        (valid(team) && team.BHasClass('enemy') ? raw.enemies : raw.allies).push(entry);
      });
      if (localPlayer && valid(localTeam) && !localTeam.BHasClass('enemy')) {
        raw.heroId = localPlayer.heroId;
        raw.ownSouls = localPlayer.souls;
        raw.playing = true;
      }
      // The native tree can retain its previous scoreboard while returning
      // to hideout. A fresh read of stale labels is not a fresh match state.
      ['connectedToHideout', 'inHideoutIntro'].forEach(function (c) {
        if (root.BHasClass(c) || (typeof root.BAscendantHasClass === 'function' && root.BAscendantHasClass(c))) raw.playing = false;
      });
      var gold = find(stats, 'gold_and_ap_container');
      var shopGold = find(shop, 'GoldAPContainer');
      var currency = valid(shopGold) && shop.visible ? shopGold : gold;
      var wallet = find(currency, 'CurrentGoldAmount');
      raw.infiniteMoney = valid(currency) && (currency.BHasClass('infiniteMoney') ||
        (typeof currency.BAscendantHasClass==='function' && currency.BAscendantHasClass('infiniteMoney')));
      raw.budget = raw.infiniteMoney ? null : live.number(text(find(valid(wallet)?wallet:currency, 'hudCurGoldLabel')));
      function teamTotal(id) { var p = find(top, id); return live.number(text(firstLabel(p))); }
      raw.friendlySouls = teamTotal('TeamScoreFriendly');
      raw.enemySouls = teamTotal('TeamScoreEnemy');
      var own = {}, activeSlots = 0, resolvedSlots = 0;
      ['ModPurchasedPanelUniversal', 'ModPurchasedPanelUniversalLocked'].forEach(function (id) {
        var inventory = find(stats, id);
        walk(inventory, 260).forEach(function (p) {
          if (p.paneltype !== 'CitadelModIcon' || !p.BHasClass('hasAbility')) return;
          activeSlots++;
          if (p.BHasClass('isHidden')) return;
          var icon = find(p, 'mod_icon');
          for (var i = 0; i < items.length; i++) if (items[i].className &&
              (p.BHasClass(items[i].className) || (valid(icon) && icon.BHasClass(items[i].className)))) {
            own[items[i].id] = true; resolvedSlots++; break;
          }
        });
      });
      // Names and ownership on shop cards are native values; components that
      // were consumed and sold cards are deliberately excluded.
      var cardOwn = {}, cards = valid(shop) ? shop.FindChildrenWithClassTraverse('mod_view') : [];
      cards.forEach(function (p) {
        if (!p.BHasClass('owned') || p.BHasClass('IgnoreOwnership') || p.BHasClass('usedAsComponent')) return;
        var labels = p.FindChildrenWithClassTraverse('modName');
        var id = labels.length ? names[text(labels[0]).toLowerCase()] : null;
        if (id) cardOwn[id] = true;
      });
      var inventoryPresent = valid(find(stats, 'ModPurchasedPanelUniversal'));
      if (inventoryPresent && activeSlots === resolvedSlots) raw.inventoryKnown = true;
      else if (inventoryPresent && Object.keys(cardOwn).length === activeSlots) { own = cardOwn; raw.inventoryKnown = true; }
      // A shop's hidden cards/slots can freeze until it is reopened. This native
      // list is independent of the active build and stays current outside shop.
      // It has no input, rendered area, badge loops or purchasing behavior.
      var requiredIds = data.shopItemIds || [], mirror = child(root, 'ShopmarkInventorySource'), mirrored = [];
      if (requiredIds.length) {
        raw.inventoryKnown = false; own = {};
        var available = {}, unknownOwned = false;
        mirrored = valid(mirror) ? mirror.FindChildrenWithClassTraverse('mod_view') : [];
        mirrored.forEach(function (p) {
          var labels = p.FindChildrenWithClassTraverse('modName');
          var id = labels.length ? names[text(labels[0]).toLowerCase()] : null;
          if (id) available[id] = true;
          if (p.BHasClass('owned') && !p.BHasClass('IgnoreOwnership') && !p.BHasClass('usedAsComponent')) {
            if (id) own[id] = true; else unknownOwned = true;
          }
        });
        if (raw.heroId !== mirrorHero) { mirrorHero = raw.heroId; mirrorWarmUntil = raw.capturedAt + 250; }
        raw.inventoryKnown = valid(mirror) && mirror.GetAttributeInt('shopmark_inventory_live', 0) === 1 &&
          raw.capturedAt >= mirrorWarmUntil && !unknownOwned && requiredIds.every(function (id) { return !!available[id]; });
        raw.availableItems = Object.keys(available).map(Number);
      }
      raw.purchased = Object.keys(own).map(Number);
      raw.diagnostics = { activeSlots:activeSlots, resolvedSlots:resolvedSlots, ownedCards:Object.keys(cardOwn).length, cards:cards.length,
        top:valid(top), shop:valid(shop), stats:valid(stats), local:!!localPlayer, mirrorCards:mirrored.length };
      if (typeof root.GetAttributeInt === 'function' && root.GetAttributeInt('shopmark_diagnostics',0)) {
        var sources = [top, gold, find(shop,'GoldAPContainer')];
        raw.diagnostics.economy = [];
        sources.forEach(function (s) { walk(s,512).forEach(function (p) {
          if(p.paneltype==='Label' && (p.id==='SoulsValue'||p.id==='hudCurGoldLabel'||p.BHasClass('ScoreLabel'))) raw.diagnostics.economy.push({id:p.id,text:String(p.text||'')});
        }); });
      }
      return raw;
    }
    return { read:read };
  }
  var api = { create:create, walk:walk };
  if (typeof $ !== 'undefined') $.ShopmarkHUD = api;
  if (typeof globalThis !== 'undefined') globalThis.ShopmarkHUD = api;
})();
