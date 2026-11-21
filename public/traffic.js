// Traffic on Street Number 2: cars, yellow taxis, auto rickshaws, buses and motorbikes on the two
// one-way carriageways, driving on the left as in India.
//
// How they drive:
//   - Each keeps a safe gap to whatever is ahead in its path (the Intelligent Driver Model: a
//     desired speed, a time gap of about a second, comfortable braking), so queues form and clear
//     naturally. Ahead means any vehicle, parked car, cart or person whose width overlaps its own.
//   - They slow for the speed breaker at the crossing between the two gates, and the body pitches
//     over it.
//   - Stopped behind a parked car or a slow auto, they move into the other lane when there is room
//     behind and ahead, indicating first; later they drift back to the lane they prefer (autos,
//     buses and motorbikes keep to the kerb side).
//   - Some park: they pick a free space ahead, indicate left, slow, and ease in to the kerb. Parked
//     cars leave after a while: indicate right, wait for a gap, pull out.
//   - Autos stop at the kerb to drop and pick up; buses stop at the bus stop.
//   - Anyone walking on the carriageway (the player included) is an obstacle: traffic brakes for
//     them, so people can cross at the gap in the median.
// Positions are in the street's own frame ("local"): x along the street, z across it.
import * as THREE from "three";
import { setVehicleNight } from "/street.js";
import { preloadVehicles, makeRealCar, vehiclesReady } from "/vehicles.js";
import { makeTrafficMotorcycle, MOTORCYCLE_DESIGNS, setMotorcycleNight } from "/motorcycle.js";
import { makeTrafficBicycle, BICYCLE_DESIGNS } from "/bicycle.js";
import { makeCharacter } from "/character.js";
import { riderLook } from "/looks.js";
import { pickBody } from "/crowdbodies.js";
import { seatCharacter } from "/seated.js";

const ROADS = {
  // near side, in front of the university: travels toward +x
  near: { dir: 1, lanes: [11.6, 13.65], park: 9.55, edge: [8.4, 15.4], from: -590, to: 133 },
  // far side, in front of the stalls: travels toward -x
  far: { dir: -1, lanes: [22.3, 20.3], park: 24.35, edge: [19.4, 25.6], from: 133, to: -592 },
};
const BREAKER_X = 9; // the hump across both carriageways at the crossing
const PARK_SLOTS = {
  // the long row along the grey boundary wall south of the university (Jan 2026 street view), then
  // the spaces either side of the gate
  near: [-362, -355.5, -349, -342.5, -336, -329.5, -323, -316.5, -310, -303.5, -297, -290.5, -284, -277.5, -271, -264.5, -258, -251.5, -55, -47, -39, -31, -23.5, -15, 24.5, 30, 41.5, 47.2, 53.5, 60],
  far: [-300, -293, -286, -279, -36, -30, -24, -14, 30.5, 36.4, 42.6, 48.6, 55],
};
// Traffic signals. Mapped data has none on this street; these are from street-level imagery:
// the one at the south junction by Meen Bhavan is seen in the Dec 2022 capture; the one at the
// north bend (the junction with Street No. 13) is assumed.
const SIGNALS = [
  { road: "far", x: -566, pole: [-566, 17.9], arm: 1, offset: 0, seen: true },
  { road: "near", x: 124, pole: [124, 8.3], arm: 1, offset: 21, seen: false },
];
const CYCLE = { green: 30, amber: 3, red: 22 };
const STOPS = {
  near: [{ x: 1.5, kinds: ["auto"] }, { x: -9, kinds: ["auto"] }, { x: -66, kinds: ["bus", "auto"] }],
  far: [{ x: 22.5, kinds: ["auto"] }, { x: -19.5, kinds: ["auto"] }, { x: 64, kinds: ["bus", "auto"] }],
};
const COLOURS = [["#f1f1ef", 30], ["#b9bcc0", 16], ["#6f7378", 12], ["#1b1d21", 9], ["#9b1d20", 7], ["#23396b", 7], ["#5a4232", 4], ["#7a1c2c", 3], ["#2d4a3a", 3], ["#c9571f", 2], ["#d8c9a6", 3]];
const TYPES = {
  hatch: { w: 20, v: [9.5, 12.5], a: 1.7, b: 3, prefer: 0.3 },
  sedan: { w: 13, v: [10, 13], a: 1.6, b: 3, prefer: 0.25 },
  suv: { w: 12, v: [10, 13.5], a: 1.6, b: 3, prefer: 0.2 },
  taxi: { w: 14, v: [9.5, 12.5], a: 1.5, b: 3, prefer: 0.45 },
  auto: { w: 17, v: [7, 9.5], a: 1.3, b: 2.6, prefer: 0.9 },
  bike: { w: 17, v: [10, 13.5], a: 2.3, b: 3.5, prefer: 0.5 },
  cycle: { w: 7, v: [3.4, 5.2], a: 0.8, b: 2.2, prefer: 1 },
  bus: { w: 4, v: [7.5, 9.5], a: 0.9, b: 2.2, prefer: 0.1 },
};

export function buildTraffic({ scene, world, RAPIER, local, phi, kitLoading, quality = "high", seed = 7 }) {
  preloadVehicles(quality === "high");
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const range = (a, b) => a + rnd() * (b - a);
  const pickW = (pairs) => {
    let t = rnd() * pairs.reduce((n, [, w]) => n + w, 0);
    for (const [v, w] of pairs) if ((t -= w) <= 0) return v;
    return pairs[0][0];
  };
  const plate = (kind) => {
    const L = "ABCDEFGHJKLMNPRSTUVWXYZ";
    const two = L[(rnd() * L.length) | 0] + (rnd() < 0.6 ? L[(rnd() * L.length) | 0] : "");
    const d = String((rnd() * 9999) | 0).padStart(4, "0");
    return `WB ${["02", "04", "06", "08", "10", "12", "19", "20", "26"][(rnd() * 9) | 0]} ${kind === "taxi" ? "T" : two} ${d}`;
  };
  const MAX_MOVING = quality === "low" ? 14 : 36;
  let seatBudget = 0; // real seated people that may still be made this frame
  let eye = null; // where the viewer is, in the street's frame
  let night = 0; // 0 by day, 1 at night: lamps on
  let busy = 1; // how much traffic for the hour: 1 = a normal daytime flow
  let kit = null;
  kitLoading.then((k) => {
    kit = k;
    for (const v of all) if (v.needsRider) seatRiders(v);
  });

  // ---------- making vehicles (kept in a pool and reused) ----------
  const pool = {};
  function build(kind) {
    const color = pickW(COLOURS);
    if (kind === "bike") {
      // the everyday mix: commuters, the older spoked kind, gearless scooters
      const design = pickW([["commuter", 5], ["classic", 2], ["scooter", 4]]);
      const cols = MOTORCYCLE_DESIGNS[design].colors;
      return makeTrafficMotorcycle({ design, color: cols[(rnd() * cols.length) | 0][0], plate: plate(kind) });
    }
    if (kind === "cycle") {
      const design = pickW([["roadster", 5], ["ladies", 2], ["city", 2], ["mtb", 2], ["sport", 1]]);
      const cols = BICYCLE_DESIGNS[design].colors;
      return makeTrafficBicycle({ design, color: cols[(rnd() * cols.length) | 0] });
    }
    // cars, taxis, autos and buses are the real Indian models only: the old procedural boxes are gone, and
    // until a model has loaded (or if it failed to) nothing of that kind is spawned (build returns null)
    return makeRealCar(kind, kind === "taxi" ? "#e8b90f" : color, rnd);
  }
  function seatRiders(v) {
    v.needsRider = false;
    const u0 = v.mesh.userData;
    if (u0.live) {
      // a cyclist: the pose is worked out as they pedal (see liveRider)
      if (!kit) return;
      const opts = riderLook(rnd, { helmet: false });
      const body = pickBody("rider", "m", rnd);
      const c = body ? makeCharacter(body.kit, { gear: opts.gear, lite: true }) : makeCharacter(kit, { ...opts, lite: true });
      const holderParent = new THREE.Group();
      holderParent.rotation.y = -Math.PI / 2;
      v.mesh.add(holderParent);
      holderParent.add(c.model);
      c.model.traverse((o) => o.isMesh && (o.castShadow = true));
      u0.cyclist = c;
      liveRider(v, 1 / 60);
      return;
    }
    const rider = v.mesh.userData.rider;
    if (!rider || !kit) return;
    const seats = [rider];
    if (v.kind === "bike" && rnd() < 0.3) seats.push(v.mesh.userData.pillion);
    v.mesh.updateMatrixWorld(true);
    const saved = v.mesh.matrixWorld.clone();
    // pose them with the vehicle at the origin, then the pose rides along
    const pos = v.mesh.position.clone();
    const rot = v.mesh.rotation.clone();
    v.mesh.position.set(0, 0, 0);
    v.mesh.rotation.set(0, 0, 0);
    v.mesh.updateMatrixWorld(true);
    for (const seat of seats) {
      const opts = riderLook(rnd, { helmet: v.kind === "bike" });
      const body = pickBody("rider", "m", rnd);
      const c = body ? makeCharacter(body.kit, { gear: opts.gear, lite: true }) : makeCharacter(kit, { ...opts, lite: true });
      const holderParent = new THREE.Group();
      holderParent.rotation.y = -Math.PI / 2; // the rider's forward (-z) along the vehicle's nose (+x)
      v.mesh.add(holderParent);
      holderParent.add(c.model);
      holderParent.updateMatrixWorld(true);
      const W = (p) => v.mesh.localToWorld(new THREE.Vector3(...p));
      c.update(1 / 60, {
        speed: 0,
        grounded: true,
        turnRate: 0,
        facing: -Math.PI / 2,
        ride: {
          saddle: W(seat.saddle),
          gripL: W(seat.gripL),
          gripR: W(seat.gripR),
          pedalL: W(seat.pegL),
          pedalR: W(seat.pegR),
          groundL: W(seat.pegL),
          groundR: W(seat.pegR),
          right: new THREE.Vector3(0, 0, 1),
          up: new THREE.Vector3(0, 1, 0),
          back: new THREE.Vector3(-1, 0, 0),
          crank: Math.PI / 2,
          effort: v.kind === "bike" ? 0.1 : 0,
          footDown: 0,
          backing: 0,
          posture: v.mesh.userData.posture ?? 1,
        },
      });
      c.model.traverse((o) => o.isMesh && (o.castShadow = true));
    }
    v.mesh.position.copy(pos);
    v.mesh.rotation.copy(rot);
    v.mesh.updateMatrixWorld(true);
    void saved;
  }

  // A cyclist's body follows the pedals, so it is posed again every frame (only when near enough to see).
  const _m = { saddle: new THREE.Vector3(), gripL: new THREE.Vector3(), gripR: new THREE.Vector3(), pedalL: new THREE.Vector3(), pedalR: new THREE.Vector3(), groundL: new THREE.Vector3(), groundR: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), back: new THREE.Vector3() };
  function liveRider(v, dt) {
    const u = v.mesh.userData;
    const c = u.cyclist;
    if (!c) return;
    v.mesh.updateMatrixWorld(true);
    const k = u.marks;
    k.saddle.getWorldPosition(_m.saddle);
    k.gripL.getWorldPosition(_m.gripL);
    k.gripR.getWorldPosition(_m.gripR);
    k.pegL.getWorldPosition(_m.pedalL);
    k.pegR.getWorldPosition(_m.pedalR);
    const yaw = v.mesh.rotation.y;
    _m.right.set(Math.sin(yaw), 0, Math.cos(yaw)); // the vehicle's +z
    _m.back.set(-Math.cos(yaw), 0, Math.sin(yaw)); // its -x
    v.mesh.localToWorld(_m.groundL.set(-0.12, 0.1, -0.36));
    v.mesh.localToWorld(_m.groundR.set(-0.12, 0.1, 0.36));
    const stopped = v.v < 0.3;
    v.foot = (v.foot ?? 1) + ((stopped ? 1 : 0) - (v.foot ?? 1)) * Math.min(1, dt * 6);
    c.update(dt, { speed: 0, grounded: true, turnRate: 0, facing: yaw - Math.PI / 2, ride: { ..._m, crank: u.crank, effort: 0.3, footDown: v.foot, backing: 0, posture: u.posture } });
  }

  // ---------- traffic signals ----------
  const signals = SIGNALS.map((sg) => {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: "#3a3d40", roughness: 0.55, metalness: 0.6 });
    const yellow = new THREE.MeshStandardMaterial({ color: "#d9a514", roughness: 0.6, metalness: 0.2 });
    const part = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    part(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 10), steel, 0, 2.8, 0);
    part(new THREE.BoxGeometry(0.3, 0.5, 0.3), yellow, 0, 0.25, 0); // painted foot
    const arm = part(new THREE.CylinderGeometry(0.05, 0.06, 4.2, 8), steel, 0, 5.45, sg.arm * 2.1);
    arm.rotation.x = Math.PI / 2;
    const lamps = {};
    const head = (y, z) => {
      part(new THREE.BoxGeometry(0.3, 1.05, 0.36), yellow, 0, y, z);
      part(new THREE.BoxGeometry(0.04, 1.25, 0.56), new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.8 }), -0.17, y, z); // backboard
      [["red", "#ff2a1a", 0.33], ["amber", "#ffb000", 0], ["green", "#19e36a", -0.33]].forEach(([name, color, dy]) => {
        const mat = (lamps[name] ||= new THREE.MeshStandardMaterial({ color: "#1a1a1a", emissive: color, emissiveIntensity: 0, roughness: 0.4 }));
        const lens = part(new THREE.CircleGeometry(0.11, 16), mat, 0.155, y + dy, z);
        lens.rotation.y = Math.PI / 2;
        lens.castShadow = false;
        const hood = part(new THREE.CylinderGeometry(0.125, 0.125, 0.16, 12, 1, true, 0, Math.PI), yellow, 0.22, y + dy, z);
        hood.rotation.z = Math.PI / 2;
        hood.rotation.y = Math.PI / 2;
      });
    };
    head(4.85, sg.arm * 3.6); // over the lanes
    head(3.1, 0); // on the pole, for those at the stop line
    const R = ROADS[sg.road];
    const [wx, wz] = local(sg.pole[0], sg.pole[1]);
    g.position.set(wx, 0, wz);
    g.rotation.y = phi + (R.dir > 0 ? Math.PI : 0); // lamps face the oncoming traffic
    if (R.dir > 0) g.scale.z = -1; // keep the arm over the carriageway after the turn
    scene.add(g);
    world.createCollider(RAPIER.ColliderDesc.cylinder(2.8, 0.14).setTranslation(wx, 2.8, wz));
    // white stop line across the carriageway
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.35, Math.abs(R.edge[1] - R.edge[0]) - 0.6), new THREE.MeshStandardMaterial({ color: "#e4e2da", roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = phi;
    const [sx, sz] = local(sg.x - R.dir * 0.2, (R.edge[0] + R.edge[1]) / 2);
    line.position.set(sx, 0.024, sz);
    scene.add(line);
    return { ...sg, lamps, state: "green" };
  });
  function updateSignals(t) {
    const total = CYCLE.green + CYCLE.amber + CYCLE.red;
    for (const sg of signals) {
      const k = (((t + sg.offset) % total) + total) % total;
      sg.state = k < CYCLE.green ? "green" : k < CYCLE.green + CYCLE.amber ? "amber" : "red";
      for (const name of ["red", "amber", "green"]) sg.lamps[name].emissiveIntensity = sg.state === name ? 3.2 : 0.04;
    }
  }

  const all = [];
  const statics = [
    // the ice-cream cart and the cycle rickshaw at the far kerb
    { road: "far", x: 4.6, lat: 24.7, L: 2.2, W: 1.2, v: 0, state: "static" },
    { road: "far", x: 19.5, lat: 24.75, L: 2.6, W: 1.2, v: 0, state: "static" },
  ];
  const slots = { near: PARK_SLOTS.near.map((x) => ({ x, taken: null })), far: PARK_SLOTS.far.map((x) => ({ x, taken: null })) };
  const qY = new THREE.Quaternion();
  // collider handle -> vehicle, so the player's ray or contact can tell a car from a wall
  const colliders = new Map();
  // fender-benders: see maybeCrash. crashes keeps the recent ones ({a, b, t, x, road, done}).
  const crashes = [];
  let crashCount = 0;
  let crashCheck = 2;
  let forceNext = false;
  const CRASH_KINDS = ["hatch", "sedan", "suv", "taxi", "auto", "bus"];
  function stopCrash(veh, dur) {
    veh.state = "crash";
    veh.v = 0;
    veh.ind = 0;
    veh.stuckT = 0;
    veh.hazard = true;
    veh.crashT = dur;
    veh.slot = null;
    veh.stopX = null;
    veh.latTarget = veh.lat;
  }
  // The player standing in front of a car for a long time: its driver gets out and has a word (people.js runs it as a
  // crash with one vehicle), then gets back in once the way is clear.
  function watchBlocked(dt) {
    if (!eye) return;
    for (const veh of all) {
      if (veh.state === "crash" && veh.blockC) {
        const c = veh.blockC;
        // still in the way (in front of the car, within a lane's width)?
        const ahead = (eye[0] - veh.x) * veh.dir - veh.L / 2;
        const inWay = ahead > -0.5 && ahead < 7 && Math.abs(eye[1] - veh.lat) < veh.W / 2 + 1.3;
        if (!c.ending) {
          c.clear = inWay ? 0 : (c.clear || 0) + dt;
          if (c.clear > 1.0 || veh.crashT < 6) c.ending = true; // the way is clear: the driver goes back to the car
        } else {
          // it waits for the driver to be seated again (a safety limit in case they never arrive)
          c.endT = (c.endT || 0) + dt;
          if (c.seated || c.endT > 14) {
            veh.crashT = Math.min(veh.crashT, 0.01);
            veh.blockC = null;
            veh.carDoor = 0;
            veh.blockCool = 60; // not again for a while
          }
        }
        continue;
      }
      veh.blockCool = Math.max(0, (veh.blockCool || 0) - dt);
      if (veh.state !== "drive" || !CRASH_KINDS.includes(veh.kind) || veh.kind === "bus" || veh.v > 0.3 || veh.blockCool > 0) {
        veh.blockT = 0;
        continue;
      }
      const ahead = (eye[0] - veh.x) * veh.dir - veh.L / 2;
      const inPath = ahead > -0.2 && ahead < 4.5 && Math.abs(eye[1] - veh.lat) < veh.W / 2 + 0.6;
      veh.blockT = inPath ? (veh.blockT || 0) + dt : 0;
      if (veh.blockT > 9 && !crashes.some((c) => !c.done && c.road === veh.road && Math.abs(c.x - veh.x) < 25)) {
        stopCrash(veh, 120);
        const c = { a: veh, b: null, t: clock, x: veh.x, road: veh.road, v: 0, done: false, block: true };
        veh.blockC = c;
        crashes.push(c);
        while (crashes.length > 30) crashes.shift();
      }
    }
  }
  function maybeCrash(dt) {
    crashCheck -= dt;
    if (crashCheck > 0) return;
    crashCheck = 0.5;
    const cands = [];
    for (const f of all) {
      if (f.state !== "drive" || !CRASH_KINDS.includes(f.kind) || (!forceNext && f.v >= 4)) continue;
      for (const l of all) {
        if (l === f || l.road !== f.road || l.state !== "drive" || (!forceNext && l.v >= 4)) continue;
        const dx = (l.x - f.x) * f.dir;
        if (dx <= 0 || Math.abs(f.lat - l.lat) > ((f.W + l.W) / 2) * 0.8) continue;
        if (dx - (f.L + l.L) / 2 < (forceNext ? 40 : 8)) cands.push([f, l]);
      }
    }
    if (!cands.length) return;
    if (!forceNext && rnd() > 0.5 / 300) return; // about one eligible moment in 5 simulated minutes
    const [f, l] = cands[(rnd() * cands.length) | 0];
    if (crashes.some((c) => !c.done && c.road === f.road && Math.abs(c.x - f.x) < 40)) return;
    forceNext = false;
    f.x = l.x - l.dir * ((f.L + l.L) / 2 + 0.03); // touching: a bump at about 1.5 m/s
    f.lat = l.lat;
    f.latTarget = l.latTarget = l.lat;
    const dur = range(45, 75);
    stopCrash(f, dur);
    stopCrash(l, dur);
    crashCount++;
    crashes.push({ a: l, b: f, t: clock, x: (f.x + l.x) / 2, road: f.road, v: 1.5, done: false });
    while (crashes.length > 30) crashes.shift();
  }
  const UP = new THREE.Vector3(0, 1, 0);

  function spawn(kind, road, x, { state = "drive", lane, slot, v } = {}) {
    const R = ROADS[road];
    const T = TYPES[kind];
    const list = (pool[kind] ||= []);
    const mesh = list.pop() || build(kind);
    if (!mesh) return null; // no model for this kind (yet)
    const u = mesh.userData;
    if (u.occupants) u.occupants.refill(rnd); // a new set of passengers for this run
    if (kind !== "taxi" && kind !== "auto" && kind !== "bus" && u.paint && !u.riderSeated) u.paint.color.set(pickW(COLOURS));
    const veh = {
      kind,
      road,
      dir: R.dir,
      mesh,
      L: u.size.L,
      W: u.size.W,
      H: u.size.H,
      x,
      lat: 0,
      latTarget: 0,
      v: v ?? 0,
      v0: range(...T.v),
      aMax: T.a,
      bComf: T.b,
      prefLane: rnd() < T.prefer ? 0 : 1,
      lane: 0,
      state,
      timer: 0,
      slot: slot || null,
      stopX: null,
      stopFor: 0,
      ind: 0,
      brake: 0,
      cooldown: range(0, 2),
      think: range(0, 0.5),
      wheel: 0,
      bump: 0,
      pitch: 0,
      yaw: 0,
      wantsPark: false,
      wantsStop: kind === "auto" ? rnd() < 0.55 : kind === "bus",
      needsRider: Boolean(u.rider || u.live) && !u.riderSeated,
    };
    veh.lane = lane ?? veh.prefLane;
    veh.kerb = kind === "cycle" ? -0.5 * Math.sign(R.lanes[1] - R.lanes[0]) : 0; // cyclists keep to the kerb side of their lane
    veh.lat = veh.latTarget = state === "parked" ? R.park : R.lanes[veh.lane] + veh.kerb + (kind === "bike" ? range(-0.6, 0.6) : range(-0.12, 0.12));
    // (no car pulls in to park: see above)
    if (veh.needsRider && kit) seatRiders(veh);
    if ((u.rider || u.live) && kit) u.riderSeated = true;
    // a body for the physics, so nobody walks or rides through a vehicle
    veh.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    veh.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(veh.L / 2, veh.H / 2, Math.max(0.3, veh.W / 2)).setTranslation(0, veh.H / 2, 0), veh.body);
    colliders.set(veh.collider.handle, veh);
    scene.add(mesh);
    place(veh, 0);
    all.push(veh);
    return veh;
  }
  function despawn(veh) {
    if (veh.collider) colliders.delete(veh.collider.handle);
    scene.remove(veh.mesh);
    world.removeRigidBody(veh.body);
    if (veh.slot) veh.slot.taken = null;
    all.splice(all.indexOf(veh), 1);
    (pool[veh.kind] ||= []).push(veh.mesh);
  }

  // Nothing is left parked on the street: every car keeps moving (Captain's call, 15 Nov). The
  // parking code below stays for a later choice, but no car is parked at the start or pulls in.
  for (const road of []) {
    for (const slot of slots[road]) {
      if (rnd() < 0.62) {
        const kind = pickW([["hatch", 4], ["sedan", 3], ["suv", 3], ["taxi", 1]]);
        const v = spawn(kind, road, slot.x, { state: "parked", slot });
        if (!v) continue;
        slot.taken = v;
        v.timer = range(15, 400);
      }
    }
  }
  // traffic already on the road: made once the car models have loaded (otherwise the first cars would all be the
  // procedural ones, and the pool would keep reusing them)
  vehiclesReady().then(() => {
    for (const road of ["near", "far"]) {
      const R = ROADS[road];
      for (let i = 0; i < MAX_MOVING / 2 - 2; i++) {
        const x = R.from + (R.to - R.from) * ((i + range(0.1, 0.8)) / (MAX_MOVING / 2));
        const kind = pickW(Object.entries(TYPES).map(([k, t]) => [k, t.w]));
        if (all.some((o) => o.road === road && Math.abs(o.x - x) < 14)) continue;
        const v = spawn(kind, road, x, { v: 6 });
        if (!v) continue;
        v.v = v.v0 * 0.7;
      }
    }
  });

  // ---------- reading the road ----------
  const overlap = (a, latB, wB, margin) => Math.min(Math.abs(a.lat - latB), Math.abs(a.latTarget - latB)) < (a.W + wB) / 2 + margin;
  // nearest thing ahead in this vehicle's path: gap to it (m) and its speed along the road
  function leaderOf(veh, people) {
    let gap = Infinity;
    let vl = 0;
    let what = null;
    const margin = veh.kind === "bike" || veh.kind === "cycle" ? 0.12 : 0.28;
    const consider = (o, x, lat, L, W, v) => {
      const dx = (x - veh.x) * veh.dir;
      if (dx <= 0 || dx > 80) return;
      if (!overlap(veh, lat, W, margin)) return;
      const g = dx - (L + veh.L) / 2;
      if (g < gap) {
        gap = g;
        vl = v;
        what = o;
      }
    };
    for (const o of all) if (o !== veh && o.road === veh.road) consider(o, o.x, o.lat, o.L, o.W, o.state === "drive" || o.state === "leaving" ? o.v : 0);
    for (const o of statics) if (o.road === veh.road) consider(o, o.x, o.lat, o.L, o.W, 0);
    for (const p of people) consider(p, p.x, p.z, 0.5, p.w || 0.6, Math.max(0, (p.vx || 0) * veh.dir));
    for (const sg of signals) {
      if (sg.road !== veh.road || sg.state === "green") continue;
      const g = (sg.x - veh.x) * veh.dir - veh.L / 2;
      if (g < -0.8) continue; // already over the line
      if (sg.state === "amber" && g < (veh.v * veh.v) / (2 * 3.2)) continue; // too close to stop: go through
      if (g + 0.6 < gap) {
        gap = Math.max(0.05, g + 0.6);
        vl = 0;
        what = "stop";
      }
    }
    if (veh.stopX !== null) {
      const g = (veh.stopX - veh.x) * veh.dir - veh.L / 2;
      if (g < gap) {
        gap = Math.max(0, g + 1.2); // a stop line, not a car: pull right up to it
        vl = 0;
        what = "stop";
      }
    }
    return { gap, vl, what };
  }
  // is a lane free enough to move into?
  function laneFree(veh, lat, people) {
    for (const o of all) {
      if (o === veh || o.road !== veh.road || o.state === "parked") continue;
      if (Math.abs(o.lat - lat) > (o.W + veh.W) / 2 + 0.2 && Math.abs((o.latTarget ?? o.lat) - lat) > (o.W + veh.W) / 2 + 0.2) continue;
      const dx = (o.x - veh.x) * veh.dir;
      const ov = o.v || 0;
      if (dx >= 0) {
        if (dx - (o.L + veh.L) / 2 < 5 + veh.v * 0.6 - (ov > veh.v ? 2 : 0)) return false;
      } else if (-dx - (o.L + veh.L) / 2 < 4 + Math.max(0, ov - veh.v) * 1.6 + ov * 0.4) return false;
    }
    for (const p of people) if (Math.abs(p.z - lat) < veh.W / 2 + 0.8 && (p.x - veh.x) * veh.dir > -3 && (p.x - veh.x) * veh.dir < 20) return false;
    return true;
  }
  const idm = (veh, gap, vl, v0) => {
    const s0 = veh.kind === "bike" || veh.kind === "cycle" ? 1.2 : 1.8;
    const T = veh.kind === "bus" ? 1.4 : 1.05;
    const sStar = s0 + Math.max(0, veh.v * T + (veh.v * (veh.v - vl)) / (2 * Math.sqrt(veh.aMax * veh.bComf)));
    const free = 1 - Math.pow(Math.max(0, veh.v) / Math.max(0.5, v0), 4);
    return veh.aMax * (free - (gap < Infinity ? (sStar / Math.max(0.1, gap)) ** 2 : 0));
  };
  // desired speed, lower near the speed breaker
  function v0At(veh) {
    const front = veh.x + (veh.dir * veh.L) / 2;
    const d = (BREAKER_X - front) * veh.dir; // > 0 before the hump
    const slow = veh.kind === "bike" ? 4.2 : veh.kind === "bus" ? 2.6 : 3.3;
    if (d > -veh.L - 0.5 && d <= 0) return slow;
    if (d > 0) return Math.min(veh.v0, Math.sqrt(slow * slow + 2 * 1.4 * Math.max(0, d - 2)));
    return veh.v0;
  }

  // ---------- one step for one vehicle ----------
  function drive(veh, dt, people, t) {
    const R = ROADS[veh.road];
    veh.cooldown -= dt;
    veh.think -= dt;
    if (veh.state === "crash") {
      veh.v = 0;
      veh.ind = 0;
      veh.brake = 1;
      veh.latVel = 0;
      veh.crashT -= dt;
      if (veh.crashT <= 0) {
        veh.state = "drive";
        veh.hazard = false;
        veh.cooldown = 3;
      }
      return;
    }
    if (veh.state === "parked") {
      veh.v = 0;
      veh.timer -= dt;
      veh.ind = 0;
      if (veh.timer < 0) {
        // ready to go: indicate right and wait for a gap behind
        veh.ind = 1;
        if (veh.timer < -1.5 && laneFree(veh, R.lanes[0], people)) {
          veh.state = "leaving";
          veh.lane = 0;
          veh.latTarget = R.lanes[0];
          if (veh.slot) veh.slot.taken = null;
          veh.slot = null;
          veh.timer = 0;
        }
      }
      veh.brake = 1;
      return;
    }
    // choose what to do next, a few times a second
    if (veh.think < 0) {
      veh.think = 0.35 + rnd() * 0.3;
      // pick a parking space ahead
      if (veh.wantsPark && !veh.slot) {
        for (const slot of slots[veh.road]) {
          const ahead = (slot.x - veh.x) * veh.dir;
          // a space it can drive into: nothing parked just before it (no reversing in here)
          const before = slots[veh.road].some((o) => o !== slot && o.taken && (slot.x - o.x) * veh.dir > 0 && (slot.x - o.x) * veh.dir < veh.L + 3.2);
          if (!slot.taken && !before && ahead > 25 && ahead < 70) {
            slot.taken = veh;
            veh.slot = slot;
            veh.state = "parking";
            break;
          }
        }
      }
      // autos and buses: pull in at a stop ahead
      if (veh.wantsStop && veh.stopX === null && veh.state === "drive") {
        for (const st of STOPS[veh.road]) {
          const ahead = (st.x - veh.x) * veh.dir;
          if (st.kinds.includes(veh.kind) && ahead > 20 && ahead < 45 && rnd() < 0.7) {
            veh.stopX = st.x;
            veh.stopFor = veh.kind === "bus" ? range(8, 16) : range(4, 12);
            veh.state = "stopping";
            break;
          }
        }
      }
      // lane changes, only while moving along normally
      const enRoute = veh.state === "parking" && veh.slot && (veh.slot.x - veh.x) * veh.dir > 10;
      if ((veh.state === "drive" || veh.state === "leaving" || enRoute) && veh.cooldown < 0 && Math.abs(veh.lat - veh.latTarget) < 0.15) {
        const { gap, vl, what } = leaderOf(veh, people);
        const blocked = gap < 35 && (vl < 0.6 || (vl < veh.v0 * 0.65 && gap < 22)) && what !== "stop";
        const other = 1 - veh.lane;
        const jitter = veh.kind === "bike" ? range(-0.5, 0.5) : range(-0.1, 0.1);
        if (blocked && laneFree(veh, R.lanes[other], people)) {
          veh.lane = other;
          veh.latTarget = R.lanes[other] + jitter + veh.kerb;
          veh.cooldown = 3 + rnd() * 3;
        } else if (!blocked && veh.lane !== veh.prefLane && rnd() < 0.3) {
          const back = R.lanes[veh.prefLane];
          if (laneFree(veh, back, people)) {
            // only drift back if nothing parked or slow sits ahead in that lane soon
            const save = veh.lat;
            veh.lat = back;
            const latSave = veh.latTarget;
            veh.latTarget = back;
            const ahead = leaderOf(veh, people);
            veh.lat = save;
            veh.latTarget = latSave;
            if (ahead.gap > 45 || ahead.vl > veh.v0 * 0.8) {
              veh.lane = veh.prefLane;
              veh.latTarget = back + jitter + veh.kerb;
              veh.cooldown = 4 + rnd() * 4;
            }
          }
        }
      }
      if (veh.state === "leaving" && Math.abs(veh.lat - veh.latTarget) < 0.2) veh.state = "drive";
    }

    // parking: slow toward the space, ease to the kerb in the last metres
    if (veh.state === "parking" && veh.slot) {
      const ahead = (veh.slot.x - veh.x) * veh.dir;
      veh.stopX = veh.slot.x + (veh.dir * veh.L) / 2 - veh.dir * 0.2;
      veh.ind = -1;
      if (ahead < 7.5) {
        veh.latTarget = R.park;
        veh.lane = 0;
      }
      if (ahead < 1.3 && veh.v < 0.15 && Math.abs(veh.lat - R.park) < 0.12) {
        veh.state = "parked";
        veh.stopX = null;
        veh.timer = range(25, 240);
        veh.wantsPark = false;
        veh.lat = R.park;
      }
    }
    if (veh.state === "stopping") {
      const ahead = (veh.stopX - veh.x) * veh.dir;
      veh.ind = -1;
      if (ahead < 18) veh.latTarget = veh.kind === "bus" ? R.lanes[0] + 0.5 * Math.sign(R.lanes[1] - R.lanes[0]) : R.lanes[0] - 0.4 * Math.sign(R.lanes[1] - R.lanes[0]); // tuck in to the kerb
      if ((veh.stopX - veh.x) * veh.dir - veh.L / 2 < 1.4 && veh.v < 0.1) {
        veh.stopFor -= dt;
        veh.atStop = true;
        // it waits while anyone is still getting on or off (see people.js), up to half a minute more
        if (veh.stopFor < 0 && (!(veh.boarding > 0) || veh.stopFor < -30)) {
          veh.atStop = false;
          veh.boarding = 0;
          veh.unloaded = false;
          veh.stopX = null;
          veh.state = "leaving";
          veh.ind = 1;
          veh.lane = 0;
          veh.latTarget = R.lanes[0];
          veh.wantsStop = rnd() < 0.3;
        }
      }
    } else if (veh.state === "drive") veh.ind = Math.abs(veh.latTarget - veh.lat) > 0.3 ? Math.sign((veh.latTarget - veh.lat) * veh.dir) : 0;

    // speed: keep the gap to whatever is ahead
    const { gap, vl, what } = leaderOf(veh, people);
    if (veh.v < 0.2 && what && what !== "stop" && (what.state === "parked" || what.state === "static" || what.state === "crash")) veh.stuckT = (veh.stuckT || 0) + dt;
    else veh.stuckT = 0;
    if (veh.stuckT > (what?.state === "crash" ? 3 : 6) && veh.state === "drive") {
      if (what.state === "crash") {
        // go round the wreck when the other lane is clear
        if (laneFree(veh, R.lanes[1 - veh.lane], people)) {
          veh.stuckT = 0;
          veh.lane = 1 - veh.lane;
          veh.latTarget = R.lanes[veh.lane];
          veh.ind = Math.sign((veh.latTarget - veh.lat) * veh.dir);
        }
      } else {
        veh.stuckT = 0;
        veh.lane = 1;
        veh.latTarget = R.lanes[1];
      }
    }
    let acc = idm(veh, gap, vl, v0At(veh));
    acc = Math.max(-7.5, Math.min(veh.aMax, acc));
    if (veh.hardBrake > 0) {
      veh.hardBrake -= dt; // someone stepped right in front: stand on the brake
      acc = -9;
    }
    const vBefore = veh.v;
    veh.v = Math.max(0, veh.v + acc * dt);
    if (gap < 0.25) veh.v = 0;
    veh.brake = acc < -0.6 || (veh.v < 0.05 && vBefore < 0.2) ? 1 : 0;
    veh.x += veh.v * veh.dir * dt;
    // sideways toward the target lane, faster when moving, never while stopped dead
    const dl = veh.latTarget - veh.lat;
    if (Math.abs(dl) > 1e-3) {
      const parking = veh.state === "parking" || veh.state === "stopping" || veh.state === "leaving";
      const rate = (veh.kind === "bike" ? 1.0 : 0.65) * Math.min(1, (parking ? 0.55 : 0.15) + veh.v / 5);
      const step = Math.sign(dl) * Math.min(Math.abs(dl), rate * dt);
      veh.lat += step;
      veh.latVel = step / Math.max(dt, 1e-4);
    } else veh.latVel = 0;
    void t;
  }

  // ---------- drawing ----------
  function hump(x) {
    const d = (x - BREAKER_X) / 0.34;
    return Math.abs(d) < 1 ? 0.07 * (1 - d * d) : 0;
  }
  function place(veh, dt, t = 0) {
    const u = veh.mesh.userData;
    // heading follows the sideways drift
    const vx = Math.max(0.5, veh.v) * veh.dir;
    const want = Math.atan2(-(veh.latVel || 0), vx);
    veh.yaw += (want - veh.yaw + (Math.abs(want - veh.yaw) > Math.PI ? -Math.sign(want - veh.yaw) * 2 * Math.PI : 0)) * Math.min(1, dt * 6);
    if (dt === 0) veh.yaw = veh.dir > 0 ? 0 : Math.PI;
    // over the hump: lift and pitch from the axle heights
    const [fa, ra] = u.axles;
    const xf = veh.x + fa * veh.dir;
    const xr = veh.x + ra * veh.dir;
    const hf = hump(xf);
    const hr = hump(xr);
    veh.bump += ((hf + hr) / 2 - veh.bump) * Math.min(1, dt * 18);
    veh.pitch += (Math.atan2(hf - hr, fa - ra) - veh.pitch) * Math.min(1, dt * 14);
    const [wx, wz] = local(veh.x, veh.lat);
    const m = veh.mesh;
    m.position.set(wx, 0.014 + veh.bump, wz);
    m.rotation.set(0, phi + veh.yaw, veh.pitch);
    // rolling wheels, brake lights, indicators
    veh.wheel -= (veh.v * dt) / u.wheelR;
    u.alloy.map.rotation = veh.wheel;
    if (u.roll) u.roll(veh.v * dt);
    if (u.occupants && dt > 0 && kit && eye) {
      // real seated people for vehicles near the viewer (a few made per frame); the blocky stand-ins everywhere else
      const near = Math.hypot(veh.x - eye[0], veh.lat - eye[1]) < 60;
      u.occupants.setNear(near, (slot) => { seatBudget--; return seatCharacter(veh.mesh, slot, kit, rnd); }, Math.max(0, seatBudget));
    }
    if (u.door) {
      // the bus door opens when it has stopped for people and shuts before it moves off; a car's driver door while its driver
      // gets out or in (people.js sets veh.carDoor)
      const open = u.door.kind === "bus" ? (veh.atStop && veh.v < 0.1 ? 1 : 0) : veh.carDoor ? 1 : 0;
      veh.doorK = (veh.doorK || 0) + (open - (veh.doorK || 0)) * Math.min(1, dt * (u.door.kind === "bus" ? 2.2 : 2.8));
      u.door.set(veh.doorK);
    }
    if (u.live && u.cyclist && dt > 0 && (!eye || Math.hypot(veh.x - eye[0], veh.lat - eye[1]) < 70)) liveRider(veh, dt);
    u.tail.emissiveIntensity = veh.brake ? 2.6 : 0.3 + night * 0.9;
    const blink = Math.sin(t * 9.4) > 0 ? 2.8 : 0;
    u.indL.emissiveIntensity = veh.ind < 0 || veh.hazard ? blink : 0;
    u.indR.emissiveIntensity = veh.ind > 0 || veh.hazard ? blink : 0;
    qY.setFromAxisAngle(UP, phi + veh.yaw);
    veh.body.setNextKinematicTranslation({ x: wx, y: 0, z: wz });
    veh.body.setNextKinematicRotation(qY);
  }

  let spawnTimer = { near: 1, far: 2 };
  let struck = null; // a moving vehicle has run into the player (see update)
  let clock = 0;

  return {
    vehicles: all,
    get playerStruck() {
      return struck;
    },
    set playerStruck(v) {
      struck = v;
    },
    crashes,
    get crashCount() {
      return crashCount;
    },
    isVehicleCollider: (c) => colliders.has(c && c.handle !== undefined ? c.handle : c),
    vehicleOfCollider: (c) => colliders.get(c && c.handle !== undefined ? c.handle : c) || null,
    /** debug: the next eligible follower rear-ends its leader at once */
    forceCrash() {
      forceNext = true;
      crashCheck = 0;
    },
    /** the player rode into this vehicle: it stops, hazards on, its driver gets out */
    crashWithPlayer(veh, dur = range(20, 30)) {
      if (!veh || veh.state === "crash") return null;
      stopCrash(veh, dur);
      crashCount++;
      const c = { a: veh, b: null, t: clock, x: veh.x, road: veh.road, player: true, done: false };
      crashes.push(c);
      return c;
    },
    /** Can someone walk across this carriageway at x for the next `seconds`? */
    clearToCross(road, x, seconds = 5) {
      for (const veh of all) {
        if (veh.road !== road || veh.state === "parked") continue;
        const dx = (x - veh.x) * veh.dir;
        if (Math.abs(dx) < veh.L / 2 + 0.9) return false; // standing across the crossing
        if (dx < -veh.L / 2 - 1) continue; // already past
        if (dx < veh.L / 2 + 2.5) {
          if (veh.v > 0.3) return false; // on the crossing and moving
          continue;
        }
        if (veh.v > 0.4 && (dx - veh.L / 2) / veh.v < seconds) return false;
        if (veh.v <= 0.4 && dx < 6) continue; // stopped for us
      }
      return true;
    },
    /**
     * people: [{x, z, vx, w}] in the street's frame: anyone standing or walking on a carriageway.
     */
    signals,
    stops: STOPS,
    roads: ROADS,
    /** k: 0 by day .. 1 at night (lamps on). flow: traffic for the hour, 1 = normal daytime. */
    setTime(k, flow = 1) {
      night = k;
      busy = flow;
      setMotorcycleNight(k);
      setVehicleNight(k);
    },
    update(dt, people, t, viewer = null) {
      clock = t;
      eye = viewer;
      updateSignals(t);
      const steps = Math.ceil(dt / 0.05);
      const h = dt / steps;
      for (let i = 0; i < steps; i++) for (const veh of [...all]) drive(veh, h, people, t);
      maybeCrash(dt);
      watchBlocked(dt);
      for (const c of crashes) if (!c.done && ![c.a, c.b].some((v) => v && v.state === "crash" && all.includes(v))) c.done = true;
      seatBudget = 3;
      for (const veh of [...all]) {
        const R = ROADS[veh.road];
        if ((veh.x - R.to) * veh.dir > 0) despawn(veh);
        else place(veh, dt, clock);
      }
      // a moving vehicle that reaches the player (who is slower): the main program turns it into a crash
      if (viewer && !struck) {
        for (const veh of all) {
          if (veh.state === "parked" || veh.state === "crash" || veh.v < 3) continue;
          const gx = Math.max(0, Math.abs(viewer[0] - veh.x) - veh.L / 2);
          const gz = Math.max(0, Math.abs(viewer[1] - veh.lat) - veh.W / 2);
          if (Math.hypot(gx, gz) < 0.2) {
            struck = { veh, v: veh.v };
            break;
          }
        }
      }
      // new arrivals at the ends of the street
      for (const road of ["near", "far"]) {
        spawnTimer[road] -= dt;
        if (spawnTimer[road] > 0) continue;
        spawnTimer[road] = (range(1.4, 4.4) * (quality === "low" ? 1.6 : 1)) / Math.max(0.06, busy);
        const moving = all.filter((v) => v.state !== "parked").length;
        // how many vehicles the street holds at this hour: full at the office rush, a sixth of that
        // in the small hours
        if (moving >= MAX_MOVING * Math.max(0.12, Math.min(1, busy / 1.45))) continue;
        const R = ROADS[road];
        if (all.some((o) => o.road === road && Math.abs(o.x - R.from) < 16)) continue;
        const kind = pickW(Object.entries(TYPES).map(([k, ty]) => [k, ty.w]));
        const v = spawn(kind, road, R.from);
        if (!v) continue;
        v.v = v.v0 * 0.8;
      }
    },
  };
}
