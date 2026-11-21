// FBX (UDIM-textured, GTA-free tuk-tuk) -> single web-ready GLB with one 2048 atlas set.
import fs from 'fs';
import sharp from 'sharp';
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener(){}, removeEventListener(){}, set src(v){} }), createElement: () => ({ style: {}, getContext: () => null, addEventListener(){}, removeEventListener(){}, set src(v){} }) };
globalThis.self = globalThis;
const origWarn = console.warn; console.warn = () => {};
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const { Document, NodeIO } = await import('@gltf-transform/core');
const [fbxPath, texDir, outPath] = process.argv.slice(2);
sharp.cache(false);
const buf = fs.readFileSync(fbxPath);
const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
root.updateMatrixWorld(true);

// ---- atlas: tiles 1001..1008 -> 3x3 grid in 2048
const ATLAS = 2048, GRID = 3, CELL = Math.floor(ATLAS / GRID);
const tileNames = { 1001: 'Body', 1002: 'Body', 1003: 'Body', 1004: 'Wheels', 1005: 'Inside', 1006: 'Inside', 1007: 'Inside', 1008: 'Accessories' };
const tileIds = Object.keys(tileNames).map(Number);
const cellOf = (udim) => { const i = tileIds.indexOf(udim); return { col: i % GRID, row: Math.floor(i / GRID) }; };
async function atlas(kind) {
  const comps = [];
  for (const id of tileIds) {
    const { col, row } = cellOf(id), set = tileNames[id], f = (k) => `${texDir}/${set}_${k}.${id}.png`;
    let img;
    if (kind === 'color') img = await sharp(f('BaseColor'), { limitInputPixels: false }).resize(CELL, CELL).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    else if (kind === 'normal') img = await sharp(f('Normal'), { limitInputPixels: false }).resize(CELL, CELL).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    else {
      const r = await sharp(f('Roughness'), { limitInputPixels: false }).resize(CELL, CELL).greyscale().raw().toBuffer();
      const m = await sharp(f('Metallic'), { limitInputPixels: false }).resize(CELL, CELL).greyscale().raw().toBuffer();
      const out = Buffer.alloc(CELL * CELL * 3); for (let i = 0; i < CELL * CELL; i++) { out[i * 3] = 255; out[i * 3 + 1] = r[i]; out[i * 3 + 2] = m[i]; }
      img = { data: out, info: { width: CELL, height: CELL, channels: 3 } };
    }
    comps.push({ input: img.data, raw: { width: CELL, height: CELL, channels: 3 }, left: col * CELL, top: row * CELL });
  }
  const bg = kind === 'normal' ? { r: 128, g: 128, b: 255 } : { r: 128, g: 128, b: 128 };
  return sharp({ create: { width: ATLAS, height: ATLAS, channels: 3, background: bg } }).composite(comps).jpeg({ quality: kind === 'normal' ? 90 : 86 }).toBuffer();
}
const [colorJpg, mrJpg, normalJpg] = [await atlas('color'), await atlas('mr'), await atlas('normal')];
console.log('atlas bytes', colorJpg.length, mrJpg.length, normalJpg.length);

// ---- geometry
const parts = []; // {name, pos, nor, uv, idx, glass}
const bakedBox = new THREE.Box3();
root.traverse((n) => { if (n.isMesh) bakedBox.expandByObject(n); });
// front wheel decides the facing: game forward is -Z
let frontZ = 0; root.traverse((n) => { if (n.isMesh && /^Wheel_F/.test(n.name)) { const b = new THREE.Box3().setFromObject(n); frontZ = (b.min.z + b.max.z) / 2; } });
const flip = frontZ > (bakedBox.min.z + bakedBox.max.z) / 2;
const cx = (bakedBox.min.x + bakedBox.max.x) / 2, cz = (bakedBox.min.z + bakedBox.max.z) / 2, y0 = bakedBox.min.y;
console.log('front at z', frontZ.toFixed(2), 'centre z', cz.toFixed(2), flip ? '=> flipping 180°' : '=> already faces -Z');
root.traverse((n) => {
  if (!n.isMesh) return;
  const g = n.geometry.clone(); g.applyMatrix4(n.matrixWorld);
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, count = P.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const mat = Array.isArray(n.material) ? n.material[0] : n.material;
  const glass = /glass/i.test(mat.name);
  let tile = 1001; if (!glass) { let su = 0; for (let i = 0; i < count; i++) su += U.getX(i); tile = 1001 + Math.floor(su / count); }
  const { col, row } = glass ? { col: 0, row: 0 } : cellOf(tile);
  for (let i = 0; i < count; i++) {
    let x = P.getX(i) - cx, y = P.getY(i) - y0, z = P.getZ(i) - cz, nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
    if (flip) { x = -x; z = -z; nx = -nx; nz = -nz; }
    pos.set([x, y, z], i * 3); nor.set([nx, ny, nz], i * 3);
    const ul = Math.min(0.997, Math.max(0.003, U.getX(i) - (tile - 1001))), vl = Math.min(0.997, Math.max(0.003, U.getY(i)));
    uv[i * 2] = (col + ul) / GRID; uv[i * 2 + 1] = (row + (1 - vl)) / GRID;
  }
  const idx = n.geometry.index ? Uint32Array.from(n.geometry.index.array) : Uint32Array.from({ length: count }, (_, i) => i);
  parts.push({ name: n.name, pos, nor, uv, idx, glass, tile });
});

// ---- pivots for the wheels so they can spin: front wheel + rim, rear wheels + rims
const doc = new Document(), buffer = doc.createBuffer();
const scene = doc.createScene('tuktuk'), rootNode = doc.createNode('tuktuk'); scene.addChild(rootNode);
const tex = (name, data) => doc.createTexture(name).setImage(data).setMimeType('image/jpeg');
const body = doc.createMaterial('body').setBaseColorTexture(tex('color', colorJpg)).setMetallicRoughnessTexture(tex('mr', mrJpg)).setNormalTexture(tex('normal', normalJpg)).setMetallicFactor(1).setRoughnessFactor(1).setDoubleSided(false);
const glassMat = doc.createMaterial('glass').setBaseColorFactor([0.62, 0.76, 0.82, 0.22]).setAlphaMode('BLEND').setRoughnessFactor(0.05).setMetallicFactor(0).setDoubleSided(true);
const groups = { wheel_front: /^(Wheel_F|Rim_F)/, wheel_rear: /^(Wheel_B|Rim_B)/ };
const nodeFor = {};
for (const [g, re] of Object.entries(groups)) {
  const ps = parts.filter((p) => re.test(p.name)); if (!ps.length) continue;
  const bb = new THREE.Box3(); for (const p of ps) for (let i = 0; i < p.pos.length; i += 3) bb.expandByPoint(new THREE.Vector3(p.pos[i], p.pos[i + 1], p.pos[i + 2]));
  const c = bb.getCenter(new THREE.Vector3());
  const node = doc.createNode(g).setTranslation([c.x, c.y, c.z]); rootNode.addChild(node); nodeFor[g] = { node, c };
  for (const p of ps) { for (let i = 0; i < p.pos.length; i += 3) { p.pos[i] -= c.x; p.pos[i + 1] -= c.y; p.pos[i + 2] -= c.z; } p.parent = g; }
}
let tris = 0;
for (const p of parts) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(p.pos).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(p.nor).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(p.uv).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(p.idx).setBuffer(buffer))
    .setMaterial(p.glass ? glassMat : body);
  const mesh = doc.createMesh(p.name).addPrimitive(prim);
  const node = doc.createNode(p.name).setMesh(mesh);
  (p.parent ? nodeFor[p.parent].node : rootNode).addChild(node);
  tris += p.idx.length / 3;
}
const io = new NodeIO(); await io.write(outPath, doc);
const size = new THREE.Box3(); for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) size.expandByPoint(new THREE.Vector3(p.pos[i], p.pos[i + 1], p.pos[i + 2]));
console.log('wrote', outPath, fs.statSync(outPath).size, 'bytes,', tris, 'tris,', parts.length, 'parts; wheel pivots', Object.keys(nodeFor).join(','));
