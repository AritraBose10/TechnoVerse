// Trees of a Salt Lake street, built in code:
//   rain tree    (Samanea saman)      wide umbrella crown on spreading limbs, the big avenue tree
//   neem         (Azadirachta indica) rounded crown of bright, finely cut leaves
//   gulmohar     (Delonix regia)      flat umbrella crown with scarlet-orange flowers
//   ashoka       (Polyalthia longifolia 'pendula') tall narrow column of drooping leaves
//   coconut palm                      ringed, leaning trunk with arching feather fronds
//   shrubs       ixora and tecoma-like hedging, some in flower
//
// Each species is grown once as a branching skeleton (tapering, bending limbs) with leaf clusters
// at the twig ends. Leaves are textured cards whose lighting normals point out from the crown's
// centre, so the canopy shades like a mass of leaves. Every tree of a species is an instance of
// that model, turned and scaled differently. Leaves sway in the breeze and cast dappled shadows.
import * as THREE from "three";
import { mergeGeometries } from "/vendor/jsm/utils/BufferGeometryUtils.js";

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- textures
function canvasTexture(w, h, draw, maxAniso, { wrap = false } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// A clump of leaves on a transparent card. Leaves crowd the middle and thin out at the edge, the
// lower ones are darker (shaded by those above), and each has a light tip and a midrib.
function leafClump(g, w, h, rnd, o) {
  const cx = w / 2;
  const cy = h / 2;
  for (let i = 0; i < o.count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * w * 0.38;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * (o.squash || 1);
    const depth = 0.55 + 0.45 * (1 - (y / h) * 0.9) + rnd() * 0.15; // higher on the card = lighter
    const L = o.len * (0.7 + rnd() * 0.6);
    const W = L * o.width;
    const ang = o.droop ? Math.PI / 2 + (rnd() - 0.5) * o.droop : rnd() * Math.PI * 2;
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    const hue = o.hue + (rnd() - 0.5) * o.hueVar;
    const light = o.light * depth + (rnd() - 0.5) * 6;
    const grad = g.createLinearGradient(0, 0, L, 0);
    grad.addColorStop(0, hsl(hue, o.sat, light * 0.8));
    grad.addColorStop(1, hsl(hue - 4, o.sat + 5, light * 1.12));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(L * 0.45, -W, L, 0);
    g.quadraticCurveTo(L * 0.45, W, 0, 0);
    g.fill();
    g.strokeStyle = hsl(hue, o.sat - 10, light * 1.25, 0.5);
    g.lineWidth = Math.max(0.6, W * 0.12);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(L * 0.92, 0);
    g.stroke();
    g.restore();
  }
  // nothing may touch the card's edge, or the square shows: fade everything out before the border
  const cut = () => {
    g.save();
    g.globalCompositeOperation = "destination-in";
    const m = g.createRadialGradient(cx, cy, w * 0.36, cx, cy, w * 0.495);
    m.addColorStop(0, "rgba(0,0,0,1)");
    m.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = m;
    g.fillRect(0, 0, w, h);
    g.restore();
  };
  if (!o.flowers) cut();
  if (o.flowers) {
    for (let i = 0; i < o.flowers; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * w * 0.4;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.8 - h * 0.05;
      const s = o.flowerSize * (0.7 + rnd() * 0.6);
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2 + rnd();
        g.fillStyle = hsl(o.flowerHue + (rnd() - 0.5) * 10, 85, 48 + rnd() * 12);
        g.beginPath();
        g.ellipse(x + Math.cos(pa) * s * 0.55, y + Math.sin(pa) * s * 0.55, s * 0.55, s * 0.38, pa, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = hsl(o.flowerHue + 15, 90, 70);
      g.beginPath();
      g.arc(x, y, s * 0.18, 0, Math.PI * 2);
      g.fill();
    }
    cut();
  }
}

function barkTexture(g, w, h, rnd, base, dark, light) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rnd() < 0.5 ? dark : light;
    g.globalAlpha = 0.08 + rnd() * 0.2;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 2 + rnd() * 8);
  }
  g.globalAlpha = 1;
  // long vertical fissures that wander and fork
  g.strokeStyle = dark;
  for (let i = 0; i < 26; i++) {
    let x = rnd() * w;
    g.lineWidth = 1 + rnd() * 3;
    g.globalAlpha = 0.45 + rnd() * 0.4;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= h; y += 16) {
      x += (rnd() - 0.5) * 8;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

// A palm frond seen flat: a midrib with long narrow leaflets angled toward the tip.
function frondTexture(g, w, h, rnd) {
  g.clearRect(0, 0, w, h);
  const cx = w / 2;
  for (let y = h * 0.06; y < h * 0.98; y += 5) {
    const t = y / h;
    const len = w * 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (0.85 + rnd() * 0.25);
    for (const side of [-1, 1]) {
      if (rnd() < 0.07) continue; // a few torn or missing leaflets
      const light = 30 + rnd() * 12;
      g.strokeStyle = hsl(85 + rnd() * 12, 45, light);
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(cx, y);
      g.quadraticCurveTo(cx + side * len * 0.6, y - len * 0.15, cx + side * len, y - len * 0.42);
      g.stroke();
    }
  }
  g.strokeStyle = hsl(55, 35, 52);
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(cx, 0);
  g.lineTo(cx, h);
  g.stroke();
}

// ---------------------------------------------------------------- geometry
const UP = new THREE.Vector3(0, 1, 0);
// A tapering, gently bending limb from `a` toward `dir`, as a few cylinder sections.
function limb(parts, a, dir, length, r0, r1, rnd, bend = 0.15) {
  const segs = 3;
  let p = a.clone();
  let d = dir.clone().normalize();
  for (let i = 0; i < segs; i++) {
    const q = p.clone().addScaledVector(d, length / segs);
    const ra = r0 + ((r1 - r0) * i) / segs;
    const rb = r0 + ((r1 - r0) * (i + 1)) / segs;
    const geo = new THREE.CylinderGeometry(rb, ra, p.distanceTo(q), 7, 1, true);
    geo.translate(0, p.distanceTo(q) / 2, 0);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, q.clone().sub(p).normalize()));
    m.setPosition(p);
    geo.applyMatrix4(m);
    // bark texture runs up the limb: scale v by length so the pattern is not stretched
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * p.distanceTo(q) * 0.6 + rnd());
    parts.push(geo);
    // limbs curve: a little toward the light and a little at random
    d.add(new THREE.Vector3((rnd() - 0.5) * bend, bend * 0.4, (rnd() - 0.5) * bend)).normalize();
    p = q;
  }
  return { end: p, dir: d };
}

// A leaf card (square) centred at p, facing roughly `face`, with lighting normals bent outward from
// the crown centre so the whole canopy shades as one rounded mass.
function card(parts, p, size, face, crownCentre, rnd, outward = 0.75) {
  const geo = new THREE.PlaneGeometry(size, size);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.clone().normalize());
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rnd() * Math.PI * 2));
  geo.applyQuaternion(q);
  geo.translate(p.x, p.y, p.z);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(crownCentre).normalize();
    n.fromBufferAttribute(nor, i);
    if (n.dot(v) < 0) n.negate();
    n.lerp(v, outward).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  parts.push(geo);
}

const randomDir = (rnd, upBias = 0) => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5 + upBias, rnd() - 0.5).normalize();

// ---------------------------------------------------------------- species
// Each returns { bark: [geometries], leaves: [geometries], height, trunkRadius }.
function broadleafTree(rnd, s) {
  const bark = [];
  const leaves = [];
  const trunkTop = new THREE.Vector3((rnd() - 0.5) * 0.3, s.trunk, (rnd() - 0.5) * 0.3);
  limb(bark, new THREE.Vector3(0, 0, 0), trunkTop.clone().normalize(), s.trunk, s.r, s.r * 0.78, rnd, 0.05);
  // root flare
  const flare = new THREE.CylinderGeometry(s.r * 1.05, s.r * 1.55, 0.5, 9, 1, true);
  flare.translate(0, 0.25, 0);
  bark.push(flare);
  const centre = new THREE.Vector3(0, s.crownY, 0);
  const tips = [];
  function grow(p, dir, len, r, depth) {
    const { end, dir: d } = limb(bark, p, dir, len, r, r * 0.62, rnd, s.bend);
    if (depth >= s.depth) {
      tips.push({ p: end, d });
      return;
    }
    const n = depth === 0 ? s.limbs : s.fork;
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + rnd() * 1.2;
      const elev = s.spread[depth] + (rnd() - 0.5) * 0.25;
      const nd = new THREE.Vector3(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev));
      nd.lerp(d, 0.25).normalize();
      grow(end, nd, len * s.shrink * (0.85 + rnd() * 0.3), r * 0.62, depth + 1);
    }
  }
  grow(trunkTop, new THREE.Vector3(0, 1, 0), s.limbLen, s.r * 0.78, 0);
  // leaf clusters at every twig end, filling the crown's shell
  for (const t of tips) {
    for (let k = 0; k < s.cards; k++) {
      const off = randomDir(rnd, 0.3).multiplyScalar(s.cardSpread * (0.4 + rnd() * 0.6));
      const p = t.p.clone().add(off);
      const out = p.clone().sub(centre);
      card(leaves, p, s.cardSize * (0.75 + rnd() * 0.5), out.lerp(randomDir(rnd, 0.6), 0.5), centre, rnd);
    }
  }
  // inner foliage so the crown is not hollow when seen from below
  for (let k = 0; k < s.inner; k++) {
    const p = centre.clone().add(randomDir(rnd, 0.2).multiply(new THREE.Vector3(s.width * 0.3, s.height * 0.12, s.width * 0.3)));
    card(leaves, p, s.cardSize, randomDir(rnd, 0.5), centre, rnd, 0.6);
  }
  return { bark, leaves, height: s.trunk, trunkRadius: s.r };
}

const SPECIES = {
  rain: { trunk: 2.8, r: 0.36, limbs: 5, fork: 2, depth: 3, limbLen: 3.6, shrink: 0.62, spread: [0.62, 0.32, 0.18], bend: 0.12, cards: 9, cardSize: 2.7, cardSpread: 1.6, inner: 34, crownY: 6.6, width: 12, height: 9 },
  neem: { trunk: 2.4, r: 0.27, limbs: 4, fork: 3, depth: 3, limbLen: 2.5, shrink: 0.66, spread: [0.95, 0.6, 0.35], bend: 0.18, cards: 7, cardSize: 2.1, cardSpread: 1.2, inner: 28, crownY: 5.8, width: 7, height: 8 },
  gulmohar: { trunk: 2.6, r: 0.3, limbs: 5, fork: 2, depth: 3, limbLen: 3.0, shrink: 0.6, spread: [0.55, 0.28, 0.15], bend: 0.12, cards: 7, cardSize: 2.4, cardSpread: 1.3, inner: 22, crownY: 5.6, width: 9.5, height: 7 },
};

function ashokaTree(rnd) {
  // a straight, slender trunk with short drooping branches all the way up: a narrow green column
  const bark = [];
  const leaves = [];
  const h = 10 + rnd() * 1.5;
  limb(bark, new THREE.Vector3(), new THREE.Vector3(0, 1, 0), h, 0.17, 0.05, rnd, 0.02);
  const centre = new THREE.Vector3(0, h * 0.55, 0);
  for (let y = 1.6; y < h + 0.6; y += 0.42) {
    const t = (y - 1.6) / (h - 1.6);
    const radius = 1.25 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.12)) * (1 - t * 0.35);
    const n = 3;
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(a) * radius * (0.5 + rnd() * 0.5), y, Math.sin(a) * radius * (0.5 + rnd() * 0.5));
      const face = new THREE.Vector3(Math.cos(a), (rnd() - 0.5) * 0.4, Math.sin(a));
      card(leaves, p, 1.5 + rnd() * 0.5, face, new THREE.Vector3(0, y, 0), rnd, 0.8);
    }
  }
  return { bark, leaves, height: h, trunkRadius: 0.17, centre };
}

function coconutPalm(rnd, frondMat) {
  const bark = [];
  const leaves = [];
  // the trunk leans and curves back up, as coconut palms do
  const h = 7.5 + rnd() * 2.5;
  const lean = new THREE.Vector3(0.25 + rnd() * 0.2, 1, 0).normalize();
  let p = new THREE.Vector3();
  let d = lean.clone();
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const q = p.clone().addScaledVector(d, h / segs);
    const geo = new THREE.CylinderGeometry(0.15, 0.17 - i * 0.003, h / segs, 9, 1, true);
    geo.translate(0, h / segs / 2, 0);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d));
    m.setPosition(p);
    geo.applyMatrix4(m);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, (uv.getY(k) + i) * (h / segs) * 0.5);
    bark.push(geo);
    p = q;
    d.lerp(UP, 0.12).normalize();
  }
  const crown = p.clone();
  // coconuts tucked under the crown
  for (let i = 0; i < 6; i++) {
    const nut = new THREE.SphereGeometry(0.13, 8, 6);
    const a = rnd() * Math.PI * 2;
    nut.translate(crown.x + Math.cos(a) * 0.22, crown.y - 0.25 - rnd() * 0.15, crown.z + Math.sin(a) * 0.22);
    bark.push(nut);
  }
  // fronds: a V-folded strip along an arching midrib
  const fronds = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + rnd() * 0.3;
    const dead = i % 7 === 0;
    const len = dead ? 3.2 : 4.2 + rnd() * 0.8;
    const rise = dead ? -1.2 : 0.5 - (i % 3) * 0.35 + rnd() * 0.2; // young fronds stand up, old ones droop
    const segsF = 10;
    const pos = [];
    const uv = [];
    const idx = [];
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    for (let k = 0; k <= segsF; k++) {
      const t = k / segsF;
      // arc: rises a little then falls away under its own weight
      const along = t * len;
      const y = rise * t * 1.4 - 1.8 * t * t * (dead ? 1.6 : 1);
      const c = crown.clone().addScaledVector(out, along * 0.95).add(new THREE.Vector3(0, y + 0.1, 0));
      const halfW = 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)) + 0.05;
      const fold = halfW * 0.35; // leaflets angle down either side of the rib
      pos.push(c.x - side.x * halfW, c.y - fold, c.z - side.z * halfW, c.x, c.y, c.z, c.x + side.x * halfW, c.y - fold, c.z + side.z * halfW);
      uv.push(0, t, 0.5, t, 1, t);
      if (k > 0) {
        const b = (k - 1) * 3;
        idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // normals: mostly up and out, so fronds catch the sky light instead of going black underneath
    const nor = geo.attributes.normal;
    const pa = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let k = 0; k < nor.count; k++) {
      v.fromBufferAttribute(pa, k).sub(crown).normalize().lerp(UP, 0.5).normalize();
      nor.setXYZ(k, v.x, v.y, v.z);
    }
    if (dead) {
      const col = new Float32Array(pos.length).fill(1);
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    }
    fronds.push({ geo, dead });
  }
  // dead fronds are brown: tint by vertex colour
  for (const f of fronds) {
    if (!f.geo.attributes.color) f.geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(f.geo.attributes.position.count * 3).fill(1), 3));
    else f.geo.attributes.color.array.forEach((_, k, arr) => (arr[k] = [1.55, 1.05, 0.55][k % 3]));
    leaves.push(f.geo);
  }
  for (const b of bark) if (!b.attributes.color) b.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(b.attributes.position.count * 3).fill(1), 3));
  return { bark, leaves, height: h, trunkRadius: 0.17, top: crown };
}

function shrubModel(rnd) {
  const leaves = [];
  const centre = new THREE.Vector3(0, 0.55, 0);
  for (let k = 0; k < 16; k++) {
    const d = randomDir(rnd, 0.35);
    const p = centre.clone().add(d.clone().multiply(new THREE.Vector3(0.55, 0.35, 0.55)));
    card(leaves, p, 0.75 + rnd() * 0.3, d, centre, rnd, 0.8);
  }
  return { bark: [], leaves, height: 1, trunkRadius: 0 };
}

// ---------------------------------------------------------------- the forest
export function makeTrees({ scene, renderer }) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const rnd = seeded(77);
  const time = { value: 0 };

  const leafTex = {
    rain: canvasTexture(512, 512, (g, w, h) => leafClump(g, w, h, rnd, { count: 2600, len: 19, width: 0.45, hue: 95, hueVar: 12, sat: 48, light: 30 }), maxAniso),
    neem: canvasTexture(512, 512, (g, w, h) => leafClump(g, w, h, rnd, { count: 2200, len: 26, width: 0.26, hue: 88, hueVar: 10, sat: 55, light: 36 }), maxAniso),
    gulmohar: canvasTexture(512, 512, (g, w, h) => leafClump(g, w, h, rnd, { count: 2600, len: 16, width: 0.42, hue: 92, hueVar: 10, sat: 50, light: 34, flowers: 70, flowerHue: 14, flowerSize: 15 }), maxAniso),
    ashoka: canvasTexture(512, 512, (g, w, h) => leafClump(g, w, h, rnd, { count: 1100, len: 52, width: 0.2, hue: 110, hueVar: 8, sat: 50, light: 24, droop: 0.7 }), maxAniso),
    shrub: canvasTexture(256, 256, (g, w, h) => leafClump(g, w, h, rnd, { count: 420, len: 12, width: 0.45, hue: 105, hueVar: 12, sat: 50, light: 28 }), maxAniso),
    shrubRed: canvasTexture(256, 256, (g, w, h) => leafClump(g, w, h, rnd, { count: 380, len: 12, width: 0.45, hue: 105, hueVar: 12, sat: 50, light: 28, flowers: 26, flowerHue: 355, flowerSize: 6 }), maxAniso),
    shrubWhite: canvasTexture(256, 256, (g, w, h) => leafClump(g, w, h, rnd, { count: 380, len: 12, width: 0.45, hue: 105, hueVar: 12, sat: 50, light: 28, flowers: 26, flowerHue: 50, flowerSize: 6 }), maxAniso),
  };
  // white flowers: lighten that texture's petals
  const frondTex = canvasTexture(128, 512, (g, w, h) => frondTexture(g, w, h, rnd), maxAniso);
  const barkTex = canvasTexture(256, 512, (g, w, h) => barkTexture(g, w, h, rnd, "#6b5a49", "#3a2e24", "#8d7c69"), maxAniso, { wrap: true });
  const palmBarkTex = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = "#8a7d6a";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      g.fillStyle = "#73685a";
      g.globalAlpha = 0.55;
      g.fillRect(0, y + (rnd() - 0.5) * 2, w, 1.5 + rnd()); // faint leaf-scar rings
      g.fillStyle = "#988c78";
      g.fillRect(0, y + 3, w, 1);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 600; i++) {
      g.fillStyle = rnd() < 0.5 ? "#6d6252" : "#9c907c";
      g.globalAlpha = 0.25;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    g.globalAlpha = 1;
  }, maxAniso, { wrap: true });

  // leaves: alpha-tested cards that sway with the breeze; shadows use the same cut-outs
  function leafMaterial(map, { vertexColors = false, sway = 1 } = {}) {
    const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, vertexColors });
    m.alphaToCoverage = true;
    const swayIt = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            vec3 base = vec3(0.0);
            #ifdef USE_INSTANCING
              base = instanceMatrix[3].xyz;
            #endif
            float phase = base.x * 0.37 + base.z * 0.29;
            float k = ${sway.toFixed(2)} * clamp(position.y / 8.0, 0.0, 1.0);
            transformed.x += k * (sin(uTime * 1.3 + phase + position.y * 0.4) * 0.09 + sin(uTime * 3.1 + position.x) * 0.025);
            transformed.z += k * (cos(uTime * 1.1 + phase * 1.3) * 0.07 + sin(uTime * 2.7 + position.z) * 0.025);
          }`,
        );
    };
    m.onBeforeCompile = swayIt;
    const depth = new THREE.MeshDepthMaterial({ map, alphaTest: 0.32, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    return { m, depth };
  }
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 });
  const palmBarkMat = new THREE.MeshStandardMaterial({ map: palmBarkTex, roughness: 0.95, vertexColors: true });

  // models: two of each broadleaf so neighbours are not clones
  const models = {};
  const build = (name, make, leafMap, opts = {}) => {
    const t = make();
    const lm = leafMaterial(leafMap, opts);
    models[name] = {
      bark: t.bark.length ? mergeGeometries(t.bark.map((g) => g.toNonIndexed())) : null,
      leaves: mergeGeometries(t.leaves.map((g) => (g.index ? g.toNonIndexed() : g))),
      leafMat: lm.m,
      leafDepth: lm.depth,
      barkMat: opts.palm ? palmBarkMat : barkMat,
      height: t.height,
      list: [],
    };
  };
  for (const v of [0, 1]) {
    build(`rain${v}`, () => broadleafTree(rnd, SPECIES.rain), leafTex.rain);
    build(`neem${v}`, () => broadleafTree(rnd, SPECIES.neem), leafTex.neem);
    build(`gulmohar${v}`, () => broadleafTree(rnd, SPECIES.gulmohar), leafTex.gulmohar);
    build(`ashoka${v}`, () => ashokaTree(rnd), leafTex.ashoka, { sway: 0.6 });
    build(`palm${v}`, () => coconutPalm(rnd), frondTex, { vertexColors: true, palm: true, sway: 1.4 });
  }
  build("shrub", () => shrubModel(rnd), leafTex.shrub, { sway: 0.3 });
  build("shrubRed", () => shrubModel(rnd), leafTex.shrubRed, { sway: 0.3 });
  build("shrubWhite", () => shrubModel(rnd), leafTex.shrubWhite, { sway: 0.3 });

  return {
    /** kind: rain | neem | gulmohar | ashoka | palm | shrub | shrubRed | shrubWhite */
    add(kind, x, y, z, { yaw = 0, scale = 1, variant = 0 } = {}) {
      const name = models[kind] ? kind : `${kind}${variant % 2}`;
      models[name].list.push({ x, y, z, yaw, scale });
      return models[name].height * scale;
    },
    finish() {
      const dummy = new THREE.Object3D();
      const tint = new THREE.Color();
      for (const m of Object.values(models)) {
        if (!m.list.length) continue;
        const parts = [];
        if (m.bark) parts.push(new THREE.InstancedMesh(m.bark, m.barkMat, m.list.length));
        const leaves = new THREE.InstancedMesh(m.leaves, m.leafMat, m.list.length);
        leaves.customDepthMaterial = m.leafDepth;
        leaves.userData.noAO = true;
        parts.push(leaves);
        m.list.forEach((t, i) => {
          dummy.position.set(t.x, t.y, t.z);
          dummy.rotation.set(0, t.yaw, 0);
          dummy.scale.setScalar(t.scale);
          dummy.updateMatrix();
          for (const p of parts) p.setMatrixAt(i, dummy.matrix);
          // each tree a slightly different green: age, water, dust from the road
          const k = 0.86 + ((Math.sin(t.x * 12.9 + t.z * 78.2) * 43758.5) % 1 + 1) % 1 * 0.26;
          leaves.setColorAt(i, tint.setRGB(k, k * (0.97 + 0.05 * Math.sin(t.x)), k * 0.95));
        });
        for (const p of parts) {
          p.castShadow = true;
          p.receiveShadow = true;
          p.frustumCulled = false;
          scene.add(p);
        }
      }
    },
    animate(seconds) {
      time.value = seconds;
    },
  };
}
