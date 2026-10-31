export const MARKS = {
  buff: "↑",
  nerf: "↓",
  unchanged: "=",
  mixed: "↕",
  changed: "•",
  unknown: "?",
};

export function plainText(html) {
  return String(html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\r/g, "")
    .trim();
}

export function itemSection(patch) {
  const text = plainText(patch.content);
  const match =
    /(?:^|\n)\s*Items\s*:\s*\n([\s\S]*?)(?=\n\s*(?:Heroes|Street Brawl|General)\s*:|$)/i.exec(
      text,
    );
  return match
    ? match[1]
        .split("\n")
        .map((s) => s.replace(/^\s*[-•]\s*/, "").trim())
        .filter(Boolean)
    : null;
}

// Only an explicitly reviewed complete item section permits an '=' default.
// No keyword or numeric heuristic decides whether a gameplay change is beneficial.
export function patchMarks(items, patch, review) {
  const lines = patch ? itemSection(patch) : null;
  const trusted = Boolean(
    lines &&
      review?.source === patch.link &&
      review?.complete === true &&
      JSON.stringify(review.reviewedLines) === JSON.stringify(lines) &&
      lines.every((line) =>
        items.some((i) =>
          line.toLowerCase().startsWith(i.name.toLowerCase() + ":"),
        ),
      ),
  );
  const marks = {};
  for (const item of items) {
    const notes = (lines ?? []).filter((line) =>
      line.toLowerCase().startsWith(item.name.toLowerCase() + ":"),
    );
    const decision = review?.items?.[item.class_name];
    const status = !trusted
      ? "unknown"
      : notes.length
        ? (decision?.status ?? "changed")
        : "unchanged";
    marks[item.id] = { status, notes, reason: decision?.reason ?? "" };
  }
  return { trusted, marks };
}

export function normalizeBuild(raw, authors, now = Date.now()) {
  const h = raw?.hero_build;
  if (
    !h ||
    !Number.isSafeInteger(h.hero_build_id) ||
    h.hero_build_id <= 0 ||
    !Number.isSafeInteger(h.hero_id)
  )
    return null;
  const author = authors.find((a) => a.accountId === h.author_account_id);
  const categories = h.details?.mod_categories;
  if (!Array.isArray(categories) || !categories.some((c) => c.mods?.length))
    return null;
  const updated = h.last_updated_timestamp ?? h.publish_timestamp ?? 0;
  return {
    id: h.hero_build_id,
    heroId: h.hero_id,
    authorId: h.author_account_id,
    author: author?.name ?? `Steam ${h.author_account_id}`,
    pro: Boolean(author),
    verification: author?.source ?? null,
    name: plainText(h.name).slice(0, 120),
    description: plainText(h.description).slice(0, 1600),
    updated,
    stale: !updated || now / 1000 - updated > 30 * 86400,
    favorites: raw.num_favorites ?? null,
    weeklyFavorites: raw.num_weekly_favorites ?? null,
    version: h.version,
    categories: categories.map((c) => ({
      name: plainText(c.name),
      optional: c.optional === true,
      items: (c.mods ?? []).map((m) => ({
        id: m.ability_id,
        note: plainText(m.annotation).slice(0, 300),
      })),
    })),
  };
}

export function shortlist(builds, heroId, count = 4) {
  const candidates = builds
    .filter((b) => b.heroId === heroId)
    .sort(
      (a, b) =>
        Number(a.stale) - Number(b.stale) ||
        Number(b.pro) - Number(a.pro) ||
        Number(Boolean(a.prePatch)) - Number(Boolean(b.prePatch)) ||
        Number(Boolean(b.stats?.matches >= 20)) -
          Number(Boolean(a.stats?.matches >= 20)) ||
        (b.stats ? wilson(b.stats.wins, b.stats.matches) : 0) -
          (a.stats ? wilson(a.stats.wins, a.stats.matches) : 0) ||
        (b.weeklyFavorites ?? 0) - (a.weeklyFavorites ?? 0) ||
        b.updated - a.updated ||
        a.id - b.id,
    );
  const seen = new Set();
  return candidates
    .filter((b) => {
      if (seen.has(b.authorId)) return false;
      seen.add(b.authorId);
      return true;
    })
    .slice(0, count);
}

export function wilson(wins, total) {
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    !Number.isSafeInteger(wins) ||
    wins < 0 ||
    wins > total
  )
    return 0;
  const z = 1.96,
    p = wins / total;
  return (
    (p +
      (z * z) / (2 * total) -
      z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) /
    (1 + (z * z) / total)
  );
}

export function assertSnapshot(s) {
  if (
    s.schema !== 1 ||
    !Array.isArray(s.heroes) ||
    !s.heroes.length ||
    !Array.isArray(s.items) ||
    !s.items.length ||
    !Array.isArray(s.builds)
  )
    throw Error("Invalid snapshot");
  for (const key of ["heroes", "items", "builds"]) {
    const ids = s[key].map((x) => x.id);
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    )
      throw Error(`Invalid or duplicate ${key} IDs`);
  }
  return s;
}
