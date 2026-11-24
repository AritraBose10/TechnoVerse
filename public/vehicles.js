// Real Indian cars for the traffic (converted from Sketchfab models; see CREDITS.md).
// Each GLB is the exterior only (interior, engine and seats removed), about 20k triangles, in three
// materials: "paint" (recoloured per car), "detail" (glass frames, tyres, lights, trim), "glass".
// Nose +x, wheels on y = 0, real length. Until a model has loaded the procedural cars in street.js are used.
import * as THREE from "three";
import { GLTFLoader } from "/vendor/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "/vendor/jsm/utils/BufferGeometryUtils.js";
import { fitLamps } from "./lampfit.js";
import { MeshoptDecoder } from "/vendor/jsm/libs/meshopt_decoder.module.js";

const MODELS = {
  micra: { kind: "hatch", file: "micra", kit: true, near: true, k: 0.963, wr: 0.298, L: 3.78, W: 1.67, H: 1.66, wb: 2.45 },
  altok10: { kind: "hatch", file: "altok10", kit: true, near: true, k: 0.822, wr: 0.284, L: 3.6, W: 1.5, H: 1.51, wb: 2.37 },
  alto800: { kind: "hatch", file: "alto800", kit: true, near: true, k: 0.788, wr: 0.255, L: 3.43, W: 1.49, H: 1.51, wb: 2.36 },
  altoworks: { kind: "hatch", file: "altoworks", L: 3.4, W: 1.48, H: 1.63, wb: 2.46 },
  m800: { kind: "hatch", file: "m800", kit: true, near: true, k: 0.765, wr: 0.249, L: 3.37, W: 1.44, H: 1.4, wb: 2.175 },
  baleno: { kind: "hatch", file: "baleno", kit: true, near: true, k: 1.053, wr: 0.327, L: 3.99, W: 1.74, H: 1.62, wb: 2.52 },
  sx4: { kind: "sedan", file: "sx4", L: 4.1, W: 1.76, H: 1.62, wb: 2.5 },
  wuling: { kind: "suv", file: "wuling", kit: true, near: true, k: 0.858, wr: 0.314, L: 4.52, W: 1.72, H: 1.93, wb: 2.7 },
  fortuner15: { kind: "suv", file: "fortuner15", kit: true, near: true, k: 0.895, wr: 0.418, L: 4.7, W: 1.86, H: 1.9, wb: 2.75 },
  everest: { kind: "suv", file: "everest", kit: true, near: true, k: 0.975, wr: 0.396, L: 4.9, W: 1.86, H: 1.77, wb: 2.85 },
  safari: { kind: "suv", file: "safari", kit: true, near: true, k: 0.883, wr: 0.373, L: 4.67, W: 1.85, H: 1.78, wb: 2.74 },
  gsrtc: { kind: "bus", file: "gsrtc", L: 10.6, W: 2.64, H: 2.82, wb: 5.15 },
  scorpio: { kind: "suv", file: "scorpio", L: 4.66, W: 1.95, H: 1.84, wb: 2.75 },
  // "kit" models: wheel nodes and flat paint/trim/glass roles, facing -z in the file (see tools/vehicles/fbx2car.mjs).
  // `k` rescales the file to the real car length.
  dzire: { kind: "sedan", file: "dzire", kit: true, near: true, k: 1, wr: 0.322, L: 3.995, W: 1.735, H: 1.515, wb: 2.456 },
  triber: { kind: "suv", file: "triber", kit: true, near: true, k: 0.885, wr: 0.335, L: 3.995, W: 1.739, H: 1.643, wb: 2.636 },
  // the auto: the file is a textured Sketchfab tuk-tuk (3 wheels, open cab, closed rear box), scaled to a real 2.6 m auto.
  // Measured on the model (file units, nose -z): driver seat top y .727 at z -.12, rear bench top y .599 at z 1.0,
  // cab floor .31 / rear floor .29, the open side entry z -.65..+.06 (centre -.30), tail reflectors x +-.595, y .615, z 1.32.
  tuktuk: { kind: "auto", file: "tuktuk", kit: true, k: 0.92, wr: 0.207, L: 2.58, W: 1.47, H: 1.64, wb: 1.9, doorX: 0.28, axles: [1.045, -0.848],
    lamps: [{ x: -1.219, y: 0.566, z: 0.547, w: 0.12, h: 0.083 }] },
  scorpion: { kind: "suv", file: "scorpio_n", kit: true, near: true, k: 1, wr: 0.379, L: 4.662, W: 1.917, H: 1.857, wb: 2.75 },
};
const PICK = {
  hatch: ["micra", "altok10", "alto800", "altoworks", "m800", "baleno", "micra", "alto800"],
  sedan: ["sx4", "dzire", "baleno", "dzire"],
  suv: ["fortuner15", "everest", "safari", "scorpio", "wuling", "scorpion", "triber", "scorpion"],
  taxi: ["micra", "alto800", "altok10"],
  auto: ["tuktuk"],
  bus: ["gsrtc"],
};
// Axle positions along the car (x, nose +x) measured from the models, and a tyre radius a little under the real one:
// the rim and the inner tyre spin, the outer ring of rubber stays put, and no bodywork is caught in the circle.
const WHEELS = {
  micra: { fx: 1.148, rx: -1.299, R: 0.29 },
  altok10: { fx: 1.076, rx: -1.318, R: 0.28 },
  alto800: { fx: 1.096, rx: -1.256, R: 0.27 },
  altoworks: { fx: 1.18, rx: -1.28, R: 0.28 },
  m800: { fx: 1.09, rx: -1.1, R: 0.25 },
  baleno: { fx: 1.187, rx: -1.34, R: 0.29 },
  sx4: { fx: 1.148, rx: -1.34, R: 0.31 },
  wuling: { fx: 1.549, rx: -1.26, R: 0.31 },
  fortuner15: { fx: 1.448, rx: -1.403, R: 0.37 },
  everest: { fx: 1.589, rx: -1.247, R: 0.38 },
  safari: { fx: 1.435, rx: -1.309, R: 0.36 },
  scorpio: { fx: 1.475, rx: -1.269, R: 0.34 },
  gsrtc: { fx: 2.2, rx: -2.95, R: 0.5 },
};
const lodGeo = {}; // name -> { paint: [geometry], glass: [...], detail: [...] }
const loaded = {};
let spinWheels = true;
let readyP = Promise.resolve();
// resolves when every car model has loaded (or failed)
export const vehiclesReady = () => readyP;
// Pull the wheels out of the "detail" mesh into their own mesh per axle, each on a pivot at the axle, so they can roll.
function splitWheels(root, name, W) {
  const w = WHEELS[name];
  if (!w) return;
  let det = null;
  root.traverse((o) => { if (o.isMesh && o.material.name === "detail") det = o; });
  if (!det) return;
  const g = det.geometry;
  const pos = g.attributes.position;
  const idx = g.index ? g.index.array : null;
  const n = idx ? idx.length : pos.count;
  const axles = [{ x: w.fx, take: [] }, { x: w.rx, take: [] }];
  const r2 = (w.R * 1.04) ** 2; // the whole old tyre goes: it was low-poly and ragged where it was cut
  const keep = [];
  let zmax = 0;
  for (let i = 0; i < n; i += 3) {
    const vs = idx ? [idx[i], idx[i + 1], idx[i + 2]] : [i, i + 1, i + 2];
    let got = null;
    for (const ax of axles) {
      if (vs.every((q) => (pos.getX(q) - ax.x) ** 2 + (pos.getY(q) - w.R) ** 2 < r2 && Math.abs(pos.getZ(q)) > 0.25 * W)) { got = ax; break; }
    }
    if (got) {
      got.take.push(...vs);
      for (const q of vs) zmax = Math.max(zmax, Math.abs(pos.getZ(q)));
    } else keep.push(...vs);
  }
  if (axles.some((a) => a.take.length < 30)) return; // did not find a wheel: leave the model as it is
  const ng = new THREE.BufferGeometry();
  for (const k of Object.keys(g.attributes)) ng.setAttribute(k, g.attributes[k]);
  ng.setIndex(new THREE.BufferAttribute(new (pos.count > 65535 ? Uint32Array : Uint16Array)(keep), 1));
  det.geometry = ng;
  const wg = wheelGeos(w.R, Math.min(zmax, W / 2));
  for (const ax of axles) {
    const pivot = new THREE.Group();
    pivot.position.set(ax.x, w.R, 0);
    pivot.userData.wheel = true;
    for (const side of [-1, 1]) {
      const tyre = new THREE.Mesh(wg.tyre, TYRE_MAT);
      tyre.position.z = side * wg.zc;
      const rim = new THREE.Mesh(wg.rim, RIM_MAT);
      const dish = new THREE.Mesh(wg.dish, DISH_MAT);
      for (const o of [rim, dish]) {
        o.position.z = side * wg.zc;
        if (side < 0) o.rotation.y = Math.PI; // the dish faces outward on both sides
      }
      tyre.receiveShadow = true;
      pivot.add(tyre, rim, dish);
    }
    det.parent.add(pivot);
  }
}
// clean round wheels: a smooth tyre with rounded shoulders, and an alloy with five spokes, built once per size
const TYRE_MAT = new THREE.MeshStandardMaterial({ color: "#151516", roughness: 0.92 });
const RIM_MAT = new THREE.MeshStandardMaterial({ color: "#c4c8cd", roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide });
const DISH_MAT = new THREE.MeshStandardMaterial({ color: "#26282b", roughness: 0.7 });
const wheelCache = {};
function wheelGeos(R, zOut) {
  const key = R.toFixed(3) + zOut.toFixed(2);
  if (wheelCache[key]) return wheelCache[key];
  const Wt = Math.max(0.15, Math.min(0.3, 0.62 * R)), h = Wt / 2;
  const prof = [[0.58, -h], [0.86, -h * 0.97], [0.96, -h * 0.82], [1.0, -h * 0.5], [1.0, h * 0.5], [0.96, h * 0.82], [0.86, h * 0.97], [0.58, h]].map(([r, y]) => new THREE.Vector2(r * R * 1.02, y));
  const tyre = new THREE.LatheGeometry(prof, 36).rotateX(Math.PI / 2);
  const parts = [];
  const dish = new THREE.CylinderGeometry(0.56 * R, 0.56 * R, Wt * 0.4, 28).rotateX(Math.PI / 2).translate(0, 0, h * 0.3); // the dark well the spokes stand in front of
  parts.push(new THREE.RingGeometry(0.5 * R, 0.63 * R, 28).translate(0, 0, h * 0.97)); // the rim lip
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(new THREE.BoxGeometry(0.46 * R, 0.13 * R, 0.05 * R).translate(0.3 * R, 0, h * 0.62).rotateZ(a));
  }
  parts.push(new THREE.CylinderGeometry(0.13 * R, 0.13 * R, 0.07 * R, 12).rotateX(Math.PI / 2).translate(0, 0, h * 0.7)); // the hub
  const rim = mergeGeometries(parts);
  const zc = Math.max(0.2, zOut - h);
  return (wheelCache[key] = { tyre, rim, dish, zc });
}
const lightGeo = {};
// Tail lights (red) and the indicators (amber, front and back on each side), merged into one mesh each per model.
function lightGeos(name, m, model) {
  if (lightGeo[name]) return lightGeo[name];
  const hz = m.W / 2;
  if (m.lamps) { // a model with its own measured tail lamps (the auto): boxes on its reflectors, no indicators
    const tl = [];
    for (const l of m.lamps) for (const sg of [1, -1]) tl.push(new THREE.BoxGeometry(0.03, l.h, l.w).translate(l.x, l.y, sg * l.z));
    return (lightGeo[name] = { tail: mergeGeometries(tl), indL: null, indR: null });
  }
  // where the body really ends, found by ray casts on the model (a guessed box corner left the lamps floating 5-20 cm behind it)
  const fit = model ? fitLamps(model, m) : { tail: null, nose: null };
  const t = fit.tail || { x: -m.L / 2 + 0.03, y: m.H * 0.58, z: hz - 0.24, yaw: 0, edge: hz };
  const n = fit.nose || { x: m.L / 2 - 0.03, y: m.H * 0.5, z: hz - 0.22, yaw: 0, edge: hz };
  const box = (w, h, d, x, y, z, yaw) => new THREE.BoxGeometry(d, h, w).rotateY(yaw).translate(x, y, z);
  const tail = [], indL = [], indR = [];
  for (const s of [1, -1]) {
    tail.push(box(0.26, 0.1, 0.06, t.x, t.y, s * t.z, s * t.yaw));
    const arr = s > 0 ? indR : indL; // facing +x with y up, +z is the right-hand side
    arr.push(box(0.14, 0.06, 0.06, n.x, n.y - 0.03 * m.H, s * n.z, s * n.yaw));
    arr.push(box(0.12, 0.06, 0.06, t.x, t.y - 0.09 * m.H, s * Math.min(t.z + 0.15, t.edge - 0.07), s * t.yaw));
  }
  return (lightGeo[name] = { tail: mergeGeometries(tail), indL: mergeGeometries(indL), indR: mergeGeometries(indR) });
}

// ---------- people inside ----------
const SKIN = ["#8d5a3c", "#a56b47", "#c58c63", "#6e4a33"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
const SHIRT = ["#e6e6e0", "#2f4f8f", "#8f2f2f", "#3a7d44", "#caa24a", "#2a2a2a", "#7a5c8f"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
const HAIR = new THREE.MeshStandardMaterial({ color: "#1b1410", roughness: 0.9 });
// A seated person, hips at (x, y, z), facing +x. `driver` puts the hands on a wheel in front.
function sitter(x, y, z, rnd, driver, s = 1) {
  const g = new THREE.Group();
  const bx = (w, h, d, px, py, pz, rz = 0) => new THREE.BoxGeometry(w, h, d).rotateZ(rz).translate(px, py, pz);
  const body = [bx(0.2 * s, 0.5 * s, 0.4 * s, 0, 0.25 * s, 0)];
  const skin = [new THREE.SphereGeometry(0.115 * s, 8, 6).translate(0.02 * s, 0.62 * s, 0), bx(0.06 * s, 0.1 * s, 0.1 * s, 0, 0.5 * s, 0)];
  const hair = [new THREE.SphereGeometry(0.12 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.65 * s, 0)];
  for (const sz of [-1, 1]) {
    if (driver) {
      body.push(bx(0.28 * s, 0.08 * s, 0.08 * s, 0.14 * s, 0.36 * s, sz * 0.2 * s, -0.5));
      skin.push(new THREE.SphereGeometry(0.05 * s, 6, 4).translate(0.27 * s, 0.3 * s, sz * 0.15 * s));
    } else body.push(bx(0.1 * s, 0.4 * s, 0.07 * s, 0.02 * s, 0.3 * s, sz * 0.15 * s));
  }
  for (const [list, mat] of [[body, SHIRT[(rnd() * SHIRT.length) | 0]], [skin, SKIN[(rnd() * SKIN.length) | 0]], [hair, HAIR]]) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    g.add(m);
  }
  g.position.set(x, y, z);
  return g;
}
// who rides in this model: the driver on the right and a figure for every passenger seat. Each seat has a blocky stand-in
// (always cheap to draw) and, for vehicles near the viewer, a real seated character made by traffic.js through seated.js.
// People.js shows a seat when someone climbs aboard and hides one when someone gets off.
function addPeople(g, name, m, rnd, kind) {
  const seats = []; // { on, p, slot, fig, real }
  const seat = (p, driver, x, y, z, s = 1, reach, floor) => {
    const fig = sitter(x, y, z, rnd, driver, s);
    g.add(fig);
    seats.push({ on: true, p, slot: { x, y, z, driver, reach, floor }, fig, real: null });
  };
  if (m.kind === "bus") {
    const y = 0.95;
    seat(1, true, 3.7, y, 0.7, 1.1, 0.3);
    for (let x = 2.4; x > -4.6; x -= 1.0) for (const z of [-0.7, -0.3, 0.3, 0.7]) seat(0.3, false, x, y, z, 1.05, 0.3);
  } else if (m.kind === "auto") {
    // the tuk-tuk: the driver on the front bench, three on the rear bench (see MODELS for the measurements)
    const k = m.k, P = (mx, my, mz) => [-mz * k, my * k, mx * k]; // file units (nose -z) -> the car's frame (nose +x)
    seat(1, true, ...P(0, 0.727, -0.12), 1, 0.25, 0.29);
    for (const mx of [-0.42, 0, 0.42]) seat(0.4, false, ...P(mx, 0.599, 1.0), 1, 0.15, 0.26);
  } else {
    const y = m.H * 0.27, dx = m.wb * 0.08, hz = m.W * 0.22;
    seat(1, true, dx, y, hz);
    seat(0.3, false, dx, y, -hz);
    const back = kind === "taxi" ? 0.6 : 0.2;
    for (const z of [-hz, hz]) seat(back, false, dx - m.wb * 0.3, y, z);
  }
  // a steering wheel for the cars (the models have no interior): a ring, hub and spoke, tilted toward the driver, that traffic.js
  // turns. Only drawn while the driver is a real figure (near the viewer). hub faces the driver (its +z points to the tail),
  // spin.rotation.z is the steering angle, spin's local +x is the driver's right.
  let wheel = null;
  if (m.kind !== "bus" && m.kind !== "auto") {
    const hub = new THREE.Group();
    hub.position.set(m.wb * 0.08 + 0.5, m.H * 0.27 + 0.4, m.W * 0.22);
    hub.rotation.y = -Math.PI / 2;
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.4;
    hub.add(tilt);
    const spin = new THREE.Group();
    tilt.add(spin);
    const mat = new THREE.MeshStandardMaterial({ color: "#1a1a1c", roughness: 0.7 });
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 6, 18), mat));
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10).rotateX(Math.PI / 2), mat));
    spin.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.016, 0.016), mat));
    hub.visible = false;
    g.add(hub);
    wheel = { hub, spin, r: 0.17 };
  }
  let near = false;
  const sync = () => {
    for (const q of seats) {
      q.fig.visible = q.on && !(near && q.real);
      if (q.real) q.real.visible = q.on && near;
    }
    if (wheel) wheel.hub.visible = near && seats[0].on && Boolean(seats[0].real);
  };
  const pax = () => seats.filter((q) => !q.slot.driver);
  const api = {
    // a fresh load of passengers (the vehicle was just taken from the pool)
    refill(r) { for (const q of seats) q.on = q.slot.driver || r() < q.p; sync(); },
    count: () => pax().filter((q) => q.on).length,
    capacity: seats.length - 1,
    // someone gets on: a seat fills; false if it is full
    seatIn() { const free = pax().filter((q) => !q.on); if (!free.length) return false; free[(Math.random() * free.length) | 0].on = true; sync(); return true; },
    // someone gets off: a seat empties; false if it was empty
    seatOut() { const t = pax().filter((q) => q.on); if (!t.length) return false; t[(Math.random() * t.length) | 0].on = false; sync(); return true; },
    // the viewer is close (or not): real characters take the seats; make(slot) builds one, at most `budget` per call
    setNear(isNear, make, budget = 1) {
      let made = 0;
      if (isNear) for (const q of seats) if (q.on && !q.real && made < budget) { q.real = make(q.slot); made++; }
      if (isNear !== near || made) { near = isNear; sync(); }
    },
    // the driver gets out of / back into the seat
    setDriver(on) { seats[0].on = on; sync(); },
    get hasReal() { return seats.some((q) => q.real); },
    // the real figures now in their seats, for traffic.js to animate
    real() { return seats.filter((q) => q.real && q.on).map((q) => ({ fig: q.real, slot: q.slot })); },
    wheel,
  };
  api.refill(rnd);
  return api;
}
let started = false;
// Near-car detail tier, chosen once per session: "hi" (about 105K triangles a car) on strong machines, "mid" (about 55K) elsewhere.
// ?cars=hi|mid overrides it. The files are meshopt-compressed (models/vehicles/near/<tier>/).
const _q = new URLSearchParams(location.search);
export const CAR_TIER = _q.get("cars") === "hi" || _q.get("cars") === "mid" ? _q.get("cars") : (_q.get("q") === "high" || (navigator.hardwareConcurrency || 4) >= 12) ? "hi" : "mid";
export function preloadVehicles(high = true) {
  if (started) return;
  started = true;
  spinWheels = high; // the wheels cost two more draw calls a car: only on high
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const jobs = [];
  for (const [name, m] of Object.entries(MODELS)) {
    jobs.push(loader.loadAsync(m.near ? `/models/vehicles/near/${CAR_TIER}/${m.file}.glb` : `/models/vehicles/${m.file}.glb`).then(
      (g) => {
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = o.material.name !== "glass";
          o.receiveShadow = true;
          if (o.material.name === "paint") {
            o.geometry.deleteAttribute("color"); // the colour comes from the material, per car
            o.userData.isPaint = true;
          }
          if (o.material.name === "glass") {
            o.material.depthWrite = false;
            o.material.roughness = 0.05;
            if (m.near) o.material.envMapIntensity = 1.6; // the sky shows in the glass
          }
        });
        if (m.kit) {
          if (m.near) { const l1 = g.scene.getObjectByName("lod1"); if (l1) l1.visible = false; } // far copy (about 2.7K triangles): shown by setLod beyond ~38 m
          else g.scene.getObjectByName("lod1")?.removeFromParent(); // one level of detail is enough here
          g.scene.rotation.y = -Math.PI / 2; // the file's nose points -z; the traffic drives along +x
          g.scene.scale.setScalar(m.k);
          g.scene.traverse((o) => { if (/^wheel_/.test(o.name)) { o.userData.wheel = true; o.userData.kit = true; } });
        } else if (spinWheels) splitWheels(g.scene, name, MODELS[name].W);
        loaded[name] = g.scene;
        // a ~3K-triangle copy of the body for cars far from the camera (models/vehicles/lod; the kit models and the bus have none)
        if (!m.kit) {
          loader.loadAsync(`/models/vehicles/lod/${m.file}.glb`).then((lg) => {
            const o = {};
            lg.scene.traverse((x) => {
              if (!x.isMesh) return;
              const key = x.material.name.replace(/\.\d+$/, "");
              if (key === "paint") x.geometry.deleteAttribute("color");
              (o[key] ||= []).push(x.geometry);
            });
            lodGeo[name] = o;
          }).catch(() => {});
        }
      },
      (e) => console.warn("vehicle model missing:", name, e),
    ));
  }
  readyP = Promise.allSettled(jobs);
}
// A car of this kind ("hatch" | "sedan" | "suv" | "taxi") in this colour, or null if none has loaded yet.
// Same userData as makeCar() in street.js, so the traffic can use it without change.
export function makeRealCar(kind, color, rnd = Math.random) {
  const list = (PICK[kind] || PICK.hatch).filter((n) => loaded[n]);
  if (!list.length) return null;
  const name = list[(rnd() * list.length) | 0];
  const m = MODELS[name];
  const g = new THREE.Group();
  const car = loaded[name].clone(true);
  g.add(car);
  let paint = null;
  car.traverse((o) => {
    if (!o.isMesh || !o.userData.isPaint) return;
    if (!paint) {
      // the near-detail cars get a clear-coated metallic finish on the strong tier; the rest keep the cheap standard paint
      paint = m.near && CAR_TIER === "hi" ? new THREE.MeshPhysicalMaterial({ name: "paint", clearcoat: 1, clearcoatRoughness: 0.1 }) : o.material.clone();
    }
    paint.vertexColors = false;
    paint.color.set(color);
    paint.roughness = m.near ? 0.3 : 0.35;
    paint.envMapIntensity = m.near ? 1.5 : 1; // near cars pick up the sky reflection more strongly
    paint.metalness = m.near ? 0.6 : 0.5;
    o.material = paint;
  });
  // lights: small emissive boxes at the corners, one material per car so each can burn on its own
  const lg = lightGeos(name, m, loaded[name]);
  const lampMat = (color, emissive, k) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: k, roughness: 0.4 });
  const tail = lampMat("#5a0a0a", "#ff1a1a", 0.3);
  const indL = lampMat("#7a4a00", "#ffa000", 0);
  const indR = lampMat("#7a4a00", "#ffa000", 0);
  for (const [geo, mat] of [[lg.tail, tail], [lg.indL, indL], [lg.indR, indR]]) {
    if (!geo) continue;
    const lamp = new THREE.Mesh(geo, mat);
    g.add(lamp);
  }
  const occupants = addPeople(g, name, m, rnd, kind);
  let door = null, rearDoor = null;
  const doorLeaves = []; // { pivot, len }: each door leaf runs from its pivot along the pivot's x by len (people.js keeps bodies off it)
  if (m.kind === "bus") {
    // the passenger door on the kerb side, behind the cab: two glazed leaves hinged at the outer edges; people.js and
    // traffic.js open it while the bus stands at a stop (door.set(0..1))
    const mat = new THREE.MeshStandardMaterial({ color: "#16222c", roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.8 });
    const frame = new THREE.MeshStandardMaterial({ color: "#2a2a2e", roughness: 0.6 });
    const leaves = [];
    for (const [hx, s] of [[3.7, 1], [4.6, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(hx, 0.4, -1.32);
      pivot.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.65, 0.035).translate(s * 0.23, 0.825, 0), mat));
      pivot.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.05).translate(s * 0.23, 0.55, 0), frame));
      pivot.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.65, 0.05).translate(s * 0.44, 0.825, 0), frame));
      g.add(pivot);
      leaves.push([pivot, s]);
      doorLeaves.push({ pivot, len: s * 0.46 });
    }
    // the model's wall is solid there, so the opening is a dark recess with a step, shown while the leaves are open
    const dark = new THREE.MeshStandardMaterial({ color: "#0b0d10", roughness: 0.9 });
    const stepMat = new THREE.MeshStandardMaterial({ color: "#8a8d90", roughness: 0.7 });
    const recess = new THREE.Group();
    recess.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.65, 0.06).translate(4.15, 1.225, -1.3), dark));
    recess.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.34).translate(4.15, 0.4, -1.45), stepMat));
    recess.visible = false;
    g.add(recess);
    door = { kind: "bus", pivots: leaves.map((l) => l[0]), set(k) {
      recess.visible = k > 0.03; for (const [pv, s] of leaves) pv.rotation.y = s * 1.55 * k; } };
  }
  else if (m.kind !== "auto") {
    // the driver's door (right-hand side, the model's +z): the body keeps its own closed door; when it opens a dark
    // opening covers that door's place and a leaf in the body colour swings out on its front hinge
    const dx = m.wb * 0.08, hw = 0.4, hz = m.W / 2 - 0.02;
    const leafMat = paint || new THREE.MeshStandardMaterial({ color: "#777", roughness: 0.5 });
    const glassM = new THREE.MeshStandardMaterial({ color: "#1a2430", roughness: 0.1, transparent: true, opacity: 0.75 });
    const dark = new THREE.MeshStandardMaterial({ color: "#0d0f12", roughness: 0.9 });
    const lh = m.H * 0.42, gh = m.H * 0.22;
    const opening = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, lh + gh, 0.04).translate(dx, 0.3 + (lh + gh) / 2, hz + 0.012), dark);
    opening.visible = false;
    const pivot = new THREE.Group();
    pivot.position.set(dx + hw, 0.3, hz + 0.03);
    pivot.add(new THREE.Mesh(new THREE.BoxGeometry(hw * 2, lh, 0.05).translate(-hw, lh / 2, 0), leafMat));
    pivot.add(new THREE.Mesh(new THREE.BoxGeometry(hw * 1.8, gh, 0.03).translate(-hw, lh + gh / 2, 0), glassM));
    pivot.visible = false;
    g.add(opening, pivot);
    doorLeaves.push({ pivot, len: -hw * 2 });
    // opened to 72 degrees, the way a car door stops on its check strap: a body gets out past it (people.js
    // steps out through the rear part of the opening, behind the open leaf)
    door = { kind: "car", pivots: [pivot], exitX: dx - hw * 0.45, handle(out) { pivot.updateWorldMatrix(true, false); return pivot.localToWorld(out.set(-hw * 1.7, lh * 0.92, 0.05)); }, set(k) { pivot.visible = opening.visible = k > 0.03; pivot.rotation.y = 1.25 * k; } };
    if (kind === "taxi") {
      // the kerb-side rear door (traffic keeps left, so the kerb is the model's -z side), same build as the driver's
      const rx = dx - m.wb * 0.3, rz = -(m.W / 2 - 0.02);
      const ropening = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, lh + gh, 0.04).translate(rx, 0.3 + (lh + gh) / 2, rz - 0.012), dark);
      ropening.visible = false;
      const rp = new THREE.Group();
      rp.position.set(rx + hw, 0.3, rz - 0.03);
      rp.add(new THREE.Mesh(new THREE.BoxGeometry(hw * 2, lh, 0.05).translate(-hw, lh / 2, 0), leafMat));
      rp.add(new THREE.Mesh(new THREE.BoxGeometry(hw * 1.8, gh, 0.03).translate(-hw, lh + gh / 2, 0), glassM));
      rp.visible = false;
      g.add(ropening, rp);
      doorLeaves.push({ pivot: rp, len: -hw * 2 });
      rearDoor = { set(k) { rp.visible = ropening.visible = k > 0.03; rp.rotation.y = -1.25 * k; } };
    }
  }
  const wheels = [];
  car.traverse((o) => { if (o.userData.wheel) wheels.push(o); });
  // far away: swap the body meshes for their light copies and hide the separate wheels (the light copy has its own)
  const lodTargets = {};
  car.traverse((o) => { if (o.isMesh && !o.userData.wheelPart) (lodTargets[o.material.name.replace(/\.\d+$/, "")] ||= []).push({ mesh: o, full: o.geometry }); });
  const setLod = (far) => {
    if (m.near) {
      const a = car.getObjectByName("lod0"), b = car.getObjectByName("lod1");
      if (!a || !b) return false;
      a.visible = !far; b.visible = far;
      return true;
    }
    const L = lodGeo[name];
    if (!L || m.kit) return false;
    for (const key of ["paint", "glass", "detail"]) if (lodTargets[key] && (!L[key] || L[key].length !== lodTargets[key].length)) return false;
    for (const key of ["paint", "glass", "detail"]) (lodTargets[key] || []).forEach((t, i) => { t.mesh.geometry = far ? L[key][i] : t.full; });
    for (const w of wheels) w.visible = !far;
    return true;
  };
  const roll = { set rotation(a) { for (const p of wheels) { if (p.userData.kit) p.rotation.x = a; else p.rotation.z = a; } }, get rotation() { const p = wheels[0]; return p ? (p.userData.kit ? p.rotation.x : p.rotation.z) : 0; } };
  g.userData = {
    size: { L: m.L, W: m.W, H: m.H },
    wheelR: m.wr ?? 0.3,
    axles: m.axles ?? [m.wb / 2, -m.wb / 2],
    doorX: m.doorX ?? (kind === "taxi" ? m.wb * (0.08 - 0.3) - 0.18 : undefined), // where people climb in: the rear part of a taxi's rear door opening (the open leaf is ahead of it)
    leaves: doorLeaves,
    rearDoor,
    paint: paint || { color: new THREE.Color() }, // models whose body is not a separate material keep their own colour
    tail,
    indL,
    indR,
    alloy: { map: roll },
    model: name,
    setLod,
    occupants,
    door,
  };
  return g;
}
