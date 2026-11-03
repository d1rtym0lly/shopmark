(function(){
  'use strict';
  var capabilities={bullet_hit:'shoot',headshot:'shoot',firing:'shoot',reload:'shoot',melee_hit:'melee',spirit_hit:'spiritDamage',spirit_burst:'burstSpirit'};
  function evaluate(term,state,hero){
    var trigger=term.trigger,need=capabilities[trigger];
    if(need&&(hero.capabilities||[]).indexOf(need)<0)return {factor:0,state:'incompatible',label:term.label};
    if(trigger==='sacrifice_self')return {factor:state.allowSacrifice===true?1:0,state:'requires_intent',label:term.label};
    var observed=state.observations||{},value=observed[trigger];
    if(trigger==='health_above'||trigger==='health_below'){
      if(Number.isFinite(state.healthPercent))value=trigger==='health_above'?state.healthPercent>term.threshold:state.healthPercent<term.threshold;
    }
    if(typeof value==='boolean')return {factor:value?1:0,state:value?'observed':'inactive',label:term.label};
    // Forecast utility while the trigger is not observed. Explicitly labelled
    // as an estimate; never claim a headshot, parry or control event occurred.
    var expected={headshot:0.3,parry:0.2,health_below:0.3,health_above:0.6,enemy_health_above:0.5,kill:0.25,
      delayed_growth:0.3,lethal_damage:0.2,sliding:0.25,veil:0.4,ambush:0.4,ultimate:0.4,sacrifice_npc:0.4};
    return {factor:expected[trigger]===undefined?0.5:expected[trigger],state:'estimated',label:term.label+(term.threshold==null?'':' ('+term.threshold+'%)')};
  }
  function aggregate(rule,state,hero){
    var effects={},counters={},penalties={},evidence=[],groups={};
    (rule.conditionalEffects||[]).forEach(function(term){
      var e=evaluate(term,state,hero);e.property=term.property;e.source=term.source;evidence.push(e);
      ['effects','counters','penalties'].forEach(function(kind){var out=kind==='effects'?effects:kind==='counters'?counters:penalties;
        Object.keys(term[kind]||{}).forEach(function(key){
          var value=term[kind][key]*e.factor;
          if(kind==='counters'){out[key]=Math.max(out[key]||0,value);return;}
          // Independent stats (damage and fire rate) both contribute. Alternate
          // values of the same stat/trigger (normal/alt fire) are not stacked.
          var group=kind+'|'+key+'|'+(term.type||term.property)+'|'+term.trigger,old=groups[group]||0;
          groups[group]=Math.max(old,value);out[key]=(out[key]||0)+Math.max(0,value-old);
        });});
    });
    return {effects:effects,counters:counters,penalties:penalties,evidence:evidence};
  }
  var api={evaluate:evaluate,aggregate:aggregate};
  if(typeof $!=='undefined')$.ShopmarkConditions=api;
  if(typeof globalThis!=='undefined')globalThis.ShopmarkConditions=api;
})();
