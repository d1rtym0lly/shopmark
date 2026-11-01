(function () {
  'use strict';
  var host = $.GetContextPanel(), hud = host.GetParent(), data = $.ShopmarkData;
  var adapter = $.ShopmarkHUD.create(hud, data, $.ShopmarkLive, function (token) { return $.Localize(token); });
  var engine = $.ShopmarkLive.create($.ShopmarkCoach), toggle = host.FindChildTraverse('ShopmarkAutoToggle');
  var toggleText = host.FindChildTraverse('ShopmarkAutoToggleText'), body = host.FindChildTraverse('ShopmarkLiveBody'), last = '', expanded = {}, statusLabel = null;
  var nextIcon = host.FindChildTraverse('ShopmarkNextIcon'), nextName = host.FindChildTraverse('ShopmarkNextName');
  var nextWhy = host.FindChildTraverse('ShopmarkNextWhy'), nextPrice = host.FindChildTraverse('ShopmarkNextPrice'), shownIcon = '';
  var source = null, sourcePending = false;
  function inventorySource(enabled) {
    if (!data.shopItemIds || !data.shopItemIds.length) return;
    if (source && source.IsValid()) {
      if (source.visible !== enabled) {
        source.visible = enabled;
        source.SetAttributeInt('shopmark_inventory_live', 0);
        if (enabled) $.Schedule(0.25, function () { if (source.IsValid() && source.visible) source.SetAttributeInt('shopmark_inventory_live', 1); });
      }
      return;
    }
    if (!enabled || sourcePending) return;
    sourcePending = true;
    // Native panel construction must happen outside a button/card's C++ event.
    $.Schedule(0.03, function () {
      sourcePending = false;
      if (!hud.IsValid() || !hud.GetAttributeInt('shopmark_auto', 0)) return;
      source = $.CreatePanel('Panel', hud, 'ShopmarkInventorySource');
      source.AddClass('ShopmarkInventorySource');
      source.hittest = false; source.hittestchildren = false;
      source.style.width = '1px'; source.style.height = '1px'; source.style.opacity = '0';
      $.CreatePanel('CitadelShopModsFiltered', source, 'ShopmarkInventoryItems');
      $.Schedule(0.25, function () { if (source.IsValid() && source.visible) source.SetAttributeInt('shopmark_inventory_live', 1); });
    });
  }
  function label(parent, text, cls) { var p = $.CreatePanel('Label', parent, ''); p.text = text; p.html = false; p.AddClass(cls); return p; }
  function panel(parent, cls) { var p = $.CreatePanel('Panel', parent, ''); p.AddClass(cls); return p; }
  toggle.SetPanelEvent('onactivate', function () {
    hud.SetAttributeInt('shopmark_auto', hud.GetAttributeInt('shopmark_auto', 0) ? 0 : 1);
    last = '';
    update();
  });
  host.FindChildTraverse('ShopmarkSideToggle').SetPanelEvent('onactivate', function () {
    hud.SetAttributeInt('shopmark_right', hud.GetAttributeInt('shopmark_right', 0) ? 0 : 1); update();
  });
  host.FindChildTraverse('ShopmarkCompactToggle').SetPanelEvent('onactivate', function () {
    hud.SetAttributeInt('shopmark_compact', hud.GetAttributeInt('shopmark_compact', 0) ? 0 : 1); update();
  });
  function compact(result) {
    var next = result.status === 'live' && result.recommendations[0];
    host.SetHasClass('sm-auto-playing', !!next);
    host.SetHasClass('sm-live-affordable', !!next && next.affordable === true);
    if (!next) { nextName.text = ''; nextWhy.text = ''; nextPrice.text = ''; return; }
    var item = data.items.filter(function (x) { return x.id === next.id; })[0], icon = item && item.icon || '';
    if (icon !== shownIcon) { nextIcon.SetImage(icon); shownIcon = icon; }
    nextName.text = next.name;
    nextWhy.text = next.shortWhy || next.why;
    nextPrice.text = $.ShopmarkLive.numberText(next.cost) + ' душ' + (next.affordable === true ? ' · можно купить' :
      next.affordable === false && Number.isFinite(result.budget) ? ' · ещё ' + $.ShopmarkLive.numberText(Math.max(0, next.cost - result.budget)) : ' · проверь магазин');
  }
  function render(result, raw) {
    body.RemoveAndDeleteChildren();
    statusLabel = null;
    if (result.status !== 'live') { label(body, result.reason || 'Включи, чтобы получать подсказки во время матча', 'sm-live-state');
      if (result.status === 'waiting') label(body, 'При неполных данных очередь приостановлена.', 'sm-live-note'); return; }
    statusLabel = label(body, '', 'sm-live-state');
    var states = {ahead:'преимущество', behind:'отставание', even:'ровно', unknown:'нет данных'};
    label(body, 'Команда: ' + states[result.advantage] + ' · линия по душам: ' + states[result.lane], 'sm-live-note');
    label(body, result.build.name + ' · ' + result.build.author, 'sm-live-note');
    result.recommendations.slice(0, 3).forEach(function (r, i) {
      var row = panel(body, 'sm-live-row'), item = data.items.filter(function (x) { return x.id === r.id; })[0];
      if (item && item.icon) { var icon = $.CreatePanel('Image', row, ''); icon.AddClass('sm-live-icon'); icon.SetImage(item.icon); }
      var copy = panel(row, 'sm-live-copy');
      label(copy, (i === 0 ? 'СЕЙЧАС' : 'ЗАТЕМ') + (r.kind === 'situation' ? ' · ПОД СОПЕРНИКА' : '') + ' · ' + r.cost, 'sm-live-tag');
      label(copy, r.name, 'sm-live-name');
      label(copy, r.affordable === false ? 'Нужно накопить или купить компонент' : r.affordable ? 'Можно купить' : 'Проверь стоимость в магазине', 'sm-live-note');
      var why = label(copy, r.why + '\n' + r.when + '\n' + r.tradeoff, 'sm-live-why');
      why.visible = expanded[r.id] === undefined ? i === 0 : expanded[r.id];
      var button = $.CreatePanel('Button', copy, ''); button.AddClass('sm-live-button');
      label(button, why.visible ? 'Свернуть объяснение' : 'Почему этот предмет?', 'sm-live-tag');
      button.SetPanelEvent('onactivate', function () { why.visible = !why.visible; expanded[r.id] = why.visible; button.GetChild(0).text = why.visible ? 'Свернуть объяснение' : 'Почему этот предмет?'; });
    });
    label(body, 'Ответы по героям — предположение по их способностям. Отчёт об уроне помощник пока не читает.', 'sm-live-note');
  }
  function update() {
    if (!host.IsValid() || !hud.IsValid()) return;
    var enabled = !!hud.GetAttributeInt('shopmark_auto', 0);
    inventorySource(enabled);
    var right = !!hud.GetAttributeInt('shopmark_right', 0), mini = !!hud.GetAttributeInt('shopmark_compact', 0);
    host.SetHasClass('sm-auto-enabled', enabled);
    host.SetHasClass('sm-live-right', right);
    host.SetHasClass('sm-live-compact', mini);
    host.SetHasClass('sm-live-obscured', hud.BHasClass('ShowEscapeMenu') || hud.BHasClass('HudHidden') || hud.BHasClass('HudTakeoverEnabled'));
    host.FindChildTraverse('ShopmarkSideText').text = 'Карточка: ' + (right ? 'справа' : 'слева');
    host.FindChildTraverse('ShopmarkCompactText').text = mini ? 'Иконка и причина' : 'Только иконка';
    toggleText.text = 'SHOPMARK · Автопомощник ' + (enabled ? 'вкл ●' : 'выкл');
    var raw = enabled ? adapter.read() : null;
    if (hud.GetAttributeInt('shopmark_diagnostics', 0) && raw) {
      // Native console lines are bounded. Keep captures parseable without the
      // 156-item availability table or duplicate diagnostic economy labels.
      var debug = {};
      Object.keys(raw).forEach(function (key) { if (key !== 'availableItems' && key !== 'diagnostics') debug[key] = raw[key]; });
      debug.availableCount = raw.availableItems ? raw.availableItems.length : null;
      debug.diagnostics = {};
      Object.keys(raw.diagnostics || {}).forEach(function (key) { if (key !== 'economy') debug.diagnostics[key] = raw.diagnostics[key]; });
      $.Msg('[SHOPMARK-LIVE] ' + JSON.stringify(debug));
    }
    var result = engine.evaluate(data, raw, { enabled:enabled, rank:hud.GetAttributeInt('shopmark_rank', 0), buildId:hud.GetAttributeInt('shopmark_build', 0) });
    if (hud.GetAttributeInt('shopmark_diagnostics', 0)) $.Msg('[SHOPMARK-PLAN] ' + JSON.stringify({status:result.status,hero:result.hero && result.hero.name,
      next:result.recommendations.map(function (r) {return {id:r.id,cost:r.cost,kind:r.kind,affordable:r.affordable};}),advantage:result.advantage,lane:result.lane}));
    hud.SetAttributeString('shopmark_next', result.status === 'live' && result.recommendations.length ? String(result.recommendations[0].id) : '');
    compact(result);
    var key = JSON.stringify({status:result.status, reason:result.reason, hero:result.hero && result.hero.id, build:result.build && result.build.id,
      recommendations:result.recommendations, advantage:result.advantage, lane:result.lane, purchased:raw && raw.purchased});
    if (key !== last) { last = key; render(result, raw); }
    if (statusLabel && statusLabel.IsValid() && result.hero) statusLabel.text = result.hero.name + ' · ' +
      (result.infiniteMoney ? '∞ душ · песочница' : result.budget == null ? 'души не прочитаны' : $.ShopmarkLive.numberText(result.budget) + ' душ');
  }
  host.SetAttributeInt('shopmark_ready', 1);
  function tick() { if (!host.IsValid() || !hud.IsValid()) return; try { update(); } catch (e) { host.SetHasClass('sm-auto-playing', false); if (hud.IsValid()) hud.SetAttributeString('shopmark_next', ''); $.Msg('[Shopmark] Live read paused: ' + String(e)); } $.Schedule(1, tick); }
  $.Schedule(0.2, tick);
})();
