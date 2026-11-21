// hb-runtime.js — parametric human runtime (Phase 0).
// Loads hb.json + hb.bin (exported from the CC0 MakeHuman/MPFB2 data by export_hb.py), applies a
// config (JSON) to the base mesh on the CPU, refits the Mixamo-named skeleton to the new body, and
// builds a THREE.SkinnedMesh. No GPU morph targets are used: the shape is baked, so playback cost
// does not depend on how many sliders exist.
import { HairCards, AssetHair } from "/creator/hb-hair.js";
import { Garment } from "/creator/hb-cloth.js";
import * as THREE from "three";

export async function loadHB(base = "/creator/") {
  const [man, buf] = await Promise.all([
    fetch(base + "hb.json").then((r) => r.json()),
    fetch(base + "hb.bin").then((r) => r.arrayBuffer()),
  ]);
  return new HB(man, buf);
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export const DEFAULT_CONFIG = () => ({
  gender: 0.5, muscle: 0.5, weight: 0.5, height: 0.5,
  race: [1 / 3, 1 / 3, 1 / 3], // african, asian, caucasian
  sliders: {},
});

class HB {
  constructor(man, buf) {
    this.man = man;
    this._buf = buf;
    const f32 = (a) => new Float32Array(buf, a.off, a.n);
    const u32 = (a) => new Uint32Array(buf, a.off, a.n);
    this.baseFull = f32(man.base);
    this.orig = u32(man.orig);
    this.nR = this.orig.length;
    this.targets = man.targets.map((t) => ({
      idx: u32(t.idx), d: new Int16Array(buf, t.d.off, t.d.n), scale: t.scale,
    }));
    this.pos = new Float32Array(this.baseFull.length);
    this.dirty = true;
  }

  // ---- macro weights (MakeHuman's macro model, young adults only in phase 0) ----
  weightsFor(cfg) {
    const w = []; // [targetIndex, weight]
    const g = clamp(cfg.gender, 0, 1);
    const gw = { female: 1 - g, male: g };
    const tri = (v) => ({ min: Math.max(0, (0.5 - v) * 2), average: 1 - Math.abs(v - 0.5) * 2, max: Math.max(0, (v - 0.5) * 2) });
    const mu = tri(clamp(cfg.muscle, 0, 1));
    const wt = tri(clamp(cfg.weight, 0, 1));
    const h = clamp(cfg.height, 0, 1);
    const hw = { minheight: Math.max(0, (0.5 - h) * 2), maxheight: Math.max(0, (h - 0.5) * 2) };
    const rsum = cfg.race.reduce((a, b) => a + b, 0) || 1;
    const rw = { african: cfg.race[0] / rsum, asian: cfg.race[1] / rsum, caucasian: cfg.race[2] / rsum };
    for (const e of this.man.macro.race) w.push([e.t, rw[e.race] * gw[e.gender]]);
    for (const e of this.man.macro.universal) w.push([e.t, gw[e.gender] * mu[e.muscle.replace("muscle", "")] * wt[e.weight.replace("weight", "")]]);
    for (const e of this.man.macro.height) {
      w.push([e.t, gw[e.gender] * mu[e.muscle.replace("muscle", "")] * wt[e.weight.replace("weight", "")] * hw[e.h]]);
    }
    for (const s of this.man.sliders) {
      const v = clamp(cfg.sliders[s.id] ?? 0, -1, 1);
      if (v > 0) for (const t of s.pos) w.push([t, v]);
      else if (v < 0) for (const t of s.neg) w.push([t, -v]);
    }
    return w.filter(([, x]) => x > 1e-4);
  }

  // Bake a config into this.pos (all 19k vertices incl. helper geometry used for joints).
  bake(cfg) {
    this.pos.set(this.baseFull);
    for (const [ti, wgt] of this.weightsFor(cfg)) {
      const t = this.targets[ti];
      const k = t.scale * wgt;
      for (let i = 0; i < t.idx.length; i++) {
        const v = t.idx[i] * 3;
        this.pos[v] += t.d[i * 3] * k;
        this.pos[v + 1] += t.d[i * 3 + 1] * k;
        this.pos[v + 2] += t.d[i * 3 + 2] * k;
      }
    }
    // stand the feet on y = 0
    let minY = Infinity;
    for (let i = 0; i < this.man.nBody; i++) minY = Math.min(minY, this.pos[i * 3 + 1]);
    this.shift = -minY;
    return this.pos;
  }

  jointPos(spec, out) {
    let x = 0, y = 0, z = 0;
    for (const i of spec) { x += this.pos[i * 3]; y += this.pos[i * 3 + 1]; z += this.pos[i * 3 + 2]; }
    const n = spec.length || 1;
    return out.set(x / n, y / n + this.shift, z / n);
  }

  // Create the character. Call update(cfg) later to reshape it in place.
  create(cfg = DEFAULT_CONFIG(), material) {
    const man = this.man;
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.nR * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(this.buf0(man.uv).slice(), 2));
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(Uint16Array.from(new Uint8Array(this._buf, man.skinIdx.off, man.skinIdx.n)), 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(this.buf0(man.skinW).slice(), 4));
    geo.setIndex(new THREE.BufferAttribute(this.buf0(man.tris).slice(), 1));

    this.bones = man.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
    this.root = new THREE.Group();
    man.bones.forEach((b, i) => (b.parent < 0 ? this.root : this.bones[b.parent]).add(this.bones[i]));
    this.skinMat = material ?? new THREE.MeshPhysicalMaterial({ color: 0xb98a6a, roughness: 0.6, sheen: 0.4, sheenColor: new THREE.Color(0xff9a7a), sheenRoughness: 0.55 });
    this.initSkinShader();
    this.mesh = new THREE.SkinnedMesh(geo, this.skinMat);
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    // eyes: small meshes parented to the head bone, with a procedural iris texture
    this.eyeTex = new THREE.CanvasTexture(document.createElement("canvas"));
    this.eyeTex.colorSpace = THREE.SRGBColorSpace;
    this.eyeMat = new THREE.MeshPhysicalMaterial({ map: this.eyeTex, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 });
    this.lashMat = new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.8, side: THREE.DoubleSide });
    this.eyes = ["eyeL", "eyeR", "lashL", "lashR"].map((k) => {
      const part = man.parts[k], o = this.buf0(part.orig);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(o.length * 3), 3));
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(o.length * 2), 2));
      g.setIndex(new THREE.BufferAttribute(this.buf0(part.tris).slice(), 1));
      const m = new THREE.Mesh(g, k.startsWith("lash") ? this.lashMat : this.eyeMat);
      m.frustumCulled = false;
      this.bones[man.headBone].add(m);
      return { mesh: m, orig: o, geo: g };
    });
    this.setEye("brown");
    // shorts: the body's own triangles in that region, drawn slightly outside the skin
    const sg = new THREE.BufferGeometry();
    for (const a of ["position", "uv", "skinIndex", "skinWeight"]) sg.setAttribute(a, geo.attributes[a]);
    sg.setIndex(new THREE.BufferAttribute(this.buf0(man.shorts).slice(), 1));
    const sm = new THREE.MeshStandardMaterial({ color: 0x2b3b5c, roughness: 0.9, side: THREE.DoubleSide });
    this.cut = { yTop: { value: 1 }, yBot: { value: 0 } };
    sm.onBeforeCompile = (sh) => {
      sh.uniforms.yTop = this.cut.yTop; sh.uniforms.yBot = this.cut.yBot;
      sh.vertexShader = "varying float vRY;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vRY = position.y; transformed += objectNormal * 0.004;");
      sh.fragmentShader = "varying float vRY; uniform float yTop; uniform float yBot;\n" + sh.fragmentShader.replace("void main() {", "void main() {\n if (vRY > yTop || vRY < yBot) discard;");
    };
    this.shorts = new THREE.SkinnedMesh(sg, sm);
    this.shorts.frustumCulled = false;
    this.root.add(this.shorts);
    // hair: scalp shell cut by a per-pixel hairline; style = thickness + hairline shape
    const hg = new THREE.BufferGeometry();
    for (const a of ["position", "uv", "skinIndex", "skinWeight"]) hg.setAttribute(a, geo.attributes[a]);
    hg.setIndex(new THREE.BufferAttribute(this.buf0(man.hair).slice(), 1));
    this.hairU = { hj: { value: new THREE.Vector3() }, line: { value: 0.11 }, slope: { value: 0.35 }, back: { value: 0.0 } };
    this.hairThick = { value: 0.012 };
    const hm = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.85, side: THREE.DoubleSide });
    hm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.hairU);
      sh.vertexShader = "varying vec3 vRP; uniform float hairThick;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vRP = position; transformed += objectNormal * hairThick;");
      sh.uniforms.hairThick = this.hairThick;
      sh.fragmentShader = "varying vec3 vRP; uniform vec3 hj; uniform float line; uniform float slope; uniform float back;\n" + sh.fragmentShader.replace("void main() {", "void main() {\n float d = vRP.z - hj.z; float lim = hj.y + line + slope * d - back * max(-d, 0.0) * 1.6; if (vRP.y < lim) discard; float st = sin((vRP.x + vRP.z * 0.5) * 900.0 + sin(vRP.y * 300.0)) * 0.5 + 0.5;").replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb *= 0.75 + 0.25 * st;");
    };
    this.hair = new THREE.SkinnedMesh(hg, hm);
    this.hair.frustumCulled = false;
    this.root.add(this.hair);
    this.cards = new HairCards(this.bones[man.headBone]);
    this.assetHair = new AssetHair(this.bones[man.headBone], new URL("assets/hair1", import.meta.url).href);
    this.assetHair.ready.then(() => { if (this._ready) this.rebuildHair(); });
    this.hairStyle = "short";
    this.setHair("short", 0x1c1410);
    this.setSkin(0.35);
    this.update(cfg, true);
    return this.root;
  }

  initSkinShader() {
    const m = this.skinMat, TL = new THREE.TextureLoader();
    this.maskTex = TL.load(new URL("skinmask.png", import.meta.url).href);
    // tileable pore / micro-relief bump: periodic value noise, two octaves + fine grain
    const N = 512, c = document.createElement("canvas"); c.width = c.height = N;
    const ctx = c.getContext("2d"), img = ctx.createImageData(N, N);
    let seed = 1337; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const lat = (g) => Float32Array.from({ length: g * g }, rnd);
    const L1 = lat(64), L2 = lat(128);
    const samp = (L, g, x, y) => { const fx = x * g, fy = y * g, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = L[(y0 % g) * g + (x0 % g)], b = L[(y0 % g) * g + ((x0 + 1) % g)], cc = L[((y0 + 1) % g) * g + (x0 % g)], d = L[((y0 + 1) % g) * g + ((x0 + 1) % g)];
      return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = 0.5 * samp(L1, 64, x / N, y / N) + 0.35 * samp(L2, 128, x / N, y / N) + 0.15 * rnd();
      const k = (y * N + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.max(0, Math.min(255, (v * 1.6 - 0.3) * 255)); img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const bt = new THREE.CanvasTexture(c); bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.repeat.set(70, 70); bt.anisotropy = 8;
    m.bumpMap = bt; m.bumpScale = 0.35; m.roughness = 0.55;
    this.browU = { eyeC0: { value: new THREE.Vector3() }, eyeC1: { value: new THREE.Vector3() }, browCol: { value: new THREE.Color(0x1c1410) }, faceCx: { value: 0 }, browOn: { value: 1 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.browU);
      sh.uniforms.tMask = { value: this.maskTex };
      sh.vertexShader = "varying vec2 vU2; varying vec3 vRP2;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vU2 = uv; vRP2 = position;");
      sh.fragmentShader = "varying vec2 vU2; varying vec3 vRP2; uniform sampler2D tMask; uniform vec3 eyeC0; uniform vec3 eyeC1; uniform vec3 browCol; uniform float faceCx; uniform float browOn;\n" + sh.fragmentShader
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec4 mk = texture2D(tMask, vU2);
          float lipM = mk.r, earM = mk.g, lidM = mk.b, faceM = mk.a;
          float vn = fract(sin(dot(floor(vRP2.xyz * 40.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          diffuseColor.rgb *= 1.0 + (vn - 0.5) * 0.05;
          diffuseColor.rgb *= mix(vec3(1.0), vec3(1.07, 0.93, 0.91), smoothstep(0.0, 1.0, faceM) * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 0.52, 0.5), lipM * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 0.8, 0.78), earM * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.88, 0.68, 0.68), lidM * 0.7);
          { // eyebrows: an arched, tapering patch above each eye, broken up into strands
            float bm = 0.0;
            for (int i = 0; i < 2; i++) {
              vec3 ec = i == 0 ? eyeC0 : eyeC1; vec3 d = vRP2 - ec;
              float outS = sign(ec.x - faceCx); float lx = d.x * outS;
              float inner = -0.015, tail = 0.038;
              float t = clamp((lx - inner) / (tail - inner), 0.0, 1.0);
              float yc = 0.0125 + 0.0065 * (1.0 - pow(abs(t - 0.4) / 0.6, 2.0)) - 0.004 * t * t;
              float th = mix(0.0095, 0.0028, smoothstep(0.3, 1.0, t));
              float a = smoothstep(th, th * 0.3, abs(d.y - yc)) * smoothstep(inner, inner + 0.009, lx) * (1.0 - smoothstep(tail - 0.012, tail, lx)) * step(-0.012, d.z) * step(d.z, 0.03);
              float sx = floor((d.y - yc) * 1000.0 + lx * 90.0);
              float vv = (d.y - yc) * 1000.0 + lx * 110.0;
              float fine = 0.8 + 0.12 * sin(vv * 7.3 + sin(lx * 300.0) * 2.0) + 0.08 * sin(vv * 13.7 + lx * 500.0);
              bm = max(bm, a * fine);
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, browCol, clamp(bm * 1.25, 0.0, 1.0) * 0.95 * browOn);
          }`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.28, lipM);`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          { float f = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
            vec3 sssC = diffuseColor.rgb * vec3(1.0, 0.32, 0.18);
            totalEmissiveRadiance += sssC * (0.02 + 0.45 * f) * (0.6 + 0.8 * earM); }`);
    };
    m.needsUpdate = true;
  }

  setHair(style, color) {
    const isAsset = style === "authored1";
    const S = isAsset ? [0.004, 9, 0, 0] : { bald: null, buzz: [0.004, 0.125, 0.5, 0], short: [0.012, 0.11, 0.35, 0], medium: [0.022, 0.09, 0.3, 0.4], long: [0.03, 0.08, 0.25, 1.0] }[style];
    this.hair.visible = !!S && !isAsset;
    this.hairStyle = style;
    if (S) { this.hairThick.value = S[0]; this.hairU.line.value = S[1]; this.hairU.slope.value = S[2]; this.hairU.back.value = S[3]; }
    if (this._ready) this.rebuildHair();
    if (color != null) { this.hair.material.color.set(color).multiplyScalar(0.3); this.cards.mat.color.set(color); this.assetHair.mat.color.set(color); this.browU.browCol.value.set(color).multiplyScalar(0.6); }
  }
  origToRender() {
    if (!this._o2r) { this._o2r = new Int32Array(this.man.nFull).fill(-1); for (let i = 0; i < this.nR; i++) if (this._o2r[this.orig[i]] < 0) this._o2r[this.orig[i]] = i; }
    return this._o2r;
  }
  // wear(slot, mhcloUrl, {color}) puts a garment on; wear(slot, null) takes it off. One garment per slot.
  async wear(slot, url, opts = {}) {
    this.garments = this.garments || {};
    if (this.garments[slot]) { this.garments[slot].dispose(); delete this.garments[slot]; }
    if (url) { const g = new Garment(this, slot); this.garments[slot] = g; await g.load(url, opts); }
    this.applyBodyMask();
    this.shorts.visible = !Object.keys(this.garments).some((k) => k === "bottom") && !this._noShorts;
  }
  garmentColor(slot, c) { this.garments?.[slot]?.setColor(c); }
  // hide body triangles that sit entirely under a worn garment (the .mhclo delete_verts lists)
  applyBodyMask() {
    const del = new Set(); for (const g of Object.values(this.garments || {})) for (const v of g.deleted) del.add(v);
    const T = this.buf0(this.man.tris), keep = [];
    for (let t = 0; t < T.length; t += 3) if (!(del.has(this.orig[T[t]]) && del.has(this.orig[T[t + 1]]) && del.has(this.orig[T[t + 2]]))) keep.push(T[t], T[t + 1], T[t + 2]);
    this.mesh.geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(keep), 1));
  }
  rebuildHair() {
    const hj = this.headWorld[this.man.headBone];
    const asset = this.hairStyle === "authored1"; this.assetHair.mesh.visible = asset && !!this.assetHair.meta && this.assetHair.rebuild(this, hj);
    this.cards.rebuild(this, asset ? "none" : this.hairStyle, hj, { line: this.hairU.line.value, slope: this.hairU.slope.value, back: this.hairU.back.value });
  }
  setSkin(t) {
    const stops = ["#f2cdae", "#d9a77d", "#b9825a", "#8a5a3b", "#5a3a26", "#3a2418"].map((c) => new THREE.Color(c));
    const x = clamp(t, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
    this.skinMat.color.copy(stops[i]).lerp(stops[i + 1], x - i);
  }

  setEye(name) {
    const col = { brown: ["#7a4a24", "#3b2110"], darkbrown: ["#4b2c17", "#1d1009"], hazel: ["#9a7a3a", "#4a3a1a"], green: ["#5f8a4a", "#2b4a28"], blue: ["#5d86b8", "#26405f"], gray: ["#8d98a3", "#454f58"] }[name] ?? ["#7a4a24", "#3b2110"];
    const c = this.eyeTex.image; c.width = c.height = 256;
    const x = c.getContext("2d");
    const g0 = x.createRadialGradient(128, 128, 60, 128, 128, 140); g0.addColorStop(0, "#f2eee8"); g0.addColorStop(1, "#d8cdc4");
    x.fillStyle = g0; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = "rgba(170,60,55,0.22)"; x.lineWidth = 1;
    for (let k = 0; k < 26; k++) { const a = (k / 26) * 6.283 + Math.sin(k * 7.1) * 0.2, r0 = 70 + (k * 37 % 40), r1 = r0 + 25 + (k * 53 % 35); x.beginPath(); x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); x.quadraticCurveTo(128 + Math.cos(a + 0.15) * (r0 + r1) / 2, 128 + Math.sin(a + 0.15) * (r0 + r1) / 2, 128 + Math.cos(a + 0.05) * r1, 128 + Math.sin(a + 0.05) * r1); x.stroke(); }
    const ir = x.createRadialGradient(128, 128, 10, 128, 128, 66); ir.addColorStop(0, col[0]); ir.addColorStop(0.7, col[0]); ir.addColorStop(1, col[1]);
    x.fillStyle = ir; x.beginPath(); x.arc(128, 128, 66, 0, 7); x.fill();
    x.strokeStyle = "rgba(0,0,0,0.18)"; x.lineWidth = 1;
    for (let k = 0; k < 70; k++) { const a = k * 0.0898; x.beginPath(); x.moveTo(128 + Math.cos(a) * 24, 128 + Math.sin(a) * 24); x.lineTo(128 + Math.cos(a) * 64, 128 + Math.sin(a) * 64); x.stroke(); }
    x.strokeStyle = "rgba(10,6,4,0.75)"; x.lineWidth = 5; x.beginPath(); x.arc(128, 128, 64, 0, 7); x.stroke();
    x.fillStyle = "#080606"; x.beginPath(); x.arc(128, 128, 24, 0, 7); x.fill();
    this.eyeTex.needsUpdate = true;
  }

  // Find the body height (m) that gives this config the requested real height, then store it in cfg.height.
  bodyHeight() {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < this.man.nBody; i++) { const y = this.pos[i * 3 + 1]; if (y < lo) lo = y; if (y > hi) hi = y; }
    return hi - lo;
  }
  fitHeight(cfg, meters) {
    const at = (h) => { this.bake({ ...cfg, height: h }); return this.bodyHeight(); };
    const h0 = at(0), h5 = at(0.5), h1 = at(1);
    let h = meters <= h5 ? (meters - h0) / (h5 - h0) * 0.5 : 0.5 + (meters - h5) / (h1 - h5) * 0.5;
    cfg.height = clamp(h, 0, 1);
    return { min: h0, mid: h5, max: h1 };
  }

  buf0(a) { return new (a === this.man.uv || a === this.man.skinW ? Float32Array : Uint32Array)(this._buf, a.off, a.n); }

  // Re-bake and refit. Keeps the pose: bones go back to bind pose, are refitted, then pose restored.
  update(cfg, first = false) {
    this.cfg = cfg;
    this.bake(cfg);
    const P = this.positions;
    for (let i = 0; i < this.nR; i++) {
      const o = this.orig[i] * 3;
      P[i * 3] = this.pos[o]; P[i * 3 + 1] = this.pos[o + 1] + this.shift; P[i * 3 + 2] = this.pos[o + 2];
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    { // weld normals across UV-seam duplicates so offset shells (hair, shorts) don't tear
      const N = geo.attributes.normal.array, no = this.orig, acc = this._nacc || (this._nacc = new Float32Array(this.man.nFull * 3));
      acc.fill(0);
      for (let i = 0; i < this.nR; i++) { const o = no[i] * 3; acc[o] += N[i * 3]; acc[o + 1] += N[i * 3 + 1]; acc[o + 2] += N[i * 3 + 2]; }
      for (let i = 0; i < this.nR; i++) { const o = no[i] * 3, l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1; N[i * 3] = acc[o] / l; N[i * 3 + 1] = acc[o + 1] / l; N[i * 3 + 2] = acc[o + 2] / l; }
      geo.attributes.normal.needsUpdate = true;
    }
    geo.computeBoundingSphere();
    if (!this.shorts.geometry.attributes.normal) this.shorts.geometry.setAttribute("normal", geo.attributes.normal);
    if (!this.hair.geometry.attributes.normal) this.hair.geometry.setAttribute("normal", geo.attributes.normal);

    const hj = this.jointPos(this.man.bones[this.man.headBone].head, new THREE.Vector3());
    for (const e of this.eyes) {
      const pa = e.geo.attributes.position.array, ua = e.geo.attributes.uv.array;
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < e.orig.length; i++) { const o = e.orig[i] * 3; cx += this.pos[o]; cy += this.pos[o + 1]; cz += this.pos[o + 2]; }
      cx /= e.orig.length; cy /= e.orig.length; cz /= e.orig.length;
      if (e.mesh === this.eyes[0].mesh) { this.browU.eyeC0.value.set(cx, cy + this.shift, cz); } else if (e.mesh === this.eyes[1].mesh) { this.browU.eyeC1.value.set(cx, cy + this.shift, cz); }
      this.browU.faceCx.value = (this.browU.eyeC0.value.x + this.browU.eyeC1.value.x) / 2;
      let R = 0; for (let i = 0; i < e.orig.length; i++) { const o = e.orig[i] * 3; R = Math.max(R, Math.hypot(this.pos[o] - cx, this.pos[o + 1] - cy, this.pos[o + 2] - cz)); }
      for (let i = 0; i < e.orig.length; i++) {
        const o = e.orig[i] * 3;
        pa[i * 3] = this.pos[o] - hj.x; pa[i * 3 + 1] = this.pos[o + 1] + this.shift - hj.y; pa[i * 3 + 2] = this.pos[o + 2] - hj.z;
        ua[i * 2] = 0.5 + (this.pos[o] - cx) / (2 * R); ua[i * 2 + 1] = 0.5 + (this.pos[o + 1] - cy) / (2 * R);
      }
      e.geo.attributes.position.needsUpdate = true; e.geo.attributes.uv.needsUpdate = true;
      e.geo.computeVertexNormals(); e.geo.computeBoundingSphere();
    }
    const saved = this.bones.map((b) => b.quaternion.clone());
    const savedPos = this.rootMotion?.clone();
    const head = this.bones.map(() => new THREE.Vector3());
    const tail = this.bones.map(() => new THREE.Vector3());
    this.man.bones.forEach((b, i) => { this.jointPos(b.head, head[i]); this.jointPos(b.tail, tail[i]); });
    { const hi = this.man.bones.findIndex((b) => b.name === 'mixamorig:Hips'), li = this.man.bones.findIndex((b) => b.name === 'mixamorig:LeftUpLeg');
      this.cut.yTop.value = head[hi].y + 0.07; this.cut.yBot.value = head[li].y - 0.17; }
    this.hairU.hj.value.copy(head[this.man.headBone]);
    this.headWorld = head;
    for (const g of Object.values(this.garments || {})) g.refit();
    this._ready = true; clearTimeout(this._ht); this._ht = setTimeout(() => this.rebuildHair(), this._firstHair ? 120 : 0); this._firstHair = true; this.tailWorld = tail;
    this.bones.forEach((bone, i) => {
      const p = this.man.bones[i].parent;
      bone.quaternion.identity();
      bone.position.copy(head[i]);
      if (p >= 0) bone.position.sub(head[p]);
    });
    this.root.updateMatrixWorld(true);
    if (first || !this.skeleton) {
      this.skeleton = new THREE.Skeleton(this.bones);
      this.mesh.bind(this.skeleton, new THREE.Matrix4());
      this.shorts.bind(this.skeleton, new THREE.Matrix4()); this.hair.bind(this.skeleton, new THREE.Matrix4());
    } else {
      this.skeleton.calculateInverses();
    }
    if (!first) this.bones.forEach((b, i) => b.quaternion.copy(saved[i]));
    this.height = this.shift + Math.max(...Array.from({ length: this.man.nBody }, (_, i) => this.pos[i * 3 + 1]));
    return this;
  }

  bone(name) { return this.bones.find((b) => b.name === "mixamorig:" + name); }
}
