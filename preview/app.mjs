import "/src/coach.js";
import { MARKS, shortlist } from "/src/core.mjs";
const $ = (id) => document.getElementById(id);
const s = await (await fetch("/data/snapshot.json")).json();
const state = {
  hero: s.heroes.find((h) => h.name === "Infernus") ?? s.heroes[0],
  build: null,
  rank: 0,
  ranksByHero: {},
  all: false,
  source: "all",
  page: 0,
  scenarios: {},
};
const itemMap = new Map(s.items.map((i) => [i.id, i]));
const date = (value) =>
  new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
function url(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : "#";
  } catch {
    return "#";
  }
}
function heroes() {
  $("heroes").replaceChildren();
  for (const h of s.heroes.filter((h) =>
    h.name.toLowerCase().includes($("hero-search").value.toLowerCase()),
  )) {
    const b = el(
      "button",
      "hero-button" + (h.id === state.hero.id ? " active" : ""),
    );
    b.setAttribute("aria-current", h.id === state.hero.id ? "true" : "false");
    if (h.image) {
      const img = el("img");
      img.src = url(h.image);
      img.alt = "";
      img.loading = "lazy";
      b.append(img);
    }
    b.append(el("span", "", h.name));
    if (h.id === state.hero.id) b.append(el("span", "arrow", "↗"));
    b.onclick = () => {
      state.hero = h;
      state.page = 0;
      state.rank = state.ranksByHero[h.id] ?? 0;
      $("rank-filter").value = String(state.rank);
      state.build = null;
      render();
    };
    $("heroes").append(b);
  }
}
function builds() {
  const all = globalThis.ShopmarkCoach.catalog(
    s,
    state.hero.id,
    state.rank,
    state.source,
    $("build-search").value,
  );
  state.page = Math.min(state.page, Math.max(0, Math.ceil(all.length / 3) - 1));
  $("catalog-count").textContent =
    all.length +
    " сборок · " +
    (state.page + 1) +
    " / " +
    Math.max(1, Math.ceil(all.length / 3));
  const selected = all.slice(state.page * 3, state.page * 3 + 3);
  if (!selected.some((b) => b.id === state.build?.id))
    state.build = selected[0] ?? null;
  $("builds").replaceChildren();
  if (!selected.length)
    $("builds").append(
      el(
        "div",
        "empty",
        "Для этого героя и ранга мало матчей после патча. Выберите «Все ранги».",
      ),
    );
  for (const [index, b] of selected.entries()) {
    const card = el(
      "article",
      "build-card" + (state.build?.id === b.id ? " selected" : ""),
    );
    const author = el("div", "card-author");
    author.append(
      el("span", "card-type", "META /"),
      document.createTextNode(b.author),
    );
    card.append(author, el("h3", "", b.name));
    const meta = el("div", "card-meta");
    meta.append(
      el("span", "", `#${b.id}`),
      el("span", "", date(b.updated * 1000)),
      el(
        "span",
        "",
        b.stale ? "УСТАРЕЛА" : b.prePatch ? "ДО ПАТЧА" : `v${b.version}`,
      ),
    );
    card.append(meta);
    const bottom = el("div", "card-bottom");
    const stat = el("span", "card-stat");
    if (b.stats) {
      stat.append(
        el(
          "strong",
          "",
          ((100 * b.stats.wins) / b.stats.matches).toFixed(1) + "%",
        ),
        document.createTextNode(` / ${b.stats.matches} матчей`),
      );
    } else stat.textContent = "Мало матчей после патча";
    const choose = el(
      "button",
      "card-select",
      state.build?.id === b.id ? "Открыта ✓" : "Смотреть →",
    );
    choose.onclick = () => {
      state.build = b;
      builds();
      items();
      renderCoach();
    };
    bottom.append(stat, choose);
    card.append(bottom);
    $("builds").append(card);
  }
}
function detail(item) {
  const m = s.marks[item.id] ?? { status: "unknown", notes: [] };
  const box = $("item-detail");
  box.replaceChildren(
    el("span", "section-kicker", "ИЗМЕНЕНИЯ ПРЕДМЕТА"),
    el("h3", "", MARKS[m.status] + " " + item.name),
  );
  box.append(
    el(
      "p",
      "",
      m.reason ||
        (m.status === "unchanged"
          ? "В проверенном разделе Items этого патча изменений не указано."
          : "Изменения требуют проверки."),
    ),
  );
  if (m.notes.length) box.append(el("p", "notes", m.notes.join("\n\n")));
}
function items() {
  $("item-groups").replaceChildren();
  let total = 0;
  const groups = state.all
    ? [{ name: "Все предметы", items: s.items.map((i) => ({ id: i.id })) }]
    : (state.build?.categories ?? []);
  for (const group of groups) {
    const ids = group.items.filter((ref) => {
      const item = itemMap.get(ref.id);
      const status = s.marks[ref.id]?.status ?? "unknown";
      return (
        item &&
        item.name
          .toLowerCase()
          .includes($("item-search").value.toLowerCase()) &&
        ($("status-filter").value === "all" ||
          status === $("status-filter").value)
      );
    });
    if (!ids.length) continue;
    total += ids.length;
    const names = {
      "#Citadel_HeroBuilds_Early": "Начало игры",
      "#Citadel_HeroBuilds_Mid": "Середина игры",
      "#Citadel_HeroBuilds_Late": "Поздняя игра",
      "#Citadel_HeroBuilds_Situational": "По ситуации",
    };
    $("item-groups").append(
      el(
        "h3",
        "item-group-heading",
        (names[group.name] ?? group.name) +
          (group.optional ? " · по ситуации" : ""),
      ),
    );
    const grid = el("div", "item-grid");
    for (const ref of ids) {
      const item = itemMap.get(ref.id);
      const m = s.marks[item.id] ?? { status: "unknown" };
      const b = el("button", "item " + item.slot);
      b.setAttribute("aria-label", item.name + ", " + m.status);
      b.title = ref.note || item.name;
      const image = el("div", "item-icon");
      if (item.image) {
        const img = el("img");
        img.src = url(item.image);
        img.alt = "";
        img.loading = "lazy";
        image.append(img);
      }
      image.append(el("span", "mark " + m.status, MARKS[m.status]));
      b.append(
        image,
        el("span", "item-name", item.name),
        el(
          "span",
          "item-price",
          (item.cost ?? "—").toLocaleString("ru-RU") + " souls",
        ),
      );
      b.onclick = () => detail(item);
      grid.append(b);
    }
    $("item-groups").append(grid);
  }
  if (!total)
    $("item-groups").append(
      el("p", "empty", "Предметов по этому фильтру нет."),
    );
  $("item-count").textContent = total + " предметов";
}
function render() {
  heroes();
  $("hero-name").textContent = state.hero.name;
  builds();
  items();
  if (typeof renderCoach === "function") renderCoach();
}
$("hero-count").textContent = s.heroes.length;
$("sync-date").textContent = date(s.metaUpdatedAt ?? s.generatedAt);
$("hero-search").oninput = heroes;
$("item-search").oninput = items;
$("status-filter").onchange = items;
for (const rank of [{ id: 0, name: "Все ранги" }, ...(s.ranks ?? [])]) {
  const option = el("option", "", rank.name);
  option.value = rank.id;
  $("rank-filter").append(option);
}
$("rank-filter").onchange = () => {
  state.rank = Number($("rank-filter").value);
  state.page = 0;
  state.ranksByHero[state.hero.id] = state.rank;
  state.build = null;
  builds();
  items();
  renderCoach();
};
for (const [id, all] of [
  ["all-items", true],
  ["build-items", false],
])
  $(id).onclick = () => {
    state.all = all;
    $("all-items").classList.toggle("active", all);
    $("build-items").classList.toggle("active", !all);
    items();
  };
if (s.patch) {
  $("patch-date").textContent = date(s.patch.date);
  $("patch-title").textContent = s.patch.title;
  $("patch-source").href = url(s.patch.url);
}
for (const p of s.recentPatches.slice(0, 4)) {
  const a = el("a");
  a.href = url(p.url);
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.append(
    el("time", "", date(p.date)),
    document.createTextNode(p.title + " ↗"),
  );
  $("recent-patches").append(a);
}
const coach = globalThis.ShopmarkCoach;
function scenario() {
  return (state.scenarios[state.hero.id] ??= {
    purchased: [],
    enemies: [],
    threats: [],
    advantage: "even",
    lane: "even",
  });
}
function renderCoach() {
  const st = scenario();
  $("coach-adv").value = st.advantage;
  $("coach-lane").value = st.lane;
  $("coach-budget").value = st.budget ?? "";
  $("coach-threats").replaceChildren();
  for (const [key, rule] of Object.entries(coach.situations)) {
    const b = el("button", st.threats.includes(key) ? "active" : "", rule.name);
    b.setAttribute("aria-pressed", String(st.threats.includes(key)));
    b.onclick = () => {
      st.threats = st.threats.includes(key)
        ? st.threats.filter((k) => k !== key)
        : [...st.threats, key];
      renderCoach();
    };
    $("coach-threats").append(b);
  }
  $("coach-enemies").textContent =
    "Враги: " +
    (st.enemies.join(", ") || "не указаны") +
    " · Отмечено покупок: " +
    st.purchased.length;
  const plan = coach.plan(s, state.build, st);
  $("coach-warnings").replaceChildren(
    ...plan.warnings.concat(plan.watch).map((w) => el("p", "coach-warning", w)),
  );
  $("coach-next").replaceChildren();
  for (const [index, r] of plan.recommendations.entries()) {
    const card = el("article", "coach-advice");
    card.dataset.itemId = r.id;
    card.append(
      el(
        "div",
        "eyebrow",
        r.kind === "situation" ? "СИТУАТИВНЫЙ ОТВЕТ" : "ШАГ СБОРКИ",
      ),
      el(
        "h3",
        "",
        String(index + 1) + ". " + r.name + " · " + r.cost + " souls",
      ),
      el("p", "", r.why),
      el("p", "condition", "Когда: " + r.when),
      el("p", "tradeoff", r.tradeoff),
    );
    const owned = el("button", "", "Отметить купленным");
    owned.onclick = () => {
      st.purchased.push(r.id);
      renderCoach();
    };
    card.append(owned);
    $("coach-next").append(card);
  }
  if (!plan.recommendations.length)
    $("coach-next").append(
      el(
        "p",
        "empty",
        "Все обязательные предметы отмечены или сборка не выбрана. Ситуативные предметы не становятся обязательными автоматически.",
      ),
    );
}
for (const h of s.heroes) {
  const o = el("option", "", h.name);
  o.value = h.name;
  $("coach-enemy").append(o);
}
$("coach-add-enemy").onclick = () => {
  const st = scenario(),
    enemy = $("coach-enemy").value;
  if (st.enemies.length < 6 && !st.enemies.includes(enemy))
    st.enemies.push(enemy);
  renderCoach();
};
$("coach-reset").onclick = () => {
  delete state.scenarios[state.hero.id];
  renderCoach();
};
$("coach-adv").onchange = () => {
  scenario().advantage = $("coach-adv").value;
  renderCoach();
};
$("coach-lane").onchange = () => {
  scenario().lane = $("coach-lane").value;
  renderCoach();
};
$("coach-budget").onchange = () => {
  const n = Number($("coach-budget").value);
  scenario().budget =
    $("coach-budget").value !== "" && Number.isFinite(n) && n >= 0
      ? n
      : undefined;
  renderCoach();
};
$("build-source").onchange = () => {
  state.source = $("build-source").value;
  state.page = 0;
  builds();
  items();
  renderCoach();
};
$("build-search").oninput = () => {
  state.page = 0;
  builds();
  items();
  renderCoach();
};
$("prev-builds").onclick = () => {
  state.page = Math.max(0, state.page - 1);
  builds();
  items();
  renderCoach();
};
$("next-builds").onclick = () => {
  state.page++;
  builds();
  items();
  renderCoach();
};
render();
renderCoach();
