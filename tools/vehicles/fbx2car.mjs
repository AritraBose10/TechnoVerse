// Generic car FBX -> lightweight GLB. Flat-colour roles instead of textures (traffic-distance cars).
// usage: node fbx2car.mjs in.fbx out.glb [--keep-all] [--lod0 10000] [--lod1 2500] [--drop re] [--scale 0.01]
import fs from 'fs';
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener(){}, removeEventListener(){}, set src(v){} }), createElement: () => ({ style: {}, getContext: () => null, addEventListener(){}, removeEventListener(){}, set src(v){} }) };
globalThis.self = globalThis; globalThis.window = { URL: { createObjectURL: () => '' } }; console.warn = () => {};
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const { Document, NodeIO } = await import('@gltf-transform/core');
const { MeshoptSimplifier } = await import('meshoptimizer'); await MeshoptSimplifier.ready;
const args = process.argv.slice(2); const [inp, outp] = args;
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const L0 = +opt('lod0', 10000), L1 = +opt('lod1', 2500);
const DROP = new RegExp(opt('drop', '^(dashboard|seats.*|speedometer.*|movsteer.*|steer.*|radio.*|bancos|volante|suspens.*|painel|detalhes|dash.*|console.*|int_.*|hanger.*|pedal.*|gear.*|handbrake.*|belt.*|carpet.*|petrol.*|screen_glass|sidewall|interior.*|motor.*|engine.*|suspension.*|plane.*|.*_int_.*|helper.*|dummy.*|shadow.*|ground.*|floor.*|undercar.*|exhaust.*|chassis_dummy)$'), 'i');
const GENERIC = args.includes('--generic');
const PAINT_RE = new RegExp(opt('paint', '^$'), 'i'), WHEEL_RE = new RegExp(opt('wheels', 'wheel|roda'), 'i'), GLASS_RE = new RegExp(opt('glass', 'glass|windscreen'), 'i');
const FLIP = opt('flip', 'auto'), CENTER = opt('center', 'wheels');
const buf = fs.readFileSync(inp);
let root;
if (/\.obj$/i.test(inp)) { const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js'); root = new OBJLoader().parse(buf.toString('utf8')); }
else if (/\.(glb|gltf)$/i.test(inp)) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  globalThis.createImageBitmap = undefined;
  root = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (g) => res(g.scene), rej));
  root.traverse((n) => { if (n.isMesh) n.geometry.clearGroups && 0; });
} else root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
root.updateMatrixWorld(true);
const tb = new THREE.Box3().setFromObject(root);
const scale = +opt('scale', (tb.max.y - tb.min.y) > 20 ? 0.01 : 1);

const C = { trim: [0.035, 0.035, 0.04], rubber: [0.02, 0.02, 0.022], rim: [0.55, 0.56, 0.58], lampW: [0.82, 0.84, 0.88], lampR: [0.45, 0.02, 0.02], lampA: [0.85, 0.45, 0.05], chrome: [0.7, 0.7, 0.72] };
function roleOf(mesh, mat) {
  const n = mesh.name.toLowerCase(), m = (mat?.name || '').toLowerCase();
  if (GENERIC) {
    if (WHEEL_RE.test(mesh.name)) return 'wheel';
    if (GLASS_RE.test(mat?.name || '') || (mat?.opacity ?? 1) < 0.9) return 'glass';
    if (PAINT_RE.test(mat?.name || '') || (mat?.map && /^#?(cccccc|ffffff)$/i.test(mat.color.getHexString()))) return 'paint';
    return 'col';
  }
  if (WHEEL_RE.test(mesh.name)) return 'wheel';
  if (/tailight_glass|taillight_glass/.test(n)) return 'lampR';
  if (/indicator.*glass/.test(n)) return 'lampA';
  if (/glass|windscreen/.test(n) || /^glass/.test(m)) return 'glass';
  if (/^indicator/.test(n)) return 'lampA';
  if (/taillight|tailight|tailights|brake/.test(n)) return 'lampR';
  if (/revlight|headlight|foglight|sidebar_light/.test(n)) return 'lampW';
  if (/grille/.test(n)) return 'trim';
  if (/front light|headl/.test(m)) return 'lampW';
  if (/rear light|tail ?l|brake/.test(m)) return 'lampR';
  if (/indicator|blinker/.test(m)) return 'lampA';
  if (/^primary(\.\d+)?$/.test(m)) return 'paint';
  if (!HAS_PRIMARY && /^(chassis|lataria|door|boot|bonnet|bump|wing|roof|body|hood|trunk|fender|mirror)/.test(n) && !/glass|interior|wheel|light|grille|grade|rubber|chrome|logo|lamp|disc|brake/.test(m)) return 'paint';
  return 'trim';
}
// ---- collect triangles per role (world space, metres, car-local axes)
let HAS_PRIMARY = false; root.traverse((n) => { if (n.isMesh) for (const m of (Array.isArray(n.material) ? n.material : [n.material])) if (/^primary(\.\d+)?$/.test(m.name)) HAS_PRIMARY = true; });
const GLOBAL = new Map(), DOMINANT = new Map(); // body-named meshes: the material covering most triangles = paint when the model has no 'primary'
root.traverse((n) => { if (!n.isMesh || !/^(chassis|lataria|door|boot|bonnet|bump|wing|roof|body|hood|trunk|fender)/i.test(n.name)) return; const ms = Array.isArray(n.material) ? n.material : [n.material], cnt = new Map();
  const g = n.geometry; for (const gr of (g.groups.length ? g.groups : [{ count: 1, materialIndex: 0 }])) { const m = ms[gr.materialIndex] || ms[0]; if (/glass|interior|wheel|light/i.test(m.name)) continue; cnt.set(m.uuid, (cnt.get(m.uuid) || 0) + gr.count); }
  let best = null, bc = 0; for (const [k, c] of cnt) if (c > bc) { best = k; bc = c; } DOMINANT.set(n.uuid, best); for (const [k, c] of cnt) GLOBAL.set(k, (GLOBAL.get(k) || 0) + c); });
let GLOBAL_PAINT = null; { let bc = 0; for (const [k, c] of GLOBAL) if (c > bc) { bc = c; GLOBAL_PAINT = k; } }
const meshes = []; const carTop = tb.max.y;
root.traverse((n) => {
  if (!n.isMesh || DROP.test(n.name)) return;
  if (/^(chassis|lataria)/i.test(n.name)) { // keep only if it is the visible shell: has paint material and reaches the roof
    const bb = new THREE.Box3().setFromObject(n), ms = Array.isArray(n.material) ? n.material : [n.material];
    if (!((HAS_PRIMARY ? ms.some((m) => /^primary(\.\d+)?$/.test(m.name)) : true) && bb.max.y > 0.8 * carTop)) return;
  }
  meshes.push(n);
});
const wheelNodes = meshes.filter((n) => WHEEL_RE.test(n.name));
const wc = wheelNodes.map((n) => new THREE.Box3().setFromObject(n));
const wheelBottom = Math.min(...wc.map((b) => b.min.y)), mid = new THREE.Vector3();
const bodyBox = new THREE.Box3(); for (const n of meshes) if (!wheelNodes.includes(n)) bodyBox.expandByObject(n);
const cx = CENTER === 'bbox' ? (bodyBox.min.x + bodyBox.max.x) / 2 : wc.length ? wc.reduce((s, b) => s + (b.min.x + b.max.x) / 2, 0) / wc.length : (tb.min.x + tb.max.x) / 2;
const cz = CENTER === 'bbox' ? (bodyBox.min.z + bodyBox.max.z) / 2 : wc.length ? wc.reduce((s, b) => s + (b.min.z + b.max.z) / 2, 0) / wc.length : (tb.min.z + tb.max.z) / 2;
// facing: lights/grille at front. detect: headlight z vs tail z
let hz = 0, tz = 0, hn = 0, tn = 0;
for (const n of meshes) { const b = new THREE.Box3().setFromObject(n), z = (b.min.z + b.max.z) / 2; if (/^headlight_mesh|grille/i.test(n.name)) { hz += z; hn++; } if (/tailight_glass|taillight|tailights_r/i.test(n.name)) { tz += z; tn++; } }
const flip = FLIP !== 'auto' ? FLIP === '1' : hn && tn ? hz / hn > tz / tn : false; // game forward is -Z
console.log('scale', scale, 'flip', flip, 'meshes kept', meshes.length);
const tx = (x, y, z) => { x = (x - cx) * scale; y = (y - wheelBottom) * scale; z = (z - cz) * scale; return flip ? [-x, y, -z] : [x, y, z]; };
const buckets = {}; // role -> {pos[], nor[], col[]}
const wheels = []; // {c:[x,y,z], pos,nor,col}
const add = (b, p, nrm, col) => { for (let i = 0; i < 3; i++) { b.pos.push(p[i]); b.nor.push(nrm[i]); b.col.push(col[i]); } };
const mk = () => ({ pos: [], nor: [], col: [] });
const tmpN = new THREE.Vector3(), nm = new THREE.Matrix3();
for (const n of meshes) {
  const g = n.geometry, P = g.attributes.position, N = g.attributes.normal; if (!N) g.computeVertexNormals();
  const N2 = g.attributes.normal; nm.getNormalMatrix(n.matrixWorld);
  const idx = g.index ? g.index.array : null, tc = (idx ? idx.length : P.count) / 3;
  const mats = Array.isArray(n.material) ? n.material : [n.material];
  const groups = g.groups.length ? g.groups : [{ start: 0, count: tc * 3, materialIndex: 0 }];
  const isWheel = WHEEL_RE.test(n.name); let wb = null, wcen = null;
  if (isWheel) { const bb = new THREE.Box3().setFromObject(n); wcen = bb.getCenter(new THREE.Vector3()); wb = mk(); wheels.push({ c: tx(wcen.x, wcen.y, wcen.z), b: wb, R: (bb.max.y - bb.min.y) / 2, wcen }); }
  const v = new THREE.Vector3();
  const world = (i) => v.fromBufferAttribute(P, i).applyMatrix4(n.matrixWorld).clone();
  for (const gr of groups) {
    const mat = mats[gr.materialIndex] || mats[0];
    for (let t = gr.start; t < gr.start + gr.count; t += 3) {
      const ids = [0, 1, 2].map((k) => (idx ? idx[t + k] : t + k));
      const wp = ids.map(world), nn = ids.map((i) => tmpN.fromBufferAttribute(N2, i).applyMatrix3(nm).normalize().clone());
      let role = roleOf(n, mat), col;
      if (role === 'wheel') {
        const c = wp[0].clone().add(wp[1]).add(wp[2]).multiplyScalar(1 / 3);
        const r = Math.hypot(c.y - wcen.y, c.z - wcen.z); const R = (new THREE.Box3().setFromObject(n).max.y - wcen.y);
        role = r > R * 0.70 ? 'rubber' : 'rim'; col = C[role];
      } else col = role === 'col' ? [mat.color.r, mat.color.g, mat.color.b] : (C[role] || [1, 1, 1]);
      const target = isWheel ? wb : (buckets[role] ||= mk());
      const outRole = role;
      for (let k = 0; k < 3; k++) {
        const p = tx(wp[k].x, wp[k].y, wp[k].z), nv = flip ? [-nn[k].x, nn[k].y, -nn[k].z] : [nn[k].x, nn[k].y, nn[k].z];
        add(target, p, nv, outRole === 'paint' ? [1, 1, 1] : col);
      }
    }
  }
}
// flip winding if mirrored (flip rotates 180° about Y -> proper rotation, no winding change)
// ---- simplify helper: soup arrays -> {pos,nor,col,idx}
function weld(b) {
  const n = b.pos.length / 3, map = new Map(), pos = [], nor = [], col = [], idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.round(b.pos[i*3]*1000)+','+Math.round(b.pos[i*3+1]*1000)+','+Math.round(b.pos[i*3+2]*1000)+','+Math.round(b.nor[i*3]*6)+','+Math.round(b.nor[i*3+1]*6)+','+Math.round(b.nor[i*3+2]*6)+','+b.col[i*3];
    let r = map.get(k); if (r === undefined) { r = pos.length / 3; map.set(k, r); pos.push(b.pos[i*3], b.pos[i*3+1], b.pos[i*3+2]); nor.push(b.nor[i*3], b.nor[i*3+1], b.nor[i*3+2]); col.push(b.col[i*3], b.col[i*3+1], b.col[i*3+2]); }
    idx[i] = r;
  }
  return { pos: Float32Array.from(pos), nor: Float32Array.from(nor), col: Float32Array.from(col), idx };
}
function reduce(b, targetTris) {
  const w = weld(b); let idx = w.idx; const want = Math.max(24, Math.floor(targetTris)) * 3;
  for (const err of [0.01, 0.02, 0.04, 0.08, 0.15, 0.3]) {
    if (idx.length <= want * 1.05) break;
    [idx] = MeshoptSimplifier.simplify(w.idx, w.pos, 3, want, err, ['Permissive', 'Prune', 'Regularize']);
  }
  if (idx.length > want * 1.3) [idx] = MeshoptSimplifier.simplifySloppy(idx, w.pos, 3, null, want, 1.0);
  const remap = new Map(), op = [], on = [], oc = [], oi = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) { const k = idx[i]; let r = remap.get(k); if (r === undefined) { r = op.length / 3; remap.set(k, r); op.push(w.pos[k*3], w.pos[k*3+1], w.pos[k*3+2]); on.push(w.nor[k*3], w.nor[k*3+1], w.nor[k*3+2]); oc.push(w.col[k*3], w.col[k*3+1], w.col[k*3+2]); } oi[i] = r; }
  return creaseNormals({ pos: Float32Array.from(op), nor: Float32Array.from(on), col: Float32Array.from(oc), idx: oi });
}
function creaseNormals(g, crease = 42) {
  const T = g.idx.length / 3, fn = new Float32Array(T * 3), at = new Map(), cs = Math.cos(crease * Math.PI / 180);
  const key = (i) => Math.round(g.pos[i*3]*1000)+','+Math.round(g.pos[i*3+1]*1000)+','+Math.round(g.pos[i*3+2]*1000);
  for (let t = 0; t < T; t++) {
    const [a, b, c] = [g.idx[t*3], g.idx[t*3+1], g.idx[t*3+2]];
    const ux = g.pos[b*3]-g.pos[a*3], uy = g.pos[b*3+1]-g.pos[a*3+1], uz = g.pos[b*3+2]-g.pos[a*3+2], vx = g.pos[c*3]-g.pos[a*3], vy = g.pos[c*3+1]-g.pos[a*3+1], vz = g.pos[c*3+2]-g.pos[a*3+2];
    fn[t*3] = uy*vz-uz*vy; fn[t*3+1] = uz*vx-ux*vz; fn[t*3+2] = ux*vy-uy*vx;   // area weighted
    for (const v of [a, b, c]) { const k = key(v); (at.get(k) || at.set(k, []).get(k)).push(t); }
  }
  // un-index: one vertex per corner so every corner can have its own normal
  const pos = new Float32Array(T*9), nor = new Float32Array(T*9), col = new Float32Array(T*9), idx = new Uint32Array(T*3);
  const len = (t) => Math.hypot(fn[t*3], fn[t*3+1], fn[t*3+2]) || 1;
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) {
    const v = g.idx[t*3+k]; let nx = 0, ny = 0, nz = 0; const lt = len(t);
    for (const u of at.get(key(v))) { const lu = len(u), d = (fn[t*3]*fn[u*3] + fn[t*3+1]*fn[u*3+1] + fn[t*3+2]*fn[u*3+2]) / (lt*lu); if (d >= cs) { nx += fn[u*3]/lu; ny += fn[u*3+1]/lu; nz += fn[u*3+2]/lu; } }
    const l = Math.hypot(nx, ny, nz) || 1, o = t*3+k;
    pos.set([g.pos[v*3], g.pos[v*3+1], g.pos[v*3+2]], o*3); nor.set([nx/l, ny/l, nz/l], o*3); col.set([g.col[v*3], g.col[v*3+1], g.col[v*3+2]], o*3); idx[o] = o;
  }
  return weld({ pos, nor, col });
}
const merge = (list) => {
  const cat = (k, T) => { let n = 0; for (const r of list) n += r[k].length; const o = new T(n); let p = 0; for (const r of list) { o.set(r[k], p); p += r[k].length; } return o; };
  const idx = new Uint32Array(list.reduce((s, r) => s + r.idx.length, 0)); let p = 0, off = 0;
  for (const r of list) { for (let i = 0; i < r.idx.length; i++) idx[p++] = r.idx[i] + off; off += r.pos.length / 3; }
  return { pos: cat('pos', Float32Array), nor: cat('nor', Float32Array), col: cat('col', Float32Array), idx };
};
const triCount = (b) => b.pos.length / 9;
const W_SHARE = 0.18; // wheels' share of the budget (4 wheels)
function build(budget, bakeWheels) {
  const wheelTris = budget * W_SHARE, perWheel = wheelTris / Math.max(1, wheels.length);
  const rest = budget - (bakeWheels ? 0 : wheelTris);
  const roles = Object.keys(buckets); const total = roles.reduce((s, r) => s + triCount(buckets[r]), 0);
  const w = { col: 1.0, paint: 4.0, glass: 0.35, trim: 1.0, lampW: 0.25, lampR: 0.25, lampA: 0.1 };
  const sw = roles.reduce((s, r) => s + (w[r] || 1) * Math.min(1, 1), 0);
  const out = { body: {}, wheels: [] };
  // allocate by weight but cap at the source count
  const alloc = {}; let left = rest;
  const order = [...roles].sort((a, b) => triCount(buckets[a]) - triCount(buckets[b]));
  let wsum = roles.reduce((s, r) => s + (w[r] || 1), 0);
  for (const r of order) { const share = left * (w[r] || 1) / wsum; alloc[r] = Math.min(triCount(buckets[r]), share); left -= alloc[r]; wsum -= (w[r] || 1); }
  for (const r of roles) out.body[r] = reduce(buckets[r], alloc[r]);
  for (const wh of wheels) out.wheels.push({ c: wh.c, g: reduce(wh.b, bakeWheels ? perWheel * 0.5 : perWheel, 0.02) });
  return out;
}
// ---- write GLB
const doc = new Document(), buffer = doc.createBuffer(); const scene = doc.createScene('car');
const rootNode = doc.createNode('car'); scene.addChild(rootNode);
const paint = doc.createMaterial('paint').setBaseColorFactor([0.92, 0.92, 0.92, 1]).setMetallicFactor(0.35).setRoughnessFactor(0.32);
const trimM = doc.createMaterial('trim').setMetallicFactor(0.1).setRoughnessFactor(0.6);
const tailM = doc.createMaterial('tail').setBaseColorFactor([0.55, 0.02, 0.02, 1]).setRoughnessFactor(0.3).setEmissiveFactor([0.3, 0, 0]);
const glassM = doc.createMaterial('glass').setBaseColorFactor([0.04, 0.06, 0.08, 0.72]).setAlphaMode('BLEND').setMetallicFactor(0.0).setRoughnessFactor(0.05).setDoubleSided(true);
const acc = (t, arr) => doc.createAccessor().setType(t).setArray(arr).setBuffer(buffer);
const prim = (g, mat, colors) => { const p = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', g.pos)).setAttribute('NORMAL', acc('VEC3', g.nor)).setIndices(acc('SCALAR', g.idx)).setMaterial(mat); if (colors) p.setAttribute('COLOR_0', acc('VEC3', g.col)); return p; };
const sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
function emit(name, lod, bake) {
  const node = doc.createNode(name); rootNode.addChild(node);
  let tris = 0;
  const bodyMesh = doc.createMesh(name + '_body');
  const trimParts = [], extra = [];
  for (const [r, g] of Object.entries(lod.body)) {
    if (r === 'paint') { bodyMesh.addPrimitive(prim(g, paint, false)); }
    else if (r === 'glass') { bodyMesh.addPrimitive(prim(g, glassM, false)); }
    else if (r === 'lampR') { bodyMesh.addPrimitive(prim(g, tailM, false)); }
    else trimParts.push(g);
    tris += g.idx.length / 3;
  }
  if (bake) for (const w of lod.wheels) { const g = w.g; trimParts.push(g); tris += g.idx.length / 3; }
  if (trimParts.length) bodyMesh.addPrimitive(prim(merge(trimParts), trimM, true));
  node.addChild(doc.createNode(name + '_shell').setMesh(bodyMesh));
  if (!bake) lod.wheels.forEach((w, i) => {
    const side = w.c[0] < 0 ? 'l' : 'r', front = w.c[2] < 0 ? 'f' : 'r';
    const wn = doc.createNode(`wheel_${front}${side}`).setTranslation(w.c);
    const lg = { ...w.g, pos: Float32Array.from(w.g.pos, (v, i) => v - w.c[i % 3]) };
    wn.setMesh(doc.createMesh(`wheel_${front}${side}`).addPrimitive(prim(lg, trimM, true)));
    node.addChild(wn); tris += w.g.idx.length / 3;
  });
  return tris;
}
const lod0 = build(L0, false), lod1 = build(L1, true);
const t0 = emit('lod0', lod0, false), t1 = emit('lod1', lod1, true);
{
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const g of [...Object.values(lod0.body), ...lod0.wheels.map((w) => w.g)]) for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.pos[i + k]); mx[k] = Math.max(mx[k], g.pos[i + k]); }
  const wr = wheels.length ? wheels.reduce((a, w) => a + w.R, 0) / wheels.length * scale : 0.3;
  rootNode.setExtras({ W: +(mx[0] - mn[0]).toFixed(3), H: +(mx[1]).toFixed(3), L: +(mx[2] - mn[2]).toFixed(3), minX: mn[0], maxX: mx[0], minZ: mn[2], maxZ: mx[2], wheelR: +wr.toFixed(3), wheels: lod0.wheels.map((w) => w.c.map((v) => +v.toFixed(3))) });
}
await new NodeIO().write(outp, doc);
// size report
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const g of Object.values(lod0.body)) for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.pos[i + k]); mx[k] = Math.max(mx[k], g.pos[i + k]); }
console.log('wrote', outp, fs.statSync(outp).size, 'bytes; lod0', t0, 'tris; lod1', t1, 'tris; size W×H×L', (mx[0] - mn[0]).toFixed(2), (mx[1] - mn[1]).toFixed(2), (mx[2] - mn[2]).toFixed(2), 'roles', Object.keys(buckets).map((r) => r + ':' + triCount(buckets[r])).join(' '), 'wheels', wheels.length);
