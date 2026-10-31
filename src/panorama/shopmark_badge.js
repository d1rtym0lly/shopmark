(function () {
  var root = $.GetContextPanel(),
    last = "";
  var states = ["buff", "nerf", "mixed", "changed", "unchanged"];
  function update() {
    if (!root.IsValid()) return;
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
    // Cards are reused by the native shop; re-read only their short name label.
    $.Schedule(1.0, update);
  }
  $.Schedule(0.1, update);
})();
