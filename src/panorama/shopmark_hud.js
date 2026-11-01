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
    var cache = {}, names = {}, heroes = {}, items = data.items || [];
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
      var gold = find(stats, 'gold_and_ap_container');
      raw.budget = live.number(text(find(gold, 'hudCurGoldLabel')));
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
      raw.purchased = Object.keys(own).map(Number);
      raw.diagnostics = { activeSlots:activeSlots, resolvedSlots:resolvedSlots, ownedCards:Object.keys(cardOwn).length, cards:cards.length,
        top:valid(top), shop:valid(shop), stats:valid(stats), local:!!localPlayer };
      return raw;
    }
    return { read:read };
  }
  var api = { create:create, walk:walk };
  if (typeof $ !== 'undefined') $.ShopmarkHUD = api;
  if (typeof globalThis !== 'undefined') globalThis.ShopmarkHUD = api;
})();
