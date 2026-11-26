// Bake: public/campus.json -> adaptive quadtree of tiles (public/tiles/manifest.json + one file per leaf).
// Derived from data only: nothing here knows the map's size or its layer names, so a bigger campus.json just bakes bigger.
// Usage: node tools/bake.mjs   (also prints the streaming-constraint checks from AGENTS.md)
// Spec: Project doc claude/technoverse-streaming.md
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";

const MAX_OBJ = 150, MAX_BYTES = 60_000; // split a tile above either budget
const MIN_SIZE = 64, MAX_DEPTH = 9;       // metres / levels: stop splitting here
const CHUNK = 150;                        // metres: long polylines (roads, rail, paths) are cut into pieces this long
const ORIGIN_LIMIT = 10_000;              // constraint 2: float32 is ~1 mm at 10 km; past this add the floating-origin shift
const DENSITY_X = 8;                      // constraint 3 (x median leaf, by bytes or object count)
const t0 = Date.now();
const raw = readFileSync("public/campus.json", "utf8");
const campus = JSON.parse(raw);
const round1 = (v) => Math.round(v * 10) / 10, round2 = (v) => Math.round(v * 100) / 100;

// 1. flatten every layer (any array in the file) into one list. Roads/rail/paths are cut into CHUNK-metre pieces so
//    a 3 km road never inflates a tile's reach; pieces keep `sid` and a `part` index so the runtime can stitch them.
const items = [], skipped = [];
const bb = (pts) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0, z0, x1, z1]; };
const add = (kind, f, pts) => { const [x0, z0, x1, z1] = bb(pts); items.push({ kind, f, x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, bytes: JSON.stringify(f).length }); };
const LINES = new Set(["roads", "paths", "rail"]);
for (const [kind, list] of Object.entries(campus)) {
  if (!Array.isArray(list)) continue;
  for (const f of list) {
    const pts = f.pts ?? (Number.isFinite(f.x) && Number.isFinite(f.z) ? [[f.x, f.z]] : null);
    if (!pts || pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) { skipped.push(kind); continue; }
    if (!LINES.has(kind) || pts.length < 3) { add(kind, f, pts); continue; }
    let piece = [pts[0]], len = 0, part = 0;
    for (let i = 1; i < pts.length; i++) {
      piece.push(pts[i]); len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (len >= CHUNK || i === pts.length - 1) { add(kind, { ...f, pts: piece, part: part++ }, piece); piece = [pts[i]]; len = 0; }
    }
  }
}
if (skipped.length) console.warn(`note: skipped ${skipped.length} feature(s) with no usable coordinates (layers: ${[...new Set(skipped)].join(", ")})`);

// 2. square root box over everything
const all = bb(items.flatMap((i) => [[i.x0, i.z0], [i.x1, i.z1]]));
const half = Math.max(all[2] - all[0], all[3] - all[1]) / 2 + 1, mcx = (all[0] + all[2]) / 2, mcz = (all[1] + all[3]) / 2;
const root = [mcx - half, mcz - half, mcx + half, mcz + half];

// 3. adaptive split; a feature belongs to the tile holding its centre, `ext` covers the full extent of what the tile holds
const leaves = [];
const extOf = (list) => { const b = bb(list.flatMap((i) => [[i.x0, i.z0], [i.x1, i.z1]])); return b.map(round1); };
function build(list, box, depth, id) {
  const bytes = list.reduce((s, i) => s + i.bytes, 0), size = box[2] - box[0];
  const node = { id, box: box.map(round1), n: list.length, bytes };
  if ((list.length <= MAX_OBJ && bytes <= MAX_BYTES) || depth >= MAX_DEPTH || size / 2 < MIN_SIZE) {
    node.leaf = true; node.ext = extOf(list); node.geometricError = 0;
    leaves.push({ node, list });
    return node;
  }
  const mx = (box[0] + box[2]) / 2, mz = (box[1] + box[3]) / 2, kids = [[], [], [], []];
  for (const i of list) kids[(i.cx >= mx ? 1 : 0) + (i.cz >= mz ? 2 : 0)].push(i);
  const boxes = [[box[0], box[1], mx, mz], [mx, box[1], box[2], mz], [box[0], mz, mx, box[3]], [mx, mz, box[2], box[3]]];
  node.children = kids.map((k, q) => (k.length ? build(k, boxes[q], depth + 1, id + q) : null)).filter(Boolean);
  node.ext = bb(node.children.flatMap((c) => [[c.ext[0], c.ext[1]], [c.ext[2], c.ext[3]]]));
  node.geometricError = round1(size * 0.05); // placeholder until Phase 1b measures the real error of the merged low-detail version
  node.lod = null;                           // Phase 1b: merged low-detail content for this tile
  return node;
}
const tree = build(items, root, 0, "r");

// 4. write. The hash covers the source and the limits, and is in every tile file name, so a re-bake can never mix
//    old tiles with a new manifest. Coordinates inside a tile are relative to `origin` (the box centre), which makes a
//    later floating-origin shift trivial.
const hash = createHash("sha1").update(raw).update(JSON.stringify([MAX_OBJ, MAX_BYTES, MIN_SIZE, MAX_DEPTH, CHUNK])).digest("hex").slice(0, 10);
try { rmSync("public/tiles", { recursive: true, force: true }); } catch { console.warn("note: could not clean public/tiles first; stale files are harmless (names carry the hash, manifest.json is the index)"); }
mkdirSync("public/tiles", { recursive: true });
for (const { node, list } of leaves) {
  const ox = round1((node.box[0] + node.box[2]) / 2), oz = round1((node.box[1] + node.box[3]) / 2);
  const features = {};
  for (const i of list) {
    const f = { ...i.f };
    if (f.pts) f.pts = f.pts.map(([x, z]) => [round2(x - ox), round2(z - oz)]);
    else { f.x = round2(f.x - ox); f.z = round2(f.z - oz); }
    (features[i.kind] ??= []).push(f);
  }
  node.file = `${node.id}.${hash}.json`;
  writeFileSync(`public/tiles/${node.file}`, JSON.stringify({ id: node.id, origin: [ox, oz], box: node.box, ext: node.ext, features }));
}
writeFileSync("public/tiles/manifest.json", JSON.stringify({ version: 1, hash, source: campus.meta?.source ?? null, osmDate: campus.meta?.osmDate ?? null, limits: { MAX_OBJ, MAX_BYTES, MIN_SIZE, MAX_DEPTH, CHUNK }, root: tree }));

// 5. stats + the constraint checks
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const medB = med(leaves.map((l) => l.node.bytes)), medN = med(leaves.map((l) => l.node.n));
const depth = leaves.reduce((m, l) => Math.max(m, l.node.id.length - 1), 0);
console.log(`baked ${items.length} pieces -> ${leaves.length} leaf tiles, depth ${depth}, hash ${hash}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`leaf bytes: median ${medB}, max ${leaves.reduce((m, l) => Math.max(m, l.node.bytes), 0)}; objects: median ${medN}`);
const reach = leaves.reduce((m, l) => Math.max(m, (l.node.ext[2] - l.node.ext[0]) / (l.node.box[2] - l.node.box[0]), (l.node.ext[3] - l.node.ext[1]) / (l.node.box[3] - l.node.box[1])), 0);
console.log(`worst tile reach: ${reach.toFixed(1)}x its box (big polygons: water/grass/buildings; lines are chunked)`);
let warn = 0;
const W = (s) => { warn++; console.warn(`⚠ STREAMING CONSTRAINT: ${s}`); };
const far = items.reduce((m, i) => Math.max(m, Math.abs(i.x0), Math.abs(i.x1), Math.abs(i.z0), Math.abs(i.z1)), 0);
console.log(`furthest content from origin: ${Math.round(far)} m (limit ${ORIGIN_LIMIT})`);
if (far > ORIGIN_LIMIT) W(`origin-precision — content at ${Math.round(far)} m — add the floating-origin shift`);
const dense = leaves.filter((l) => l.node.bytes > DENSITY_X * medB || l.node.n > DENSITY_X * medN);
if (dense.length) W(`grid-density — ${dense.length} leaf tile(s) over ${DENSITY_X}x median (worst ${dense[0].node.id}: ${dense[0].node.bytes} B, ${dense[0].node.n} objects) — lower MIN_SIZE or MAX_DEPTH`);
// constraint 1 (heuristic): numeric-literal world placement. Only files that build the static world; characters, vehicles and UI use local offsets and are exempt.
// A hand-authored set is allowed when public/authored-sets.json declares it as ONE unit with an anchor and a radius; its file is then exempt from the lint.
const authored = JSON.parse(readFileSync("public/authored-sets.json", "utf8"));
for (const a of authored) {
  if (!a.file || !a.anchor || !(a.radius > 0)) W(`no-hand-placed-objects — public/authored-sets.json: entry "${a.unit || a.file}" needs file, anchor and radius > 0`);
  else console.log(`authored set: ${a.file} (${a.unit}), anchor ${a.anchor}, radius ${a.radius} m`);
}
const exempt = new Set(authored.filter((a) => a.file && a.anchor && a.radius > 0).map((a) => a.file));
for (const f of ["world.js", "street.js", "trees.js", "herotrees.js", "opposite.js"].filter((f) => !exempt.has(f))) {
  const hits = readFileSync(`public/${f}`, "utf8").split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /position\.set\(\s*-?\d/.test(l));
  if (hits.length) W(`no-hand-placed-objects — public/${f}: ${hits.length} literal position.set at lines ${hits.slice(0, 6).map((h) => h[0]).join(",")}${hits.length > 6 ? ",…" : ""} (heuristic; local offsets inside a group are fine) — move static ones into data/world/*.json`);
}
console.log(warn ? `${warn} warning(s)` : "no streaming-constraint warnings");
