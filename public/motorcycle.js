// The everyday two-wheelers of an Indian street, built from their real measurements:
//
//   commuter  a 100 cc commuter in the Hero Splendor mould: 1.235 m wheelbase, 18 inch wheels,
//             0.79 m seat, slim tank, long flat dual seat, a small cowl round a squarish headlamp,
//             black alloy wheels, an inclined single cylinder with a long chrome silencer on the
//             right, twin rear shocks, a leg guard, a saree guard and a grab rail
//   classic   the older pattern still everywhere (CD 100 / CT 100 / Boxer kind): round chrome
//             headlamp, wire-spoked wheels with chrome rims, knee pads on the tank, fork gaiters
//             and a luggage carrier behind the seat
//   bullet    the 350 cc long-stroke single every Indian road knows (the Bullet / Classic 350 kind,
//             built here without any maker's badge): 1.39 m wheelbase, 19 inch spoked wheels,
//             195 kg, teardrop tank with pinstripes, headlamp in a nacelle on the fork, deep
//             mudguards, split seat, an upright finned cylinder and one long chrome silencer
//   scooter   a 110 cc gearless scooter (Activa kind): 10 inch wheels, flat floorboard, front
//             apron, headlamp in the handlebar cowl, the engine under the seat, a centre stand
//
// No sports bikes: these are the machines that actually fill the kerb outside a college.
//
// buildMotorcycle() gives the same handles as buildBicycle(): the group, the steering group, grip
// and footrest markers for the rider's hands and feet, the saddle, and pose(). The front fork,
// wheel, mudguard, headlamp and bars turn together about the real steering axis.
// Riding uses stepBike() from bicycle.js with an engine: power-limited at speed (5.9 kW gives
// about 87 km/h against air drag), thrust-limited in first gear, engine braking on a closed
// throttle, 0.7 g of brakes.
import * as THREE from "three";
import { P, tubeGeo, pathGeo, bandGeo, loftGeo, slabGeo, Parts, canvasTexture } from "/vparts.js";

const G = 9.81;
const deg = (d) => (d * Math.PI) / 180;

const MOTOR = {
  motor: true,
  riderMass: 72,
  brake: 0.7 * G,
  maxSide: 6.5,
  steerRate: 1.9,
  maxSteer: 0.6,
  engineBrake: 0.7, // m/s^2 on a closed throttle
  idle: 1300,
  redline: 8000,
  parkLean: 0.17,
  gear: 1,
};

export const MOTORCYCLE_DESIGNS = {
  commuter: {
    label: "motorcycle",
    R: 0.3, tyre: 0.04, L: 1.235, rake: 26, wheels: "alloy", lamp: "cowl",
    colors: [["#16171a", "#c8202a"], ["#8f1418", "#e8e8e4"], ["#1c2f6b", "#d8d8d4"], ["#5d6066", "#16171a"], ["#16171a", "#c9a227"]],
    phys: { mass: 112, cda: 0.62, crr: 0.016, power: { cruise: 3300, sprint: 5900 }, push: { cruise: 420, sprint: 640 }, gears: [24, 45, 66, 92], topSpeed: 24.6, posture: 0.3 },
  },
  classic: {
    label: "motorcycle",
    R: 0.3, tyre: 0.038, L: 1.225, rake: 27, wheels: "spoke", lamp: "round", rack: true, kneePads: true, gaiters: true,
    colors: [["#141416", "#c9a227"], ["#5e1218", "#e8e8e4"], ["#15264f", "#e8e8e4"], ["#1d3b2a", "#e0d6b0"]],
    phys: { mass: 108, cda: 0.64, crr: 0.016, power: { cruise: 3100, sprint: 5600 }, push: { cruise: 400, sprint: 610 }, gears: [23, 43, 63, 88], topSpeed: 23.6, posture: 0.28 },
  },
  bullet: {
    label: "350 cc classic",
    R: 0.335, tyre: 0.046, L: 1.39, rake: 26, wheels: "spoke", lamp: "nacelle", heavy: true,
    colors: [["#111214", "#c9a227"], ["#5a1016", "#d9c27a"], ["#3c4638", "#111214"], ["#676b70", "#111214"], ["#16264a", "#d8d8d4"]],
    phys: { mass: 195, cda: 0.68, crr: 0.017, power: { cruise: 8000, sprint: 15000 }, push: { cruise: 720, sprint: 1080 }, gears: [38, 62, 88, 110, 126], topSpeed: 32.5, posture: 0.22, idle: 950, redline: 6200, parkLean: 0.16, brake: 0.75 * G, steerRate: 1.6 },
  },
  scooter: {
    label: "scooter",
    R: 0.215, tyre: 0.045, L: 1.24, rake: 26.5, wheels: "disc", scooter: true,
    colors: [["#e9e9e6", "#16171a"], ["#6f7479", "#16171a"], ["#8f1418", "#16171a"], ["#1d2f5e", "#16171a"], ["#1b1c1f", "#16171a"], ["#c9b68a", "#16171a"]],
    phys: { mass: 109, cda: 0.66, crr: 0.018, power: { cruise: 3100, sprint: 5700 }, push: { cruise: 330, sprint: 440 }, gears: [86], cvt: true, topSpeed: 23, posture: 0.12, parkLean: 0, maxSteer: 0.65 },
  },
};
export const MOTORCYCLE_KINDS = Object.keys(MOTORCYCLE_DESIGNS);

export function motorcycleSpec(design = "commuter") {
  const d = MOTORCYCLE_DESIGNS[design] || MOTORCYCLE_DESIGNS.commuter;
  return { ...MOTOR, wheelRadius: d.R, wheelbase: d.L, ...d.phys };
}

const shared = {};
function mats() {
  if (shared.black) return shared;
  shared.black = new THREE.MeshStandardMaterial({ color: "#17181a", roughness: 0.6 });
  shared.matte = new THREE.MeshStandardMaterial({ color: "#222326", roughness: 0.85 });
  shared.tyre = new THREE.MeshStandardMaterial({ color: "#141414", roughness: 0.93 });
  shared.vinyl = new THREE.MeshStandardMaterial({ color: "#1a1a1b", roughness: 0.62 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: "#d9dcdf", roughness: 0.14, metalness: 1 });
  shared.engine = new THREE.MeshStandardMaterial({ color: "#9a9da1", roughness: 0.45, metalness: 0.85 });
  shared.engineBlack = new THREE.MeshStandardMaterial({ color: "#232426", roughness: 0.5, metalness: 0.6 });
  shared.alloy = new THREE.MeshStandardMaterial({ color: "#1d1e20", roughness: 0.4, metalness: 0.7 });
  shared.head = new THREE.MeshStandardMaterial({ color: "#f3f6f8", roughness: 0.1, metalness: 0.5, emissive: "#fff3d6", emissiveIntensity: 0.15 });
  shared.smoke = new THREE.MeshStandardMaterial({ color: "#0f1114", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.72 });
  shared.mirror = new THREE.MeshStandardMaterial({ color: "#e8ecef", roughness: 0.03, metalness: 1 });
  shared.spoke = new THREE.LineBasicMaterial({ color: "#c4c8cc" });
  shared.wire = new THREE.LineBasicMaterial({ color: "#2a2b2d" });
  shared.head.userData.noShadow = true;
  shared.smoke.userData.noShadow = true;
  return shared;
}
const plateTextures = new Map();
function plateMat(text) {
  if (!plateTextures.has(text)) {
    const tex = canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = "#f4f4f0";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#111";
      g.lineWidth = 5;
      g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = "#111";
      g.font = "700 46px Arial";
      g.textAlign = "center";
      g.textBaseline = "middle";
      const parts = text.split(" ");
      g.fillText(parts.slice(0, 2).join(" "), w / 2, h * 0.3);
      g.fillText(parts.slice(2).join(" "), w / 2, h * 0.72);
    });
    plateTextures.set(text, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  }
  return plateTextures.get(text);
}

export function buildMotorcycle({ design = "commuter", color, accent, plate = "WB 06 AF 6627", detail = true } = {}) {
  const D = MOTORCYCLE_DESIGNS[design] || MOTORCYCLE_DESIGNS.commuter;
  const S = mats();
  const pair = D.colors.find((c) => c[0] === color) || D.colors[0];
  color ||= pair[0];
  accent ||= pair[1];
  const seg = detail ? 10 : 6;
  const ring = detail ? 18 : 12;
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
  const stripe = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: "#8f0f12", roughness: 0.25, emissive: "#ff1a10", emissiveIntensity: 0.3 });
  const amber = () => new THREE.MeshStandardMaterial({ color: "#d98a1a", roughness: 0.3, emissive: "#ff9a1a", emissiveIntensity: 0 });
  const indL = amber();
  const indR = amber();
  const R = D.R;
  const L = D.L;
  const H = deg(90 - D.rake);
  const axis = new THREE.Vector3(0, Math.sin(H), Math.cos(H)); // up and back along the steering head
  const ahead = new THREE.Vector3(0, Math.cos(H), -Math.sin(H));
  const rearAxle = P(-L / 2, R);
  const frontAxle = P(L / 2, R);
  const offset = D.scooter ? 0.03 : 0.045;
  const onAxis = frontAxle.clone().addScaledVector(ahead, -offset);
  const up = (t, x = 0) => frontAxle.clone().addScaledVector(axis, t).setX(x); // along the fork from the axle
  const col = (t) => onAxis.clone().addScaledVector(axis, t); // along the steering axis

  const root = new THREE.Group();
  const body = new Parts();
  const front = new Parts();
  // last number: the far end's radius for a taper, or (3 and up) how many sides for a thin rod
  const T = (parts, mat, a, b, r, r2) => parts.add(mat, r2 >= 3 ? tubeGeo(a, b, r, r2) : tubeGeo(a, b, r, seg, r2 ?? r));
  const lofted = (parts, mat, sections) => parts.add(mat, loftGeo(sections, { seg: ring }));

  // ---- wheels ----
  function wheel(isFront) {
    const w = new THREE.Group();
    const parts = new Parts();
    const t = D.tyre * (isFront && !D.scooter ? 0.92 : 1);
    parts.add(S.tyre, new THREE.TorusGeometry(R - t, t, detail ? 10 : 7, detail ? 36 : 22).rotateY(Math.PI / 2));
    const rimR = R - 2 * t + 0.006;
    if (D.wheels === "disc") {
      parts.add(S.engine, new THREE.CylinderGeometry(rimR, rimR, 0.07, detail ? 24 : 14, 1, true).rotateZ(Math.PI / 2));
      parts.add(S.alloy, new THREE.CylinderGeometry(rimR - 0.004, rimR * 0.5, 0.03, detail ? 24 : 14).rotateZ(-Math.PI / 2).translate(0.012, 0, 0));
      parts.add(S.alloy, new THREE.CylinderGeometry(rimR - 0.004, rimR * 0.5, 0.03, detail ? 24 : 14).rotateZ(Math.PI / 2).translate(-0.012, 0, 0));
      parts.add(S.engine, new THREE.CylinderGeometry(0.045, 0.045, 0.1, 12).rotateZ(Math.PI / 2));
    } else {
      const spoked = D.wheels === "spoke";
      parts.add(spoked ? S.chrome : S.alloy, new THREE.TorusGeometry(rimR, 0.016, 6, detail ? 36 : 22).rotateY(Math.PI / 2).scale(1.5, 1, 1));
      parts.add(S.engine, new THREE.CylinderGeometry(0.062, 0.062, 0.1, 14).rotateZ(Math.PI / 2)); // drum brake hub
      parts.add(S.engineBlack, new THREE.CylinderGeometry(0.066, 0.066, 0.02, 14).rotateZ(Math.PI / 2).translate(isFront ? -0.045 : 0.045, 0, 0)); // brake plate
      if (spoked) {
        const pts = [];
        const n = detail ? 36 : 18;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const ha = a + (i % 4 < 2 ? 0.5 : -0.5);
          const hx = i % 2 ? 0.04 : -0.04;
          pts.push(new THREE.Vector3(hx, Math.sin(ha) * 0.06, Math.cos(ha) * 0.06), new THREE.Vector3(0, Math.sin(a) * (rimR - 0.008), Math.cos(a) * (rimR - 0.008)));
        }
        w.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), S.spoke));
      } else {
        for (let i = 0; i < 5; i++) {
          // five twin spokes
          for (const off of [-0.16, 0.16]) parts.add(S.alloy, new THREE.BoxGeometry(0.03, rimR - 0.045, 0.022).translate(0, 0.05 + (rimR - 0.045) / 2, 0).rotateX((i / 5) * Math.PI * 2 + off));
        }
      }
    }
    parts.into(w);
    return w;
  }
  const rearWheel = wheel(false);
  rearWheel.position.copy(rearAxle);
  root.add(rearWheel);

  // ---- steering ----
  const pivotAt = col(D.scooter ? 0.3 : 0.5);
  const steerPivot = new THREE.Group();
  steerPivot.position.copy(pivotAt);
  steerPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  root.add(steerPivot);
  const steer = new THREE.Group();
  steerPivot.add(steer);
  steerPivot.updateMatrix();
  const steerAt = steerPivot.matrix.clone();
  const steerInv = steerAt.clone().invert();
  const frontMount = new THREE.Group();
  steer.add(frontMount);
  frontMount.position.copy(frontAxle).applyMatrix4(steerInv);
  frontMount.quaternion.copy(steerPivot.quaternion).invert();
  const frontWheel = wheel(true);
  frontMount.add(frontWheel);
  const marker = (p, parent = root, inv = null) => {
    const o = new THREE.Object3D();
    o.position.copy(p);
    if (inv) o.position.applyMatrix4(inv);
    parent.add(o);
    return o;
  };
  const grips = [];
  const mirrors = (base, top, sgn) => {
    front.add(S.black, pathGeo([base, base.clone().lerp(top, 0.5).add(new THREE.Vector3(sgn * 0.01, 0.02, 0.012)), top], 0.005, 5, 8));
    front.add(S.black, new THREE.SphereGeometry(0.055, 12, 8).scale(1.1, 0.72, 0.28).translate(top.x + sgn * 0.02, top.y + 0.02, top.z));
    front.add(S.mirror, new THREE.CircleGeometry(0.046, 14).scale(1.1, 0.72, 1).translate(top.x + sgn * 0.02, top.y + 0.02, top.z + 0.017));
  };
  const frontPlate = (f, y, tilt) => {
    const g = new THREE.PlaneGeometry(0.16, 0.08).rotateY(Math.PI).rotateX(tilt).translate(0, y, -f);
    const m = new THREE.Mesh(g.applyMatrix4(steerInv), plateMat(plate));
    steer.add(m);
  };

  let saddleAt;
  let pegs;
  let pillion;
  let size;
  const kick = new THREE.Group();
  root.add(kick);
  let centreStand = false;

  if (!D.scooter) {
    // =============================================================== motorcycle
    // The body is drawn at the commuter's length and stretched to this machine's wheelbase;
    // round things that must stay round (mudguards, the frame at the steering head) go in `fixed`.
    const sx = L / 1.235;
    const Lb = 1.235;
    const stretch = new THREE.Matrix4().makeScale(1, 1, 1 / sx);
    const fixed = new Parts();
    const heavy = Boolean(D.heavy);
    // ---- front end ----
    for (const x of [-0.085, 0.085]) {
      T(front, S.engine, up(-0.02, x), up(0.3, x), 0.024); // fork sliders
      T(front, D.gaiters ? S.matte : S.chrome, up(0.3, x), up(D.gaiters ? 0.46 : 0.62, x), D.gaiters ? 0.027 : 0.017);
      if (D.gaiters) T(front, S.chrome, up(0.46, x), up(0.62, x), 0.017);
    }
    T(front, S.black, up(0.47, -0.105), up(0.47, 0.105), 0.021); // lower yoke
    T(front, S.black, up(0.62, -0.105), up(0.62, 0.105), 0.02); // top yoke
    T(front, S.black, col(0.44), col(0.66), 0.018); // steering stem
    front.add(paint, bandGeo(L / 2, R, R + 0.03, heavy ? -42 : -28, heavy ? 150 : 128, heavy ? 0.15 : 0.115, { steps: detail ? 16 : 9, crown: heavy ? 0.04 : 0.02 })); // front mudguard
    for (const x of [-0.06, 0.06]) T(front, S.black, up(0.02, x * 1.4), P(L / 2 + Math.cos(deg(-20)) * (R + 0.028), R + Math.sin(deg(-20)) * (R + 0.028), x), 0.005, 5);
    const hl = up(0.6).addScaledVector(ahead, 0.11);
    const hf = -hl.z;
    if (D.lamp === "cowl") {
      lofted(front, paint, [
        { f: hf - 0.11, y: hl.y + 0.012, h: 0.08, w: 0.08, n: 2.6 },
        { f: hf - 0.02, y: hl.y + 0.006, h: 0.105, w: 0.115, n: 3 },
        { f: hf + 0.055, y: hl.y, h: 0.094, w: 0.102, n: 3.4 },
      ]);
      lofted(front, S.head, [{ f: hf + 0.052, y: hl.y - 0.004, h: 0.07, w: 0.082, n: 3.6 }, { f: hf + 0.072, y: hl.y - 0.004, h: 0.05, w: 0.064, n: 3.6 }]);
      front.add(S.smoke, slabGeo([[hf - 0.02, hl.y + 0.1], [hf + 0.05, hl.y + 0.092], [hf + 0.0, hl.y + 0.2], [hf - 0.02, hl.y + 0.197]], 0.2, { bevel: 0.004 })); // small screen
      lofted(front, S.black, [{ f: hf - 0.14, y: hl.y + 0.1, h: 0.03, w: 0.075, n: 3.5 }, { f: hf - 0.04, y: hl.y + 0.113, h: 0.034, w: 0.088, n: 3.5 }]); // instruments
    } else {
      if (D.lamp === "nacelle") {
        // the headlamp sits in a painted housing that wraps the fork tops, with two small pilot lamps
        lofted(front, paint, [
          { f: hf - 0.2, y: hl.y + 0.005, h: 0.085, w: 0.125, n: 2.6 },
          { f: hf - 0.06, y: hl.y, h: 0.11, w: 0.125, n: 2.4 },
          { f: hf + 0.03, y: hl.y, h: 0.1, w: 0.102, n: 2.2 },
        ]);
        for (const sgn of [-1, 1]) front.add(S.head, new THREE.SphereGeometry(0.018, 8, 6).translate(sgn * 0.105, hl.y + 0.05, hl.z - 0.045));
      } else front.add(S.chrome, new THREE.SphereGeometry(0.092, 16, 10).scale(1, 1, 1.15).translate(0, hl.y, hl.z + 0.02)); // lamp bucket
      front.add(S.chrome, new THREE.TorusGeometry(0.088, 0.01, 6, 22).translate(0, hl.y, hl.z - 0.07));
      front.add(S.head, new THREE.SphereGeometry(0.086, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1, 0.35).translate(0, hl.y, hl.z - 0.068));
      if (D.lamp !== "nacelle") front.add(S.black, new THREE.CylinderGeometry(0.055, 0.05, 0.06, 14).rotateX(-0.6).translate(0, hl.y + 0.135, hl.z + 0.07)); // speedometer pod
    }
    for (const sgn of [-1, 1]) {
      // front indicators on stalks
      T(front, S.black, P(hf - 0.05, hl.y - 0.03, sgn * 0.09), P(hf - 0.05, hl.y - 0.03, sgn * 0.165), 0.007, 5);
      front.add(sgn < 0 ? indL : indR, new THREE.SphereGeometry(0.03, 10, 8).scale(1.25, 0.85, 1.25).translate(sgn * 0.19, hl.y - 0.03, hl.z + 0.05));
      // handlebar: rises from the top yoke and comes back to the rider
      const tc = col(0.64);
      const pts = [tc, tc.clone().add(new THREE.Vector3(sgn * 0.07, 0.035, 0.012)), tc.clone().add(new THREE.Vector3(sgn * 0.16, 0.135, 0.05)), tc.clone().add(new THREE.Vector3(sgn * 0.26, 0.16, 0.1)), tc.clone().add(new THREE.Vector3(sgn * 0.365, 0.158, 0.125))];
      front.add(S.chrome, pathGeo(pts, 0.011, 6, detail ? 18 : 10));
      const g0 = pts[3].clone().lerp(pts[4], 0.0);
      T(front, S.matte, g0, pts[4], 0.0175);
      grips[sgn < 0 ? 0 : 1] = marker(g0.clone().lerp(pts[4], 0.5), steer, steerInv);
      front.add(S.black, new THREE.BoxGeometry(0.035, 0.035, 0.045).translate(g0.x - sgn * 0.02, g0.y, g0.z)); // switch housing
      T(front, S.engine, g0.clone().add(new THREE.Vector3(-sgn * 0.02, 0, -0.03)), pts[4].clone().add(new THREE.Vector3(0, -0.005, -0.055)), 0.005, 5); // lever
      mirrors(g0.clone().add(new THREE.Vector3(-sgn * 0.035, 0.01, 0)), g0.clone().add(new THREE.Vector3(sgn * 0.03, 0.13, 0.03)), sgn);
    }
    front.into(steer, steerAt);
    frontPlate(hf + 0.045, hl.y - 0.165, 0.2);

    // ---- frame ----
    T(fixed, S.black, col(0.46), col(0.68), 0.03); // steering head
    T(fixed, S.black, col(0.5), P(0.17 * sx, 0.42), 0.022); // down tube
    T(fixed, S.black, col(0.62), P(-0.1 * sx, 0.72), 0.022); // backbone under the tank
    for (const x of [-0.1, 0.1]) {
      T(body, S.black, P(-0.1, 0.7, x * 0.6), P(-0.62, 0.72, x), 0.014); // seat rails
      T(body, S.black, P(-0.1, 0.7, x * 0.6), P(-0.24, 0.33, x), 0.016);
      body.add(S.black, new THREE.BoxGeometry(0.032, 0.045, Lb / 2 - 0.22).translate(x * 1.05, 0.315, (Lb / 2 + 0.24) / 2 - 0.01)); // swing arm
      // twin shocks: chrome spring over a black damper
      T(body, S.black, P(-Lb / 2 + 0.06, 0.335, x * 1.5), P(-0.42, 0.67, x * 1.42), 0.012);
      T(body, S.chrome, P(-Lb / 2 + 0.085, 0.4, x * 1.5), P(-0.435, 0.635, x * 1.43), 0.024);
    }
    // ---- tank ----
    const tw = heavy ? 1.14 : 1; // a 13 litre teardrop on the big single
    const th = heavy ? 1.16 : 1;
    lofted(body, paint, [
      { f: 0.3, y: 0.8, h: 0.04 * th, w: 0.045 * tw },
      { f: 0.25, y: 0.815, h: 0.075 * th, w: 0.105 * tw, hb: 0.06 },
      { f: 0.15, y: 0.826, h: 0.086 * th, w: 0.137 * tw, hb: 0.07 },
      { f: 0.04, y: 0.818, h: 0.08 * th, w: 0.13 * tw, hb: 0.07 },
      { f: -0.06, y: 0.795, h: 0.06 * th, w: 0.1 * tw, hb: 0.055 },
      { f: -0.11, y: 0.78, h: 0.03, w: 0.06 },
    ]);
    lofted(body, stripe, [{ f: 0.24, y: 0.812, h: heavy ? 0.005 : 0.012, w: 0.108 * tw }, { f: 0.15, y: 0.812, h: heavy ? 0.006 : 0.014, w: 0.1395 * tw }, { f: 0.04, y: 0.804, h: heavy ? 0.006 : 0.014, w: 0.1325 * tw }, { f: -0.05, y: 0.79, h: heavy ? 0.005 : 0.01, w: 0.103 * tw }]); // the graphic (a pinstripe on the big single) along the tank
    body.add(S.chrome, new THREE.CylinderGeometry(0.03, 0.032, 0.014, 14).translate(0, 0.826 + 0.086 * th + 0.001, -0.15)); // filler cap
    if (D.kneePads) for (const sgn of [-1, 1]) body.add(S.matte, new THREE.SphereGeometry(0.07, 10, 8).scale(1.25, 0.8, 0.14).rotateY(Math.PI / 2).translate(sgn * 0.128, 0.81, -0.02));
    // ---- seat ----
    if (heavy) {
      // split seat: a wide rider's saddle and a separate pillion pad
      lofted(body, S.vinyl, [{ f: -0.07, y: 0.775, h: 0.03, w: 0.09, n: 3 }, { f: -0.16, y: 0.772, h: 0.042, w: 0.15, n: 3.2 }, { f: -0.3, y: 0.775, h: 0.045, w: 0.165, n: 3.2 }, { f: -0.38, y: 0.79, h: 0.035, w: 0.14, n: 3 }]);
      lofted(body, S.vinyl, [{ f: -0.4, y: 0.8, h: 0.028, w: 0.11, n: 3.2 }, { f: -0.47, y: 0.8, h: 0.036, w: 0.135, n: 3.6 }, { f: -0.6, y: 0.802, h: 0.036, w: 0.13, n: 3.6 }, { f: -0.67, y: 0.802, h: 0.026, w: 0.1, n: 3.2 }]);
    } else
      lofted(body, S.vinyl, [
        { f: -0.07, y: 0.775, h: 0.03, w: 0.085, n: 3.2 },
        { f: -0.15, y: 0.768, h: 0.034, w: 0.13, n: 3.6 },
        { f: -0.36, y: 0.765, h: 0.035, w: 0.137, n: 3.8 },
        { f: -0.56, y: 0.778, h: 0.036, w: 0.128, n: 3.8 },
        { f: -0.67, y: 0.785, h: 0.028, w: 0.1, n: 3.2 },
      ]);
    // ---- side panels and tail ----
    lofted(body, paint, [
      { f: -0.07, y: 0.62, h: 0.1, w: 0.118, n: 3.6 },
      { f: -0.25, y: 0.635, h: 0.098, w: 0.142, n: 3.8 },
      { f: -0.45, y: 0.675, h: 0.068, w: 0.132, n: 3.6 },
      { f: -0.66, y: 0.72, h: 0.045, w: 0.105, n: 3.2 },
      { f: -0.77, y: 0.737, h: 0.03, w: 0.075, n: 3 },
    ]);
    lofted(body, stripe, [{ f: -0.1, y: 0.66, h: 0.012, w: 0.1215, n: 3.6 }, { f: -0.25, y: 0.672, h: 0.012, w: 0.1445, n: 3.8 }, { f: -0.45, y: 0.7, h: 0.01, w: 0.1345, n: 3.6 }, { f: -0.64, y: 0.732, h: 0.008, w: 0.109, n: 3.2 }]);
    lofted(body, tail, [{ f: -0.765, y: 0.737, h: 0.03, w: 0.07, n: 3 }, { f: -0.8, y: 0.737, h: 0.024, w: 0.058, n: 3 }]);
    for (const sgn of [-1, 1]) {
      T(body, S.black, P(-0.72, 0.69, sgn * 0.06), P(-0.72, 0.69, sgn * 0.13), 0.007, 5);
      body.add(sgn < 0 ? indL : indR, new THREE.SphereGeometry(0.028, 10, 8).scale(1.25, 0.85, 1.25).translate(sgn * 0.155, 0.69, 0.72));
    }
    fixed.add(heavy ? paint : S.black, bandGeo(-L / 2, R, R + 0.035, heavy ? 50 : 62, heavy ? 206 : 196, heavy ? 0.155 : 0.125, { steps: detail ? 18 : 10, crown: heavy ? 0.04 : 0.022 })); // rear mudguard
    S.black.side = THREE.DoubleSide;
    {
      const g = new THREE.PlaneGeometry(0.2, 0.1).rotateX(0.3).translate(0, 0.6, 0.865 * sx); // under the tail lamp, on the mudguard
      const m = new THREE.Mesh(g, plateMat(plate));
      root.add(m);
    }
    // grab rail
    body.add(D.rack ? S.black : S.engine, pathGeo([P(-0.48, 0.745, 0.125), P(-0.66, 0.79, 0.125), P(-0.8, 0.83, 0.09), P(-0.8, 0.83, -0.09), P(-0.66, 0.79, -0.125), P(-0.48, 0.745, -0.125)], 0.011, 6, detail ? 24 : 12));
    if (D.rack) {
      // luggage carrier behind the seat
      for (const x of [-0.11, 0, 0.11]) T(body, S.black, P(-0.7, 0.81, x), P(-0.98, 0.815, x), 0.008, 5);
      for (const f of [-0.72, -0.85, -0.98]) T(body, S.black, P(f, 0.812, -0.11), P(f, 0.812, 0.11), 0.008, 5);
      for (const x of [-0.11, 0.11]) T(body, S.black, P(-0.96, 0.81, x), P(-0.7, 0.6, x * 1.1), 0.008, 5);
    }
    // ---- engine: an inclined air-cooled single ----
    const eng = D.wheels === "spoke" ? S.engine : S.engineBlack;
    lofted(body, eng, [
      { f: 0.15, y: 0.36, h: 0.085, w: 0.1, n: 3.4 },
      { f: 0.02, y: 0.36, h: 0.11, w: 0.14, n: 3.4 },
      { f: -0.16, y: 0.365, h: 0.1, w: 0.135, n: 3.4 },
      { f: -0.26, y: 0.37, h: 0.07, w: 0.1, n: 3 },
    ]);
    body.add(S.engine, new THREE.CylinderGeometry(0.09, 0.095, 0.03, 18).rotateZ(Math.PI / 2).translate(0.15, 0.37, 0.02)); // clutch cover
    body.add(S.engine, new THREE.CylinderGeometry(0.08, 0.085, 0.03, 18).rotateZ(Math.PI / 2).translate(-0.15, 0.37, -0.02)); // magneto cover
    {
      const lean = heavy ? 0.07 : 0.36; // the cylinder leans forward (the long-stroke single stands almost upright)
      const dir = new THREE.Vector3(0, Math.cos(lean), -Math.sin(lean));
      const base = P(heavy ? 0.04 : 0.07, 0.45);
      T(body, eng, base, base.clone().addScaledVector(dir, 0.2), heavy ? 0.062 : 0.052);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      for (let i = 0; i < (detail ? 7 : 4); i++) {
        const c = base.clone().addScaledVector(dir, 0.02 + i * (detail ? 0.022 : 0.04));
        body.add(S.engine, new THREE.BoxGeometry(heavy ? 0.2 : 0.16, 0.007, heavy ? 0.16 : 0.15).applyQuaternion(q).translate(c.x, c.y, c.z)); // cooling fins
      }
      const headC = base.clone().addScaledVector(dir, 0.215);
      body.add(S.engine, new THREE.BoxGeometry(0.14, 0.075, 0.14).applyQuaternion(q).translate(headC.x, headC.y, headC.z));
      // exhaust: down from the head, under the engine, then the long silencer on the right
      const port = headC.clone().add(new THREE.Vector3(0.03, -0.01, -0.07));
      body.add(S.chrome, pathGeo([port, port.clone().add(new THREE.Vector3(0.06, -0.06, -0.07)), P(0.25, 0.36, 0.13), P(0.14, 0.24, 0.155), P(-0.02, 0.235, 0.165)], 0.018, 6, detail ? 22 : 12));
      T(body, S.chrome, P(-0.02, 0.235, 0.165), P(-0.2, 0.26, 0.17), 0.02, 0.045);
      T(body, S.chrome, P(-0.2, 0.26, 0.17), P(-0.84, 0.385, 0.175), 0.045, 0.05);
      body.add(S.chrome, new THREE.SphereGeometry(0.05, 10, 8).scale(1, 1, 0.5).translate(0.175, 0.386, 0.842));
      body.add(S.matte, slabGeo([[-0.25, 0.325], [-0.7, 0.415], [-0.7, 0.385], [-0.25, 0.295]], 0.02, { bevel: 0.004, x: 0.222 })); // heat shield
    }
    body.add(S.black, slabGeo([[-0.2, 0.43], [-Lb / 2 + 0.05, 0.39], [-Lb / 2 + 0.05, 0.3], [-0.2, 0.34]], 0.03, { bevel: 0.006, x: -0.125 })); // chain cover
    // leg guard
    body.add(S.chrome, pathGeo([P(0.2, 0.6, -0.04), P(0.27, 0.52, -0.2), P(0.26, 0.4, -0.3), P(0.2, 0.3, -0.24), P(0.17, 0.26, -0.1), P(0.17, 0.26, 0.1), P(0.2, 0.3, 0.24), P(0.26, 0.4, 0.3), P(0.27, 0.52, 0.2), P(0.2, 0.6, 0.04)], 0.011, 6, detail ? 40 : 20));
    // saree guard on the left of the rear wheel
    {
      const pts = [];
      for (const y of [0.3, 0.38, 0.46, 0.54]) pts.push(P(-0.42, y + 0.06, -0.175), P(-0.86, y, -0.175));
      for (const f of [-0.42, -0.53, -0.64, -0.75, -0.86]) pts.push(P(f, 0.3 + (f + 0.86) * 0.136, -0.175), P(f, 0.54 + (f + 0.86) * 0.136, -0.175));
      for (const p of pts) p.z *= sx;
      root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), S.wire));
    }
    // footrests, brake pedal, gear lever
    T(body, S.black, P(-0.1, 0.3, -0.27), P(-0.1, 0.3, 0.27), 0.012);
    for (const sgn of [-1, 1]) {
      body.add(S.matte, new THREE.BoxGeometry(0.085, 0.03, 0.045).translate(sgn * 0.235, 0.305, 0.1));
      T(body, S.black, P(-0.4, 0.42, sgn * 0.13), P(-0.42, 0.4, sgn * 0.23), 0.01, 5); // pillion rest
      body.add(S.matte, new THREE.BoxGeometry(0.06, 0.025, 0.04).translate(sgn * 0.215, 0.405, 0.42));
    }
    T(body, S.engine, P(-0.1, 0.3, 0.2), P(0.06, 0.29, 0.21), 0.008, 5); // brake pedal
    T(body, S.engine, P(-0.02, 0.33, -0.16), P(0.07, 0.31, -0.2), 0.008, 5); // gear lever
    body.into(root, stretch);
    fixed.into(root);
    // side stand
    kick.position.copy(P(-0.14 * sx, 0.26, -0.13));
    kick.add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.29, 6).translate(0, -0.145, 0), S.black));
    saddleAt = P(-0.2 * sx, heavy ? 0.82 : 0.802);
    pegs = [P(-0.1 * sx, 0.305, 0.235), P(-0.1 * sx, 0.305, -0.235)];
    pillion = { saddle: P(-0.5 * sx, heavy ? 0.84 : 0.815), pegs: [P(-0.42 * sx, 0.405, 0.215), P(-0.42 * sx, 0.405, -0.215)], hold: [P(-0.2 * sx, 0.97, -0.17), P(-0.2 * sx, 0.97, 0.17)] };
    size = { L: 1.98 * sx, W: heavy ? 0.79 : 0.74, H: 1.08 };
  } else {
    // =============================================================== scooter
    for (const x of [-0.07, 0.07]) T(front, S.black, up(-0.01, x), up(0.27, x), 0.02); // fork
    T(front, S.black, up(0.27, -0.08), up(0.27, 0.08), 0.02);
    T(front, S.black, col(0.26), col(0.86), 0.02); // steering column, inside the apron
    front.add(paint, bandGeo(L / 2, R, R + 0.03, -35, 150, 0.14, { steps: detail ? 16 : 9, crown: 0.03 })); // front mudguard
    // handlebar cowl with the headlamp in it
    lofted(front, paint, [
      { f: 0.335, y: 0.955, h: 0.05, w: 0.115, n: 3 },
      { f: 0.26, y: 0.982, h: 0.072, w: 0.2, n: 3 },
      { f: 0.17, y: 0.99, h: 0.056, w: 0.215, n: 3 },
      { f: 0.115, y: 0.985, h: 0.03, w: 0.15, n: 2.6 },
    ]);
    lofted(front, S.head, [{ f: 0.333, y: 0.955, h: 0.04, w: 0.088, n: 3 }, { f: 0.352, y: 0.953, h: 0.028, w: 0.068, n: 3 }]);
    lofted(front, S.black, [{ f: 0.24, y: 1.045, h: 0.018, w: 0.085, n: 3.4 }, { f: 0.15, y: 1.04, h: 0.02, w: 0.1, n: 3.4 }]); // instruments
    for (const sgn of [-1, 1]) {
      const a = P(0.17, 0.985, sgn * 0.2);
      const b = P(0.165, 0.985, sgn * 0.35);
      T(front, S.chrome, a, b, 0.011);
      const g0 = a.clone().lerp(b, 0.3);
      T(front, S.matte, g0, b, 0.0175);
      grips[sgn < 0 ? 0 : 1] = marker(g0.clone().lerp(b, 0.5), steer, steerInv);
      T(front, S.engine, g0.clone().add(new THREE.Vector3(0, 0, -0.03)), b.clone().add(new THREE.Vector3(0, -0.005, -0.055)), 0.005, 5);
      mirrors(P(0.2, 1.03, sgn * 0.15), P(0.17, 1.14, sgn * 0.25), sgn);
    }
    front.into(steer, steerAt);

    // apron and floorboard in one pressing
    body.add(paint, slabGeo([[0.42, 0.25], [0.47, 0.43], [0.36, 0.43], [0.3, 0.335], [-0.1, 0.335], [-0.1, 0.25]], 0.38, { bevel: 0.03 }));
    // the apron: a curved shield standing on the front of the floorboard, leaning back to the bars
    body.add(paint, loftGeo([
      { f: -0.08, y: 0.03, h: 0.06, hb: 0.04, w: 0.17, n: 3.4 },
      { f: 0.12, y: 0.04, h: 0.08, hb: 0.05, w: 0.22, n: 3.2 },
      { f: 0.34, y: 0.045, h: 0.085, hb: 0.055, w: 0.215, n: 3.2 },
      { f: 0.5, y: 0.05, h: 0.07, hb: 0.05, w: 0.16, n: 3 },
    ], { seg: ring }).rotateX(deg(107)).translate(0, 0.42, -0.45));
    body.add(S.matte, new THREE.BoxGeometry(0.3, 0.012, 0.34).translate(0, 0.342, -0.1)); // floor mat
    for (const sgn of [-1, 1]) body.add(sgn < 0 ? indL : indR, new THREE.SphereGeometry(0.03, 10, 8).scale(1.2, 1.7, 0.5).rotateX(0.3).translate(sgn * 0.14, 0.7, -0.418));
    {
      const g = new THREE.PlaneGeometry(0.16, 0.08).rotateY(Math.PI).rotateX(0.3).translate(0, 0.56, -0.465);
      root.add(new THREE.Mesh(g, plateMat(plate)));
    }
    // body under the seat
    lofted(body, paint, [
      { f: 0.0, y: 0.42, h: 0.17, hb: 0.16, w: 0.15, n: 3.6 },
      { f: -0.15, y: 0.5, h: 0.212, hb: 0.23, w: 0.2, n: 3.6 },
      { f: -0.45, y: 0.52, h: 0.2, hb: 0.2, w: 0.205, n: 3.2 },
      { f: -0.7, y: 0.56, h: 0.15, hb: 0.13, w: 0.17, n: 2.8 },
      { f: -0.86, y: 0.6, h: 0.065, w: 0.09, n: 2.6 },
    ]);
    lofted(body, S.vinyl, [
      { f: -0.08, y: 0.735, h: 0.04, w: 0.1, n: 3.2 },
      { f: -0.24, y: 0.738, h: 0.05, w: 0.155, n: 3.6 },
      { f: -0.5, y: 0.748, h: 0.05, w: 0.158, n: 3.6 },
      { f: -0.74, y: 0.757, h: 0.035, w: 0.11, n: 3 },
    ]);
    lofted(body, tail, [{ f: -0.85, y: 0.605, h: 0.045, w: 0.078, n: 3 }, { f: -0.885, y: 0.605, h: 0.034, w: 0.06, n: 3 }]);
    for (const sgn of [-1, 1]) body.add(sgn < 0 ? indL : indR, new THREE.SphereGeometry(0.03, 10, 8).scale(1.2, 0.9, 1.4).translate(sgn * 0.115, 0.6, 0.83));
    body.add(S.engine, pathGeo([P(-0.48, 0.74, 0.165), P(-0.72, 0.752, 0.15), P(-0.86, 0.757, 0.075), P(-0.86, 0.757, -0.075), P(-0.72, 0.752, -0.15), P(-0.48, 0.74, -0.165)], 0.012, 6, detail ? 24 : 12)); // grab rail
    S.black.side = THREE.DoubleSide;
    body.add(S.black, bandGeo(-L / 2, R, R + 0.035, 110, 210, 0.13, { steps: 8, crown: 0.025 }));
    {
      const g = new THREE.PlaneGeometry(0.2, 0.1).rotateX(0.2).translate(0, 0.455, 0.878);
      root.add(new THREE.Mesh(g, plateMat(plate)));
    }
    // transmission case on the left, silencer on the right
    lofted(body, S.engine, [
      { f: -0.2, y: 0.265, h: 0.075, w: 0.05, x: -0.145, n: 3 },
      { f: -0.45, y: 0.25, h: 0.085, w: 0.055, x: -0.15, n: 3 },
      { f: -0.67, y: 0.225, h: 0.075, w: 0.05, x: -0.15, n: 3 },
    ]);
    T(body, S.matte, P(-0.3, 0.225, 0.155), P(-0.76, 0.275, 0.165), 0.055, 0.06);
    body.add(S.chrome, slabGeo([[-0.34, 0.27], [-0.72, 0.31], [-0.72, 0.25], [-0.34, 0.21]], 0.02, { bevel: 0.004, x: 0.228 }));
    T(body, S.chrome, P(-L / 2 + 0.02, 0.24, 0.135), P(-0.52, 0.55, 0.135), 0.022); // rear shock
    T(body, S.black, P(-0.1, 0.33, -0.2), P(-0.1, 0.33, 0.2), 0.01, 5);
    body.into(root);
    // centre stand
    centreStand = true;
    kick.position.copy(P(-0.2, 0.225));
    const kp = new Parts();
    for (const x of [-1, 1]) kp.add(S.black, tubeGeo(new THREE.Vector3(x * 0.05, 0, 0), new THREE.Vector3(x * 0.15, -0.215, 0), 0.011, 6));
    kp.into(kick);
    saddleAt = P(-0.24, 0.79);
    pegs = [P(0.1, 0.34, 0.1), P(0.1, 0.34, -0.1)];
    pillion = { saddle: P(-0.52, 0.795), pegs: [P(-0.3, 0.33, 0.2), P(-0.3, 0.33, -0.2)], hold: [P(-0.22, 0.95, -0.17), P(-0.22, 0.95, 0.17)] };
    size = { L: 1.78, W: 0.72, H: 1.14 };
  }

  const spec = motorcycleSpec(design);
  let wheelAngle = 0;
  const spin = (roll) => {
    wheelAngle -= roll / R;
    rearWheel.rotation.x = wheelAngle;
    frontWheel.rotation.x = wheelAngle;
  };
  const stand = (down) => {
    if (centreStand) kick.rotation.x = down ? 0.12 : -1.4;
    else {
      kick.rotation.x = down ? 0.3 : -1.42;
      kick.rotation.z = down ? -0.42 : 0;
    }
  };
  stand(false);
  return {
    kind: "motorcycle",
    design,
    label: D.label,
    spec,
    group: root,
    steer,
    grips, // [left, right]
    pedals: pegs.map((p) => marker(p)), // [right, left] footrests
    saddle: marker(saddleAt),
    pillion: { saddle: marker(pillion.saddle), pegs: pillion.pegs.map((p) => marker(p)), hold: pillion.hold.map((p) => marker(p)) },
    size,
    paint,
    lights: { tail, indL, indR, head: S.head },
    spin,
    /** steerAngle (rad, + turns right), roll (m travelled this frame), kickstand (bool), brake (bool) */
    pose({ steerAngle = 0, roll = 0, kickstand = false, brake = false }) {
      steer.rotation.y = -steerAngle;
      spin(roll);
      stand(kickstand);
      tail.emissiveIntensity = brake ? 2.6 : 0.3 + nightGlow * 0.9;
    },
  };
}
let nightGlow = 0;
/** 0 by day, 1 at night: tail lamps stay lit and the headlamps come on. */
export function setMotorcycleNight(k) {
  nightGlow = k;
  if (shared.head) shared.head.emissiveIntensity = 0.15 + k * 3.2;
}

/**
 * A motorcycle for the traffic: nose along +x, with what traffic.js expects in userData (size,
 * axles, lights, where the rider and pillion sit).
 */
export function makeTrafficMotorcycle(opts) {
  const m = buildMotorcycle({ ...opts, detail: false });
  const g = new THREE.Group();
  m.group.rotation.y = -Math.PI / 2; // forward (-z) along +x
  g.add(m.group);
  g.updateMatrixWorld(true);
  const at = (o) => g.worldToLocal(o.getWorldPosition(new THREE.Vector3())).toArray();
  g.userData = {
    size: m.size,
    wheelR: m.spec.wheelRadius,
    axles: [m.spec.wheelbase / 2, -m.spec.wheelbase / 2],
    tail: m.lights.tail,
    indL: m.lights.indL,
    indR: m.lights.indR,
    alloy: { map: { rotation: 0 } },
    roll: m.spin,
    posture: m.spec.posture,
    design: m.design,
    rider: { saddle: at(m.saddle), gripL: at(m.grips[0]), gripR: at(m.grips[1]), pegL: at(m.pedals[1]), pegR: at(m.pedals[0]) },
    pillion: { saddle: at(m.pillion.saddle), gripL: at(m.pillion.hold[0]), gripR: at(m.pillion.hold[1]), pegL: at(m.pillion.pegs[1]), pegR: at(m.pillion.pegs[0]) },
  };
  return g;
}

// ---------------------------------------------------------------- sound
/** The engine note and horn of the motorcycle you are riding. Starts on first use (after a key press). */
export function makeEngineSound() {
  let ctx = null;
  let osc1, osc2, filt, gain, hornGain;
  function start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    gain = ctx.createGain();
    gain.gain.value = 0;
    filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 300;
    filt.Q.value = 1.2;
    osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc2 = ctx.createOscillator();
    osc2.type = "square";
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    osc1.connect(filt);
    osc2.connect(g2).connect(filt);
    filt.connect(gain).connect(ctx.destination);
    osc1.start();
    osc2.start();
    hornGain = ctx.createGain();
    hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter();
    hf.type = "bandpass";
    hf.frequency.value = 1900;
    hf.Q.value = 0.7;
    for (const f of [415, 522]) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = f;
      o.connect(hf);
      o.start();
    }
    hf.connect(hornGain).connect(ctx.destination);
    return true;
  }
  return {
    /** rpm, throttle 0..1; on=false fades the engine out (parked). */
    set(rpm, throttle, on) {
      if (!ctx) {
        if (!on || !start()) return;
      }
      if (ctx.state === "suspended") ctx.resume();
      const t = ctx.currentTime;
      const fire = Math.max(8, rpm / 120); // one bang every two turns of a single cylinder
      osc1.frequency.setTargetAtTime(fire * 2, t, 0.04);
      osc2.frequency.setTargetAtTime(fire, t, 0.04);
      filt.frequency.setTargetAtTime(180 + rpm * 0.09 + throttle * 700, t, 0.05);
      gain.gain.setTargetAtTime(on ? 0.035 + throttle * 0.06 : 0, t, on ? 0.06 : 0.25);
    },
    horn(on) {
      if (!ctx) {
        if (!on || !start()) return;
      }
      hornGain.gain.setTargetAtTime(on ? 0.09 : 0, ctx.currentTime, 0.012);
    },
  };
}
