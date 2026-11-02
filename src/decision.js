// Independent mechanics planner. No build IDs, author text or catalogue order.
// Knowledge records must be reviewed against game data before being enabled.
(function () {
  'use strict';
  function plan(data, state, knowledge, previous) {
    var own = knowledge.heroes[state.heroId];
    if (!own || !own.verified) return {status:'waiting', reason:'Нет проверенного профиля механик героя', recommendations:[]};
    var items = {}, held = {}, fulfilled = {}, ownedEffects = {}, warnings = [];
    data.items.forEach(function (item) { items[item.id] = item; });
    function fulfill(id) {
      if (fulfilled[id]) return;
      fulfilled[id] = true;
      ((items[id] || {}).components || []).forEach(fulfill);
    }
    (state.purchased || []).forEach(function (id) {
      held[id] = true; fulfill(id);
      var rule = knowledge.items[id];
      if (rule && rule.verified) Object.keys(rule.effects || {}).forEach(function (key) {
        ownedEffects[key] = (ownedEffects[key] || 0) + rule.effects[key];
      });
    });
    function credit(id, seen) {
      if (seen[id] || !items[id]) return 0;
      seen[id] = true;
      return held[id] ? items[id].cost : (items[id].components || []).reduce(function (sum, c) {return sum + credit(c, seen);}, 0);
    }
    var threats = {}, evidence = [], personal = [];
    (state.enemies || []).forEach(function (enemy) {
      var profile = knowledge.heroes[enemy.heroId];
      var knownWorth = Number.isFinite(state.ownSouls) && state.ownSouls > 0 && Number.isFinite(enemy.souls);
      var ratio = knownWorth ? enemy.souls / state.ownSouls : 1;
      personal.push({heroId:enemy.heroId, delta:knownWorth ? state.ownSouls - enemy.souls : null});
      if (!profile || !profile.verified) { warnings.push('Не проверены механики героя ' + enemy.heroId); return; }
      // Wealth changes priority; it does not prove damage type or a won fight.
      var weight = Math.max(0.5, Math.min(2, ratio)) * (enemy.sameLane ? 1.25 : 1);
      Object.keys(profile.threats || {}).forEach(function (key) {
        threats[key] = (threats[key] || 0) + profile.threats[key] * weight;
        evidence.push({heroId:enemy.heroId, mechanic:key, weight:profile.threats[key] * weight, inferred:true});
      });
      (enemy.purchased || []).forEach(function (id) {
        var rule = knowledge.items[id];
        if (!rule || !rule.verified) return;
        Object.keys(rule.threats || {}).forEach(function (key) {
          threats[key] = (threats[key] || 0) + rule.threats[key] * weight;
          evidence.push({heroId:enemy.heroId, itemId:id, mechanic:key, weight:rule.threats[key] * weight, inferred:false});
        });
      });
    });
    var unreviewed = [], candidates = [];
    data.items.forEach(function (item) {
      if (fulfilled[item.id] || (state.availableItems && state.availableItems.indexOf(item.id) < 0)) return;
      var rule = knowledge.items[item.id];
      if (!rule || !rule.verified || !rule.source) {unreviewed.push(item.id);return;}
      if ((rule.requires || []).some(function (c) {return (own.capabilities || []).indexOf(c) < 0;})) return;
      var benefit = 0, answers = [];
      Object.keys(rule.effects || {}).forEach(function (key) {
        benefit += rule.effects[key] * ((own.benefits || {})[key] || 0) / (1 + (ownedEffects[key] || 0));
      });
      Object.keys(rule.counters || {}).forEach(function (key) {
        var value = rule.counters[key] * (threats[key] || 0) / (1 + (ownedEffects[key] || 0));
        benefit += value;
        if (value > 0) answers.push(key);
      });
      if (benefit <= 0) return;
      var credited = {};
      var cost = Math.max(0, item.cost - (item.components || []).reduce(function (sum, id) {return sum + credit(id, credited);}, 0));
      // A horizon penalizes long saving, without making every cheap purchase
      // preferable to finishing a useful upgrade. No claim of optimal play.
      var gap = Number.isFinite(state.budget) ? Math.max(0, cost - state.budget) : 0;
      candidates.push({id:item.id, name:item.name, cost:cost, score:benefit / Math.sqrt(Math.max(400, cost)) / (1 + gap / 3200),
        affordable:Number.isFinite(state.budget) ? gap === 0 : null, answers:answers,
        why:rule.explanation, conditions:rule.conditions || [], source:rule.source});
    });
    candidates.sort(function (a,b) {return b.score-a.score || a.id-b.id;});
    var next = candidates.slice(0,8), ids = next.map(function (r) {return r.id;}), old = previous || [];
    return {status:'planned', recommendations:next, personalEconomy:personal, evidence:evidence,
      coverage:{unreviewedItems:unreviewed}, warnings:warnings,
      added:ids.filter(function (id) {return old.indexOf(id)<0;}),
      removed:old.filter(function (id) {return ids.indexOf(id)<0;})};
  }
  var api = {plan:plan};
  if (typeof $ !== 'undefined') $.ShopmarkDecision = api;
  if (typeof globalThis !== 'undefined') globalThis.ShopmarkDecision = api;
})();
