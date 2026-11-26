// The everyday Indian two-wheeler helmet: an open-face ISI helmet with a flip-up smoked visor
// (the Steelbird / Vega kind worn on every commuter bike), built to real size.
//
// Measurements: shell about 27 cm across, 31 cm front to back and 25 cm tall, about 1.1 kg;
// the face opening runs from the brow (just above the eyebrows) down past the cheekbones; the
// shell comes lower at the back and over the ears; the chin strap with a D-ring hangs from just in
// front of each ear. Inside, a dark padded liner shows round the edge.
//
// Frame of the returned group: origin at the centre of the wearer's head (about 9 cm above the
// eyes, midway front to back), +z forward (the face), y up. `strap(worn)` closes the chin strap
// under the chin or lets it hang loose.
import * as THREE from "three";

const shared = {};
function mats() {
  if (shared.liner) return shared;
  shared.liner = new THREE.MeshStandardMaterial({ color: "#141416", roughness: 0.95 });
  shared.rubber = new THREE.MeshStandardMaterial({ color: "#0e0e10", roughness: 0.7 });
  shared.visor = new THREE.MeshPhysicalMaterial({ color: "#1a2026", roughness: 0.04, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.55, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  shared.strap = new THREE.MeshStandardMaterial({ color: "#1b1b1d", roughness: 0.85, side: THREE.DoubleSide });
  shared.metal = new THREE.MeshStandardMaterial({ color: "#c4c7cb", roughness: 0.3, metalness: 0.9 });
  shared.vent = new THREE.MeshStandardMaterial({ color: "#202124", roughness: 0.5 });
  return shared;
}
const paintCache = new Map();
function paint(color) {
  if (!paintCache.has(color)) paintCache.set(color, new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }));
  return paintCache.get(color);
}

// A point on the shell's outer surface: an egg, wider at the back, slightly flattened at the sides.
const RX = 0.136; // half-width
const RF = 0.15; // front half-length
const RB = 0.165; // back half-length
const RY = 0.135; // height above the centre
function shellPoint(theta, phi, inset = 0) {
  // theta: angle round from the front (0) to the right (+pi/2) and back (pi); phi: down from the top
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const fz = Math.cos(theta);
  const rz = fz > 0 ? RF : RB;
  // below the widest line the shell runs straight down over the ears and the back of the skull
  // (17 cm below the centre at the nape) rather than closing in like a ball
  const below = c < 0 ? Math.min(1, -c * 1.6) : 0;
  return new THREE.Vector3(Math.sin(theta) * (s + below * (1 - s) * 0.85) * (RX - inset), c < 0 ? c * (0.17 - inset) : c * (RY - inset), fz * (s + below * (1 - s) * 0.85) * (rz - inset));
}
// how far down the shell reaches at each angle round the head: highest over the face, lowest at
// the back of the neck, covering the ears at the sides
function edgePhi(theta) {
  const a = Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta))); // 0 front .. pi back
  const face = 1.02; // the brow
  const ear = 2.2; // below the ear
  const back = 2.4; // the nape
  if (a < 0.62) return face;
  if (a < 1.2) return face + (ear - face) * ((a - 0.62) / 0.58) ** 0.7;
  return ear + (back - ear) * ((a - 1.05) / (Math.PI - 1.05));
}

export function makeHelmet({ color = "#1b1d22", accent = "#c8202a", detail = true } = {}) {
  const S = mats();
  const g = new THREE.Group();
  g.name = "helmet";
  const NT = detail ? 48 : 28;
  const NP = detail ? 18 : 10;
  // ---- outer shell and liner, following the cut-out edge ----
  const shell = (inset, mat, side = THREE.FrontSide) => {
    const pos = [];
    const idx = [];
    for (let i = 0; i <= NT; i++) {
      const th = (i / NT) * Math.PI * 2;
      const edge = edgePhi(th);
      for (let j = 0; j <= NP; j++) {
        const p = shellPoint(th, (j / NP) * edge, inset);
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < NT; i++)
      for (let j = 0; j < NP; j++) {
        const a = i * (NP + 1) + j;
        const b = a + NP + 1;
        if (side === THREE.BackSide) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  };
  g.add(shell(0, paint(color)));
  g.add(shell(0.012, S.liner, THREE.BackSide));
  // rubber trim round the edge
  {
    const pts = [];
    for (let i = 0; i <= NT; i++) {
      const th = (i / NT) * Math.PI * 2;
      pts.push(shellPoint(th, edgePhi(th), 0.006));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), NT, 0.0075, 6, true), S.rubber));
  }
  // a stripe from the brow over the crown to the back, and the vents on top
  {
    const pts = [];
    for (let j = 0; j <= 16; j++) {
      const phi = -1.05 + (j / 16) * (1.05 + 1.9); // front edge over the top and down the back
      pts.push(shellPoint(phi < 0 ? 0 : Math.PI, Math.abs(phi), -0.0015));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const stripe = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.013, 4), paint(accent));
    stripe.scale.set(1.25, 1, 1);
    g.add(stripe);
    for (const x of [-0.04, 0.04]) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.045), S.vent);
      const p = shellPoint(x > 0 ? 0.35 : -0.35, 0.55, -0.003);
      v.position.copy(p);
      v.lookAt(p.clone().multiplyScalar(2));
      g.add(v);
    }
  }
  // ---- visor: smoked, hinged at the temples, raised a little ----
  const visorPivot = new THREE.Group();
  visorPivot.position.set(0, 0.0, 0.0);
  g.add(visorPivot);
  {
    const pos = [];
    const idx = [];
    const NA = detail ? 20 : 12;
    const NB = 6;
    for (let i = 0; i <= NA; i++) {
      const th = -1.15 + (i / NA) * 2.3; // across the face
      for (let j = 0; j <= NB; j++) {
        const phi = 1.0 + (j / NB) * 0.95; // from the brow down to the cheekbones
        const p = shellPoint(th, phi, -0.012);
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < NA; i++)
      for (let j = 0; j < NB; j++) {
        const a = i * (NB + 1) + j;
        idx.push(a, a + NB + 1, a + 1, a + NB + 1, a + NB + 2, a + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const visor = new THREE.Mesh(geo, S.visor);
    visor.renderOrder = 3;
    visorPivot.add(visor);
    for (const sx of [-1, 1]) {
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 12).rotateZ(Math.PI / 2), S.rubber);
      const p = shellPoint(sx * 1.45, 1.35, -0.005);
      hinge.position.copy(p);
      g.add(hinge);
    }
  }
  visorPivot.rotation.x = -0.18; // pushed up a little, as most riders keep it in town
  // ---- chin strap with the D-rings ----
  const strapGroup = new THREE.Group();
  g.add(strapGroup);
  const strapAt = [-1, 1].map((sx) => shellPoint(sx * 1.3, edgePhi(1.3) - 0.04, 0.012));
  function buildStrap(worn) {
    strapGroup.clear();
    const [l, r] = strapAt;
    // worn: under the chin (about 11 cm below the centre of the head, a little forward);
    // loose: hanging in a loop below the helmet
    const mid = worn ? new THREE.Vector3(0, -0.2, 0.075) : new THREE.Vector3(0, -0.3, -0.01);
    for (const [a, sgn] of [[l, -1], [r, 1]]) {
      const ctrl = worn ? new THREE.Vector3(sgn * 0.065, -0.2, 0.04) : new THREE.Vector3(sgn * 0.07, -0.27, -0.02);
      const curve = new THREE.QuadraticBezierCurve3(a, ctrl, mid.clone().add(new THREE.Vector3(sgn * 0.012, 0, 0)));
      const strap = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.0045, 4), S.strap);
      strap.scale.set(1, 1, 1);
      strapGroup.add(strap);
    }
    for (const sx of [-0.01, 0.006]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.002, 4, 12), S.metal);
      ring.position.copy(mid).add(new THREE.Vector3(sx, 0, 0));
      ring.rotation.y = Math.PI / 2;
      strapGroup.add(ring);
    }
  }
  buildStrap(false);
  let worn = false;
  return {
    group: g,
    /** close the strap under the chin (true) or let it hang (false) */
    strap(on) {
      if (on === worn) return;
      worn = on;
      buildStrap(on);
    },
    /** visor: 0 down over the eyes .. 1 fully up */
    visor(k) {
      visorPivot.rotation.x = -0.05 - 1.1 * k;
    },
  };
}
