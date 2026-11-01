(function () {
  var situations = {
    heal: {
      name: "Враг много лечится",
      item: "Healbane",
      why: "Духовный урон накладывает снижение входящего лечения. Это помогает довести цель до убийства, вместо того чтобы бесконечно пробивать восстановленное здоровье.",
      when: "Нужно регулярно наносить цели духовный урон. Само наличие лечения у героя ещё не означает, что оно решает текущую драку.",
    },
    control: {
      name: "Меня ловят контролем",
      item: "Reactive Barrier",
      why: "Барьер срабатывает при указанных в описании видах контроля и даёт запас на переживание нападения.",
      when: "Это защита после срабатывания контроля, а не иммунитет и не снятие оглушения.",
    },
    bullets: {
      name: "Умираю от стрельбы",
      item: "Metal Skin",
      why: "Активная невосприимчивость к пулям даёт короткое окно пережить фокус и уйти за укрытие.",
      when: "Применяй вовремя. Не защищает от духовного урона и не заменяет позиционирование.",
    },
    spirit: {
      name: "Умираю от способностей",
      item: "Spirit Resilience",
      why: "Духовная защита помогает переживать соответствующий урон; дополнительное сопротивление этого предмета действует ниже половины здоровья.",
      when: "Сверь тип урона в отчёте о смерти. Сопротивление духу не является универсальной защитой от оружия.",
    },
    escape: {
      name: "Враг постоянно убегает",
      item: "Slowing Hex",
      why: "Замедление и запрет способностей/предметов передвижения помогают удержать цель для следующего попадания или союзного контроля.",
      when: "Не отключает использование выносливости. Не трать активный предмет, если команда не может продолжить атаку.",
    },
    flight: {
      name: "Не достаю воздушную цель",
      item: "Knockdown",
      why: "Отложенное оглушение позволяет подготовить продолжение атаки; против воздушной цели длительность оглушения увеличена.",
      when: "Срабатывание не мгновенное: учитывай задержку в 2 секунды и способы защиты противника.",
    },
  };
  var watch = {
    Abrams:
      "У Abrams есть восстановление здоровья. Если оно мешает добивать, проверь антихил; одного имени героя недостаточно для обязательной покупки.",
    Shiv: "У Shiv выживаемость зависит не только от лечения. Не считай антихил полным отключением его защиты.",
    Infernus:
      "Проверь в отчёте урон от горения и лечение. Защита от пуль не закрывает духовный урон.",
    Haze: "Если главный источник урона — пули, своевременный Metal Skin может дать окно выживания. Сверь текущий тип урона.",
    Vindicta:
      "Если цель долго держится в воздухе, обдумай Knockdown и подготовь продолжение после задержки.",
    "Grey Talon":
      "Воздушная цель и духовные способности требуют разных ответов: проверь, что именно мешает в этой игре.",
    Bebop:
      "Против притягивания важны дистанция и укрытия. Reactive Barrier может помочь пережить соответствующий контроль, но не отменяет сам захват.",
    Lash: "Разнесённая позиция команды уменьшает ценность группового контроля. Предмет не заменяет рассредоточение.",
  };
  function catalog(data, heroId, rank, source, query) {
    var evidence = {};
    (((data.meta || {})[heroId] || {})[rank] || []).forEach(function (b) {
      evidence[b.id] = b.stats;
    });
    var q = String(query || "").toLowerCase();
    return (data.builds || data.catalog || [])
      .filter(function (b) {
        return (
          b.heroId === heroId &&
          (source !== "pro" || b.pro) &&
          (!q ||
            (b.name + " " + b.author + " " + b.id).toLowerCase().indexOf(q) >=
              0)
        );
      })
      .map(function (b) {
        var copy = {};
        Object.keys(b).forEach(function (k) {
          copy[k] = b[k];
        });
        copy.stats = evidence[b.id] || null;
        return copy;
      })
      .sort(function (a, b) {
        return (
          Number(!!b.stats) - Number(!!a.stats) ||
          Number(a.stale) - Number(b.stale) ||
          b.updated - a.updated ||
          a.id - b.id
        );
      });
  }
  function plan(data, build, state) {
    state = state || {};
    var inventory = state.purchased || [],
      enemies = state.enemies || [],
      threats = state.threats || [];
    var owned = {};
    inventory.forEach(function (id) {
      owned[id] = true;
    });
    var byId = {},
      byName = {};
    (data.items || []).forEach(function (i) {
      byId[i.id] = i;
      byName[i.name] = i;
    });
    var base = [],
      seen = {};
    ((build || {}).categories || []).forEach(function (c) {
      (c.items || []).forEach(function (ref) {
        if (!seen[ref.id] && !owned[ref.id] && byId[ref.id]) {
          seen[ref.id] = true;
          base.push({
            item: byId[ref.id],
            optional: !!c.optional,
            note: ref.note || "",
            group: c.name,
          });
        }
      });
    });
    var required = base.filter(function (r) {
      return !r.optional;
    });
    var first = required[0];
    var warnings = [];
    if (state.advantage === "behind")
      warnings.push(
        "При отставании сначала сократи число смертей и покупай доступные промежуточные усиления. Дорогая защита, на которую долго копишь без эффекта, тоже может ухудшить положение.",
      );
    if (state.advantage === "ahead")
      warnings.push(
        "Преимущество — повод закрепить доступ к объектам и безопасному фарму. Не меняй рабочую сборку целиком ради ещё одного предмета на урон.",
      );
    if (state.lane === "lost")
      warnings.push(
        "Проигранная линия не означает, что проиграна вся карта. Восстанови безопасный доход, не возвращайся в тот же невыгодный размен ради компенсации.",
      );
    if (state.lane === "won")
      warnings.push(
        "Выигранная линия даёт окно закрепить объект или помочь соседу. Перед уходом проверь волну, безопасный маршрут и доступность своей цели.",
      );
    var candidates = required.slice(0, 8).map(function (r, index) {
      var cost = r.item.cost || 0;
      var affordable = Number.isFinite(state.budget)
        ? cost <= state.budget
        : null;
      var reason =
        index === 0
          ? "Следующий некупленный обязательный шаг выбранной сборки."
          : "Более поздний шаг сборки: оцени его после ближайшей покупки.";
      if (r.item.effect) reason += " Эффект по описанию игры: " + r.item.effect;
      var last = byId[inventory[inventory.length - 1]];
      if (last && (r.item.components || []).indexOf(last.id) >= 0)
        reason +=
          " " +
          last.name +
          " входит в рецепт: это развитие уже купленного компонента. Проверь доплату и условия применения в магазине.";
      else if (
        last &&
        (last.roles || []).some(function (role) {
          return (r.item.roles || []).indexOf(role) >= 0;
        })
      )
        reason +=
          " Вместе с " +
          last.name +
          " усиливает уже выбранное направление. Это не доказательство оптимального порядка: проверь, не важнее ли сейчас закрыть слабое место.";
      if ((r.item.roles || []).indexOf("spirit") >= 0)
        reason +=
          " Сила духа полезна там, где у способности есть соответствующее масштабирование; она не усиливает одинаково все действия героя.";
      if ((r.item.roles || []).indexOf("weapon") >= 0)
        reason +=
          " Бонус оружию ценен, если ты можешь удерживать дистанцию и попадать; дополнительный урон не решит проблему постоянных смертей.";
      if (r.note) reason += " Авторская заметка: " + r.note;
      else
        reason +=
          " Автор не объяснил именно эту связку; порядок не является единственным вариантом.";
      return {
        id: r.item.id,
        name: r.item.name,
        cost: cost,
        kind: "build",
        score: 100 - index * 5,
        why: reason,
        when: "Проверь, что выбранная сборка подходит твоему стилю и текущему патчу.",
        tradeoff:
          "Покупка ситуативного ответа может отложить этот шаг, но иногда позволяет дожить до следующей драки.",
        affordable: affordable,
      };
    });
    threats.forEach(function (key) {
      var rule = situations[key],
        item = rule && byName[rule.item];
      if (!item || owned[item.id]) return;
      var cost = item.cost || 0;
      candidates = candidates.filter(function (r) {
        return r.id !== item.id;
      });
      candidates.push({
        id: item.id,
        name: item.name,
        cost: cost,
        kind: "situation",
        score: state.advantage === "behind" ? 145 : 125,
        why: rule.why,
        when: rule.when,
        tradeoff: first
          ? "Отложит " +
            first.item.name +
            ". Бери ответ, если указанная проблема действительно важнее следующего усиления сборки."
          : "Это ситуативный ответ, а не обязательное завершение сборки.",
        affordable: Number.isFinite(state.budget) ? cost <= state.budget : null,
      });
    });
    candidates.forEach(function (r) {
      var item = byId[r.id];
      if (
        r.kind === "build" &&
        (state.advantage === "behind" || state.lane === "lost") &&
        r.cost <= 1600 &&
        ((item.roles || []).indexOf("health") >= 0 ||
          (item.roles || []).indexOf("mobility") >= 0)
      ) {
        r.score += 30;
        r.why +=
          " В указанном отставании доступный запас здоровья или подвижность поднят выше в учебном плане, чтобы уменьшить риск следующей смерти.";
      }
      if (r.affordable === false) {
        r.score -= 60;
        r.when +=
          " Полная стоимость выше указанного бюджета; проверь доплату и компоненты в магазине.";
      }
    });
    candidates.sort(function (a, b) {
      return b.score - a.score || a.cost - b.cost;
    });
    return {
      recommendations: candidates.slice(0, 8),
      warnings: warnings,
      watch: enemies.map(function (name) {
        return (
          watch[name] ||
          name +
            ": конкретный контрпредмет зависит от сборки и наблюдаемой угрозы, а не только от выбора героя."
        );
      }),
      mode: "manual",
      optional: base
        .filter(function (r) {
          return r.optional;
        })
        .map(function (r) {
          return {
            id: r.item.id,
            name: r.item.name,
            note:
              r.note ||
              "Автор пометил предмет ситуативным. Условия в сборке не описаны — обязательную покупку из этого не делаем.",
          };
        }),
    };
  }
  var api = { catalog: catalog, plan: plan, situations: situations };
  if (typeof $ !== "undefined") $.ShopmarkCoach = api;
  if (typeof globalThis !== "undefined") globalThis.ShopmarkCoach = api;
})();
