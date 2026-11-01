import fs from "node:fs/promises";
import path from "node:path";
import { at, gamePath, hash, readJSON, writeJSON } from "./lib.mjs";
import { readVpk } from "./vpk.mjs";
const game = path.resolve(await gamePath());
const manifest = await readJSON("dist/build-manifest.json");
const archive = await readVpk(path.join(game, "pak01_dir.vpk"));
const changed = [];
for (const [key, expected] of Object.entries(manifest.nativeHashes))
  if (hash(await archive.read(key)) !== expected) changed.push(key);
const artifact = await fs.readFile(at("dist/shopmark.vpk"));
const integrity = hash(artifact) === manifest.sha256;
const conflicts = [];
const installedCopies = [];
const installedOtherVersions = [];
let ownedInstallation;
try { ownedInstallation = await readJSON('.cache/installation.json'); } catch {}
const dirs = [path.join(game, "addons")];
const gi = await fs.readFile(path.join(game, "gameinfo.gi"), "utf8");
// Include manager profiles mounted by SearchPaths, when explicitly quoted.
for (const m of gi.matchAll(/^\s*Game\s+"([^"]+)"/gim)) {
  if (m[1].includes("|")) continue;
  const dir = path.resolve(game, "..", m[1]);
  if (dir !== game && !dirs.includes(dir)) dirs.push(dir);
}
for (const dir of dirs) {
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    continue;
  }
  for (const name of names.filter(
    (n) =>
      n.endsWith("_dir.vpk") || (/\.vpk$/i.test(n) && !/_\d{3}\.vpk$/i.test(n)),
  )) {
    const file = path.join(dir, name);
    try {
      if ((await fs.stat(file)).size === manifest.size && hash(await fs.readFile(file)) === manifest.sha256) {
        installedCopies.push(file);
        continue;
      }
      if (ownedInstallation && path.resolve(ownedInstallation.destination).toLowerCase() === path.resolve(file).toLowerCase() &&
          path.dirname(path.resolve(file)).toLowerCase() === path.resolve(game, 'addons').toLowerCase() &&
          hash(await fs.readFile(file)) === ownedInstallation.sha256) {
        installedOtherVersions.push(file);
        continue;
      }
      const addon = await readVpk(file);
      const shared = Object.keys(manifest.nativeHashes).filter((key) =>
        addon.entries.has(key),
      );
      if (shared.length) conflicts.push({ file, resources: shared });
    } catch (e) {
      conflicts.push({ file, error: e.message });
    }
  }
}
const report = {
  game,
  artifactIntegrity: integrity,
  nativeFilesChanged: changed,
  conflicts,
  installedCopies,
  installedOtherVersions,
  runtimeTested: manifest.runtimeTested,
  checkedAt: new Date().toISOString(),
};
await writeJSON(at("dist/compatibility-report.json"), report);
console.log(JSON.stringify(report, null, 2));
if (!integrity || changed.length || conflicts.length) process.exitCode = 1;
