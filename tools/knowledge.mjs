import fs from 'node:fs/promises';
import {hash,at,readJSON,writeJSON} from './lib.mjs';
import {compileConditionals} from './conditional-model.mjs';
// Asset properties are facts; utility weights are explicit, versioned heuristics.
export async function generateKnowledge() {
  const snapshot=await readJSON('data/snapshot.json');
  const load=async type=>JSON.parse(await fs.readFile(at('.cache',hash('https://api.deadlock-api.com/v1/assets/'+type+'?language=english')+'.json'),'utf8')).value;
  const [items,heroes]=await Promise.all([load('items'),load('heroes')]);
  let localized=[];try{localized=JSON.parse(await fs.readFile(at('.cache',hash('https://api.deadlock-api.com/v1/assets/items?language=russian')+'.json'),'utf8')).value;}catch{}
  const plain=x=>String(x||'').replace(/<svg[\s\S]*?<\/svg>/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const map={AMMO_CLIP_SIZE_PERCENT:['weaponUtility',30],WEAPON_DAMAGE_INCREASE:['weapon',20],FIRE_RATE:['weapon',20],
    TECH_POWER:['spirit',15],HEALTH_MAX:['health',200],BASE_HEALTH_PERCENT:['health',20],
    OUT_OF_COMBAT_HEALTH_REGEN:['sustain',4],HEALTH_REGEN_PER_SECOND:['sustain',4],
    BULLET_ARMOR_DAMAGE_RESIST:['bulletDefense',15],TECH_RESIST:['spiritDefense',15],
    BULLET_LIFESTEAL:['weaponSustain',20],TECH_LIFESTEAL:['spiritSustain',20],
    MELEE_DAMAGE_INCREASE:['melee',25],STATUS_RESISTANCE:['controlDefense',20],
    SPRINT_SPEED_BONUS:['mobility',2],MOVEMENT_SPEED_MAX:['mobility',2],STAMINA:['mobility',2],
    STAMINA_REGEN_PER_SECOND_PERCENTAGE:['mobility',25],COOLDOWN_REDUCTION_PERCENTAGE:['cooldown',15],
    BONUS_ABILITY_DURATION_PERCENTAGE:['duration',20],TECH_RANGE_PERCENT:['range',20],TECH_RADIUS_PERCENT:['range',20],
    BONUS_ABILITY_CHARGES:['charges',1],HEAL_AMP_CAST_PERCENT:['healing',20],HEAL_AMP_REGEN_PERCENT:['sustain',20]};
  const special={
    'Eternal Gift':{effects:{growth:2}},'Slowing Bullets':{counters:{escape:1},effects:{weapon:0.4},requires:['shoot']},
    'Spirit Strike':{effects:{melee:0.8},counters:{spiritDefense:1},requires:['melee']},
    'Majestic Leap':{effects:{mobility:1.8}},'Prism Blast':{effects:{health:1.5,spirit:1.5}},
    'Close Quarters':{effects:{weapon:1.3},requires:['closeRange']},
    'Unstable Concoction':{effects:{weapon:4,spirit:4},requires:['explicitSacrificeIntent']},
    'Mystic Burst':{effects:{spirit:1.5},requires:['spiritDamage']},
    'Cold Front':{effects:{spirit:1,farm:1}},
    'Cultist Sacrifice':{effects:{farm:2}},
    'Quicksilver Reload':{effects:{spirit:0.7,weaponUtility:1.2},requires:['shoot']},
    'Radiant Regeneration':{effects:{sustain:1.5},requires:['spiritDamage']},
    'Mystical Piano':{counters:{channel:3,escape:2}},'Ethereal Shift':{counters:{spirit:2,bullets:1}},
    'Cursed Relic':{counters:{channel:3,bullets:2,escape:2}},'Warp Stone':{effects:{mobility:1.5},counters:{bullets:0.6}},
    'Cloak of Opportunity':{counters:{control:3}},'Haunting Shot':{counters:{healing:2},effects:{weapon:1},requires:['shoot']},
    'Split Shot':{effects:{farm:1,weapon:1.5},requires:['shoot']},'Celestial Blessing':{effects:{healing:2},counters:{control:3}},
    'Healbane':{counters:{healing:3},requires:['spiritDamage']},'Toxic Bullets':{counters:{healing:3},requires:['shoot']},
    'Decay':{counters:{healing:3}},'Metal Skin':{counters:{bullets:3}},'Weapon Shielding':{counters:{bullets:1}},
    'Spirit Shielding':{counters:{spirit:1}},'Bullet Resilience':{counters:{bullets:2}},'Spirit Resilience':{counters:{spirit:2}},
    'Reactive Barrier':{counters:{control:2}},'Debuff Reducer':{counters:{control:1}},'Debuff Remover':{counters:{control:2}},
    'Unstoppable':{counters:{control:3}},'Counterspell':{counters:{control:2,spirit:1}},'Dispel Magic':{counters:{control:2}},
    'Knockdown':{counters:{flight:3,channel:2}},'Slowing Hex':{counters:{escape:2}},'Silence Wave':{counters:{channel:2,escape:1}},
    'Silencer':{counters:{channel:2,escape:1}},'Armor Piercer':{counters:{bulletDefense:2},requires:['shoot']},
    'Mystic Vulnerability':{counters:{spiritDefense:2},requires:['spiritDamage']},
    'Bullet Resist Shredder':{counters:{bulletDefense:2},requires:['spiritDamage']},
    'Spirit Shredder':{counters:{spiritDefense:2},requires:['shoot']},
    'Healing Rite':{effects:{sustain:1.4}},'Mystic Regeneration':{effects:{sustain:1.4}},
    'Monster Rounds':{effects:{farm:1}},'Tesla Bullets':{effects:{farm:2}},'Ricochet':{effects:{farm:2}},
    'Restorative Shot':{effects:{sustain:1.2}},'Melee Lifesteal':{effects:{sustain:1},requires:['melee']}
  };
  const knowledge={version:2,generatedAt:snapshot.generatedAt,policy:'conditional-mechanics-v2',heroes:{},items:{}};
  for(const h of snapshot.heroes){
    const asset=heroes.find(a=>a.id===h.id);if(!asset)throw Error('Missing hero '+h.name);
    const abilities=Object.entries(asset.items).filter(([k])=>/^signature/.test(k)).map(([,c])=>items.find(a=>a.class_name===c));
    if(abilities.some(a=>!a)||abilities.length!==4)throw Error('Missing signature ability '+h.name);
    const description=abilities.map(a=>plain(a.description?.desc)).join(' ');
    const properties=abilities.flatMap(a=>Object.entries(a.properties||{}));
    const spiritCount=abilities.filter(a=>/spirit damage|spirit dps/i.test(plain(a.description?.desc))||Object.entries(a.properties||{}).some(([k,v])=>/damage/i.test(k)&&/TechPower/.test(JSON.stringify(v.scale_function)))).length;
    const spirit=spiritCount>0;
    const bullets=/bullet damage|firing your weapon|weapon hits|fire rate/i.test(description);
    const threats={bullets:bullets?1.5:0.6};if(spirit)threats.spirit=1.1;
    if(/heal|lifesteal|health regen/i.test(description))threats.healing=1;
    if(/stun|sleep|root|silence|immobiliz|disarm/i.test(description))threats.control=1;
    if(/fly|flight|flying/i.test(description))threats.flight=1;
    if(/teleport|dash|leap/i.test(description))threats.escape=0.7;
    if(abilities.some(a=>parseFloat(a.properties?.AbilityChannelTime?.value)>0))threats.channel=0.7;
    knowledge.heroes[h.id]={verified:true,name:h.name,source:'https://api.deadlock-api.com/v1/assets/heroes?language=english',
      capabilities:['shoot','melee'].concat(spirit?['spiritDamage']:[]).concat(properties.some(([k,v])=>/damage/i.test(k)&&parseFloat(v.value)>=80)?['burstSpirit']:[]).concat(/melee|close range|nearby enemies/i.test(description)?['closeRange']:[]),threats,
      benefits:{weapon:bullets?1.5:1,spirit:0.25+spiritCount*0.35,growth:0.3,health:0.8,sustain:0.9,mobility:0.8,melee:/melee/i.test(description)?1.3:0.3,
        barrier:0.7,recovery:0.4,weaponUtility:0.4,weaponAmp:bullets?1.5:1,spiritAmp:0.25+spiritCount*0.35,
        bulletDefense:0.5,spiritDefense:0.5,controlDefense:0.4,weaponSustain:bullets?0.9:0.5,spiritSustain:spirit?0.9:0.1,
        cooldown:1,duration:0.6,range:0.5,charges:0.7,healing:threats.healing?1:0.2,farm:0.8},
      abilities:abilities.map(a=>({id:a.id,name:a.name,description:plain(a.description?.desc)}))};
  }
  for(const item of snapshot.items){
    const a=items.find(a=>a.id===item.id);if(!a)throw Error('Missing item '+item.name);
    const effects={},facts=[],unmodelled=[];
    for(const [key,p] of Object.entries(a.properties||{})){
      const value=parseFloat(p.value),type=String(p.provided_property_type||'').replace('MODIFIER_VALUE_','');
      if(!Number.isFinite(value)||value<=0||p.negative_attribute)continue;
      const conditional=(p.usage_flags||[]).includes('ConditionallyApplied');
      if(conditional){if(p.label)unmodelled.push(plain(p.label));continue;}
      if(map[type]){const [effect,scale]=map[type];effects[effect]=(effects[effect]||0)+value/scale;facts.push({key,type,value,effect});}
    }
    const extra=special[item.name]||{};Object.entries(extra.effects||{}).forEach(([k,v])=>effects[k]=(effects[k]||0)+v);
    const counters={...(extra.counters||{})};if(effects.bulletDefense)counters.bullets=Math.max(counters.bullets||0,effects.bulletDefense);
    if(effects.spiritDefense)counters.spirit=Math.max(counters.spirit||0,effects.spiritDefense);if(effects.controlDefense)counters.control=Math.max(counters.control||0,effects.controlDefense);
    const local=localized.find(i=>i.id===item.id);
    const descriptions=x=>[...Object.values(x.description||{}),...(x.tooltip_sections||[]).flatMap(s=>(s.section_attributes||[]).map(a=>a.loc_string))].map(plain).filter(Boolean);
    const desc=[...new Set(descriptions(local||{}).length?descriptions(local):descriptions(a))].join(' ')||item.effect||item.name;
    const conditionalEffects=compileConditionals(a,plain,map);
    knowledge.items[item.id]={verified:true,source:'https://api.deadlock-api.com/v1/assets/items?language=english#'+item.class_name,
      effects,counters,requires:extra.requires||[],explanation:desc,facts,
      conditions:[a.is_active_item?'Активный предмет: эффект требует своевременного применения.':'Проверь условия срабатывания пассивного эффекта.',desc],
      conditionalEffects,partial:false,unmodelled:[]};
  }
  await writeJSON(at('data/knowledge.json'),knowledge);
  console.log('Mechanics profiles: '+Object.keys(knowledge.heroes).length+' heroes, '+Object.keys(knowledge.items).length+' items; '+Object.values(knowledge.items).reduce((n,i)=>n+i.conditionalEffects.length,0)+' classified conditional properties.');
  return knowledge;
}
if(process.argv[1]?.endsWith('knowledge.mjs'))await generateKnowledge();
