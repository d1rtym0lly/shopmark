// Runs only when the native build browser is opened. No polling or HTTP.
(function () {
  var ctx = $.GetContextPanel();
  var data = $.ShopmarkData;
  if (!data || !ctx || ctx.FindChildTraverse("ShopmarkHeader")) return;
  var lang = typeof $.Language === "function" ? $.Language() : "english";
  var ru = lang === "russian";
  function tr(r, e) {
    return ru ? r : e;
  }
  function label(parent, text, cls) {
    var p = $.CreatePanel("Label", parent, "");
    p.text = text;
    p.html = false;
    if (cls) p.AddClass(cls);
    return p;
  }
  function button(parent, text, fn, cls) {
    var p = $.CreatePanel("Button", parent, "");
    p.AddClass(cls || "sm-button");
    label(p, text);
    p.SetPanelEvent("onactivate", fn);
    return p;
  }
  var host = ctx.FindChildTraverse("ShopmarkMount");
  if (!host) return;
  var header = $.CreatePanel("Panel", host, "ShopmarkHeader");
  header.AddClass("sm-header");
  var title = $.CreatePanel("Panel", header, "");
  title.AddClass("sm-brand");
  label(title, "SHOPMARK", "sm-wordmark");
  label(title, tr("Сборки и баланс", "Builds & balance"), "sm-subtitle");
  var patchTitle = data.patch
    ? data.patch.date.slice(0, 10)
    : tr("нет данных", "no data");
  label(header, tr("ПАТЧ  ", "PATCH  ") + patchTitle, "sm-patch-date");
  var controls = $.CreatePanel("Panel", host, "");
  controls.AddClass("sm-controls");
  label(controls, tr("Герой", "Hero"), "sm-control-label");
  var picker = $.CreatePanel("DropDown", controls, "ShopmarkHero");
  picker.AddClass("sm-picker");
  data.heroes.forEach(function (hero) {
    var option = $.CreatePanel("Label", picker, "sm-hero-" + hero.id);
    option.text = hero.name;
    option.SetAttributeInt("hero-id", hero.id);
    picker.AddOption(option);
  });
  var showPatches = false;
  var rememberedRanks = {};
  label(controls, tr("Ранг матчей", "Match rank"), "sm-control-label");
  var rankPicker = $.CreatePanel("DropDown", controls, "ShopmarkRank");
  rankPicker.AddClass("sm-picker");
  [{ id: 0, name: tr("Все ранги", "All ranks") }]
    .concat(data.ranks || [])
    .forEach(function (rank) {
      var option = $.CreatePanel("Label", rankPicker, "sm-rank-" + rank.id);
      option.text = rank.name;
      option.SetAttributeInt("rank-id", rank.id);
      rankPicker.AddOption(option);
    });
  rankPicker.SetSelected("sm-rank-0");
  button(controls, tr("Патчи и предметы", "Patches & items"), function () {
    showPatches = !showPatches;
    render();
  });
  var note = label(
    host,
    tr(
      "1. Тот же герой, что в игре  →  2. Ранг матчей  →  3. Найти и «Использовать». Выборка ranked после патча, от 20 матчей.",
      "Choose the same hero as in the game build browser. Press Find, then the native Use Build button.",
    ),
    "sm-help",
  );
  var cards = $.CreatePanel("Panel", host, "ShopmarkCards");
  cards.AddClass("sm-cards");
  var legend = $.CreatePanel("Panel", host, "");
  legend.AddClass("sm-legend");
  [
    ["↑", tr("усиление", "buff"), "buff"],
    ["↓", tr("ослабление", "nerf"), "nerf"],
    ["=", tr("без изменений", "untouched"), "unchanged"],
    ["↕", tr("смешанное", "mixed"), "mixed"],
    ["•", tr("изменено", "changed"), "changed"],
    ["?", tr("не проверено", "unreviewed"), "unknown"],
  ].forEach(function (entry) {
    label(legend, entry[0] + " " + entry[1], "sm-legend-" + entry[2]);
  });
  function render() {
    cards.RemoveAndDeleteChildren();
    cards.SetHasClass("sm-patch-view", showPatches);
    if (showPatches) {
      var feed = $.CreatePanel("Panel", cards, "");
      feed.AddClass("sm-patch-feed");
      (data.recentPatches || []).forEach(function (patch) {
        label(
          feed,
          patch.date.slice(0, 10) + " / " + patch.title,
          "sm-card-author",
        );
        label(feed, patch.excerpt, "sm-patch-excerpt");
      });
      var changes = $.CreatePanel("Panel", cards, "");
      changes.AddClass("sm-patch-feed");
      var symbols = { buff: "↑", nerf: "↓", mixed: "↕", changed: "•" };
      (data.changes || []).forEach(function (item) {
        label(
          changes,
          symbols[item.status] + " " + item.name,
          "sm-legend-" + item.status,
        );
        label(
          changes,
          ru ? item.reason : item.notes.join(" / "),
          "sm-patch-excerpt",
        );
      });
      return;
    }
    var selected = picker.GetSelected();
    if (!selected) return;
    var heroId = selected.GetAttributeInt("hero-id", 0);
    var rankOption = rankPicker.GetSelected();
    var rankId = rankOption ? rankOption.GetAttributeInt("rank-id", 0) : 0;
    rememberedRanks[heroId] = rankId;
    var list = ((data.meta || {})[heroId] || {})[rankId] || [];
    if (!list.length) {
      label(
        cards,
        tr(
          "Для этого героя и ранга пока мало матчей после патча. Выберите «Все ранги» или обновите данные позже.",
          "Not enough post-patch matches for this hero and rank. Try All ranks or update later.",
        ),
        "sm-empty",
      );
      return;
    }
    list.forEach(function (build, index) {
      var card = $.CreatePanel("Panel", cards, "");
      card.AddClass("sm-card");
      label(
        card,
        [
          tr("СТАБИЛЬНЫЙ ВЫБОР", "STEADY PICK"),
          tr("АЛЬТЕРНАТИВА", "ALTERNATIVE"),
          tr("ЕЩЁ ВАРИАНТ", "ANOTHER OPTION"),
        ][index],
        "sm-card-author",
      );
      label(card, build.name, "sm-card-name");
      var date = new Date(build.updated * 1000).toISOString().slice(0, 10);
      label(
        card,
        "#" +
          build.id +
          "  ·  " +
          date +
          (build.stale
            ? tr("  ·  УСТАРЕЛА", "  ·  STALE")
            : build.prePatch
              ? tr("  ·  ДО ПАТЧА", "  ·  PRE-PATCH")
              : ""),
        "sm-card-meta",
      );
      label(
        card,
        build.stats
          ? ((100 * build.stats.wins) / build.stats.matches).toFixed(1) +
              "%  /  " +
              build.stats.matches +
              tr(" матчей", " games")
          : tr("Мало матчей после патча", "Low post-patch sample"),
        "sm-card-meta",
      );
      button(card, tr("Найти сборку", "Find build") + "  →", function () {
        var search = ctx.FindChildTraverse("SearchTextEntry");
        if (!search) {
          note.text =
            tr(
              "Поле поиска игры недоступно. Введите ID вручную: ",
              "Game search unavailable. Enter ID manually: ",
            ) + build.id;
          return;
        }
        search.text = String(build.id);
        try {
          // Invoke the existing XML handlers rather than guessing native event signatures.
          var publicTabs = ctx.FindChildrenWithClassTraverse("PublicBuilds");
          if (publicTabs.length)
            $.DispatchEvent("Activated", publicTabs[0], "mouse");
          $.DispatchEvent("Activated", search, "keyboard");
          note.text =
            tr(
              "Проверьте ID и автора в результатах, затем нажмите «Использовать»: #",
              "Check ID and author in the results, then press Use Build: #",
            ) + build.id;
        } catch (e) {
          note.text =
            tr(
              "ID подставлен. Нажмите обновление в штатном поиске: #",
              "ID entered. Press refresh in the native search: #",
            ) + build.id;
        }
      });
    });
  }
  rankPicker.SetPanelEvent("oninputsubmit", render);
  picker.SetPanelEvent("oninputsubmit", function () {
    var h = picker.GetSelected();
    if (h)
      rankPicker.SetSelected(
        "sm-rank-" + (rememberedRanks[h.GetAttributeInt("hero-id", 0)] || 0),
      );
    render();
  });
  picker.SetSelected("sm-hero-" + data.heroes[0].id);
  render();
})();
