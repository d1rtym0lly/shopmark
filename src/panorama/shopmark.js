(function () {
  var ctx = $.GetContextPanel(),
    data = $.ShopmarkData,
    coach = $.ShopmarkCoach;
  if (!data || !coach || ctx.FindChildTraverse("ShopmarkHeader")) return;
  var host = ctx.FindChildTraverse("ShopmarkMount");
  if (!host) return;
  var page = 0,
    source = "all",
    view = "builds",
    selected = null,
    states = {},
    ranks = {};
  function label(parent, text, cls) {
    var p = $.CreatePanel("Label", parent, "");
    p.text = text;
    p.html = false;
    if (cls) p.AddClass(cls);
    return p;
  }
  function button(parent, text, fn) {
    var p = $.CreatePanel("Button", parent, "");
    p.AddClass("sm-button");
    label(p, text);
    p.SetPanelEvent("onactivate", fn);
    return p;
  }
  function panel(parent, cls) {
    var p = $.CreatePanel("Panel", parent, "");
    p.AddClass(cls);
    return p;
  }
  function select(parent, id, options, value, change) {
    var d = $.CreatePanel("DropDown", parent, id);
    d.AddClass("sm-picker");
    options.forEach(function (o) {
      var l = $.CreatePanel("Label", d, id + "-" + o[0]);
      l.text = o[1];
      l.SetAttributeString("value", String(o[0]));
      d.AddOption(l);
    });
    d.SetSelected(id + "-" + value);
    d.SetPanelEvent("oninputsubmit", function () {
      var s = d.GetSelected();
      if (s) change(s.GetAttributeString("value", ""));
    });
    return d;
  }
  function value(d) {
    var v = d.GetSelected();
    return v ? v.GetAttributeString("value", "0") : "0";
  }
  var header = $.CreatePanel("Panel", host, "ShopmarkHeader");
  header.AddClass("sm-header");
  label(header, "SHOPMARK / COACH", "sm-wordmark");
  label(
    header,
    "Патч " + (data.patch ? data.patch.date.slice(0, 10) : "не проверен"),
    "sm-patch-date",
  );
  var controls = panel(host, "sm-controls");
  label(controls, "Герой", "sm-control-label");
  var hero = select(
    controls,
    "sm-hero",
    data.heroes.map(function (h) {
      return [h.id, h.name];
    }),
    data.heroes[0].id,
    function () {
      page = 0;
      rank.SetSelected("sm-rank-" + (ranks[value(hero)] || 0));
      selected = null;
      render();
    },
  );
  label(controls, "Ранг матчей", "sm-control-label");
  var rank = select(
    controls,
    "sm-rank",
    [[0, "Все ранги"]].concat(
      data.ranks.map(function (r) {
        return [r.id, r.name];
      }),
    ),
    0,
    function (v) {
      ranks[value(hero)] = Number(v);
      page = 0;
      render();
    },
  );
  var bar = panel(host, "sm-controls");
  var filter = button(bar, "Все сборки", function () {
    source = source === "all" ? "pro" : "all";
    filter.GetChild(0).text =
      source === "all" ? "Все сборки" : "Известные авторы";
    page = 0;
    view = "builds";
    render();
  });
  var search = $.CreatePanel("TextEntry", bar, "ShopmarkBuildSearch");
  search.AddClass("sm-picker");
  search.SetAttributeString("placeholder", "Название / автор / ID");
  search.SetPanelEvent("ontextentrychange", function () {
    page = 0;
    render();
  });
  button(bar, "←", function () {
    page = Math.max(0, page - 1);
    view = "builds";
    render();
  });
  var count = label(bar, "", "sm-control-label");
  button(bar, "→", function () {
    page++;
    view = "builds";
    render();
  });
  button(bar, "Помощник", function () {
    view = view === "coach" ? "builds" : "coach";
    render();
  });
  button(bar, "Патчи", function () {
    view = view === "patches" ? "builds" : "patches";
    render();
  });
  var note = label(
    host,
    "Выбери того же героя, что в игре. «Найти» передаёт ID штатному поиску, «Разобрать» открывает объяснения.",
    "sm-help",
  );
  var cards = panel(host, "sm-cards");
  var legend = panel(host, "sm-legend");
  [
    ["↑", "усилили", "buff"],
    ["↓", "ослабили", "nerf"],
    ["=", "без правок", "unchanged"],
    ["↕", "смешанное", "mixed"],
  ].forEach(function (a) {
    label(legend, a[0] + " " + a[1], "sm-legend-" + a[2]);
  });
  function scenario() {
    var id = value(hero);
    return (
      states[id] ||
      (states[id] = {
        purchased: [],
        enemies: [],
        threats: [],
        advantage: "even",
        lane: "even",
      })
    );
  }
  function find(build) {
    var entry = ctx.FindChildTraverse("SearchTextEntry");
    if (!entry) {
      note.text = "Введи ID в поиск игры: " + build.id;
      return;
    }
    entry.text = String(build.id);
    var tabs = ctx.FindChildrenWithClassTraverse("PublicBuilds");
    if (tabs.length) $.DispatchEvent("Activated", tabs[0], "mouse");
    $.DispatchEvent("Activated", entry, "keyboard");
    note.text =
      "Проверь ID #" + build.id + " и нажми штатную кнопку «Использовать».";
  }
  function render() {
    cards.RemoveAndDeleteChildren();
    cards.SetHasClass("sm-coach-view", view !== "builds");
    var id = Number(value(hero)),
      rankId = Number(value(rank)),
      all = coach.catalog(data, id, rankId, source, search.text || "");
    page = Math.min(page, Math.max(0, Math.ceil(all.length / 3) - 1));
    count.text =
      all.length +
      " сборок · " +
      (page + 1) +
      " / " +
      Math.max(1, Math.ceil(all.length / 3));
    if (!selected || selected.heroId !== id) selected = all[0] || null;
    if (view === "patches") {
      var feed = panel(cards, "sm-coach-feed");
      (data.recentPatches || []).forEach(function (p) {
        label(feed, p.date.slice(0, 10) + " / " + p.title, "sm-card-author");
        label(feed, p.excerpt, "sm-patch-excerpt");
      });
      var changes = panel(cards, "sm-coach-feed");
      (data.changes || []).forEach(function (i) {
        label(changes, i.name, "sm-card-author");
        label(changes, i.reason || i.notes.join(" / "), "sm-patch-excerpt");
      });
      return;
    }
    if (view === "coach") {
      renderCoach();
      return;
    }
    if (!all.length) {
      label(
        cards,
        "Сборки по этому фильтру не найдены. Сбрось поиск или выбери «Все сборки».",
        "sm-empty",
      );
      return;
    }
    all.slice(page * 3, page * 3 + 3).forEach(function (b) {
      var card = panel(cards, "sm-card");
      label(
        card,
        (b.pro ? "ИЗВЕСТНЫЙ АВТОР / " : "СООБЩЕСТВО / ") + b.author,
        "sm-card-author",
      );
      label(card, b.name, "sm-card-name");
      label(
        card,
        "#" +
          b.id +
          " · " +
          new Date(b.updated * 1000).toISOString().slice(0, 10) +
          (b.stale ? " · УСТАРЕЛА" : ""),
        "sm-card-meta",
      );
      label(
        card,
        b.stats
          ? ((100 * b.stats.wins) / b.stats.matches).toFixed(1) +
              "% / " +
              b.stats.matches +
              " матчей"
          : "Для выбранного ранга нет подтверждённой выборки",
        "sm-card-meta",
      );
      button(card, "Разобрать сборку", function () {
        selected = b;
        view = "coach";
        render();
      });
      button(card, "Найти в игре →", function () {
        find(b);
      });
      button(card, "Для автопомощника", function () {
        var hud = ctx;
        for (var n = 0; hud && hud.id !== 'Hud' && n < 40; n++) hud = hud.GetParent();
        if (!hud || hud.id !== 'Hud') { note.text = 'Открой сборки из магазина в матче.'; return; }
        hud.SetAttributeInt('shopmark_build', b.id);
        hud.SetAttributeInt('shopmark_rank', rankId);
        note.text = 'Автопомощник использует «' + b.name + '». Включи его переключателем в магазине.';
      });
    });
  }
  function renderCoach() {
    var st = scenario(),
      left = panel(cards, "sm-coach-feed"),
      right = panel(cards, "sm-coach-feed");
    label(left, "СЦЕНАРИЙ ЗАДАН ВАМИ", "sm-card-author");
    label(
      left,
      "Автосбор состояния матча не подключён. Совет меняется по указанным ниже данным.",
      "sm-help",
    );
    label(
      left,
      selected ? selected.name : "Нет выбранной сборки",
      "sm-card-name",
    );
    select(
      left,
      "sm-adv",
      [
        ["even", "Силы равны"],
        ["ahead", "Есть преимущество"],
        ["behind", "Отстаю"],
      ],
      st.advantage,
      function (v) {
        st.advantage = v;
        render();
      },
    );
    select(
      left,
      "sm-lane",
      [
        ["even", "Линия ровная"],
        ["won", "Выиграл линию"],
        ["lost", "Проиграл линию"],
      ],
      st.lane,
      function (v) {
        st.lane = v;
        render();
      },
    );
    var budget = $.CreatePanel("TextEntry", left, "sm-budget");
    budget.AddClass("sm-picker");
    budget.text = typeof st.budget === "number" ? String(st.budget) : "";
    button(left, "Учесть бюджет (souls)", function () {
      var n = Number(budget.text);
      st.budget = budget.text !== "" && isFinite(n) && n >= 0 ? n : undefined;
      render();
    });
    Object.keys(coach.situations).forEach(function (key) {
      button(
        left,
        (st.threats.indexOf(key) >= 0 ? "✓ " : "+ ") +
          coach.situations[key].name,
        function () {
          var i = st.threats.indexOf(key);
          if (i >= 0) st.threats.splice(i, 1);
          else st.threats.push(key);
          render();
        },
      );
    });
    var enemy = select(
      left,
      "sm-enemy",
      data.heroes.map(function (h) {
        return [h.id, h.name];
      }),
      data.heroes[0].id,
      function () {},
    );
    button(left, "Добавить врага", function () {
      var id = Number(value(enemy)),
        h = data.heroes.filter(function (h) {
          return h.id === id;
        })[0];
      if (h && st.enemies.indexOf(h.name) < 0 && st.enemies.length < 6)
        st.enemies.push(h.name);
      render();
    });
    label(left, "Враги: " + (st.enemies.join(", ") || "не указаны"), "sm-help");
    button(left, "Сбросить сценарий", function () {
      delete states[value(hero)];
      render();
    });
    var result = coach.plan(data, selected, st);
    result.warnings.concat(result.watch).forEach(function (s) {
      label(right, s, "sm-patch-excerpt");
    });
    result.recommendations.forEach(function (r, index) {
      label(
        right,
        index + 1 + ". " + r.name + " · " + r.cost + " souls",
        "sm-card-author",
      );
      label(right, r.why, "sm-patch-excerpt");
      label(right, "Когда: " + r.when, "sm-patch-excerpt");
      label(right, r.tradeoff, "sm-help");
      button(right, "Отметить купленным", function () {
        st.purchased.push(r.id);
        render();
      });
    });
    result.optional.forEach(function (r) {
      label(
        right,
        "По ситуации: " + r.name + " — " + r.note,
        "sm-patch-excerpt",
      );
    });
    label(
      right,
      "Отмечено покупок: " +
        st.purchased.length +
        ". Кнопки не покупают и не переставляют предметы в самой игре.",
      "sm-help",
    );
  }
  render();
})();
