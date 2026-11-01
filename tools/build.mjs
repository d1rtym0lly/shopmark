import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { at, gamePath, hash, readJSON, writeJSON } from "./lib.mjs";
import { packVpk, readVpk } from "./vpk.mjs";
import { generate } from "./generate.mjs";
const game = await gamePath();
const initialSteamInf = await fs.readFile(path.join(game, "steam.inf"), "utf8");
const arg = (name) =>
  process.argv.includes(name)
    ? process.argv[process.argv.indexOf(name) + 1]
    : null;
const compiler =
  arg("--compiler") ??
  process.env.SHOPMARK_COMPILER ??
  "C:/steam/steamapps/common/Counter-Strike Global Offensive/game/bin/win64/resourcecompiler.exe";
const viewer =
  arg("--viewer") ??
  process.env.SHOPMARK_VIEWER ??
  at(".reference/vrf/Source2Viewer-CLI.exe");
await fs.access(compiler);
await fs.access(viewer);
const vpk = await readVpk(path.join(game, "pak01_dir.vpk"));
const nativeNames = [
  "citadel_ui_build_selector",
  "citadel_shop_mod_view",
  "citadel_shop_mod_view_favorites",
];
const native = at(".build/native");
await fs.mkdir(native, { recursive: true });
const sourceHashes = {};
for (const name of nativeNames) {
  const key = `panorama/layout/${name}.vxml_c`;
  sourceHashes[key] = hash(await vpk.read(key));
}
const decompile = spawnSync(
  viewer,
  [
    "-i",
    path.join(game, "pak01_dir.vpk"),
    "-o",
    native,
    "--vpk_filepath",
    nativeNames.map((n) => "panorama/layout/" + n + ".vxml_c").join(","),
    "-d",
  ],
  { encoding: "utf8", windowsHide: true },
);
if (decompile.status !== 0) throw Error(decompile.stderr || decompile.stdout);
await generate();
const content = at(".build/content/shopmark");
const output = at(".build/game/shopmark");
await fs.mkdir(content, { recursive: true });
await fs.mkdir(output, { recursive: true });
// Source 2 tools require a sibling core mount even with absolute SearchPaths.
const coreMount = at(".build/game/core");
try {
  await fs.access(coreMount);
} catch {
  await fs.symlink(
    path.resolve(path.dirname(compiler), "../../core"),
    coreMount,
    "junction",
  );
}
const binMount = path.join(output, "bin");
try {
  await fs.access(binMount);
} catch {
  await fs.symlink(
    path.resolve(path.dirname(compiler), "../../csgo/bin"),
    binMount,
    "junction",
  );
}
// New Deadlock archives may use a format the CS2 compiler cannot mount.
// Stage only compiled style dependencies through our CRC-checked archive reader.
const nativeAssets = at(".build/game/nativeassets");
for (const key of vpk.entries.keys()) {
  if (!key.startsWith("panorama/styles/") || !key.endsWith(".vcss_c")) continue;
  const destination = path.join(nativeAssets, key);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, await vpk.read(key));
}
await fs.cp(at(".build/generated/panorama"), path.join(content, "panorama"), {
  recursive: true,
});
await fs.cp(
  at("src/panorama/shopmark.js"),
  path.join(content, "panorama/scripts/shopmark.js"),
);
await fs.cp(
  at("src/panorama/shopmark.css"),
  path.join(content, "panorama/styles/shopmark.css"),
);
await fs.copyFile(
  at("src/panorama/shopmark_badge.js"),
  path.join(content, "panorama/scripts/shopmark_badge.js"),
);
await fs.copyFile(
  at("src/coach.js"),
  path.join(content, "panorama/scripts/shopmark_coach.js"),
);
const includes =
  '\n\t\t<include src="s2r://panorama/styles/shopmark.vcss_c" />\n\t\t<include src="s2r://panorama/styles/shopmark_marks.vcss_c" />\n\t';
const badge =
  '<Panel class="ShopmarkBadges" hittest="false" hittestchildren="false">' +
  Object.entries({
    Buff: "↑",
    Nerf: "↓",
    Unchanged: "=",
    Mixed: "↕",
    Changed: "•",
    Unknown: "?",
  })
    .map(
      ([name, mark]) =>
        `<Label class="ShopmarkBadge Shopmark${name}" text="${mark}" hittest="false" />`,
    )
    .join("") +
  "</Panel>";
await fs.mkdir(path.join(content, "panorama/layout"), { recursive: true });
for (const name of nativeNames) {
  let xml = await fs.readFile(
    path.join(native, "panorama/layout", name + ".xml"),
    "utf8",
  );
  xml = xml.replace(/\.(vcss|vjs|vxml)(?=["'])/g, ".$1_c");
  if (!xml.includes("</styles>")) throw Error("Native styles anchor changed");
  xml = xml.replace("</styles>", includes + "</styles>");
  if (name === "citadel_ui_build_selector") {
    if (!xml.includes("<CitadelHeroBuildsSelector>"))
      throw Error("Native build selector anchor changed; review needed");
    xml = xml.replace(
      "</styles>",
      '</styles>\n<scripts><include src="s2r://panorama/scripts/shopmark_data.vjs_c" /><include src="s2r://panorama/scripts/shopmark_coach.vjs_c" /><include src="s2r://panorama/scripts/shopmark.vjs_c" /></scripts>',
    );
    xml = xml.replace(
      "<CitadelHeroBuildsSelector>",
      '<CitadelHeroBuildsSelector><Panel id="ShopmarkMount" />',
    );
  } else {
    const anchor = '<Panel class="modIconContainer">';
    if (!xml.includes(anchor))
      throw Error("Native item card anchor changed; review needed");
    xml = xml.replace(anchor, anchor + badge);
    xml = xml.replace(
      "</styles>",
      '</styles><scripts><include src="s2r://panorama/scripts/shopmark_marks_data.vjs_c" /><include src="s2r://panorama/scripts/shopmark_badge.vjs_c" /></scripts>',
    );
  }
  await fs.writeFile(path.join(content, "panorama/layout", name + ".xml"), xml);
}
// The compiler writes only inside .build. Installed gameinfo and addons are untouched.
const gi =
  '"GameInfo" { "game" "Shopmark compile sandbox" "FileSystem" { "SteamAppId" "1422450" "SearchPaths" { "Game" "shopmark" "Game" "nativeassets" "Game" "core" } } }';
await fs.writeFile(path.join(output, "gameinfo.gi"), gi);
const sources = [
  "panorama/scripts/shopmark_data.js",
  "panorama/scripts/shopmark.js",
  "panorama/scripts/shopmark_coach.js",
  "panorama/scripts/shopmark_marks_data.js",
  "panorama/scripts/shopmark_badge.js",
  "panorama/styles/shopmark.css",
  "panorama/styles/shopmark_marks.css",
  ...nativeNames.map((n) => "panorama/layout/" + n + ".xml"),
];
const log = [];
for (const source of sources) {
  const r = spawnSync(
    compiler,
    ["-game", output, "-i", path.join(content, source), "-nop4", "-f"],
    { encoding: "utf8", windowsHide: true },
  );
  log.push(r.stdout ?? "", r.stderr ?? "");
  await fs.writeFile(at(".build/compiler.log"), log.join("\n"));
  if (
    r.status !== 0 ||
    /\b[1-9]\d* failed\b|\b(?:fatal )?error:/i.test(
      (r.stdout ?? "") + (r.stderr ?? ""),
    )
  )
    throw Error("Compilation failed: " + source + "; see .build/compiler.log");
}
const extensions = { ".js": ".vjs_c", ".css": ".vcss_c", ".xml": ".vxml_c" };
const files = new Map();
for (const source of sources) {
  const key = source.replace(/\.(js|css|xml)$/, (ext) => extensions[ext]);
  files.set(key, await fs.readFile(path.join(output, key)));
}
const snapshot = await readJSON("data/snapshot.json");
const steamInf = await fs.readFile(path.join(game, "steam.inf"), "utf8");
if (steamInf !== initialSteamInf)
  throw Error(
    "Steam updated Deadlock during compilation. Rebuild after the update finishes.",
  );
const currentVpk = await readVpk(path.join(game, "pak01_dir.vpk"));
for (const [key, checksum] of Object.entries(sourceHashes))
  if (hash(await currentVpk.read(key)) !== checksum)
    throw Error("Native resources changed during compilation; rebuild.");
const version = /ClientVersion=(\d+)/.exec(steamInf)?.[1];
const artifact = packVpk(files);
await fs.mkdir(at("dist"), { recursive: true });
await fs.writeFile(at("dist/shopmark.vpk"), artifact);
await writeJSON(at("dist/build-manifest.json"), {
  version: "0.3.0",
  gameBuild: version,
  createdAt: new Date().toISOString(),
  dataGeneratedAt: snapshot.generatedAt,
  sha256: hash(artifact),
  size: artifact.length,
  nativeHashes: sourceHashes,
  resources: [...files.keys()],
  runtimeTested: false,
});
const verify = await readVpk(at("dist/shopmark.vpk"));
for (const key of files.keys()) await verify.read(key);
console.log(
  `VPK built and CRC verified: ${artifact.length} bytes, ${files.size} resources, game ${version}. No game files installed.`,
);
