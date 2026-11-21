// Procedural hair cards: tapered ribbon "locks" grown from the scalp, textured with an alpha strand map,
// shaded with a Kajiya-Kay style anisotropic highlight, darkened at the root for depth.
import * as THREE from "three";

const STYLES = {
  short:  { n: 1500, len: [0.045, 0.085], fringe: 0.075, w: 0.017, grav: 0.5, stiff: 0.8, segs: 4, wrap: 1.0 },
  medium: { n: 1800, len: [0.10, 0.17], fringe: 0.12, w: 0.02, grav: 1.0, stiff: 0.55, segs: 6, wrap: 0.75 },
  long:   { n: 2300, len: [0.30, 0.44], fringe: 0.2, w: 0.022, grav: 1.3, stiff: 0.45, segs: 8, wrap: 0.55 },
};

function strandTexture() {
  const W = 64, H = 256, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"); let s = 99; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 26; k++) {
    const x0 = (k + r() * 0.8) / 26 * W, L = 0.62 + r() * 0.38, wob = r() * 3 + 0.5, ph = r() * 6, g = 120 + r() * 135, w0 = 1.1 + r() * 1.2;
    for (let y = 0; y < H; y++) {
      const v = 1 - y / H; if (v > L) continue;
      const taper = Math.min(1, (L - v) / 0.12 + 0.15), xx = x0 + Math.sin(v * 9 + ph) * wob;
      x.fillStyle = `rgba(${g | 0},${g | 0},${g | 0},${0.55 + 0.45 * taper})`; x.fillRect(xx - w0 * taper / 2, y, Math.max(0.6, w0 * taper), 1.2);
    }
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class HairCards {
  constructor(parentBone) {
    this.geo = new THREE.BufferGeometry();
    this.mat = new THREE.MeshStandardMaterial({ map: strandTexture(), vertexColors: true, alphaTest: 0.3, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.4, color: 0x1c1410 });
    this.light = { value: new THREE.Vector3(0.4, 0.8, 0.6).normalize() };
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.hLight = this.light;
      sh.vertexShader = "attribute vec3 tang; varying vec3 vWT; varying vec3 vWP;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vWT = normalize(mat3(modelMatrix) * tang); vWP = (modelMatrix * vec4(position, 1.0)).xyz;");
      sh.fragmentShader = "varying vec3 vWT; varying vec3 vWP; uniform vec3 hLight;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        { vec3 V = normalize(cameraPosition - vWP); vec3 H = normalize(hLight + V); vec3 T = normalize(vWT);
          float th = dot(T, H); float sp = pow(sqrt(max(0.0, 1.0 - th * th)), 70.0);
          float th2 = dot(normalize(T + vec3(0.0, 0.15, 0.0)), H); float sp2 = pow(sqrt(max(0.0, 1.0 - th2 * th2)), 20.0);
          totalEmissiveRadiance += mix(diffuseColor.rgb, vec3(1.0), 0.45) * (sp * 0.3 + sp2 * 0.05); }`);
    };
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    parentBone.add(this.mesh);
    this.mesh.visible = false;
  }

  // hb: HB instance (positions, shorts etc); hj: head joint (Vector3, includes shift); line/slope/back: hairline params
  rebuild(hb, style, hj, hl) {
    const S = STYLES[style];
    this.mesh.visible = !!S;
    if (!S) return;
    const P = hb.positions, Nn = hb.mesh.geometry.attributes.normal.array, T = hb.buf0(hb.man.hair);
    // head ellipsoid + crown from the scalp vertices
    let mnx = 9, mxx = -9, mny = 9, mxy = -9, mnz = 9, mxz = -9;
    for (let i = 0; i < T.length; i++) { const v = T[i] * 3; mnx = Math.min(mnx, P[v]); mxx = Math.max(mxx, P[v]); mny = Math.min(mny, P[v + 1]); mxy = Math.max(mxy, P[v + 1]); mnz = Math.min(mnz, P[v + 2]); mxz = Math.max(mxz, P[v + 2]); }
    const hc = new THREE.Vector3((mnx + mxx) / 2, (mny + mxy) / 2 + 0.01, (mnz + mxz) / 2 - 0.005), hr = new THREE.Vector3((mxx - mnx) / 2, (mxy - mny) / 2 + 0.005, (mxz - mnz) / 2);
    const crown = new THREE.Vector3(hc.x, mxy, hc.z - hr.z * 0.25);
    const nT = T.length / 3;
    const area = new Float32Array(nT); let tot = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < nT; t++) {
      a.fromArray(P, T[t * 3] * 3); b.fromArray(P, T[t * 3 + 1] * 3); c.fromArray(P, T[t * 3 + 2] * 3);
      area[t] = b.sub(a).cross(c.sub(a)).length() * 0.5; tot += area[t];
    }
    const cum = new Float32Array(nT); let acc = 0; for (let t = 0; t < nT; t++) { acc += area[t]; cum[t] = acc / tot; }
    let seed = 4242; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const segs = S.segs, vpc = (segs + 1) * 2, max = S.n;
    const pos = new Float32Array(max * vpc * 3), nor = new Float32Array(max * vpc * 3), tan = new Float32Array(max * vpc * 3), uv = new Float32Array(max * vpc * 2), col = new Float32Array(max * vpc * 3);
    const idx = new Uint32Array(max * segs * 6);
    let nc = 0, tries = 0;
    const p = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3(), f = new THREE.Vector3(), bn = new THREE.Vector3(), q = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), dn = new THREE.Vector3(0, -1, 0);
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), na = new THREE.Vector3(), nb = new THREE.Vector3(), nc_ = new THREE.Vector3();
    while (nc < max && tries++ < max * 12) {
      const r0 = rnd(); let lo = 0, hi = nT - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r0) lo = m + 1; else hi = m; }
      let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const i0 = T[lo * 3] * 3, i1 = T[lo * 3 + 1] * 3, i2 = T[lo * 3 + 2] * 3;
      pa.fromArray(P, i0); pb.fromArray(P, i1); pc.fromArray(P, i2);
      p.copy(pa).multiplyScalar(1 - u - v).addScaledVector(pb, u).addScaledVector(pc, v);
      na.fromArray(Nn, i0); nb.fromArray(Nn, i1); nc_.fromArray(Nn, i2);
      n.copy(na).multiplyScalar(1 - u - v).addScaledVector(nb, u).addScaledVector(nc_, v).normalize();
      const dz = p.z - hj.z, lim = hj.y + hl.line + hl.slope * dz - hl.back * Math.max(-dz, 0) * 1.6;
      if (p.y < lim - 0.01) continue;
      const soft = Math.min(1, Math.max(0, (p.y - lim + 0.01) / 0.035));
      if (rnd() > soft) continue;
      if (n.y < -0.2 && p.y < hj.y + 0.12) continue; // not under the chin / face underside
      // growth direction: radial from the crown whorl, lifted along the normal; fringe flows forward
      f.copy(p).sub(crown); f.addScaledVector(n, -f.dot(n)); f.normalize();
      const front = Math.max(0, Math.min(1, (p.z - hc.z) / (hr.z * 0.9))) * Math.max(0, Math.min(1, (p.y - hc.y) / (hr.y * 0.5)));
      const fringe = front > 0.35;
      let len = S.len[0] + rnd() * (S.len[1] - S.len[0]); if (fringe) len = S.fringe * (0.45 + rnd() * 0.35);
      d.copy(n).multiplyScalar(0.18).addScaledVector(f, 0.55).addScaledVector(dn, 0.2).normalize();
      if (fringe) d.addScaledVector(up, 0.35).addScaledVector(new THREE.Vector3(0, 0, 1), 0.15).addScaledVector(new THREE.Vector3(Math.sign(p.x - hc.x - 0.02) * (0.35 + rnd() * 0.25), 0, 0), 1).normalize();
      const gk = fringe ? 0.35 : 1, step = len / segs, w0 = S.w * (0.8 + rnd() * 0.5), shade = 0.9 + rnd() * 0.2;
      p.addScaledVector(n, 0.001);
      const base = nc * vpc;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        bn.crossVectors(d, n).normalize(); if (bn.lengthSq() < 1e-6) bn.set(1, 0, 0);
        const w = w0 * (1 - 0.55 * t) * 0.5;
        for (let side = 0; side < 2; side++) {
          const k = (base + s * 2 + side) * 3, sg = side ? 1 : -1;
          q.copy(p).addScaledVector(bn, sg * w);
          pos[k] = q.x - hj.x; pos[k + 1] = q.y - hj.y; pos[k + 2] = q.z - hj.z;
          // spherical-ish normal for soft volumetric shading
          f.copy(q).sub(hc); f.y *= 0.8; f.normalize();
          nor[k] = f.x; nor[k + 1] = f.y; nor[k + 2] = f.z;
          tan[k] = d.x; tan[k + 1] = d.y; tan[k + 2] = d.z;
          const k2 = (base + s * 2 + side) * 2; uv[k2] = side; uv[k2 + 1] = t;
          const g = shade * (0.42 + 0.58 * Math.pow(t, 0.7)); col[k] = col[k + 1] = col[k + 2] = g;
        }
        if (s < segs) {
          d.lerp(dn, Math.min(0.9, gk * S.grav * (0.25 + (1 - S.stiff)) * (0.3 + t) * 3 / segs)).normalize();
          p.addScaledVector(d, step);
          // collide: head ellipsoid, neck/shoulder cylinder
          q.copy(p).sub(hc); const e = Math.hypot(q.x / (hr.x + 0.006), q.y / (hr.y + 0.006), q.z / (hr.z + 0.006));
          if (p.y > hj.y + 0.02) {
            const tt = (s + 1) / segs, shellE = 1 + (0.005 + 0.014 * tt) / hr.y;
            if (e < shellE) p.copy(hc).addScaledVector(q, shellE / Math.max(e, 0.2));
            else if (e > shellE) { q.multiplyScalar(shellE / e); q.add(hc); p.lerp(q, S.wrap * (1 - 0.7 * tt)); }
          }
          if (fringe) p.y = Math.max(p.y, hj.y + hl.line + hl.slope * (p.z - hj.z) - 0.005);
          if (p.y < hj.y + 0.02) {
            const rx = p.x - hj.x, rz = p.z - (hj.z - 0.01), rr = Math.hypot(rx, rz), R = 0.075 + Math.max(0, hj.y - p.y) * 0.9;
            if (rr < R) { const k = R / Math.max(rr, 1e-4); p.x = hj.x + rx * k; p.z = hj.z - 0.01 + rz * k; }
          }
        }
      }
      const ib = nc * segs * 6;
      for (let s = 0; s < segs; s++) { const a0 = base + s * 2; idx.set([a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2], ib + s * 6); }
      nc++;
    }
    const g = this.geo, setA = (name, arr, size, n) => { g.setAttribute(name, new THREE.BufferAttribute(arr.subarray(0, n * size), size)); };
    setA("position", pos, 3, nc * vpc); setA("normal", nor, 3, nc * vpc); setA("tang", tan, 3, nc * vpc); setA("uv", uv, 2, nc * vpc); setA("color", col, 3, nc * vpc);
    g.setIndex(new THREE.BufferAttribute(idx.subarray(0, nc * segs * 6), 1));
    g.computeBoundingSphere();
    this.count = nc;
  }
}

// Authored hair mesh (from an FBX), refitted to the morphed head with a per-axis similarity fit
// matched on skull measurements, then pushed out of the head ellipsoid. Root-to-tip darkening via vertex colour.
export class AssetHair {
  constructor(parentBone, url) {
    this.url = url;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, envMapIntensity: 0.6, side: THREE.FrontSide, color: 0x2a1a10 });
    this.geo = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.mesh.visible = false;
    parentBone.add(this.mesh);
    this.ready = fetch(url + ".json").then((r) => r.json()).then(async (j) => {
      const b = await (await fetch(url + ".bin")).arrayBuffer(), n = j.verts;
      this.meta = j; this.P0 = new Float32Array(b, 0, n * 3); this.N0 = new Float32Array(b, n * 12, n * 3); this.U0 = new Float32Array(b, n * 24, n * 2);
      this.I = new Uint32Array(b, n * 32, j.idx);
      this.geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      this.geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      this.geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      this.geo.setAttribute("uv", new THREE.BufferAttribute(this.U0.slice(), 2));
      this.geo.setIndex(new THREE.BufferAttribute(this.I.slice(), 1));
    });
  }
  rebuild(hb, hj) {
    if (!this.meta) return false;
    const P = hb.positions, T = hb.buf0(hb.man.hair);
    let top = -9, mnx = 9, mxx = -9, mny = 9, mnz = 9, mxz = -9;
    for (let i = 0; i < T.length; i++) { const v = T[i] * 3; top = Math.max(top, P[v + 1]); mny = Math.min(mny, P[v + 1]); mnx = Math.min(mnx, P[v]); mxx = Math.max(mxx, P[v]); mnz = Math.min(mnz, P[v + 2]); mxz = Math.max(mxz, P[v + 2]); }
    let hw = 0, zf = -9, zb = 9;
    for (let i = 0; i < T.length; i++) { const v = T[i] * 3, y = P[v + 1]; if (y > top - 0.06 || y < top - 0.10) continue; hw = Math.max(hw, Math.abs(P[v] - (mnx + mxx) / 2)); zf = Math.max(zf, P[v + 2]); zb = Math.min(zb, P[v + 2]); }
    const d = this.meta.dummy, db = d.band;
    const sx = hw / db.hw, sz = (zf - zb) / (db.zf - db.zb), sy = (sx + sz) / 2;
    const cx = (mnx + mxx) / 2, dzc = (db.zf + db.zb) / 2, ozc = (zf + zb) / 2;
    const hc = new THREE.Vector3(cx, (mny + top) / 2 + 0.01, (mnz + mxz) / 2 - 0.005), hr = new THREE.Vector3((mxx - mnx) / 2, (top - mny) / 2 + 0.005, (mxz - mnz) / 2);
    const pa = this.geo.attributes.position.array, na = this.geo.attributes.normal.array, ca = this.geo.attributes.color.array, n = this.meta.verts;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      let x = cx + this.P0[k] * sx, y = top + (this.P0[k + 1] - d.top) * sy, z = ozc + (this.P0[k + 2] - dzc) * sz;
      let qx = (x - hc.x) / (hr.x + 0.004), qy = (y - hc.y) / (hr.y + 0.004), qz = (z - hc.z) / (hr.z + 0.004), e = Math.hypot(qx, qy, qz);
      if (e < 1 && y > hj.y + 0.01) { const f = 1 / Math.max(e, 0.2); x = hc.x + (x - hc.x) * f; y = hc.y + (y - hc.y) * f; z = hc.z + (z - hc.z) * f; e = 1; }
      pa[k] = x - hj.x; pa[k + 1] = y - hj.y; pa[k + 2] = z - hj.z;
      const nx = this.N0[k] / sx, ny = this.N0[k + 1] / sy, nz = this.N0[k + 2] / sz, l = Math.hypot(nx, ny, nz) || 1;
      na[k] = nx / l; na[k + 1] = ny / l; na[k + 2] = nz / l;
      const c = 0.55 + 0.45 * Math.min(1, Math.max(0, (e - 1) / 0.2)); ca[k] = ca[k + 1] = ca[k + 2] = c;
    }
    this.geo.attributes.position.needsUpdate = this.geo.attributes.normal.needsUpdate = this.geo.attributes.color.needsUpdate = true;
    this.geo.computeBoundingSphere();
    return true;
  }
}
