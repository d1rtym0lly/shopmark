(function () {
  'use strict';
  var host = $.GetContextPanel(), hud = host.GetParent(), data = $.ShopmarkData;
  var adapter = $.ShopmarkHUD.create(hud, data, $.ShopmarkLive, function (token) { return $.Localize(token); });
  var engine = $.ShopmarkLive.create($.ShopmarkCoach), toggle = host.FindChildTraverse('ShopmarkAutoToggle');
  var toggleText = host.FindChildTraverse('ShopmarkAutoToggleText'), body = host.FindChildTraverse('ShopmarkLiveBody'), last = '', expanded = {}, statusLabel = null;
  function label(parent, text, cls) { var p = $.CreatePanel('Label', parent, ''); p.text = text; p.html = false; p.AddClass(cls); return p; }
  function panel(parent, cls) { var p = $.CreatePanel('Panel', parent, ''); p.AddClass(cls); return p; }
  toggle.SetPanelEvent('onactivate', function () {
    hud.SetAttributeInt('shopmark_auto', hud.GetAttributeInt('shopmark_auto', 0) ? 0 : 1);
    last = '';
    update();
  });
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
    host.SetHasClass('sm-auto-enabled', enabled);
    toggleText.text = 'SHOPMARK · Автопомощник ' + (enabled ? 'вкл ●' : 'выкл');
    var raw = enabled ? adapter.read() : null;
    var result = engine.evaluate(data, raw, { enabled:enabled, rank:hud.GetAttributeInt('shopmark_rank', 0), buildId:hud.GetAttributeInt('shopmark_build', 0) });
    hud.SetAttributeString('shopmark_next', result.status === 'live' && result.recommendations.length ? String(result.recommendations[0].id) : '');
    var key = JSON.stringify({status:result.status, reason:result.reason, hero:result.hero && result.hero.id, build:result.build && result.build.id,
      recommendations:result.recommendations, advantage:result.advantage, lane:result.lane, purchased:raw && raw.purchased});
    if (key !== last) { last = key; render(result, raw); }
    if (statusLabel && statusLabel.IsValid() && result.hero) statusLabel.text = result.hero.name + ' · ' +
      (result.budget == null ? 'души не прочитаны' : result.budget.toLocaleString('ru-RU') + ' душ');
    if (hud.GetAttributeInt('shopmark_diagnostics', 0) && raw) $.Msg('[SHOPMARK-LIVE] ' + JSON.stringify(raw));
  }
  function tick() { if (!host.IsValid()) return; try { update(); } catch (e) { hud.SetAttributeString('shopmark_next', ''); $.Msg('[Shopmark] Live read paused: ' + String(e)); } $.Schedule(1, tick); }
  $.Schedule(0.2, tick);
})();
