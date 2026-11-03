// Mechanics and ranked purchase timing. No build IDs, author text or catalogue order.
// Knowledge records must be reviewed against game data before being enabled.
(function () {
  'use strict';
  function purchaseEvidence(profile, id, state, held) {
    var best=null;
    var stage=state.seconds<540?0:state.seconds<1200?1:state.seconds<1800?2:3;
    var wealth=state.projectedWealth;
    (profile.items[id]||[]).forEach(function(row, column){
      if(!row)return;
      var distance=Math.abs(column-stage);
      var timing=distance===0?1:distance===1?0.6:0.25;
      var saving=wealth>0?Math.max(0,row[1]-wealth)/Math.max(3000,wealth):0;
      var weight=row[0]/1000*timing/(1+saving);
      if(!best||weight>best.weight)best={weight:weight,share:row[0]/1000,delta:row[2]/1000};
    });
    if(best){
      best.lift=0;
      Object.keys(held).forEach(function(from){
        best.lift=Math.max(best.lift,((profile.following||{})[from]||{})[id]||0);
      });
    }
    return best;
  }
  function score(data, state, knowledge, previous, context) {
    var own = knowledge.heroes[state.heroId];
    if (!own || !own.verified) return {status:'waiting', reason:'Нет проверенного профиля механик героя', recommendations:[]};
    var conditions=typeof $!=='undefined'?$.ShopmarkConditions:globalThis.ShopmarkConditions;
    if(knowledge.version>=2&&!conditions)return {status:'waiting',reason:'Не загружен модуль условных эффектов',recommendations:[]};
    function vectors(rule){
      if(context.vectors.has(rule))return context.vectors.get(rule);
      var extra=conditions?conditions.aggregate(rule,state,own):{effects:{},counters:{},penalties:{},evidence:[]};
      var effects={},counters={};
      Object.keys(rule.effects||{}).forEach(function(k){effects[k]=rule.effects[k];});
      Object.keys(extra.effects).forEach(function(k){effects[k]=(effects[k]||0)+extra.effects[k];});
      Object.keys(rule.counters||{}).forEach(function(k){counters[k]=rule.counters[k];});
      Object.keys(extra.counters).forEach(function(k){counters[k]=Math.max(counters[k]||0,extra.counters[k]);});
      var result={effects:effects,counters:counters,penalties:extra.penalties,evidence:extra.evidence};
      context.vectors.set(rule,result);return result;
    }
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
      if(rule&&rule.verified){var v=vectors(rule);
        Object.keys(v.effects).forEach(function(key){ownedEffects[key]=(ownedEffects[key]||0)+v.effects[key];});
        Object.keys(v.counters).forEach(function(key){ownedCounters[key]=(ownedCounters[key]||0)+v.counters[key];});}
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
      bulletDefense:'сопротивление пулям',spiritDefense:'сопротивление духу',controlDefense:'защита от контроля',weaponSustain:'лечение от стрельбы',spiritSustain:'лечение от духовного урона',
      barrier:'барьер',recovery:'восстановление после возрождения',weaponUtility:'удобство стрельбы',weaponAmp:'усиление урона оружия',spiritAmp:'усиление духовного урона'};
    var richestRatio=1;
    (state.enemies||[]).forEach(function(e){if(Number.isFinite(state.ownSouls)&&state.ownSouls>0&&Number.isFinite(e.souls))richestRatio=Math.max(richestRatio,e.souls/state.ownSouls);});
    var unreviewed = [], candidates = [];
    data.items.forEach(function (item) {
      if (fulfilled[item.id] || (state.availableItems && state.availableItems.indexOf(item.id) < 0)) return;
      var tier=item.tier;
      if(context.progression&&(!tier||tier<state.minTier||tier>state.maxTier))return;
      var rule = knowledge.items[item.id];
      if (!rule || !rule.verified || !rule.source) {unreviewed.push(item.id);return;}
      if ((rule.requires || []).some(function (c) {return (own.capabilities || []).indexOf(c) < 0;})) return;
      var v=vectors(rule);
      var benefit = 0, counterBenefit=0, answers = [], benefits=[];
      Object.keys(v.effects).forEach(function (key) {
        var value=v.effects[key] * ((own.benefits || {})[key] || 0) / (1 + (ownedEffects[key] || 0));
        if(richestRatio>1.12 && (key==='farm'||key==='sustain'||key==='health'))value*=key==='farm'?1.5:1.2;
        benefit += value;if(value>0.3)benefits.push({key:key,value:value});
      });
      Object.keys(v.counters).forEach(function (key) {
        // One answered threat must not fill the plan with redundant counters.
        var value = v.counters[key] * Math.min(3,threats[key] || 0) / (1 + 4*(ownedCounters[key] || 0));
        if(Number.isFinite(state.ownSouls)&&state.ownSouls<3200)value*=0.2;
        benefit += value;counterBenefit+=value;
        if (value > 0) answers.push(key);
      });
      Object.keys(v.penalties).forEach(function(key){benefit-=v.penalties[key]*((own.benefits||{})[key]||0.5);});
      if (benefit <= 0) return;
      var observed=context.flow&&purchaseEvidence(context.flow,item.id,state,held);
      var situational=counterBenefit>=1.4&&counterBenefit>=benefit*0.5;
      if(context.flow&&(!observed||observed.share<0.035)&&!situational)return;
      var credited = {};
      var cost = Math.max(0, item.cost - (item.components || []).reduce(function (sum, id) {return sum + credit(id, credited);}, 0));
      // A horizon penalizes long saving, without making every cheap purchase
      // preferable to finishing a useful upgrade. No claim of optimal play.
      var gap = Number.isFinite(state.budget) ? Math.max(0, cost - state.budget) : 0;
      benefits.sort(function(a,b){return b.value-a.value;});
      var target=(!context.progression||situational)&&evidence.filter(function(e){return answers.indexOf(e.mechanic)>=0;}).sort(function(a,b){return b.weight-a.weight;})[0];
      var targetName=target&&((data.heroes||[]).filter(function(h){return h.id===target.heroId;})[0]||{}).name;
      var short=target?'Ответ на '+(labels[target.mechanic]||target.mechanic)+' у '+(targetName||target.heroId):
        'Для твоего героя: '+benefits.slice(0,2).map(function(b){return labels[b.key]||b.key;}).join(', ');
      if(cost<item.cost)short=(state.projected?'Улучшение по плану. ':'Улучшение купленного компонента. ')+short;
      var economic='';
      if(target){var opponent=(state.enemies||[]).filter(function(e){return e.heroId===target.heroId;})[0];
        if(opponent&&Number.isFinite(opponent.souls)&&Number.isFinite(state.ownSouls))economic=' Разница душ с этим соперником: '+(state.ownSouls-opponent.souls)+'.';}
      var rating=benefit / Math.sqrt(Math.max(400, cost));
      if(observed){
        // Adjusted win rate is a tie-breaker. Frequency and timing supply the prior.
        rating=(0.35+observed.weight*3)*(0.85+Math.min(0.65,rating*10))*(1+Math.max(-0.08,Math.min(0.08,observed.delta))+observed.lift/2000);
      }else if(context.flow)rating=Math.min(1.35,rating*18);
      var stats=observed&&observed.share>=0.05?' В '+Math.round(observed.share*100)+'% матчей на этом герое с покупками на соответствующем этапе брали этот предмет.':'';
      candidates.push({id:item.id, name:item.name, cost:cost, fullCost:item.cost, tier:tier, score:rating / (1 + gap / 3200),
        affordable:Number.isFinite(state.budget) ? gap === 0 : null, answers:answers,
        shortWhy:short,kind:target?'situation':'mechanics',why:short+'.'+economic+' '+rule.explanation+stats,
        when:(rule.conditions||[]).concat(v.evidence.map(function(e){return e.label+': '+(e.state==='estimated'?'оценка вероятного применения':e.state==='observed'?'условие подтверждено':e.state==='inactive'?'сейчас не выполняется':'требует подходящего действия');})).join(' '),
        tradeoff:gap>0?'Нужно накопить ещё '+gap+' душ; сравни с ближайшим доступным усилением.':'Эта покупка откладывает другие усиления; при изменении угроз очередь пересчитается.',
        conditions:rule.conditions || [], conditionEvidence:v.evidence,source:rule.source,partial:!!rule.partial});
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
  function plan(data,state,knowledge,previous){
    var flow=(data.purchaseFlow||{})[state.heroId];
    var context={vectors:new Map(),progression:data.items.some(function(item){return item.tier>0;}),
      flow:flow&&flow.matches>=150&&Object.keys(flow.items).length?flow:null};
    var projected=(state.purchased||[]).slice(),next=[],byId={};
    data.items.forEach(function(i){byId[i.id]=i;});
    var minTier=projected.reduce(function(tier,id){return Math.max(tier,(byId[id]||{}).tier||1);},1);
    var seconds=Number.isFinite(state.seconds)?state.seconds:0;
    var wealth=Number.isFinite(state.ownSouls)?state.ownSouls:0;
    var perMinute=seconds>=180&&wealth>0?Math.min(2200,Math.max(550,wealth*60/seconds)):900;
    var wallet=Number.isFinite(state.budget)?state.budget:null, result;
    for(var step=0;step<8;step++){
      var floor=Math.max(minTier,wealth>=30000?4:wealth>=16000?3:wealth>=6500?2:1);
      var ceiling=Math.max(floor,wealth>=22000?4:wealth>=9500?3:wealth>=4000?2:1);
      if(floor<3&&ceiling>floor&&projected.filter(function(id){return (byId[id]||{}).tier===floor;}).length>=3)floor++;
      var r=score(data,Object.assign({},state,{purchased:projected,budget:wallet,seconds:seconds,
        minTier:floor,maxTier:ceiling,projectedWealth:wealth,projected:step>0}),knowledge,step===0?previous:[],context);
      if(step===0)result=r;
      if(r.status!=='planned')return r;
      if(!r.recommendations.length)break;
      var item=r.recommendations[0];item.projected=step>0;
      if(step>0){item.affordable=null;item.tradeoff='Цена после предыдущих шагов плана.';}
      next.push(item);
      minTier=Math.max(minTier,item.tier||1);
      var earned=Math.max(perMinute*0.5,item.cost-(wallet===null?0:wallet));
      wealth+=earned;
      seconds+=earned*60/perMinute;
      if(wallet!==null)wallet=Math.max(0,wallet+earned-item.cost);
      var consumed={};
      function consume(id){if(consumed[id])return;consumed[id]=true;((byId[id]||{}).components||[]).forEach(consume);}
      ((byId[item.id]||{}).components||[]).forEach(consume);
      projected=projected.filter(function(id){return !consumed[id];});projected.push(item.id);
    }
    var ids=next.map(function(i){return i.id;}),old=previous||[];
    result.recommendations=next;
    result.added=ids.filter(function(id){return old.indexOf(id)<0;});result.removed=old.filter(function(id){return ids.indexOf(id)<0;});
    return result;
  }
  var api = {plan:plan};
  if (typeof $ !== 'undefined') $.ShopmarkDecision = api;
  if (typeof globalThis !== 'undefined') globalThis.ShopmarkDecision = api;
})();
