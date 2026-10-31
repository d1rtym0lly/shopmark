import fs from "node:fs/promises";
import path from "node:path";
export function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export async function readVpk(file) {
  const data = await fs.readFile(file);
  if (data.readUInt32LE(0) !== 0x55aa1234) throw Error("Invalid VPK signature");
  const version = data.readUInt32LE(4);
  if (![1, 2].includes(version)) throw Error("Unsupported VPK version");
  let pos = version === 2 ? 28 : 12;
  const treeEnd = pos + data.readUInt32LE(8);
  function str() {
    const end = data.indexOf(0, pos);
    if (end < pos || end >= treeEnd) throw Error("Truncated VPK tree");
    const value = data.toString("utf8", pos, end);
    pos = end + 1;
    return value;
  }
  const entries = new Map();
  for (let ext; (ext = str()); )
    for (let dir; (dir = str()); )
      for (let name; (name = str()); ) {
        if (pos + 18 > treeEnd) throw Error("Truncated VPK entry");
        const crc = data.readUInt32LE(pos),
          pre = data.readUInt16LE(pos + 4),
          archive = data.readUInt16LE(pos + 6),
          offset = data.readUInt32LE(pos + 8),
          length = data.readUInt32LE(pos + 12);
        if (data.readUInt16LE(pos + 16) !== 0xffff)
          throw Error("Bad VPK terminator");
        pos += 18;
        const preload = data.subarray(pos, pos + pre);
        pos += pre;
        const key = (dir === " " ? "" : dir + "/") + name + "." + ext;
        entries.set(key, { crc, archive, offset, length, preload });
      }
  async function read(key) {
    const e = entries.get(key);
    if (!e) throw Error(`Game resource missing: ${key}`);
    let payload;
    if (e.archive === 0x7fff)
      payload = data.subarray(
        treeEnd + e.offset,
        treeEnd + e.offset + e.length,
      );
    else {
      const chunk = file.replace(
        /_dir\.vpk$/i,
        "_" + String(e.archive).padStart(3, "0") + ".vpk",
      );
      const handle = await fs.open(chunk, "r");
      try {
        payload = Buffer.alloc(e.length);
        const r = await handle.read(payload, 0, e.length, e.offset);
        if (r.bytesRead !== e.length) throw Error("Truncated VPK data");
      } finally {
        await handle.close();
      }
    }
    const result = Buffer.concat([e.preload, payload]);
    if (crc32(result) !== e.crc) throw Error(`VPK CRC mismatch: ${key}`);
    return result;
  }
  return { entries, read };
}
export function packVpk(files) {
  const groups = new Map();
  let offset = 0;
  const payloads = [];
  for (const [file, data] of [...files].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!/^panorama\/[a-z0-9_/]+\.(?:vcss_c|vxml_c|vjs_c)$/.test(file))
      throw Error(`Unexpected package resource: ${file}`);
    const ext = path.posix.extname(file).slice(1),
      dir = path.posix.dirname(file),
      name = path.posix.basename(file, "." + ext);
    if (!groups.has(ext)) groups.set(ext, new Map());
    if (!groups.get(ext).has(dir)) groups.get(ext).set(dir, []);
    const entry = Buffer.alloc(18);
    entry.writeUInt32LE(crc32(data), 0);
    entry.writeUInt16LE(0x7fff, 6);
    entry.writeUInt32LE(offset, 8);
    entry.writeUInt32LE(data.length, 12);
    entry.writeUInt16LE(0xffff, 16);
    groups
      .get(ext)
      .get(dir)
      .push(Buffer.from(name + "\0"), entry);
    payloads.push(data);
    offset += data.length;
  }
  const tree = [];
  for (const [ext, dirs] of groups) {
    tree.push(Buffer.from(ext + "\0"));
    for (const [dir, entries] of dirs)
      tree.push(Buffer.from(dir + "\0"), ...entries, Buffer.from([0]));
    tree.push(Buffer.from([0]));
  }
  tree.push(Buffer.from([0]));
  const body = Buffer.concat(tree),
    header = Buffer.alloc(12);
  header.writeUInt32LE(0x55aa1234, 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(body.length, 8);
  return Buffer.concat([header, body, ...payloads]);
}
