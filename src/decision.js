// Independent mechanics planner. No build IDs, author text or catalogue order.
// Knowledge records must be reviewed against game data before being enabled.
(function () {
  'use strict';
  function plan(data, state, knowledge, previous) {
    var own = knowledge.heroes[state.heroId];
    if (!own || !own.verified) return {status:'waiting', reason:'Нет проверенного профиля механик героя', recommendations:[]};
    var items = {}, held = {}, fulfilled = {}, ownedEffects = {}, ownedCounters = {}, warnings = [];
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
      if (rule && rule.verified) Object.keys(rule.counters || {}).forEach(function (key) { ownedCounters[key]=(ownedCounters[key]||0)+rule.counters[key]; });
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
    var labels={weapon:'урон оружия',spirit:'сила духа',health:'запас здоровья',sustain:'восстановление',mobility:'подвижность',
      melee:'ближний бой',farm:'зачистка волн',cooldown:'перезарядка способностей',duration:'длительность',range:'дальность',charges:'заряды',
      bullets:'пули',healing:'лечение',control:'контроль',flight:'полёт',channel:'поддерживаемые способности',escape:'уход из боя',
      bulletDefense:'сопротивление пулям',spiritDefense:'сопротивление духу',controlDefense:'защита от контроля',weaponSustain:'лечение от стрельбы',spiritSustain:'лечение от духовного урона'};
    var richestRatio=1;
    (state.enemies||[]).forEach(function(e){if(Number.isFinite(state.ownSouls)&&state.ownSouls>0&&Number.isFinite(e.souls))richestRatio=Math.max(richestRatio,e.souls/state.ownSouls);});
    var unreviewed = [], candidates = [];
    data.items.forEach(function (item) {
      if (fulfilled[item.id] || (state.availableItems && state.availableItems.indexOf(item.id) < 0)) return;
      var rule = knowledge.items[item.id];
      if (!rule || !rule.verified || !rule.source) {unreviewed.push(item.id);return;}
      if ((rule.requires || []).some(function (c) {return (own.capabilities || []).indexOf(c) < 0;})) return;
      var benefit = 0, answers = [], benefits=[];
      Object.keys(rule.effects || {}).forEach(function (key) {
        var value=rule.effects[key] * ((own.benefits || {})[key] || 0) / (1 + (ownedEffects[key] || 0));
        if(richestRatio>1.12 && (key==='farm'||key==='sustain'||key==='health'))value*=key==='farm'?1.5:1.2;
        benefit += value;if(value>0.3)benefits.push({key:key,value:value});
      });
      Object.keys(rule.counters || {}).forEach(function (key) {
        // One answered threat must not fill the plan with redundant counters.
        var value = rule.counters[key] * Math.min(3,threats[key] || 0) / (1 + 4*(ownedCounters[key] || 0));
        if(Number.isFinite(state.ownSouls)&&state.ownSouls<3200)value*=0.2;
        benefit += value;
        if (value > 0) answers.push(key);
      });
      if (benefit <= 0) return;
      var credited = {};
      var cost = Math.max(0, item.cost - (item.components || []).reduce(function (sum, id) {return sum + credit(id, credited);}, 0));
      // A horizon penalizes long saving, without making every cheap purchase
      // preferable to finishing a useful upgrade. No claim of optimal play.
      var gap = Number.isFinite(state.budget) ? Math.max(0, cost - state.budget) : 0;
      benefits.sort(function(a,b){return b.value-a.value;});
      var target=evidence.filter(function(e){return answers.indexOf(e.mechanic)>=0;}).sort(function(a,b){return b.weight-a.weight;})[0];
      var targetName=target&&((data.heroes||[]).filter(function(h){return h.id===target.heroId;})[0]||{}).name;
      var short=target?'Ответ на '+(labels[target.mechanic]||target.mechanic)+' у '+(targetName||target.heroId):
        'Для твоего героя: '+benefits.slice(0,2).map(function(b){return labels[b.key]||b.key;}).join(', ');
      if((item.components||[]).some(function(id){return held[id];}))short='Улучшение купленного компонента. '+short;
      var economic='';
      if(target){var opponent=(state.enemies||[]).filter(function(e){return e.heroId===target.heroId;})[0];
        if(opponent&&Number.isFinite(opponent.souls)&&Number.isFinite(state.ownSouls))economic=' Разница душ с этим соперником: '+(state.ownSouls-opponent.souls)+'.';}
      candidates.push({id:item.id, name:item.name, cost:cost, score:benefit / Math.sqrt(Math.max(400, cost)) / (1 + gap / 3200),
        affordable:Number.isFinite(state.budget) ? gap === 0 : null, answers:answers,
        shortWhy:short,kind:answers.length?'situation':'mechanics',why:short+'.'+economic+' '+rule.explanation,
        when:(rule.conditions||[]).join(' '),tradeoff:gap>0?'Нужно накопить ещё '+gap+' душ; сравни с ближайшим доступным усилением.':'Эта покупка откладывает другие усиления; при изменении угроз очередь пересчитается.',
        conditions:rule.conditions || [], source:rule.source,partial:!!rule.partial});
    });
    candidates.sort(function (a,b) {return b.score-a.score || a.id-b.id;});
    var prior=(previous||[])[0], incumbent=candidates.filter(function(c){return c.id===prior;})[0];
    if(incumbent&&candidates[0]&&incumbent.score>=candidates[0].score*0.9)candidates=[incumbent].concat(candidates.filter(function(c){return c!==incumbent;}));
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
