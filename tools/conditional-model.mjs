// Every conditional property is classified explicitly. A new native type or
// item stops generation instead of silently declaring coverage complete.
const groups = {
  active:['Silencer','Heroic Aura','Dispel Magic','Metal Skin','Slowing Hex','Spirit Sap','Rusted Barrel','Disarming Hex','Decay','Scourge','Phantom Strike','Warp Stone','Vortex Web','Majestic Leap','Healing Rite','Infuser','Guardian Ward','Divine Barrier','Alchemical Fire','Blood Tribute','Fleetfoot','Colossus','Cold Front','Arctic Blast','Ethereal Shift','Cursed Relic','Fury Trance','Magic Carpet','Lightning Scroll','Express Shot','Mystical Piano','Celestial Blessing','Haunting Shot','Prism Blast'],
  bullet_hit:['Weighted Shots','Slowing Bullets','Inhibitor','Spirit Shredder','Spirit Rend','Toxic Bullets','Bullet Resist Shredder','Mystic Slow','Escalating Exposure','Burst Fire','Split Shot','Spirit Burn','Ballistic Enchantment'],
  spirit_hit:['Healbane','Mystic Vulnerability'],
  headshot:['Weakening Headshot','Headhunter','Crippling Headshot'],
  parry:['Rebuttal','Counterspell'],
  melee_hit:['Lifestrike','Spirit Strike','Spirit Snatch','Crushing Fists'],
  health_above:['Hollow Point','Fortitude','Battle Vest'],health_below:['Frenzy','Spirit Resilience','Bullet Resilience'],
  enemy_health_above:['Opening Rounds'],near_enemy:['Point Blank',"Hunter's Aura"],
  bullet_damage_taken:['Weapon Shielding','Escalating Resilience'],spirit_damage_taken:['Spirit Shielding'],
  damage_taken:['Grit'],lethal_damage:['Cheat Death'],control_taken:['Reactive Barrier','Indomitable','Cloak of Opportunity'],
  dash:['Kinetic Dash','Arcane Surge'],cast:['Surge of Power'],ultimate:['Diviner\'s Kevlar'],
  firing:['Intensifying Magazine'],kill:['Glass Cannon'],veil:['Veil Walker','Stalker'],
  reload:['Active Reload'],sliding:['Electric Slippers'],sacrifice_npc:['Cultist Sacrifice'],
  delayed_growth:['Eternal Gift'],spirit_burst:['Mystic Reverb'],ambush:['Shadow Weave'],sacrifice_self:['Unstable Concoction']
};
const labels={active:'при своевременном применении активного предмета',bullet_hit:'после попаданий пулями',spirit_hit:'после духовного урона',
  headshot:'при попадании в голову',parry:'после успешного парирования',melee_hit:'после попадания в ближнем бою',health_above:'при здоровье выше порога',
  health_below:'при здоровье ниже порога',enemy_health_above:'при здоровье цели выше порога',near_enemy:'на нужной дистанции от врага',
  bullet_damage_taken:'после получения урона пулями',spirit_damage_taken:'после получения духовного урона',damage_taken:'после получения урона',
  lethal_damage:'при смертельном уроне',control_taken:'после вражеского контроля',dash:'после рывка',cast:'после применения умения',
  ultimate:'после применения ультимейта',firing:'при длительной стрельбе',kill:'после убийства',veil:'после прохождения завесы',
  reload:'после успешной активной перезарядки',sliding:'во время скольжения',sacrifice_npc:'после поглощения подходящего существа',
  delayed_growth:'после накопления постоянных бонусов',spirit_burst:'при достаточном разовом духовном уроне',ambush:'при выходе из скрытности',
  sacrifice_self:'при намеренном самопожертвовании'};
const extras={BARRIER_HEALTH:['barrier',300],AMMO_CLIP_SIZE:['weapon',20],BONUS_BULLET_SPEED_PERCENT:['weaponUtility',100],
  MOVEMENT_SPEED_WHILE_SHOOTING_PENALTY_REDUCTION_PERCENT:['mobility',100],MOVEMENT_SPEED_WHILE_ZOOMED_PENALTY_REDUCTION_PERCENT:['mobility',100],
  AIR_CONTROL_PERCENT:['mobility',100],RESPAWN_TIME_PERCENTAGE:['recovery',-70]};
export function compileConditionals(asset, plain, baseMap) {
  const props=Object.entries(asset.properties||{}).filter(([,p])=>(p.usage_flags||[]).includes('ConditionallyApplied')&&Number.isFinite(parseFloat(p.value))&&parseFloat(p.value)!==0);
  if(!props.length)return [];
  const defaultTrigger=Object.keys(groups).find(k=>groups[k].includes(asset.name));
  if(!defaultTrigger)throw Error('No conditional trigger for '+asset.name);
  return props.map(([key,p])=>{
    const value=parseFloat(p.value),type=String(p.provided_property_type||'').replace('MODIFIER_VALUE_','');
    let trigger=asset.name==='Spirit Rend'&&key==='MagicResistReduction'?'headshot':defaultTrigger;
    const effects={},counters={},penalties={},constraints=[];
    const enemy=(/SLOW_PERCENT|GROUND_DASH_REDUCTION|RESIST_REDUCTION|HEAL_AMP|DAMAGE_TAKEN_HEALS/.test(type)||
      ['Inhibitor','Haunting Shot','Rusted Barrel','Spirit Sap','Disarming Hex','Spirit Snatch'].includes(asset.name)&&value<0);
    if(/HEAL_AMP_(RECEIVE|REGEN)_PERCENT/.test(type)&&value<0){if(asset.name==='Cheat Death')penalties.sustain=Math.abs(value)/25;else counters.healing=Math.abs(value)/25;}
    else if(/BULLET_AND_MELEE_RESIST_REDUCTION|BULLET_RESIST_REDUCTION/.test(type)||key==='BulletArmorReduction')effects.weaponAmp=Math.abs(value)/15;
    else if(type==='TECH_RESIST_REDUCTION')effects.spiritAmp=Math.abs(value)/15;
    else if(type==='TECH_DAMAGE_TAKEN_HEALS_ATTACKER')effects.spiritSustain=Math.abs(value)/20;
    else if(type==='MOVEMENT_SPEED_SLOW_PERCENT'||type==='MOVEMENT_GROUND_DASH_REDUCTION_PERCENT'){
      if(asset.name==='Metal Skin')penalties.mobility=Math.abs(value)/25;else counters.escape=Math.abs(value)/25;
    } else if(type==='ALL_DAMAGE_MULTIPLIER'||type==='TECH_DAMAGE_MULTIPLIER'){
      if(enemy){counters.bullets=Math.abs(value)/25;counters.spirit=Math.abs(value)/25;}
      else if(value<0){if(type==='ALL_DAMAGE_MULTIPLIER')penalties.weapon=Math.abs(value)/25;penalties.spirit=Math.abs(value)/25;}
      else {if(type==='ALL_DAMAGE_MULTIPLIER')effects.weapon=value/25;effects.spirit=value/25;}
    } else if(type==='ANIMATION_FRAME_SKIP_RATE'){counters.bullets=Math.abs(value)/6;constraints.push('ошеломление замедляет действия цели; это не прямой бонус урона');}
    else if(type==='GRAVITY_SCALE'){penalties.mobility=0.5;constraints.push('изменение гравитации ограничивает воздушное движение');}
    else if(type==='MOVE_SPEED_LIMIT'){
      if(asset.name==='Mystical Piano')counters.escape=1;else constraints.push('скорость в особом состоянии ограничена '+value+' м/с');
    } else if(key==='HealOnSuccess')effects.sustain=value/200;
    else if(key==='TechResistBelowThreshold')effects.spiritDefense=value/15;
    else if(key==='BulletResistBelowThreshold')effects.bulletDefense=value/15;
    else if(key==='MaxHealthDamage')effects.spirit=value/10;
    else if(key==='BulletSplitShot')effects.farm=value/5;
    else if(key==='EvasionWhileSliding')counters.bullets=value/30;
    else {
      const mapping=baseMap[type]||extras[type];
      if(!mapping)throw Error('Unclassified conditional '+asset.name+'.'+key+' ('+type+')');
      const [effect,scale]=mapping;
      if(enemy){if(effect==='spirit')counters.spirit=Math.abs(value)/scale;else if(effect==='weapon')counters.bullets=Math.abs(value)/scale;else throw Error('Ambiguous target '+asset.name+'.'+key);}
      else if(value/scale<0)penalties[effect]=Math.abs(value/scale);else effects[effect]=value/scale;
    }
    let threshold=null;
    if(trigger==='health_above'||trigger==='health_below'||trigger==='enemy_health_above'){
      const names=trigger==='health_below'?['LowHealthThreshold','HealthThreshold']:['HealthThreshold','HighHealthThreshold'];
      threshold=names.map(n=>parseFloat(asset.properties[n]?.value)).find(Number.isFinite);
      if(!Number.isFinite(threshold)){
        const texts=JSON.stringify(asset.description)+' '+JSON.stringify(asset.tooltip_sections);
        const m=/(?:above|below|more than)\s+(\d+(?:\.\d+)?)%/i.exec(plain(texts));
        threshold=m?Number(m[1]):null;
      }
      if(threshold==null)throw Error('Missing health threshold '+asset.name);
    }
    return {property:key,type:type||null,value,trigger,label:labels[trigger],threshold,effects,counters,penalties,constraints,
      source:'assets:'+asset.class_name+'.properties.'+key};
  });
}
