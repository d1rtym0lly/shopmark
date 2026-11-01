(function () {
  var root = $.GetContextPanel(),
    last = "";
  // The read-only native inventory source needs no badges or per-card timers.
  for (var owner = root, d = 0; owner && d < 40; d++, owner = owner.GetParent()) {
    if (owner.BHasClass('ShopmarkInventorySource')) return;
    if (owner.id === 'Hud') break;
  }
  var states = ["buff", "nerf", "mixed", "changed", "unchanged"];
  // Item layouts already coexist with HUD mods. Mount one independent service
  // under Hud instead of replacing base_hud or installing one loop per card.
  var hud = root;
  for (var n = 0; hud && hud.id !== 'Hud' && n < 40; n++) hud = hud.GetParent();
  var mountAttempted = false;
  function mount() {
    if (mountAttempted || !hud || !hud.IsValid() || hud.id !== 'Hud') return;
    mountAttempted = true;
    // This runs after the card's C++ constructor has returned. Loading another
    // layout reentrantly while the native shop card is being built is unsafe.
    if (!hud.FindChild('ShopmarkLiveRoot')) {
      var live = $.CreatePanel('Panel', hud, 'ShopmarkLiveRoot');
      live.hittest = false;
      if (!live.BLoadLayout('s2r://panorama/layout/shopmark_live.vxml_c', false, false)) live.DeleteAsync(0);
    }
  }
  function update() {
    if (!root.IsValid()) return;
    mount();
    var labels = root.FindChildrenWithClassTraverse("modName");
    var name = labels.length ? String(labels[0].text).trim().toLowerCase() : "";
    if (name !== last || !root.BHasClass("ShopmarkResolved")) {
      last = name;
      var status = ($.ShopmarkMarks || {})[name] || "unknown";
      root.AddClass("ShopmarkResolved");
      states.forEach(function (s) {
        root.SetHasClass("sm-mark-" + s, s === status);
      });
    }
    var item = ($.ShopmarkItemIds || {})[name];
    root.SetHasClass('ShopmarkAutoNext', !!hud && !!item && String(item) === hud.GetAttributeString('shopmark_next', ''));
    // Cards are reused by the native shop; re-read only their short name label.
    $.Schedule(1.0, update);
  }
  $.Schedule(0.1, update);
})();
