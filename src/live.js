(function () {
  'use strict';
  // Only visible HUD facts enter this module. Missing facts stay unknown.
  function number(text) {
    var s = String(text == null ? '' : text).replace(/<[^>]*>/g, '').replace(/[\s\u00a0\u202f]/g, '').toLowerCase();
    if (!/^\d+(?:[.,]\d+)?[kкmм]?$/.test(s)) return null;
    return Math.round(Number(s.replace(',', '.').replace(/[kкmм]$/, '')) * (/[kк]$/.test(s) ? 1000 : /[mм]$/.test(s) ? 1000000 : 1));
  }
  function clock(text) {
    var m = /^(\d{1,3}):(\d{2})$/.exec(String(text || '').trim());
    return m && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  var matchups = {
    'Abrams': ['heal', 'control'], 'Shiv': ['heal'], 'Infernus': ['heal', 'spirit'],
    'Haze': ['bullets'], 'Wraith': ['bullets', 'control'], 'Vindicta': ['flight'],
    'Grey Talon': ['flight', 'spirit'], 'Bebop': ['control'], 'Lash': ['control'],
    'Dynamo': ['control'], 'Kelvin': ['heal'], 'Yamato': ['heal', 'spirit'],
    'Pocket': ['spirit'], 'Seven': ['spirit'], 'Lady Geist': ['spirit'],
    'Viscous': ['control'], 'Mo & Krill': ['control'], 'Paradox': ['control'],
    'Warden': ['control'], 'Ivy': ['control'], 'McGinnis': ['bullets'],
    'Mirage': ['spirit'], 'Holliday': ['control'], 'Calico': ['escape'],
  };
  function comparison(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a + b < 1600) return 'unknown';
    var delta = (a - b) / Math.max(a, b, 1);
    return delta > 0.12 ? 'ahead' : delta < -0.12 ? 'behind' : 'even';
  }
  function create(coach) {
    var previousHero = null, previousTime = null, laneAtEnd = null, inventory = [];
    function reset() { previousHero = null; previousTime = null; laneAtEnd = null; inventory = []; }
    function evaluate(data, raw, settings, now) {
      settings = settings || {};
      now = now == null ? Date.now() : now;
      if (!settings.enabled) { reset(); return { status: 'off', recommendations: [] }; }
      if (!raw || !Number.isFinite(raw.capturedAt) || now - raw.capturedAt > 3500 || now < raw.capturedAt)
        return { status: 'waiting', reason: 'Жду свежие данные матча', recommendations: [] };
      if (!raw.heroId || !raw.inventoryKnown || !raw.playing || raw.spectating)
        return { status: 'waiting', reason: 'Жду героя и покупки в матче', recommendations: [] };
      if (previousHero !== raw.heroId || (previousTime != null && raw.seconds != null && raw.seconds < previousTime - 15)) reset();
      previousHero = raw.heroId;
      previousTime = raw.seconds;
      var current = raw.purchased || [];
      inventory = inventory.filter(function (id) { return current.indexOf(id) >= 0; });
      current.forEach(function (id) { if (inventory.indexOf(id) < 0) inventory.push(id); });
      var hero = (data.heroes || []).filter(function (h) { return h.id === raw.heroId; })[0];
      if (!hero) return { status: 'waiting', reason: 'Герой пока не распознан', recommendations: [] };
      var builds = coach.catalog(data, raw.heroId, settings.rank || 0, 'all', '');
      var build = builds.filter(function (b) { return b.id === settings.buildId; })[0] || builds[0];
      if (!build) return { status: 'waiting', reason: 'Для героя пока нет сборки', recommendations: [] };
      var enemies = (raw.enemies || []).filter(function (p) { return p.hero; });
      var laneEnemies = enemies.filter(function (p) { return p.sameLane && Number.isFinite(p.souls); });
      var laneAllies = (raw.allies || []).filter(function (p) { return p.sameLane && Number.isFinite(p.souls); });
      var lane = raw.seconds > 480 ? laneAtEnd || 'unknown' : 'unknown', laneNow = 'unknown';
      if (laneEnemies.length && laneAllies.length && Number.isFinite(raw.seconds) && raw.seconds >= 120) {
        laneNow = comparison(laneAllies.reduce(function (s, p) { return s + p.souls; }, 0) / laneAllies.length,
          laneEnemies.reduce(function (s, p) { return s + p.souls; }, 0) / laneEnemies.length);
        if (raw.seconds <= 480) laneAtEnd = laneNow;
        lane = raw.seconds <= 480 ? laneNow : laneAtEnd || 'unknown';
      }
      var advantage = comparison(raw.friendlySouls, raw.enemySouls);
      // A hero's presence is a potential matchup, not evidence of received damage.
      // Prioritize at most one answer, after the opening purchases, against a
      // richer lane opponent or the enemy carrying most of the visible economy.
      var priority = enemies.slice().sort(function (a, b) { return (b.souls || 0) - (a.souls || 0); })[0];
      var laneLeader = laneEnemies.slice().sort(function (a, b) { return (b.souls || 0) - (a.souls || 0); })[0];
      if (raw.seconds != null && raw.seconds <= 480 && laneLeader) priority = laneLeader;
      var threats = [], evidence = '';
      if (priority && Number.isFinite(priority.souls) && Number.isFinite(raw.ownSouls) && raw.ownSouls >= 3200 &&
          priority.souls >= raw.ownSouls * 0.9) {
        threats = (matchups[priority.hero] || []).slice(0, 1);
        evidence = priority.hero + ' · ' + priority.souls.toLocaleString('ru-RU') + ' душ' + (priority.sameLane ? ' · твоя линия' : ' · больше всего душ у врага');
      }
      var result = coach.plan(data, build, { purchased: inventory, enemies: enemies.map(function (e) { return e.hero; }),
        threats: threats, budget: raw.budget, advantage: advantage, lane: lane === 'ahead' ? 'won' : lane === 'behind' ? 'lost' : lane });
      result.recommendations.forEach(function (r) {
        if (r.kind === 'situation') r.why = 'Учитываю ' + evidence + '. Возможный ответ по набору способностей: ' + r.why;
      });
      result.status = 'live';
      result.mode = 'automatic';
      result.hero = hero;
      result.build = build;
      result.advantage = advantage;
      result.lane = lane;
      result.seconds = raw.seconds;
      result.budget = raw.budget;
      result.purchased = (raw.purchased || []).slice();
      result.evidence = evidence;
      result.warnings.unshift('Ситуативные ответы оцениваются по открытым героям и душам. Помощник не знает, кто нанёс тебе урон, и не видит скрытые действия.');
      return result;
    }
    return { evaluate: evaluate, reset: reset };
  }
  var api = { number: number, clock: clock, comparison: comparison, create: create };
  if (typeof $ !== 'undefined') $.ShopmarkLive = api;
  if (typeof globalThis !== 'undefined') globalThis.ShopmarkLive = api;
})();
