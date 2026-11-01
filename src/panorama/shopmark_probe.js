// Included only by --probe. Temporary local logging; never a release default.
(function () {
  var hud = $.GetContextPanel();
  for (var i = 0; hud && hud.id !== 'Hud' && i < 40; i++) hud = hud.GetParent();
  if (!hud || hud.id !== 'Hud' || hud.GetAttributeInt('shopmark_probe', 0)) return;
  hud.SetAttributeInt('shopmark_probe', 1);
  hud.SetAttributeInt('shopmark_diagnostics', 1);
  hud.SetAttributeInt('shopmark_auto', 1);
  $.Msg('[SHOPMARK-PROBE] Mounted under native Hud; automatic diagnostics enabled locally.');
})();
