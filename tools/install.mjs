import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { at, readJSON, gamePath, hash, writeJSON } from "./lib.mjs";
import { readVpk } from "./vpk.mjs";
const game = await gamePath();
const running = execFileSync(
  "tasklist",
  ["/FI", "IMAGENAME eq deadlock.exe", "/FO", "CSV", "/NH"],
  { encoding: "utf8", windowsHide: true },
);
if (running.toLowerCase().includes('"deadlock.exe"'))
  throw Error("Close Deadlock before installation.");
const manifest = await readJSON("dist/build-manifest.json");
const data = await fs.readFile(at("dist/shopmark.vpk"));
if (hash(data) !== manifest.sha256) throw Error("Artifact checksum mismatch");
const native = await readVpk(path.join(game, "pak01_dir.vpk"));
for (const [key, expected] of Object.entries(manifest.nativeHashes))
  if (hash(await native.read(key)) !== expected)
    throw Error("Game resources changed; rebuild first.");
const gi = await fs.readFile(path.join(game, "gameinfo.gi"), "utf8");
if (!/^\s*Game\s+"?citadel\/addons"?\s*$/im.test(gi))
  throw Error("Addons SearchPath missing; configure the mod manager first.");
const addons = path.join(game, "addons");
const names = await fs.readdir(addons);
let prior;
try {
  prior = await readJSON(".cache/installation.json");
} catch {}
let ownedPath;
if (
  prior &&
  path.dirname(path.resolve(prior.destination)).toLowerCase() ===
    path.resolve(addons).toLowerCase()
) {
  try {
    if (hash(await fs.readFile(prior.destination)) === prior.sha256)
      ownedPath = prior.destination;
  } catch {}
}

for (const name of names.filter(
  (n) => /\.vpk$/i.test(n) && !/_\d{3}\.vpk$/i.test(n),
)) {
  if (
    ownedPath &&
    path.resolve(addons, name).toLowerCase() ===
      path.resolve(ownedPath).toLowerCase()
  )
    continue;
  const other = await readVpk(path.join(addons, name));
  if (Object.keys(manifest.nativeHashes).some((key) => other.entries.has(key)))
    throw Error("UI conflict with " + name);
}
let destination = ownedPath;
for (let n = 1; !destination && n <= 99; n++) {
  const base = "pak" + String(n).padStart(2, "0");
  if (
    !names.some(
      (name) =>
        name.toLowerCase().startsWith(base.toLowerCase() + "_") ||
        name.toLowerCase() === base + ".vpk",
    )
  ) {
    destination = path.join(addons, base + "_dir.vpk");
    break;
  }
}
if (!destination) throw Error("No free addon slot");
if (ownedPath) {
  const old = await fs.readFile(ownedPath);
  if (hash(old) !== prior.sha256)
    throw Error("Installed mod changed during update");
  await fs.writeFile(at(".cache/previous-shopmark.vpk"), old);
  const temp = destination + ".shopmark.tmp";
  await fs.writeFile(temp, data, { flag: "wx" });
  await fs.rename(temp, destination);
} else await fs.writeFile(destination, data, { flag: "wx" });
if (hash(await fs.readFile(destination)) !== manifest.sha256)
  throw Error("Installed copy checksum mismatch");
await writeJSON(at(".cache/installation.json"), {
  destination,
  sha256: manifest.sha256,
  installedAt: new Date().toISOString(),
  gameinfoChanged: false,
});
console.log("Installed and verified: " + destination);
