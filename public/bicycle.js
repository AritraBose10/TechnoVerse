// Bicycles: five designs seen on a Kolkata street, and the riding physics they share.
//
// Designs (buildBicycle({ design })):
//   roadster  the black Indian roadster (Hero / Atlas / Avon pattern): 28 inch wheels, slack
//             angles, full steel mudguards, a closed chain case, swept-back bars, a sprung leather
//             saddle, a carrier, a centre stand and a bottle-dynamo lamp
//   ladies    step-through frame, wire basket on the bars, mudguards, chain guard, carrier
//   city      a hybrid with a diamond frame, riser bars and a rear rack
//   mtb       fat knobbly tyres, sloping top tube, suspension fork, flat bars, disc brakes
//   sport     a light single-speed street bike: thin tyres, deep coloured rims, narrow flat bars
//
// Each is built from its own measurements (wheel size, wheelbase, head angle, tube lengths), so
// the fork meets the axle and the saddle and grips sit where a rider's body needs them. The fork,
// front wheel and handlebar turn together about the real steering axis (along the head tube).
// Wheels spin with the ground speed; the cranks turn only while pedalling (the rear hub
// freewheels when coasting).
//
// Physics (see stepBike): the rider pushes with a set power, held back by rolling resistance,
// air drag and the slope (gravity along the road); brakes give up to about 0.45 g. Steering follows
// the kinematic bicycle model (turn radius = wheelbase / tan(steer)), and the steering lock
// available shrinks with speed so sideways acceleration stays within what tyres and balance allow.
// The bike leans into turns by the balance angle atan(v^2 / (g * R)), reached with a short lag, as a
// rider's lean does. Below walking pace the rider can no longer balance and puts a foot down.
// The same step drives the motorcycles (motorcycle.js) with an engine in place of legs.
import * as THREE from "three";
import { P, tubeGeo, pathGeo, bandGeo, loftGeo, slabGeo, Parts } from "/vparts.js";

const G = 9.81;
const AIR = 1.2; // kg/m^3
const deg = (d) => (d * Math.PI) / 180;

// What the physics needs to know about a machine. Bicycles: power is the rider's legs.
const BASE = {
  motor: false,
  riderMass: 72,
  crankLength: 0.17,
  power: { cruise: 150, sprint: 420 }, // watts at the pedals
  push: { cruise: 190, sprint: 330 }, // newtons at the wheel when starting off (gearing limit)
  brake: 0.45 * G, // m/s^2 with both brakes
  maxSide: 4.5, // m/s^2 sideways: beyond this a rider would slide or fall
  steerRate: 2.2, // rad/s the bars can be turned at
  maxSteer: 0.62, // rad, full lock at walking pace
  posture: 1, // how far the rider leans forward over the bars (1 = a city bike)
  parkLean: 0.14, // resting on a side stand
};

export const BICYCLE_DESIGNS = {
  city: {
    label: "city bike",
    R: 0.34, tyre: 0.018, L: 1.08, head: 71, rake: 0.045, cs: 0.44, bbY: 0.285,
    seat: { len: 0.53, ang: 73, post: 0.2 }, headLen: 0.14, frame: "diamond", tube: 1,
    bars: "riser", saddle: "sport", rack: true, chain: "guard", stand: "side", spokes: 32, rim: "#c9ccd1",
    colors: ["#8f1d22", "#1f4f7a", "#2d5a3a"],
    phys: { mass: 13, cda: 0.5, crr: 0.006, gear: 2.6 },
  },
  roadster: {
    label: "roadster",
    R: 0.355, tyre: 0.02, L: 1.16, head: 67, rake: 0.06, cs: 0.47, bbY: 0.29,
    seat: { len: 0.57, ang: 68, post: 0.12 }, headLen: 0.12, frame: "diamond", tube: 1.05,
    bars: "swept", saddle: "sprung", rack: "heavy", mudguards: true, chain: "case", stand: "centre", lamp: true, bell: true, spokes: 36, rim: "#c9ccd1",
    colors: ["#141416", "#15301f", "#191c3a"],
    phys: { mass: 19, cda: 0.6, crr: 0.008, gear: 2.4, power: { cruise: 140, sprint: 380 }, posture: 0.5, parkLean: 0 },
  },
  ladies: {
    label: "ladies' cycle",
    R: 0.33, tyre: 0.019, L: 1.1, head: 69, rake: 0.05, cs: 0.45, bbY: 0.28,
    seat: { len: 0.46, ang: 70, post: 0.2 }, headLen: 0.2, frame: "step", tube: 1,
    bars: "swept", saddle: "wide", rack: true, mudguards: true, chain: "guard", basket: true, bell: true, stand: "side", spokes: 32, rim: "#c9ccd1",
    colors: ["#8a2a5a", "#1f8a8a", "#b33a3a", "#6a3fa0"],
    phys: { mass: 16, cda: 0.58, crr: 0.007, gear: 2.3, power: { cruise: 135, sprint: 360 }, posture: 0.45 },
  },
  mtb: {
    label: "mountain bike",
    R: 0.345, tyre: 0.027, L: 1.09, head: 68, rake: 0.045, cs: 0.43, bbY: 0.31,
    seat: { len: 0.42, ang: 73, post: 0.3 }, headLen: 0.12, frame: "slope", tube: 1.4,
    bars: "flat", barWidth: 0.34, saddle: "sport", suspension: true, disc: true, derailleur: true, stand: "side", spokes: 32, rim: "#1c1c1e",
    colors: ["#d9641a", "#2e8f3a", "#1b5fb8", "#c9c21a"],
    phys: { mass: 15, cda: 0.55, crr: 0.011, gear: 2.5 },
  },
  sport: {
    label: "street bike",
    R: 0.336, tyre: 0.013, L: 1.0, head: 73, rake: 0.04, cs: 0.405, bbY: 0.275,
    seat: { len: 0.54, ang: 74, post: 0.22 }, headLen: 0.13, frame: "diamond", tube: 0.9,
    bars: "flat", barWidth: 0.26, saddle: "race", deepRim: true, stand: "side", spokes: 24,
    colors: ["#e8e8e4", "#101012", "#19b0c9"], rims: ["#19b0c9", "#e0382e", "#e8e8e4"],
    phys: { mass: 9.5, cda: 0.42, crr: 0.004, gear: 2.9, posture: 1.25 },
  },
};
export const BICYCLE_KINDS = Object.keys(BICYCLE_DESIGNS);

/** The numbers stepBike needs for a design. */
export function bicycleSpec(design = "city") {
  const d = BICYCLE_DESIGNS[design] || BICYCLE_DESIGNS.city;
  return { ...BASE, wheelRadius: d.R, wheelbase: d.L, ...d.phys };
}
// kept for older callers: the city bike
export const BIKE = { ...bicycleSpec("city"), headAngle: deg(71) };

const shared = {};
function mats() {
  if (shared.black) return shared;
  shared.black = new THREE.MeshStandardMaterial({ color: "#151517", roughness: 0.8 });
  shared.rubber = new THREE.MeshStandardMaterial({ color: "#1b1b1c", roughness: 0.95 });
  shared.steel = new THREE.MeshStandardMaterial({ color: "#c9ccd1", roughness: 0.3, metalness: 0.9 });
  shared.darkRim = new THREE.MeshStandardMaterial({ color: "#1c1c1e", roughness: 0.45, metalness: 0.6 });
  shared.leather = new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.75 });
  shared.vinyl = new THREE.MeshStandardMaterial({ color: "#1f1c1a", roughness: 0.7 });
  shared.lens = new THREE.MeshStandardMaterial({ color: "#f3f1e4", roughness: 0.2, emissive: "#ffe9b8", emissiveIntensity: 0.1 });
  shared.red = new THREE.MeshStandardMaterial({ color: "#a01214", roughness: 0.3, emissive: "#5a0508", emissiveIntensity: 0.25 });
  shared.spoke = new THREE.LineBasicMaterial({ color: "#b8bcc2" });
  shared.chain = new THREE.LineBasicMaterial({ color: "#3a3a3c" });
  shared.wire = new THREE.LineBasicMaterial({ color: "#d8d8d2" });
  return shared;
}

// ---------------------------------------------------------------- model
export function buildBicycle({ design = "city", color, rimColor, detail = true } = {}) {
  const D = BICYCLE_DESIGNS[design] || BICYCLE_DESIGNS.city;
  const S = mats();
  const R = D.R;
  const L = D.L;
  const seg = detail ? 10 : 6;
  const k = D.tube; // tube thickness for this frame
  color ||= D.colors[0];
  const frameMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const guardMat = new THREE.MeshStandardMaterial({ color: design === "roadster" ? color : "#c9ccd1", roughness: 0.35, metalness: design === "roadster" ? 0.4 : 0.85, side: THREE.DoubleSide });
  const rimMat = D.deepRim ? new THREE.MeshStandardMaterial({ color: rimColor || D.rims[0], roughness: 0.35, metalness: 0.5 }) : D.rim === "#1c1c1e" ? S.darkRim : S.steel;

  // ---- where things are (side profile: f forward, y up) ----
  const H = deg(D.head);
  const axis = new THREE.Vector3(0, Math.sin(H), Math.cos(H)); // up and back along the head tube
  const ahead = new THREE.Vector3(0, Math.cos(H), -Math.sin(H)); // square to it, forward
  const rearAxle = P(-L / 2, R);
  const frontAxle = P(L / 2, R);
  const onAxis = frontAxle.clone().addScaledVector(ahead, -D.rake); // the fork's rake puts the axle ahead of the steering axis
  const crown = onAxis.clone().addScaledVector(axis, R + (D.suspension ? 0.075 : 0.05));
  const headBottom = crown.clone().addScaledVector(axis, 0.03);
  const headTop = headBottom.clone().addScaledVector(axis, D.headLen);
  const bb = P(-L / 2 + D.cs, D.bbY);
  const seatDir = new THREE.Vector3(0, Math.sin(deg(D.seat.ang)), Math.cos(deg(D.seat.ang)));
  const seatTop = bb.clone().addScaledVector(seatDir, D.seat.len);
  const saddlePoint = seatTop.clone().addScaledVector(seatDir, D.seat.post);
  const side = (p, x) => p.clone().setX(x);

  const root = new THREE.Group(); // stands on the ground; lean is applied to this by the caller
  const frame = new Parts();
  // last number: the far end's radius for a taper, or (3 and up) how many sides for a thin rod
  const T = (parts, mat, a, b, r, r2) => parts.add(mat, r2 >= 3 ? tubeGeo(a, b, r, r2) : tubeGeo(a, b, r, seg, r2 ?? r));

  // ---- frame ----
  T(frame, frameMat, headBottom.clone().addScaledVector(axis, -0.012), headTop.clone().addScaledVector(axis, 0.012), 0.022 * k); // head tube
  T(frame, frameMat, bb, seatTop, 0.017 * k); // seat tube
  if (D.frame === "step") {
    // step-through: two tubes run low from the head tube to the seat tube
    T(frame, frameMat, headTop.clone().addScaledVector(axis, -0.03), bb.clone().addScaledVector(seatDir, D.seat.len * 0.42), 0.016 * k);
    T(frame, frameMat, headBottom, bb.clone().addScaledVector(seatDir, 0.05), 0.019 * k);
  } else if (D.frame === "slope") {
    T(frame, frameMat, headTop.clone().addScaledVector(axis, -0.02), bb.clone().addScaledVector(seatDir, D.seat.len * 0.92), 0.018 * k); // sloping top tube
    T(frame, frameMat, bb, headBottom, 0.023 * k);
  } else {
    T(frame, frameMat, seatTop.clone().addScaledVector(seatDir, -0.03), headTop.clone().addScaledVector(axis, -0.02), 0.017 * k); // top tube
    T(frame, frameMat, bb, headBottom, 0.021 * k);
  }
  const stayTop = D.frame === "slope" ? bb.clone().addScaledVector(seatDir, D.seat.len * 0.9) : seatTop.clone().addScaledVector(seatDir, -0.03);
  for (const x of [-0.055, 0.055]) {
    T(frame, frameMat, side(bb, x * 0.6), side(rearAxle, x), 0.009 * k); // chainstays
    T(frame, frameMat, side(stayTop, x * 0.3), side(rearAxle, x), 0.008 * k); // seatstays
  }
  frame.add(frameMat, new THREE.CylinderGeometry(0.024 * k, 0.024 * k, 0.075, seg).rotateZ(Math.PI / 2).translate(bb.x, bb.y, bb.z)); // bottom bracket shell
  T(frame, S.steel, seatTop.clone().addScaledVector(seatDir, -0.04), saddlePoint, 0.0135); // seatpost

  // ---- saddle ----
  const sf = -saddlePoint.z;
  const sy = saddlePoint.y + 0.035;
  const saddleShape = {
    sport: [[0.17, 0.018, 0.02], [0.08, 0.03, 0.022], [-0.04, 0.062, 0.024], [-0.1, 0.072, 0.02]],
    race: [[0.17, 0.014, 0.014], [0.07, 0.022, 0.016], [-0.05, 0.052, 0.018], [-0.1, 0.06, 0.014]],
    wide: [[0.15, 0.022, 0.024], [0.06, 0.045, 0.03], [-0.05, 0.1, 0.034], [-0.11, 0.105, 0.028]],
    sprung: [[0.16, 0.02, 0.02], [0.06, 0.04, 0.024], [-0.05, 0.095, 0.03], [-0.115, 0.1, 0.026]],
  }[D.saddle];
  const saddleMat = D.saddle === "sprung" ? S.leather : S.vinyl;
  frame.add(saddleMat, loftGeo(saddleShape.map(([df, w, h], i) => ({ f: sf + df, y: sy + (i === 0 ? -0.006 : i === 3 ? 0.008 : 0), w, h, hb: h * 0.5, n: 2.8 })), { seg: detail ? 12 : 8 }));
  if (D.saddle === "sprung" || D.saddle === "wide") {
    for (const x of [-0.055, 0.055]) frame.add(S.steel, new THREE.CylinderGeometry(0.016, 0.016, 0.05, 8).translate(x, sy - 0.04, saddlePoint.z + 0.07)); // coil springs
    frame.add(S.steel, tubeGeo(P(sf - 0.07, sy - 0.062, -0.07), P(sf - 0.07, sy - 0.062, 0.07), 0.005, 5));
  }
  const saddleTop = sy + saddleShape[2][2];

  // ---- wheels ----
  const spokeN = detail ? D.spokes : Math.min(16, D.spokes);
  function wheel(disc) {
    const w = new THREE.Group();
    const parts = new Parts();
    const tyre = new THREE.TorusGeometry(R - D.tyre, D.tyre, detail ? 10 : 6, detail ? 48 : 24).rotateY(Math.PI / 2);
    parts.add(S.rubber, tyre);
    const rimR = R - D.tyre * 2 - 0.004;
    if (D.deepRim) parts.add(rimMat, new THREE.TorusGeometry(rimR - 0.012, 0.022, 6, detail ? 48 : 24).rotateY(Math.PI / 2).scale(0.42, 1, 1));
    else parts.add(rimMat, new THREE.TorusGeometry(rimR, 0.009, 6, detail ? 48 : 24).rotateY(Math.PI / 2));
    parts.add(S.steel, new THREE.CylinderGeometry(0.022, 0.022, 0.1, 10).rotateZ(Math.PI / 2));
    if (disc) parts.add(S.steel, new THREE.CylinderGeometry(0.08, 0.08, 0.003, 20).rotateZ(Math.PI / 2).translate(-0.045, 0, 0));
    parts.into(w);
    // spokes, laced to alternate sides of the hub
    const pts = [];
    const reach = D.deepRim ? rimR - 0.03 : rimR - 0.005;
    for (let i = 0; i < spokeN; i++) {
      const a = (i / spokeN) * Math.PI * 2;
      const hubX = i % 2 ? 0.035 : -0.035;
      const ha = a + (i % 4 < 2 ? 0.35 : -0.35);
      pts.push(new THREE.Vector3(hubX, Math.sin(ha) * 0.022, Math.cos(ha) * 0.022), new THREE.Vector3(0, Math.sin(a) * reach, Math.cos(a) * reach));
    }
    w.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), S.spoke));
    return w;
  }
  const rearWheel = wheel(D.disc);
  rearWheel.position.copy(rearAxle);
  root.add(rearWheel);

  // ---- steering: fork, front wheel, stem and bars turn about the head-tube axis ----
  const steerPivot = new THREE.Group();
  steerPivot.position.copy(headBottom);
  steerPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  root.add(steerPivot);
  const steer = new THREE.Group(); // rotate steer.rotation.y to turn the bars
  steerPivot.add(steer);
  steerPivot.updateMatrix();
  const steerAt = steerPivot.matrix.clone(); // the steering's place in the bike's frame
  const steerInv = steerAt.clone().invert();
  const front = new Parts();
  const frontMount = new THREE.Group(); // lines the wheel up with the frame; the wheel spins inside it
  steer.add(frontMount);
  frontMount.position.copy(frontAxle).applyMatrix4(steerInv);
  frontMount.quaternion.copy(steerPivot.quaternion).invert();
  const frontWheel = wheel(D.disc);
  frontMount.add(frontWheel);
  // fork blades from the crown to the axle
  for (const x of [-0.05, 0.05]) {
    const top = side(crown, x);
    const bottom = side(frontAxle, x);
    if (D.suspension) {
      const mid = top.clone().lerp(bottom, 0.45);
      T(front, S.steel, top, mid, 0.014);
      T(front, S.black, mid, bottom, 0.02);
    } else {
      const knee = top.clone().lerp(bottom, 0.72).addScaledVector(ahead, -D.rake * 0.35); // the blade curves forward near the axle
      T(front, frameMat, top, knee, 0.012 * k);
      T(front, frameMat, knee, bottom, 0.011 * k, 0.012 * k);
    }
  }
  T(front, D.suspension ? S.black : frameMat, side(crown, -0.06), side(crown, 0.06), 0.014 * k); // fork crown
  // stem and handlebar
  const stemTop = headTop.clone().addScaledVector(axis, D.bars === "swept" ? 0.13 : 0.1);
  T(front, S.steel, headBottom.clone().addScaledVector(axis, -0.02), stemTop, 0.012);
  const grips = [];
  const marker = (p, parent = steer, inv = steerInv) => {
    const o = new THREE.Object3D();
    o.position.copy(p).applyMatrix4(inv);
    parent.add(o);
    return o;
  };
  if (D.bars === "swept") {
    // roadster bars: out, then swept back so the grips point at the rider
    const c = stemTop.clone().add(new THREE.Vector3(0, 0, -0.05));
    T(front, S.steel, stemTop, c, 0.013);
    for (const sgn of [-1, 1]) {
      const pts = [c, c.clone().add(new THREE.Vector3(sgn * 0.13, 0.035, -0.01)), c.clone().add(new THREE.Vector3(sgn * 0.25, 0.05, 0.05)), c.clone().add(new THREE.Vector3(sgn * 0.265, 0.035, 0.2))];
      front.add(S.steel, pathGeo(pts, 0.0105, 6, detail ? 16 : 8));
      const g0 = pts[3].clone().lerp(pts[2], 0.62);
      T(front, S.black, g0, pts[3], 0.016);
      grips[sgn < 0 ? 0 : 1] = marker(g0.clone().lerp(pts[3], 0.5));
      T(front, S.steel, g0.clone().add(new THREE.Vector3(0, -0.03, -0.01)), pts[3].clone().add(new THREE.Vector3(0, -0.035, -0.02)), 0.004, 5); // brake lever
    }
  } else {
    const flat = D.bars === "flat";
    const c = stemTop.clone().add(new THREE.Vector3(0, 0, flat ? -0.09 : -0.08));
    T(front, S.steel, stemTop, c, flat ? 0.015 : 0.016);
    const half = D.barWidth || 0.3;
    for (const sgn of [-1, 1]) {
      const end = c.clone().add(new THREE.Vector3(sgn * half, flat ? 0.005 : 0.02, flat ? 0.02 : 0.06));
      T(front, flat ? S.black : S.steel, c, end, 0.011);
      const g0 = c.clone().lerp(end, 0.68);
      T(front, S.black, g0, end, 0.017);
      grips[sgn < 0 ? 0 : 1] = marker(g0.clone().lerp(end, 0.5));
      T(front, S.black, g0, g0.clone().add(new THREE.Vector3(sgn * 0.02, -0.025, -0.09)), 0.005, 5); // brake lever
    }
  }
  if (D.bell) front.add(S.steel, new THREE.SphereGeometry(0.024, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(stemTop.x - 0.1, stemTop.y + 0.04, stemTop.z - 0.02));
  if (D.lamp) {
    // bottle-dynamo headlamp on a bracket from the fork crown
    const at = crown.clone().add(new THREE.Vector3(0, 0.07, -0.09));
    T(front, S.steel, crown, at, 0.005, 5);
    front.add(S.steel, new THREE.CylinderGeometry(0.04, 0.028, 0.06, 12).rotateX(-Math.PI / 2).translate(at.x, at.y, at.z));
    front.add(S.lens, new THREE.CircleGeometry(0.037, 12).rotateY(Math.PI).translate(at.x, at.y, at.z - 0.031));
    front.add(S.steel, new THREE.CylinderGeometry(0.014, 0.014, 0.07, 8).translate(0.06, frontAxle.y + R * 0.72, frontAxle.z + 0.07)); // the dynamo bottle on the fork
  }
  if (D.mudguards) {
    front.add(guardMat, bandGeo(L / 2, R, R + 0.014, -8, 140, D.tyre * 2 + 0.022, { steps: detail ? 16 : 8 }));
    for (const x of [-0.045, 0.045]) T(front, S.steel, side(frontAxle, x), P(L / 2 + Math.cos(deg(8)) * (R + 0.012), R - Math.sin(deg(8)) * (R + 0.012), x * 0.6), 0.003, 4); // stay
  }
  if (D.basket) {
    // wire basket hung from the bars
    const c = stemTop.clone().add(new THREE.Vector3(0, -0.06, -0.24));
    const [bw, bh, bd] = [0.17, 0.2, 0.12];
    const lines = [];
    const corner = (sx, sy2, sz) => new THREE.Vector3(c.x + sx * bw * (sy2 > 0 ? 1 : 0.86), c.y + sy2 * bh * 0.5, c.z + sz * bd * (sy2 > 0 ? 1 : 0.86));
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * 2 - 1;
      for (const sz of [-1, 1]) lines.push(corner(u, 1, sz), corner(u, -1, sz));
      for (const sx of [-1, 1]) lines.push(corner(sx, 1, u), corner(sx, -1, u));
      lines.push(corner(u, -1, -1), corner(u, -1, 1), corner(-1, -1, u), corner(1, -1, u));
    }
    for (const yv of [-0.3, 0.35]) lines.push(corner(-1, yv, -1), corner(1, yv, -1), corner(1, yv, -1), corner(1, yv, 1), corner(1, yv, 1), corner(-1, yv, 1), corner(-1, yv, 1), corner(-1, yv, -1));
    const lg = new THREE.BufferGeometry().setFromPoints(lines);
    lg.applyMatrix4(steerInv);
    steer.add(new THREE.LineSegments(lg, S.wire));
    const rim = [corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)];
    rim.forEach((p, i) => T(front, S.steel, p, rim[(i + 1) % 4], 0.005, 5));
    T(front, S.steel, stemTop.clone().add(new THREE.Vector3(0, 0, -0.05)), c.clone().add(new THREE.Vector3(0, bh * 0.5, bd)), 0.005, 5);
  }
  front.into(steer, steerAt);

  // ---- drivetrain ----
  const gear = D.phys.gear;
  const ringR = 0.1;
  const cogR = ringR / gear;
  const crank = new THREE.Group(); // rotate crank.rotation.x
  crank.position.copy(bb);
  root.add(crank);
  const cr = new Parts();
  cr.add(S.steel, new THREE.TorusGeometry(ringR, 0.006, 6, detail ? 36 : 18).rotateY(Math.PI / 2).translate(0.06, 0, 0));
  for (let i = 0; i < 5; i++) cr.add(S.steel, new THREE.BoxGeometry(0.004, ringR, 0.012).translate(0.06, ringR / 2, 0).rotateX((i / 5) * Math.PI * 2)); // chainring spider
  const pedals = [];
  for (const sgn of [1, -1]) {
    // right crank points down at angle 0; the left is opposite
    const arm = new THREE.BoxGeometry(0.018, BASE.crankLength, 0.03).translate(sgn * 0.075, -BASE.crankLength / 2, 0);
    if (sgn < 0) arm.rotateX(Math.PI);
    cr.add(S.steel, arm);
    const pedalSpot = new THREE.Group(); // counter-rotated so the pedal stays level
    pedalSpot.position.set(sgn * 0.12, sgn * -BASE.crankLength, 0);
    pedalSpot.userData.base = sgn === 1 ? 0 : Math.PI;
    crank.add(pedalSpot);
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.07), S.black);
    pedal.castShadow = true;
    pedalSpot.add(pedal);
    pedals.push(pedalSpot);
  }
  cr.into(crank);
  frame.add(S.steel, new THREE.TorusGeometry(cogR, 0.005, 6, 20).rotateY(Math.PI / 2).translate(0.06, rearAxle.y, rearAxle.z));
  // chain: top and bottom runs between the chainring and the sprocket
  if (D.chain !== "case") {
    const chainPts = [new THREE.Vector3(0.06, bb.y + ringR, bb.z), new THREE.Vector3(0.06, rearAxle.y + cogR, rearAxle.z), new THREE.Vector3(0.06, bb.y - ringR, bb.z), new THREE.Vector3(0.06, rearAxle.y - cogR, rearAxle.z)];
    root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(chainPts), S.chain));
  }
  const fb = -bb.z;
  const fr = -rearAxle.z;
  if (D.chain === "case") {
    // the roadster's closed chain case
    const prof = [];
    for (let i = 0; i <= 10; i++) {
      const t = Math.PI / 2 - (i / 10) * Math.PI;
      prof.push([fb + Math.cos(t) * 0.125, bb.y + Math.sin(t) * 0.125]);
    }
    for (let i = 0; i <= 8; i++) {
      const t = -Math.PI / 2 - (i / 8) * Math.PI;
      prof.push([fr + Math.cos(t) * 0.065, rearAxle.y + Math.sin(t) * 0.065]);
    }
    frame.add(frameMat, slabGeo(prof, 0.03, { bevel: 0.006, x: 0.064 }));
  } else if (D.chain === "guard") {
    frame.add(S.black, slabGeo([[fb + 0.115, bb.y + 0.135], [fr + 0.02, rearAxle.y + cogR + 0.04], [fr + 0.02, rearAxle.y + cogR + 0.012], [fb + 0.04, bb.y + 0.09], [fb + 0.115, bb.y + 0.07]], 0.012, { bevel: 0.003, x: 0.07 }));
  }
  if (D.derailleur) {
    frame.add(S.black, new THREE.BoxGeometry(0.02, 0.09, 0.035).translate(0.07, rearAxle.y - 0.07, rearAxle.z + 0.01));
    frame.add(S.steel, new THREE.CylinderGeometry(0.055, 0.03, 0.035, 14).rotateZ(Math.PI / 2).translate(0.045, rearAxle.y, rearAxle.z)); // cassette
  }

  // ---- stand ----
  const kick = new THREE.Group();
  root.add(kick);
  const centre = D.stand === "centre";
  if (centre) {
    kick.position.set(0, bb.y - 0.03, bb.z + 0.1);
    const kp = new Parts();
    for (const x of [-1, 1]) kp.add(S.black, tubeGeo(new THREE.Vector3(x * 0.03, 0, 0), new THREE.Vector3(x * 0.11, -(bb.y - 0.035), 0), 0.008, 6));
    kp.add(S.black, tubeGeo(new THREE.Vector3(-0.11, -(bb.y - 0.04), 0), new THREE.Vector3(0.11, -(bb.y - 0.04), 0), 0.007, 6));
    kp.into(kick);
  } else {
    kick.position.set(-0.05, bb.y + 0.01, bb.z + 0.08);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 6).translate(0, -0.16, 0), S.black);
    kick.add(leg);
  }

  // ---- mudguard, carrier, reflector ----
  if (D.mudguards) {
    frame.add(guardMat, bandGeo(-L / 2, R, R + 0.014, 55, 205, D.tyre * 2 + 0.022, { steps: detail ? 18 : 9 }));
    for (const x of [-0.045, 0.045]) T(frame, S.steel, side(rearAxle, x), P(-L / 2 + Math.cos(deg(195)) * (R + 0.012), R + Math.sin(deg(195)) * (R + 0.012), x * 0.6), 0.003, 4);
    frame.add(S.red, new THREE.BoxGeometry(0.04, 0.03, 0.012).translate(0, R + Math.sin(deg(188)) * (R + 0.03), -(-L / 2 + Math.cos(deg(188)) * (R + 0.03))));
  }
  if (D.rack) {
    const heavy = D.rack === "heavy";
    const ry = R * 2 + (D.mudguards ? 0.045 : 0.0) - 0.02 + (heavy ? 0.02 : 0);
    const rr = heavy ? 0.006 : 0.005;
    for (const x of [-0.06, 0.06]) {
      T(frame, S.black, side(rearAxle, x * 1.05).add(new THREE.Vector3(0, 0.02, 0)), P(-L / 2 - 0.04, ry, x), rr, 5);
      T(frame, S.black, P(-L / 2 + 0.2, ry, x), P(-L / 2 - 0.2, ry, x), rr, 5);
      if (heavy) T(frame, S.black, side(rearAxle, x * 1.05).add(new THREE.Vector3(0, 0.02, 0)), P(-L / 2 - 0.19, ry, x), rr, 5);
    }
    T(frame, S.black, P(-L / 2 + 0.2, ry, 0), stayTop.clone().addScaledVector(seatDir, -0.05), rr, 5);
    for (const df of [0.2, 0.07, -0.07, -0.2]) T(frame, S.black, P(-L / 2 + df, ry, -0.06), P(-L / 2 + df, ry, 0.06), rr, 5);
    if (heavy) T(frame, S.steel, P(-L / 2 + 0.18, ry + 0.012, 0), P(-L / 2 - 0.16, ry + 0.02, 0), 0.004, 5); // spring clip
    if (!D.mudguards) frame.add(S.red, new THREE.BoxGeometry(0.05, 0.03, 0.012).translate(0, ry - 0.03, L / 2 + 0.205));
  }
  frame.into(root);

  const saddleMark = new THREE.Object3D();
  saddleMark.position.set(0, saddleTop, saddlePoint.z + 0.04);
  root.add(saddleMark);

  const spec = bicycleSpec(design);
  let wheelAngle = 0;
  return {
    kind: "bicycle",
    design,
    label: D.label,
    spec,
    group: root,
    steer,
    grips, // [left, right] markers at the middle of each grip
    pedals, // [right, left] pedal centres
    saddle: saddleMark,
    bb,
    size: { L: L + 2 * R, W: 0.6, H: 1.1 },
    kick, // the stand, for the rider's foot when getting on and off
    /** steerAngle (rad, + turns right), roll (m travelled this frame), crankAngle (rad), kickstand (bool, or 0..1 part way) */
    pose({ steerAngle = 0, roll = 0, crankAngle = 0, kickstand = false }) {
      const k = +kickstand;
      steer.rotation.y = -steerAngle;
      wheelAngle -= roll / R;
      rearWheel.rotation.x = wheelAngle;
      frontWheel.rotation.x = wheelAngle;
      crank.rotation.x = -crankAngle;
      for (const p of pedals) p.rotation.x = crankAngle; // pedals stay level
      if (centre) kick.rotation.x = -1.4 + 1.5 * k;
      else {
        kick.rotation.x = -1.45 + 0.9 * k;
        kick.rotation.z = -0.25 * k;
      }
    },
  };
}

// ---------------------------------------------------------------- physics
export function newRide(heading) {
  return { v: 0, heading, steer: 0, lean: 0, leanVel: 0, crank: 0, roll: 0, footDown: 1, effort: 0, pedalling: false, wobble: 0, bump: 0, backing: 0, backDist: 0, rpm: 0, gearNo: 1, throttle: 0 };
}

/**
 * One frame of riding.
 * input: { pedal: 0..1, sprint: bool, brake: 0..1, steer: -1..1 (+ = right) }
 * ground: { grounded: bool, grade: rise per metre ahead (+ uphill) }
 * spec: the machine (bicycleSpec() or a motorcycle's spec). With an engine, `pedal` is the
 * throttle: part throttle normally, wide open with `sprint`.
 * Returns the horizontal velocity to move the body by.
 */
export function stepBike(r, input, ground, dt, spec = BIKE) {
  const m = spec.mass + spec.riderMass;
  const L = spec.wheelbase;
  const CRR = spec.crr;
  const CDA = spec.cda;
  const BRAKE = spec.brake;
  const MAX_SIDE_ACCEL = spec.maxSide;
  const STEER_RATE = spec.steerRate;
  const MAX_STEER = spec.maxSteer;
  const v = r.v;
  const sprint = input.sprint && input.pedal > 0;
  if (ground.grounded) {
    // driving force: power-limited at speed, gearing-limited when starting off
    const power = sprint ? spec.power.sprint : spec.power.cruise;
    const push = sprint ? spec.push.sprint : spec.push.cruise;
    const drive = input.pedal > 0 ? input.pedal * Math.min(push, power / Math.max(v, 0.1)) : 0;
    // resistances always oppose the direction of travel
    const dirV = Math.abs(v) > 0.01 ? Math.sign(v) : 0;
    const roll = dirV * (CRR * m * G + (spec.motor && input.pedal === 0 && v > 1 ? spec.engineBrake * m : 0)); // a closed throttle holds the bike back
    const drag = 0.5 * AIR * CDA * v * Math.abs(v);
    const slope = (-m * G * ground.grade) / Math.sqrt(1 + ground.grade * ground.grade);
    // Reverse: a bicycle cannot be pedalled backwards, so from a standstill the rider holding the
    // brake key puts both feet down and walks the bike back while seated: slow (about 0.7 m/s, a
    // shuffling walk), steady, upright. Pedalling forward while rolling back brakes first.
    const wantBack = input.brake > 0 && input.pedal === 0 && v < 0.15;
    const feet = wantBack ? Math.max(-140, Math.min(140, (-0.7 - v) * m * 2.2)) : 0; // feet push against the ground
    const brake = input.brake > 0 && v > 0.15 ? Math.min(input.brake * BRAKE * m, (v / dt) * m + slope) : 0;
    const backBrake = input.pedal > 0 && v < 0 ? Math.min(BRAKE * m, (-v / dt) * m) : 0; // stop before going forward
    const a = (drive - roll - drag + slope - brake + feet + backBrake) / m;
    r.v = v + a * dt;
    // a stopped bike on the flat stays put; it rolls back only down a slope or when walked back
    if (r.v < 0 && !wantBack && ground.grade <= 0.005 && v >= 0) r.v = 0;
    r.v = Math.max(r.v, -1.5);
    if (spec.topSpeed) r.v = Math.min(r.v, spec.topSpeed);
  } else {
    r.v -= ((0.5 * AIR * CDA * v * Math.abs(v)) / m) * dt; // only air resists in flight
  }

  // ---- steering ----
  const speed = Math.abs(r.v);
  const lock = Math.min(MAX_STEER, Math.atan((MAX_SIDE_ACCEL * L) / Math.max(speed * speed, 1e-3)));
  const want = ground.grounded ? input.steer * lock : r.steer;
  r.steer += Math.max(-STEER_RATE * dt, Math.min(STEER_RATE * dt, want - r.steer));
  r.steer = Math.max(-lock, Math.min(lock, r.steer));
  if (ground.grounded) r.heading -= ((r.v * Math.tan(r.steer)) / L) * dt; // + steer turns right, heading turns clockwise

  // ---- balance: lean into the turn, with the lag of a real rider ----
  const turnLean = Math.atan((r.v * r.v * Math.tan(r.steer)) / (L * G)); // + leans right
  const slow = Math.max(0, Math.min(1, (1.4 - speed) / 1.1)); // 0 above 1.4 m/s, 1 when stopped
  const backingNow = r.v < -0.05 || (input.brake > 0 && input.pedal === 0 && speed < 0.15);
  r.backing += ((backingNow ? 1 : 0) - r.backing) * (1 - Math.exp(-dt * 8));
  if (r.v < 0) r.backDist += -r.v * dt;
  const stopped = (speed < 0.35 && input.pedal === 0) || backingNow;
  r.footDown += ((stopped ? 1 : 0) - r.footDown) * (1 - Math.exp(-dt * (stopped ? 6 : 10)));
  r.wobble += dt * (2.5 + speed);
  const wobble = Math.sin(r.wobble) * 0.035 * slow * (1 - r.footDown); // small corrections at walking pace
  // foot down: rests on the left foot; walking it back on both feet: upright
  const target = turnLean * (1 - r.footDown) - 0.13 * r.footDown * (1 - r.backing) + wobble;
  const k = 70; // stiffness: settles in about a quarter of a second
  r.leanVel += (k * (target - r.lean) - 2 * 0.85 * Math.sqrt(k) * r.leanVel) * dt;
  r.lean += r.leanVel * dt;
  r.lean = Math.max(-0.75, Math.min(0.75, r.lean));

  // ---- drivetrain: cranks turn with the rear wheel only while pedalling (freewheel) ----
  if (spec.motor) {
    // engine speed from road speed through the gears (shifting up near the top of each one)
    r.pedalling = false;
    r.throttle += ((input.pedal > 0 ? (sprint ? 1 : 0.55) : 0) - r.throttle) * (1 - Math.exp(-dt * 9));
    const kmh = Math.max(0, r.v) * 3.6;
    const tops = spec.gears;
    let g = r.gearNo || 1;
    if (g < tops.length && kmh > tops[g - 1] * (0.62 + 0.3 * r.throttle)) g++;
    else if (g > 1 && kmh < tops[g - 2] * 0.45) g--;
    r.gearNo = g;
    const want = spec.cvt ? spec.idle + (spec.redline * 0.72 - spec.idle) * Math.min(1, r.throttle * 1.3 + kmh / 140) * (kmh < 1 && r.throttle < 0.05 ? 0 : 1) : Math.max(spec.idle, spec.redline * Math.min(1.02, kmh / tops[g - 1]));
    r.rpm += (Math.max(spec.idle, want) - r.rpm) * (1 - Math.exp(-dt * (spec.cvt ? 4 : 9)));
    r.effort += ((sprint ? 0.5 : 0.1) - r.effort) * (1 - Math.exp(-dt * 4));
  } else {
    r.pedalling = input.pedal > 0 && ground.grounded && r.v >= 0;
    if (r.pedalling) r.crank += ((Math.max(r.v, 0.6) / spec.wheelRadius / spec.gear) * dt);
    else if (r.v < 0 && ground.grounded) r.crank += (r.v / spec.wheelRadius / spec.gear) * dt; // rolling back turns the cranks back
    r.effort += ((sprint ? 1 : input.pedal > 0 ? 0.35 : 0) - r.effort) * (1 - Math.exp(-dt * 4));
  }
  r.roll = r.v * dt;

  const fx = -Math.sin(r.heading);
  const fz = -Math.cos(r.heading);
  return { vx: fx * r.v, vz: fz * r.v };
}

/**
 * A bicycle for the traffic: nose along +x, with what traffic.js expects in userData. The rider
 * pedals, so userData.live asks for the rider's pose to be worked out every frame.
 */
export function makeTrafficBicycle(opts) {
  const m = buildBicycle({ ...opts, detail: false });
  const g = new THREE.Group();
  m.group.rotation.y = -Math.PI / 2; // forward (-z) along +x
  g.add(m.group);
  m.pose({});
  let crank = Math.random() * 6;
  g.userData = {
    size: { L: m.size.L, W: 0.6, H: 1.5 },
    wheelR: m.spec.wheelRadius,
    axles: [m.spec.wheelbase / 2, -m.spec.wheelbase / 2],
    tail: { emissiveIntensity: 0 },
    indL: { emissiveIntensity: 0 },
    indR: { emissiveIntensity: 0 },
    alloy: { map: { rotation: 0 } },
    roll(d) {
      if (d > 0.0005) crank += d / m.spec.wheelRadius / m.spec.gear;
      m.pose({ roll: d, crankAngle: crank });
    },
    get crank() {
      return crank;
    },
    posture: m.spec.posture,
    design: m.design,
    live: true,
    marks: { saddle: m.saddle, gripL: m.grips[0], gripR: m.grips[1], pegL: m.pedals[1], pegR: m.pedals[0] },
  };
  return g;
}
