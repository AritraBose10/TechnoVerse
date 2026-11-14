// A city bicycle: the model and its riding physics.
//
// Model: a hybrid/city bike with 700c wheels (0.68 m across), a diamond frame sized for a
// 1.75 m rider, 1.08 m wheelbase and a 71 degree head angle. The fork, front wheel and handlebar
// turn together about the real steering axis (along the head tube). Wheels spin with the ground
// speed; the cranks turn only while pedalling (the rear hub freewheels when coasting).
//
// Physics (see stepBike): the rider pushes with a set power, held back by rolling resistance,
// air drag and the slope (gravity along the road); brakes give up to about 0.45 g. Steering follows
// the kinematic bicycle model (turn radius = wheelbase / tan(steer)), and the steering lock
// available shrinks with speed so sideways acceleration stays within what tyres and balance allow.
// The bike leans into turns by the balance angle atan(v^2 / (g * R)), reached with a short lag, as a
// rider's lean does. Below walking pace the rider can no longer balance and puts a foot down.
import * as THREE from "three";

export const BIKE = {
  wheelRadius: 0.34,
  wheelbase: 1.08,
  headAngle: (71 * Math.PI) / 180,
  crankLength: 0.17,
  gear: 2.6, // wheel turns per crank turn (42 x 16)
  mass: 13, // kg, bike
  riderMass: 72, // kg
};

const G = 9.81;
const AIR = 1.2; // kg/m^3
const CDA = 0.5; // m^2, upright city riding
const CRR = 0.006; // rolling resistance, city tyres on asphalt
const POWER = { cruise: 150, sprint: 420 }; // watts at the pedals
const MAX_PUSH = { cruise: 190, sprint: 330 }; // newtons at the wheel when starting off (gearing limit)
const BRAKE = 0.45 * G; // m/s^2 with both brakes
const MAX_SIDE_ACCEL = 4.5; // m/s^2: beyond this a rider would slide or fall
const STEER_RATE = 2.2; // rad/s the bars can be turned at
const MAX_STEER = 0.62; // rad, full lock at walking pace

// ---------------------------------------------------------------- model
export function buildBicycle({ color = "#8f1d22", detail = true } = {}) {
  const R = BIKE.wheelRadius;
  const L = BIKE.wheelbase;
  // Bike coordinates: x to the rider's right, y up, forward is -z. Origin on the ground under the
  // bottom bracket's plane, halfway between the axles.
  const rearAxle = new THREE.Vector3(0, R, L / 2);
  const frontAxle = new THREE.Vector3(0, R, -L / 2);
  const bb = new THREE.Vector3(0, 0.285, L / 2 - 0.44); // bottom bracket: 44 cm chainstays
  const seatTop = bb.clone().add(new THREE.Vector3(0, Math.sin(1.274), Math.cos(1.274)).multiplyScalar(0.53)); // 73 deg seat tube
  const headBottom = new THREE.Vector3(0, 0.62, -0.42);
  const steerAxis = new THREE.Vector3(0, Math.sin(BIKE.headAngle), Math.cos(BIKE.headAngle)).normalize(); // up and back
  const headTop = headBottom.clone().addScaledVector(steerAxis, 0.16);

  const frameMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const black = new THREE.MeshStandardMaterial({ color: "#151517", roughness: 0.8 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#1b1b1c", roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: "#c9ccd1", roughness: 0.3, metalness: 0.9 });
  const saddleMat = new THREE.MeshStandardMaterial({ color: "#2a2420", roughness: 0.7 });

  const root = new THREE.Group(); // stands on the ground; lean is applied to this by the caller
  const meshes = [];
  const tube = (a, b, r, mat, parent = root) => {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, detail ? 10 : 6), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    parent.add(m);
    meshes.push(m);
    return m;
  };

  // ---- frame ----
  const side = (p, x) => p.clone().setX(x);
  tube(seatTop, headTop, 0.017, frameMat); // top tube
  tube(bb, headBottom, 0.021, frameMat); // down tube
  tube(bb, seatTop, 0.017, frameMat); // seat tube
  tube(headBottom, headTop, 0.022, frameMat); // head tube
  for (const x of [-0.055, 0.055]) {
    tube(side(bb, x * 0.6), side(rearAxle, x), 0.009, frameMat); // chainstays
    tube(side(seatTop, x * 0.3), side(rearAxle, x), 0.008, frameMat); // seatstays
  }
  // seatpost and saddle
  const saddlePoint = seatTop.clone().addScaledVector(seatTop.clone().sub(bb).normalize(), 0.2);
  tube(seatTop, saddlePoint, 0.0135, steel);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.27), saddleMat);
  saddle.geometry.translate(0, 0, 0.02);
  saddle.position.copy(saddlePoint).add(new THREE.Vector3(0, 0.03, 0));
  root.add(saddle);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.12), saddleMat);
  nose.position.copy(saddle.position).add(new THREE.Vector3(0, 0, -0.15));
  root.add(nose);
  meshes.push(saddle, nose);

  // ---- wheels ----
  function wheel() {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.018, 0.018, detail ? 10 : 6, detail ? 48 : 24), rubber);
    tyre.rotation.y = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.04, 0.009, 6, detail ? 48 : 24), steel);
    rim.rotation.y = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 10), steel);
    hub.rotation.z = Math.PI / 2;
    w.add(tyre, rim, hub);
    // 32 spokes, laced to alternate sides of the hub
    const n = detail ? 32 : 16;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const hubX = i % 2 ? 0.035 : -0.035;
      const ha = a + (i % 4 < 2 ? 0.35 : -0.35);
      pts.push(new THREE.Vector3(hubX, Math.sin(ha) * 0.022, Math.cos(ha) * 0.022), new THREE.Vector3(0, Math.sin(a) * (R - 0.045), Math.cos(a) * (R - 0.045)));
    }
    w.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#b8bcc2" })));
    meshes.push(tyre, rim, hub);
    return w;
  }
  const rearWheel = wheel();
  rearWheel.position.copy(rearAxle);
  root.add(rearWheel);

  // ---- steering: fork, front wheel, stem and bars turn about the head-tube axis ----
  const steerPivot = new THREE.Group();
  steerPivot.position.copy(headBottom);
  steerPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), steerAxis);
  root.add(steerPivot);
  const steer = new THREE.Group(); // rotate steer.rotation.y to turn the bars
  steerPivot.add(steer);
  const toSteer = (p) => {
    root.updateMatrixWorld(true);
    return steer.worldToLocal(root.localToWorld(p.clone()));
  };
  const frontMount = new THREE.Group(); // lines the wheel up with the frame; the wheel spins inside it
  steer.add(frontMount);
  frontMount.position.copy(toSteer(frontAxle));
  frontMount.quaternion.copy(steerPivot.quaternion.clone().invert());
  const frontWheel = wheel();
  frontMount.add(frontWheel);
  // fork blades from the crown to the axle, with a little forward rake at the bottom
  const crown = toSteer(headBottom.clone().addScaledVector(steerAxis, -0.04));
  const axleL = toSteer(frontAxle);
  for (const x of [-0.05, 0.05]) {
    const a = crown.clone().add(new THREE.Vector3(x, 0, 0));
    const b = axleL.clone().add(new THREE.Vector3(x, 0, 0));
    tube(a, b, 0.012, frameMat, steer);
  }
  // stem and riser handlebar
  const stemTop = toSteer(headTop.clone().addScaledVector(steerAxis, 0.1));
  tube(new THREE.Vector3(0, -0.02, 0), stemTop, 0.014, steel, steer);
  const barCentre = stemTop.clone().add(toSteer(new THREE.Vector3(0, 0, -0.08)).sub(toSteer(new THREE.Vector3(0, 0, 0))));
  tube(stemTop, barCentre, 0.016, steel, steer);
  const grips = [];
  for (const sgn of [-1, 1]) {
    const end = barCentre.clone().add(toSteer(new THREE.Vector3(sgn * 0.3, 0.02, 0.06)).sub(toSteer(new THREE.Vector3(0, 0, 0))));
    tube(barCentre, end, 0.011, steel, steer);
    const gripStart = barCentre.clone().lerp(end, 0.7);
    tube(gripStart, end, 0.017, black, steer);
    const grip = new THREE.Object3D();
    grip.position.copy(gripStart.clone().lerp(end, 0.5));
    steer.add(grip);
    grips.push(grip);
    // brake lever
    tube(gripStart, gripStart.clone().add(toSteer(new THREE.Vector3(0, -0.02, -0.1)).sub(toSteer(new THREE.Vector3(0, 0, 0)))), 0.006, black, steer);
  }

  // ---- drivetrain ----
  const crank = new THREE.Group(); // rotate crank.rotation.x
  crank.position.copy(bb);
  root.add(crank);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 36), steel);
  ring.rotation.y = Math.PI / 2;
  ring.position.x = 0.06;
  crank.add(ring);
  const pedals = [];
  for (const sgn of [1, -1]) {
    // right crank points down-forward at angle 0; the left is opposite
    const arm = new THREE.Group();
    arm.rotation.x = sgn === 1 ? 0 : Math.PI;
    crank.add(arm);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.018, BIKE.crankLength, 0.03), steel);
    a.position.set(sgn * 0.075, -BIKE.crankLength / 2, 0);
    arm.add(a);
    const pedalSpot = new THREE.Group(); // counter-rotated so the pedal stays level
    pedalSpot.position.set(sgn * 0.12, -BIKE.crankLength, 0);
    arm.add(pedalSpot);
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.07), black);
    pedalSpot.add(pedal);
    pedals.push(pedalSpot);
    meshes.push(a, pedal);
  }
  const cog = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 6, 20), steel);
  cog.rotation.y = Math.PI / 2;
  cog.position.copy(rearAxle).setX(0.06);
  root.add(cog);
  // chain: top and bottom runs between the chainring and the sprocket
  const chainPts = [
    new THREE.Vector3(0.06, bb.y + 0.1, bb.z), new THREE.Vector3(0.06, rearAxle.y + 0.04, rearAxle.z),
    new THREE.Vector3(0.06, bb.y - 0.1, bb.z), new THREE.Vector3(0.06, rearAxle.y - 0.04, rearAxle.z),
  ];
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(chainPts), new THREE.LineBasicMaterial({ color: "#3a3a3c" })));

  // ---- kickstand (left side, behind the bottom bracket) ----
  const kick = new THREE.Group();
  kick.position.set(-0.05, bb.y + 0.01, bb.z + 0.08);
  root.add(kick);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 6), black);
  leg.position.y = -0.16;
  kick.add(leg);

  // mudguard-free city bike: add a rear rack for character
  tube(side(rearAxle, -0.06).add(new THREE.Vector3(0, 0.02, 0)), new THREE.Vector3(-0.06, 0.66, rearAxle.z + 0.02), 0.005, black);
  tube(side(rearAxle, 0.06).add(new THREE.Vector3(0, 0.02, 0)), new THREE.Vector3(0.06, 0.66, rearAxle.z + 0.02), 0.005, black);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.012, 0.36), black);
  rack.position.set(0, 0.665, rearAxle.z - 0.06);
  root.add(rack);

  for (const m of [...meshes, rack]) m.castShadow = true;

  const saddleMark = new THREE.Object3D();
  saddleMark.position.copy(saddle.position).add(new THREE.Vector3(0, 0.03, 0.04));
  root.add(saddleMark);

  let wheelAngle = 0;
  return {
    group: root,
    steer,
    grips, // [left, right] markers at the middle of each grip
    pedals, // [right, left] pedal centres
    saddle: saddleMark,
    bb,
    /** steerAngle (rad, + turns right), roll (m travelled this frame), crankAngle (rad), kickstand (bool) */
    pose({ steerAngle = 0, roll = 0, crankAngle = 0, kickstand = false }) {
      steer.rotation.y = -steerAngle;
      wheelAngle -= roll / R;
      rearWheel.rotation.x = wheelAngle;
      frontWheel.rotation.x = wheelAngle;
      crank.rotation.x = -crankAngle;
      for (const p of pedals) p.rotation.x = crankAngle - p.parent.rotation.x; // pedals stay level
      kick.rotation.x = kickstand ? -0.55 : -1.45;
      kick.rotation.z = kickstand ? -0.25 : 0;
    },
  };
}

// ---------------------------------------------------------------- physics
export function newRide(heading) {
  return { v: 0, heading, steer: 0, lean: 0, leanVel: 0, crank: 0, roll: 0, footDown: 1, effort: 0, pedalling: false, wobble: 0, bump: 0 };
}

/**
 * One frame of riding.
 * input: { pedal: 0..1, sprint: bool, brake: 0..1, steer: -1..1 (+ = right) }
 * ground: { grounded: bool, grade: rise per metre ahead (+ uphill) }
 * Returns the horizontal velocity to move the body by.
 */
export function stepBike(r, input, ground, dt) {
  const m = BIKE.mass + BIKE.riderMass;
  const L = BIKE.wheelbase;
  const v = r.v;
  const sprint = input.sprint && input.pedal > 0;
  if (ground.grounded) {
    // driving force from the pedals: power-limited at speed, gearing/leg-limited when starting off
    const power = sprint ? POWER.sprint : POWER.cruise;
    const push = sprint ? MAX_PUSH.sprint : MAX_PUSH.cruise;
    const drive = input.pedal > 0 ? input.pedal * Math.min(push, power / Math.max(v, 0.1)) : 0;
    const roll = v > 0.01 ? CRR * m * G : 0;
    const drag = 0.5 * AIR * CDA * v * v;
    const slope = (-m * G * ground.grade) / Math.sqrt(1 + ground.grade * ground.grade);
    const brake = input.brake > 0 && v > 0 ? Math.min(input.brake * BRAKE * m, (v / dt) * m + slope) : 0;
    let a = (drive - roll - drag + slope - brake) / m;
    r.v = v + a * dt;
    // a bike rolls back down a hill only if nobody pedals or brakes; a stopped bike on the flat stays put
    if (r.v < 0 && (input.pedal > 0 || input.brake > 0 || ground.grade <= 0.005)) r.v = Math.max(r.v, 0);
    r.v = Math.max(r.v, -1.5);
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
  const stopped = speed < 0.35 && input.pedal === 0;
  r.footDown += ((stopped ? 1 : 0) - r.footDown) * (1 - Math.exp(-dt * (stopped ? 6 : 10)));
  r.wobble += dt * (2.5 + speed);
  const wobble = Math.sin(r.wobble) * 0.035 * slow * (1 - r.footDown); // small corrections at walking pace
  const target = turnLean * (1 - r.footDown) - 0.13 * r.footDown + wobble; // foot down: rests on the left foot
  const k = 70; // stiffness: settles in about a quarter of a second
  r.leanVel += (k * (target - r.lean) - 2 * 0.85 * Math.sqrt(k) * r.leanVel) * dt;
  r.lean += r.leanVel * dt;
  r.lean = Math.max(-0.75, Math.min(0.75, r.lean));

  // ---- drivetrain: cranks turn with the rear wheel only while pedalling (freewheel) ----
  r.pedalling = input.pedal > 0 && ground.grounded && r.v >= 0;
  if (r.pedalling) r.crank += ((Math.max(r.v, 0.6) / BIKE.wheelRadius / BIKE.gear) * dt);
  r.effort += ((sprint ? 1 : input.pedal > 0 ? 0.35 : 0) - r.effort) * (1 - Math.exp(-dt * 4));
  r.roll = r.v * dt;

  const fx = -Math.sin(r.heading);
  const fz = -Math.cos(r.heading);
  return { vx: fx * r.v, vz: fz * r.v };
}
