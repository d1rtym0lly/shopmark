import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const at = (...parts) => path.join(ROOT, ...parts);
export const readJSON = async (...parts) =>
  JSON.parse(await fs.readFile(at(...parts), "utf8"));
export async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + ".tmp", JSON.stringify(value, null, 2) + "\n");
  await fs.rename(file + ".tmp", file);
}
export const hash = (data) => createHash("sha256").update(data).digest("hex");
export async function cachedJSON(
  url,
  { refresh = false, ttl = 21600000 } = {},
) {
  const file = at(".cache", hash(url) + ".json");
  let previous;
  try {
    previous = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  if (!refresh && previous && Date.now() - previous.time < ttl)
    return previous.value;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(25000),
        headers: {
          "User-Agent":
            "Shopmark/0.1 (+https://github.com/d1rtym0lly/shopmark)",
        },
      });
      if (response.status === 429 || response.status === 503) {
        const seconds = Number(response.headers.get("retry-after") ?? 3);
        if (!Number.isFinite(seconds) || seconds > 30)
          throw Error(`Service busy; retry later (${response.status})`);
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(1, seconds) * 1000),
        );
        continue;
      }
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const value = await response.json();
      await writeJSON(file, { time: Date.now(), value });
      return value;
    } catch (e) {
      if (attempt === 2) throw Error(`${url}: ${e.message}`);
    }
  }
  throw Error(`Retry limit: ${url}`);
}
export async function mapLimit(values, fn, concurrency = 2) {
  const output = new Array(values.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = i++;
        if (index >= values.length) break;
        output[index] = await fn(values[index], index);
      }
    }),
  );
  return output;
}
export async function gamePath() {
  const arg = process.argv.indexOf("--game");
  if (arg >= 0) return path.resolve(process.argv[arg + 1]);
  if (process.env.SHOPMARK_GAME) return path.resolve(process.env.SHOPMARK_GAME);
  for (const dir of [
    "C:/steam/steamapps/common/Deadlock/game/citadel",
    "C:/Program Files (x86)/Steam/steamapps/common/Deadlock/game/citadel",
  ]) {
    try {
      await fs.access(path.join(dir, "pak01_dir.vpk"));
      return path.resolve(dir);
    } catch {}
  }
  throw Error("Pass --game <Deadlock/game/citadel> or set SHOPMARK_GAME.");
}
