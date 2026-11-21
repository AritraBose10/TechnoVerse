// hb-cloth.js — MakeHuman-style garments (.mhclo + .obj [+ .mhmat texture]) fitted to the morphed body.
// Every garment vertex is bound to 3 base-mesh vertices (barycentric weights + an offset scaled by body size),
// so it follows every morph slider exactly. Skin weights are copied from the bound body vertices.
import * as THREE from "three";

const DM = 0.1; // MakeHuman data is in decimetres

async function text(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + " " + r.status); return r.text(); }

export function parseMhclo(src) {
  const g = { verts: [], del: [], scale: {}, obj: null, material: null, name: "garment" };
  let mode = "";
  for (const line of src.split(/\r?\n/)) {
    const w = line.trim().split(/\s+/);
    if (!w[0] || w[0] === "#") { if (!w[0]) mode = mode === "v" ? "" : mode; continue; }
    if (mode === "v" && /^\d+$/.test(w[0])) {
      if (w.length === 1) g.verts.push({ i: [+w[0], +w[0], +w[0]], w: [1, 0, 0], d: [0, 0, 0] });
      else g.verts.push({ i: [+w[0], +w[1], +w[2]], w: [+w[3], +w[4], +w[5]], d: [+w[6], +w[7], +w[8]] });
      continue;
    }
    if (mode === "d" && /^[\d-]/.test(w[0])) {
      let seq = false, last = 0;
      for (const t of w) { if (t === "-") seq = true; else { const n = +t; if (seq) { for (let k = last; k <= n; k++) g.del.push(k); seq = false; } else g.del.push(n); last = n; } }
      continue;
    }
    mode = "";
    const k = w[0];
    if (k === "obj_file") g.obj = w[1]; else if (k === "material") g.material = w[1]; else if (k === "name") g.name = w[1];
    else if (k === "verts") mode = "v"; else if (k === "delete_verts") mode = "d";
    else if (k === "x_scale" || k === "y_scale" || k === "z_scale") g.scale[k[0]] = [+w[1], +w[2], +w[3]];
  }
  return g;
}

export function parseObj(src) {
  const V = [], VT = [], faces = [];
  for (const line of src.split(/\r?\n/)) {
    if (line.startsWith("v ")) { const w = line.split(/\s+/); V.push([+w[1], +w[2], +w[3]]); }
    else if (line.startsWith("vt ")) { const w = line.split(/\s+/); VT.push([+w[1], +w[2]]); }
    else if (line.startsWith("f ")) faces.push(line.trim().split(/\s+/).slice(1).map((t) => { const p = t.split("/"); return [+p[0] - 1, p[1] ? +p[1] - 1 : -1]; }));
  }
  return { V, VT, faces };
}

function parseMhmat(src) {
  const m = { diffuse: null, color: null };
  for (const line of src.split(/\r?\n/)) {
    const w = line.trim().split(/\s+/);
    if (w[0] === "diffuseTexture") m.diffuse = w[1];
    else if (w[0] === "diffuseColor") m.color = [+w[1], +w[2], +w[3]];
  }
  return m;
}

export class Garment {
  constructor(hb, slot) { this.hb = hb; this.slot = slot; this.mesh = null; this.deleted = new Set(); }

  async load(mhcloUrl, opts = {}) {
    const base = mhcloUrl.slice(0, mhcloUrl.lastIndexOf("/") + 1);
    const cl = parseMhclo(await text(mhcloUrl));
    const obj = parseObj(await text(base + cl.obj));
    this.cl = cl; this.deleted = new Set(cl.del);
    // unique render vertices (objV, vt)
    const key = new Map(), rv = [], uv = [], idx = [];
    for (const f of obj.faces) {
      const ids = f.map(([v, t]) => { const k = v + "/" + t; if (!key.has(k)) { key.set(k, rv.length); rv.push(v); uv.push(t >= 0 ? obj.VT[t] : [0, 0]); } return key.get(k); });
      for (let i = 1; i < ids.length - 1; i++) idx.push(ids[0], ids[i], ids[i + 1]);
    }
    this.rv = Int32Array.from(rv);
    const n = rv.length, hb = this.hb;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(Float32Array.from(uv.flat()), 2));
    // skin weights from the heaviest-bound base vertex
    const o2r = hb.origToRender(), si = hb.mesh.geometry.attributes.skinIndex.array, sw = hb.mesh.geometry.attributes.skinWeight.array;
    const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const b = cl.verts[rv[i]]; if (!b) continue;
      const j = b.w[0] >= b.w[1] && b.w[0] >= b.w[2] ? b.i[0] : b.w[1] >= b.w[2] ? b.i[1] : b.i[2];
      const r = o2r[j] >= 0 ? o2r[j] : 0;
      for (let k = 0; k < 4; k++) { SI[i * 4 + k] = si[r * 4 + k]; SW[i * 4 + k] = sw[r * 4 + k]; }
    }
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(SI, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(SW, 4));
    geo.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ color: opts.color ?? 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    if (cl.material) {
      try {
        const mm = parseMhmat(await text(base + cl.material));
        if (mm.diffuse) { const t = await new THREE.TextureLoader().loadAsync(base + mm.diffuse); t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; mat.map = t; }
        if (mm.color && opts.color == null && !mat.map) mat.color.setRGB(...mm.color);
      } catch (e) { /* no material file: plain colour */ }
    }
    this.mesh = new THREE.SkinnedMesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = "garment:" + this.slot;
    hb.root.add(this.mesh);
    if (hb.skeleton) this.mesh.bind(hb.skeleton, new THREE.Matrix4());
    this.refit();
    return this;
  }

  setColor(c) { if (this.mesh) this.mesh.material.color.set(c); }

  // Recompute positions from the current morphed base. Call after every HB.update().
  refit() {
    if (!this.mesh) return;
    const hb = this.hb, P = hb.pos, sh = hb.shift, cl = this.cl;
    const sc = {};
    for (const a of ["x", "y", "z"]) {
      const s = cl.scale[a];
      if (!s) { sc[a] = 1; continue; }
      const dx = P[s[0] * 3] - P[s[1] * 3], dy = P[s[0] * 3 + 1] - P[s[1] * 3 + 1], dz = P[s[0] * 3 + 2] - P[s[1] * 3 + 2];
      sc[a] = Math.hypot(dx, dy, dz) / (Math.abs(s[2]) * DM || 1);
    }
    const pa = this.mesh.geometry.attributes.position.array, n = this.rv.length;
    for (let i = 0; i < n; i++) {
      const b = cl.verts[this.rv[i]]; if (!b) continue;
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 3; k++) { const j = b.i[k] * 3, w = b.w[k]; x += P[j] * w; y += P[j + 1] * w; z += P[j + 2] * w; }
      pa[i * 3] = x + b.d[0] * DM * sc.x; pa[i * 3 + 1] = y + b.d[1] * DM * sc.y + sh; pa[i * 3 + 2] = z + b.d[2] * DM * sc.z;
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    { // weld normals across UV seams
      const N = geo.attributes.normal.array, acc = this._acc || (this._acc = new Float32Array((Math.max(...this.rv) + 1) * 3));
      acc.fill(0);
      for (let i = 0; i < n; i++) { const o = this.rv[i] * 3; acc[o] += N[i * 3]; acc[o + 1] += N[i * 3 + 1]; acc[o + 2] += N[i * 3 + 2]; }
      for (let i = 0; i < n; i++) { const o = this.rv[i] * 3, l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1; N[i * 3] = acc[o] / l; N[i * 3 + 1] = acc[o + 1] / l; N[i * 3 + 2] = acc[o + 2] / l; }
      geo.attributes.normal.needsUpdate = true;
    }
    geo.computeBoundingSphere();
  }

  dispose() { if (this.mesh) { this.hb.root.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; } }
}
