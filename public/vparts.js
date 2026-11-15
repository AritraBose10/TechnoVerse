// Shapes shared by the two-wheelers (bicycle.js, motorcycle.js): tubes between two points, tubes
// along a curve, bands that follow a wheel (mudguards), and smooth bodies drawn as a row of
// cross-sections (fuel tanks, seats, side panels, a scooter's body).
//
// Everything is in the bike's own frame: x to the rider's right, y up, forward is -z. Side
// profiles are written as (f, y): f metres forward of the midpoint between the axles, y above
// the ground.
import * as THREE from "three";
import { mergeGeometries } from "/vendor/jsm/utils/BufferGeometryUtils.js";

const UP = new THREE.Vector3(0, 1, 0);

/** A point from side-profile numbers: f forward, y up, x to the right. */
export const P = (f, y, x = 0) => new THREE.Vector3(x, y, -f);

/** Straight tube from a to b. */
export function tubeGeo(a, b, r, seg = 8, r2 = r) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** Tube through a list of points, bent smoothly. */
export function pathGeo(points, r, seg = 6, steps = 0) {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
  return new THREE.TubeGeometry(curve, steps || points.length * 6, r, seg, false);
}

/**
 * A band that follows a wheel: a mudguard. Centre of the wheel at (f, y); the band sits at
 * `radius` from it, from angle a0 to a1 (degrees: 0 = straight ahead, 90 = top, 180 = behind),
 * `width` across, curved across its width like pressed steel.
 */
export function bandGeo(f, y, radius, a0, a1, width, { steps = 14, crown = 0.012, x = 0 } = {}) {
  const pos = [];
  const idx = [];
  const across = [-1, -0.6, 0, 0.6, 1];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    for (const u of across) {
      const r = radius - crown * u * u; // the edges turn in toward the tyre
      pos.push(x + (u * width) / 2, y + Math.sin(a) * r, -(f + Math.cos(a) * r));
    }
  }
  const n = across.length;
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < n - 1; k++) {
      const a = i * n + k;
      idx.push(a, a + 1, a + n + 1, a, a + n + 1, a + n);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A smooth body from cross-sections along the bike. Each section: { f, y, h, w, n, x }:
 * centre height y, half-height h, half-width w, and how square it is (n = 2 an ellipse, 4 nearly
 * a box). x moves it off the centre line. Ends are closed.
 */
export function loftGeo(sections, { seg = 16 } = {}) {
  const list = [...sections].sort((a, b) => b.f - a.f); // front to back
  const pos = [];
  const idx = [];
  for (const s of list) {
    const e = 2 / (s.n || 2.6);
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      // flatter underneath when asked (a seat, a tank on its frame)
      const hh = sn < 0 && s.hb !== undefined ? s.hb : s.h;
      pos.push((s.x || 0) + Math.sign(c) * Math.abs(c) ** e * s.w, s.y + Math.sign(sn) * Math.abs(sn) ** e * hh, -s.f);
    }
  }
  for (let i = 0; i < list.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k;
      const b = i * seg + ((k + 1) % seg);
      idx.push(a, b, b + seg, a, b + seg, a + seg);
    }
  }
  // end caps
  const cap = (i, flip) => {
    const s = list[i];
    const c = pos.length / 3;
    pos.push(s.x || 0, s.y, -s.f);
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k;
      const b = i * seg + ((k + 1) % seg);
      if (flip) idx.push(c, a, b);
      else idx.push(c, b, a);
    }
  };
  cap(0, false);
  cap(list.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A side profile [[f, y], ...] given thickness across the bike (centred, or offset by x). */
export function slabGeo(profile, width, { bevel = 0.012, x = 0 } = {}) {
  const shape = new THREE.Shape(profile.map(([f, y]) => new THREE.Vector2(f, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, width - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(Math.PI / 2); // shape x (forward) -> -z, extrusion -> x
  g.translate(x, 0, 0);
  return g;
}

/**
 * Collects parts by material for one moving piece (the frame, the steering, a wheel) and turns
 * them into one mesh per material, so a whole bike is a couple of dozen draws at most.
 */
export class Parts {
  constructor() {
    this.by = new Map();
  }
  add(mat, geo) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const key of Object.keys(g.attributes)) if (key !== "position" && key !== "normal" && key !== "uv") g.deleteAttribute(key);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(g);
    return this;
  }
  /** Adds the merged meshes to `group`. `at`: the group's place in the bike's frame (a Matrix4), if not the origin. */
  into(group, at = null) {
    const inv = at ? at.clone().invert() : null;
    for (const [mat, list] of this.by) {
      const geo = mergeGeometries(list);
      if (inv) geo.applyMatrix4(inv);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !mat.userData.noShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.by.clear();
    return group;
  }
}

/** Picture on a small canvas, as a colour texture. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
