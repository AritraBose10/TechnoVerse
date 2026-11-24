// Driveable cars: parked cars you can get into, a Rapier raycast-vehicle chassis, a real drivetrain (engine torque
// curve, clutch, manual and automatic gearboxes), lights and indicators on the car, the hero's driving pose, a
// steering wheel and three cameras. main.js only gets a few hooks (tools/drive/patch_main.py); everything else lives here.
//
// Frames used below: the car's own frame has the nose on +x, up on +y and the right-hand side on +z (the driver sits
// on the right: India). A car's world heading is mesh.rotation.y = psi, so its nose points along (cos psi, 0, -sin psi).
// The hero's own heading (me.group.rotation.y) is psi - PI/2, because the character looks along its local -z.
import { vehiclesReady, makeRealCar } from "/vehicles.js";
import { createCarHud } from "/carhud.js";
import { createCarSound } from "/carsound.js";

const DEG = Math.PI / 180;
const G0 = 9.81;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;
// piecewise-linear lookup in a [[x, y], ...] table
function table(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  }
  return pts[pts.length - 1][1];
}

// ---------- the engine and gearbox (a small Indian 1.2 litre petrol, 5-speed) ----------
const IDLE = 850;
const REDLINE = 6200;
const LIMITER = 6500; // fuel cut
const STALL = 450;
const ENGINE_INERTIA = 0.22; // kg m^2: flywheel and crank, so it revs 0 to 6000 in about a second
const TORQUE = [[0, 0], [450, 45], [850, 72], [1000, 85], [2000, 105], [3000, 115], [4000, 118], [5000, 112], [6000, 98], [6500, 85], [8000, 40]]; // Nm at full throttle
const RATIOS = [3.55, 1.9, 1.28, 0.97, 0.78]; // 1st..5th
const REVERSE = 3.25;
const FINAL = 4.1;
const EFFICIENCY = 0.88;
const fric = (rpm) => 12 + 0.0065 * rpm; // Nm of pumping and friction: this is the engine braking off the throttle
const ratioOf = (g) => (g < 0 ? -REVERSE : g === 0 ? 0 : RATIOS[g - 1]) * FINAL; // signed: reverse turns the wheels the other way
const AUTO_LABEL = ["P", "R", "N", "D"];

// ---------- the cars ----------
// kind -> chassis mass (kg) and engine torque scale; three parked cars on the near road's parking lane (street frame)
const KINDS = {
  hatch: { mass: 1000, tk: 1, label: "hatchback" },
  sedan: { mass: 1150, tk: 1, label: "sedan" },
  suv: { mass: 1350, tk: 1.3, label: "SUV" },
};
const PARKED = [
  { kind: "hatch", x: -39, color: "#9b1d20", seed: 0.15 },
  { kind: "sedan", x: -31, color: "#f1f1ef", seed: 0.1 },
  { kind: "suv", x: 24.5, color: "#23396b", seed: 0.55 },
];
const PARK_LAT = 9.55; // the near road's parking lane
const STEER_RATIO = 2.5; // steering wheel turns 2.5x the road wheels
const SUSP_REST = 0.22; // suspension rest length (m)
const SUSP_EQ = 0.15; // the length it settles at under the car's weight: the chassis origin then sits on the ground
const SUSP_K = 35;
const GROUPS = 0x0001fffd; // what the wheels' rays and the cameras' rays may hit: not people (group 2)
const CHASSIS_GROUPS = 0x0005fffd; // member of groups 1 (so the walking player is stopped by it) and 4; collides with all but group 2

export function createDriving(ctx) {
  const { THREE, RAPIER, scene, world, camera, worldInfo, keys, STEP, getHero, getMe, playerBody, placeBody, logLine, getAudio, getView, isBusy } = ctx;
  const hud = createCarHud();
  const sound = createCarSound(() => getAudio());

  const cars = []; // every parked car: { kind, spec, mesh, u, body, ctl, ... }
  const S = {
    car: null,
    phase: null, // null | "enter" | "in" | "exit"
    phaseT: 0,
    engine: "off", // off | cranking | running | stalled
    crankT: 0,
    crankNeed: 0.9,
    rpm: 0,
    thr: 0,
    brk: 0,
    fuelCut: false,
    mode: "manual",
    autoClutch: true,
    gear: 0, // manual: -1 R, 0 N, 1..5
    sel: 0, // automatic lever: 0 P, 1 R, 2 N, 3 D
    autoGear: 1,
    shiftT: 0, // seconds of the current gear change left
    shiftCool: 0,
    antiStall: 0,
    pedal: 0, // the clutch pedal (1 = down), manual without auto-clutch
    autoK: 0, // the auto-clutch's engagement 0..1
    launching: false,
    k: 1, // clutch engagement used last step (for the HUD and the sound)
    cap: 0,
    steer: 0, // road wheel angle (rad, + = left)
    ind: 0, // -1 left, +1 right
    indArm: 0,
    indYawTurn: 0,
    hazard: false,
    lights: 0,
    hb: true, // handbrake latch
    hbHold: 0,
    cam: 0,
    v: 0,
    speedAbs: 0,
    dirHold: 0,
    yawRate: 0,
    blinkT: 0,
    blinkOn: false,
    acc: 0,
    lookYaw: 0,
    lookPitch: 0,
    lookBack: false,
    chaseYaw: 0,
    chaseDist: 5.5,
    prevView: 0,
    prevPitch: 0,
    shake: 0,
    wheelAngle: 0,
    horn: false,
    tickT: 0,
    fov0: 55,
    hint: "",
    exitSpot: null,
  };
  const hudState = { kmh: 0, rpm: 0, redline: REDLINE, gear: "N", mode: "manual", autoClutch: true, engine: "off", blinkOn: false, indL: false, indR: false, hazard: false, lights: 0, handbrake: true, clutch: 0, cam: "chase", hint: "" };
  const CAMS = ["chase", "bonnet", "cockpit"];

  // ---------- the headlight (one real light, moved to whichever car is being driven) ----------
  // Created now, at intensity 0, so the shaders are built with the light in them during the loading screen
  // (a light that appears later would recompile every material in view with a visible hitch).
  const headlight = new THREE.SpotLight("#fff4dc", 0, 40, 0.55, 0.5, 2);
  headlight.castShadow = false;
  headlight.position.set(0, 0, 0);
  headlight.target.position.set(10, 0, 0);
  scene.add(headlight, headlight.target);

  // ---------- parked cars ----------
  const rndOf = (seed) => () => seed;
  function nosePoint(mesh, u) {
    // where the bodywork really ends at lamp height, found by a ray from in front (the models differ by up to 20 cm)
    const { L, W, H } = u.size;
    const rc = new THREE.Raycaster();
    mesh.updateMatrixWorld(true);
    const out = { x: L / 2 - 0.03, y: H * 0.42, z: W / 2 - 0.27 };
    const origin = new THREE.Vector3(L + 1, out.y, out.z).applyMatrix4(mesh.matrixWorld);
    const dir = new THREE.Vector3(-1, 0, 0).transformDirection(mesh.matrixWorld);
    rc.set(origin, dir);
    rc.far = L + 2;
    const targets = [];
    mesh.traverse((o) => { if (o.isMesh && o.visible && o.material && o.material.name !== "glass") targets.push(o); });
    const hit = rc.intersectObjects(targets, false)[0];
    if (hit) out.x = mesh.worldToLocal(hit.point.clone()).x - 0.005;
    return out;
  }
  function buildCar(spec, index) {
    const mesh = makeRealCar(spec.kind, spec.color, rndOf(spec.seed));
    if (!mesh) return null;
    const u = mesh.userData;
    const ks = KINDS[spec.kind];
    u.occupants.refill(() => 1); // nobody inside: no stand-in passengers
    u.occupants.setDriver(false);
    u.setLod?.(false); // the player's car always shows its full detail
    const { L, W, H } = u.size;
    const R = u.wheelR;
    const [fa, ra] = u.axles;
    const wb = fa - ra;
    const [wx, wz] = worldInfo.local(spec.x, PARK_LAT);
    const psi = worldInfo.phi; // parked nose +x of the street (dir +1), see traffic.js
    mesh.position.set(wx, 0, wz);
    mesh.rotation.set(0, psi, 0);
    scene.add(mesh);
    mesh.updateMatrixWorld(true);

    // lamps at the nose (white; they burn when the headlights are on)
    const np = nosePoint(mesh, u);
    const lampMat = new THREE.MeshStandardMaterial({ color: "#d8d8d0", emissive: "#fff2c8", emissiveIntensity: 0, roughness: 0.3 });
    const lampGeo = new THREE.BoxGeometry(0.05, 0.1, 0.22);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(lampGeo, lampMat);
      m.position.set(np.x - 0.02, np.y, s * np.z);
      mesh.add(m);
    }
    // the steering wheel: a rim and three spokes, tilted like a real column; only visible while someone drives
    const sx = wb * 0.08, sy = H * 0.27, sz = W * 0.22; // the seat (hips)
    const axis = new THREE.Vector3(-0.94, 0.34, 0).normalize(); // column direction, towards the driver
    const centre = new THREE.Vector3(sx + 0.42, sy + 0.42, sz);
    const wheel = new THREE.Group();
    const plastic = new THREE.MeshStandardMaterial({ color: "#1a1a1c", roughness: 0.6 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.016, 8, 28), plastic);
    wheel.add(rim);
    for (const a of [Math.PI / 2, Math.PI * 0.5 + (Math.PI * 2) / 3, Math.PI * 0.5 + (Math.PI * 4) / 3]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.016), plastic);
      spoke.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0);
      spoke.rotation.z = a;
      wheel.add(spoke);
    }
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.04, 14).rotateX(Math.PI / 2), plastic));
    const wheelBase = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    wheel.position.copy(centre);
    wheel.quaternion.copy(wheelBase);
    wheel.visible = false;
    mesh.add(wheel);
    // the front wheels turn with the steering: find them, and let the steering (y) act outside the roll
    const steered = [];
    mesh.traverse((o) => {
      if (!o.userData.wheel) return;
      const p = mesh.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
      if (p.x > 0) {
        o.rotation.order = "YXZ";
        steered.push(o);
      }
    });

    // ---- physics ----
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), psi);
    const hh = H * 0.35;
    const cy = 0.3 + hh; // the floor of the chassis box clears the ground by 30 cm
    const com = { x: ra + 0.55 * wb, y: 0.42, z: 0 }; // front-heavy (55 %), low
    const m = ks.mass;
    const inertia = { x: (m / 12) * (W * W + H * H), y: (m / 12) * (L * L + W * W), z: (m / 12) * (L * L + H * H) };
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(wx, 0, wz)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setAdditionalMassProperties(m, com, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setCanSleep(false)
      .setLinearDamping(0)
      .setAngularDamping(0.5);
    const body = world.createRigidBody(desc);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(L / 2 - 0.05, hh, W / 2 - 0.02).setTranslation(0, cy, 0).setDensity(0).setFriction(0.25).setRestitution(0).setCollisionGroups(CHASSIS_GROUPS),
      body,
    );
    const ctl = world.createVehicleController(body);
    ctl.setIndexForwardAxis = 0; // the nose is +x (Rapier's default is z)
    const hz = W / 2 - 0.18;
    const wheelPos = [[fa, -hz], [fa, hz], [ra, -hz], [ra, hz]]; // FL, FR, RL, RR
    wheelPos.forEach(([x, z], i) => {
      ctl.addWheel({ x, y: R + SUSP_EQ, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, SUSP_REST, R);
      // front and rear stiffness in the ratio of their loads (55/45), so the car sits level
      ctl.setWheelSuspensionStiffness(i, i < 2 ? SUSP_K * 1.1 : SUSP_K * 0.9);
      ctl.setWheelSuspensionCompression(i, 2.3);
      ctl.setWheelSuspensionRelaxation(i, 4.4);
      ctl.setWheelMaxSuspensionTravel(i, 0.15);
      ctl.setWheelMaxSuspensionForce(i, 40000);
      ctl.setWheelFrictionSlip(i, 1.1);
      ctl.setWheelSideFrictionStiffness(i, 1);
    });
    const car = {
      index, spec, ks, mesh, u, body, collider, ctl, wheelSteered: steered, steerWheel: wheel, steerAxis: axis, steerBase: wheelBase, steerCentre: centre,
      seat: new THREE.Vector3(sx, sy, sz), wb, L, W, H, R, fa, ra, lamps: lampMat,
      fixed: true, doorK: 0, doorTarget: 0, doorOpen: false,
      home: { x: wx, z: wz, psi },
      prev: { p: new THREE.Vector3(wx, 0, wz), q: q.clone() },
      cur: { p: new THREE.Vector3(wx, 0, wz), q: q.clone() },
      brakeLit: false,
    };
    cars.push(car);
    return car;
  }
  let building = false;
  function buildAll() {
    if (building || cars.length) return;
    building = true;
    vehiclesReady().then(() => {
      PARKED.forEach((s, i) => buildCar(s, i));
      building = false;
    });
  }
  buildAll();

  // ---------- near a car ----------
  const _v = new THREE.Vector3();
  function doorPoint(car, out) {
    return car.mesh.localToWorld(out.set(car.seat.x, 0, car.W / 2));
  }
  function near() {
    idleTick();
    const hero = getHero();
    const me = getMe();
    if (S.phase || !hero || !me || isBusy() || !cars.length) return null;
    const p = me.group.position;
    let best = null;
    let bd = 2.3;
    for (const c of cars) {
      if (!c.fixed) continue;
      doorPoint(c, _v);
      const d = Math.hypot(_v.x - p.x, _v.z - p.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  // ---------- idle upkeep: doors closing, lamps off, parked cars held still ----------
  let idleLast = 0;
  function idleTick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - idleLast) / 1000);
    idleLast = now;
    if (dt <= 0.004 || S.phase) return;
    animDoors(dt);
  }
  function animDoors(dt) {
    for (const c of cars) {
      if (c.doorK === c.doorTarget) continue;
      c.doorK += clamp(c.doorTarget - c.doorK, -dt * 2.2, dt * 2.2);
      c.u.door?.set(c.doorK);
    }
  }
  function setDoor(car, open) {
    if (car.doorTarget === (open ? 1 : 0)) return;
    car.doorTarget = open ? 1 : 0;
    sound.door(open);
  }

  // ---------- turning a parked car on and off ----------
  const _q = new THREE.Quaternion();
  function setLive(car) {
    car.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    car.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    car.fixed = false;
  }
  function setIdle(car) {
    const t = car.body.translation();
    const r = car.body.rotation();
    car.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    car.body.setTranslation(t, true);
    car.body.setRotation(r, true);
    car.fixed = true;
    car.mesh.position.set(t.x, t.y, t.z);
    car.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    car.mesh.updateMatrixWorld(true);
  }

  // ---------- getting in and out ----------
  function enter(car) {
    const hero = getHero();
    S.car = car;
    S.phase = "enter";
    S.phaseT = 0;
    S.engine = "off";
    S.rpm = 0;
    S.thr = S.brk = S.steer = S.pedal = S.autoK = 0;
    S.k = 1;
    S.gear = 0;
    S.sel = 0;
    S.autoGear = 1;
    S.hb = true;
    S.ind = 0;
    S.hazard = false;
    S.lights = 0;
    S.cam = 0;
    S.acc = 0;
    S.lookYaw = S.lookPitch = 0;
    S.shiftT = S.shiftCool = 0;
    S.launching = false;
    S.fov0 = camera.fov;
    setLive(car);
    setDoor(car, true);
    car.steerWheel.visible = true;
    hud.show(true);
    S.prevView = getView().yaw;
    S.prevPitch = getView().pitch;
    const psi = carYaw(car);
    S.chaseYaw = psi;
    logLine(`Getting into the ${car.ks.label}. Release the handbrake with Space.`, true);
  }
  function seat() {
    const me = getMe();
    const car = S.car;
    playerBody.collider.setEnabled(false);
    me.group.add(getHero().model);
    S.phase = "in";
    S.phaseT = 0;
    setDoor(car, false);
    const hero = getHero();
    hero.model.getObjectByName("Head")?.scale.setScalar(S.cam === 2 ? 0.001 : 1);
  }
  // the driver's side, or the kerb side if a wall or a car stands there
  function exitSpot(car) {
    const gap = car.W / 2 + 0.75;
    const tries = [gap, -gap];
    let best = null;
    for (const zz of tries) {
      const from = car.mesh.localToWorld(new THREE.Vector3(car.seat.x, 0.9, 0));
      const to = car.mesh.localToWorld(new THREE.Vector3(car.seat.x, 0.9, zz));
      const d = _v.copy(to).sub(from);
      const len = d.length();
      d.divideScalar(len);
      const hit = world.castRay(new RAPIER.Ray(from, d), len, true, undefined, GROUPS, undefined, car.body);
      const free = !hit || hit.toi > len - 0.05;
      const gnd = world.castRay(new RAPIER.Ray({ x: to.x, y: 1.6, z: to.z }, { x: 0, y: -1, z: 0 }), 3, true, undefined, GROUPS, undefined, car.body);
      const y = gnd ? 1.6 - gnd.toi : 0;
      best ||= { x: to.x, y, z: to.z };
      if (free) return { x: to.x, y, z: to.z };
    }
    return best;
  }
  function beginExit() {
    const car = S.car;
    if (S.speedAbs > 3 / 3.6) {
      logLine("Stop first to get out.", true);
      return;
    }
    S.phase = "exit";
    S.phaseT = 0;
    S.exitSpot = exitSpot(car);
    stopEngine(false);
    S.hb = true;
    S.gear = 0;
    S.sel = 0;
    S.ind = 0;
    S.hazard = false;
    S.lights = 0;
    setDoor(car, true);
    sound.stop();
    sound.horn(false);
  }
  function getOut() {
    const car = S.car;
    const me = getMe();
    const hero = getHero();
    const sp = S.exitSpot || { x: car.mesh.position.x, y: 0, z: car.mesh.position.z };
    const psi = carYaw(car);
    playerBody.collider.setEnabled(true);
    placeBody(sp.x, sp.y, sp.z);
    me.group.position.set(sp.x, sp.y, sp.z);
    me.group.rotation.y = psi - Math.PI / 2;
    hero.model.getObjectByName("Head")?.scale.setScalar(1);
    hero.update(0, { speed: 0, grounded: true, turnRate: 0, facing: me.group.rotation.y, lookAt: null, talk: 0 }); // back to a plain upright pose
    me.tag.visible = true;
    car.steerWheel.visible = false;
    car.u.indL.emissiveIntensity = car.u.indR.emissiveIntensity = 0;
    car.u.tail.emissiveIntensity = 0.3;
    car.lamps.emissiveIntensity = 0;
    headlight.intensity = 0;
    scene.add(headlight, headlight.target);
    setDoor(car, false); // shuts itself while the player walks off (idleTick)
    setIdle(car);
    camera.fov = S.fov0;
    camera.updateProjectionMatrix();
    hud.show(false);
    S.phase = null;
    S.car = null;
    logLine("Out of the car.", true);
  }

  function carYaw(car) {
    const q = car.mesh.quaternion;
    // heading psi: the nose (1,0,0) rotated by q is (cos psi, 0, -sin psi)
    const fx = 1 - 2 * (q.y * q.y + q.z * q.z);
    const fz = 2 * (q.x * q.z - q.y * q.w);
    return Math.atan2(-fz, fx);
  }

  // ---------- engine states ----------
  function stopEngine(stall) {
    S.engine = stall ? "stalled" : "off";
    S.crankT = 0;
    S.launching = false;
    if (stall) {
      sound.stall();
      logLine("The engine stalled. Hold I to restart it.", true);
    }
  }
  // can the starter turn the engine over right now (the clutch interlock, as on every modern car)
  function starterOk() {
    if (S.mode === "auto") return S.sel === 0 || S.sel === 2;
    return S.gear === 0 || S.autoClutch || S.k < 0.3;
  }
  const gearNow = () => (S.mode === "auto" ? (S.sel === 1 ? -1 : S.sel === 3 ? S.autoGear : 0) : S.gear);
  const gearLabel = () => (S.mode === "auto" ? AUTO_LABEL[S.sel] : S.gear < 0 ? "R" : S.gear === 0 ? "N" : String(S.gear));
  // engine speed (rpm) the wheels would turn it at in gear g
  const wheelRpm = (g, v, R) => (Math.abs(ratioOf(g)) * Math.abs(v) / R) * (30 / Math.PI);

  // ---------- keys ----------
  function keydown(e) {
    const code = e.code;
    if (!S.phase) {
      if (code === "KeyE" && !e.repeat) {
        const c = near();
        if (c) {
          enter(c);
          return true;
        }
      }
      return false;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (S.phase !== "in") return code === "KeyE";
    const rep = e.repeat;
    switch (code) {
      case "KeyE":
        if (!rep) beginExit();
        return true;
      case "KeyI":
        if (!rep && S.engine === "running") {
          stopEngine(false);
          logLine("Engine off.", true);
        }
        return true;
      case "Space":
        if (!rep) {
          if (S.speedAbs < 1) S.hb = !S.hb;
          else S.hbHold = 1; // moving: it is held while the key is down (see readInputs)
        }
        return true;
      case "KeyR":
        if (!rep) shift(1);
        return true;
      case "KeyF":
        if (!rep) shift(-1);
        return true;
      case "KeyK":
        if (!rep && S.mode === "manual") {
          S.autoClutch = !S.autoClutch;
          logLine(S.autoClutch ? "Auto-clutch on." : "Auto-clutch off: hold Shift for the clutch.", true);
        }
        return true;
      case "KeyM":
        if (!rep) {
          if (S.speedAbs > 0.5) logLine("Stop first to change the gearbox.", true);
          else {
            S.mode = S.mode === "manual" ? "auto" : "manual";
            S.gear = 0;
            S.sel = S.engine === "running" ? 2 : 0;
            S.autoGear = 1;
            S.launching = false;
            logLine(S.mode === "auto" ? "Automatic gearbox: P R N D." : "Manual gearbox, 5 speeds.", true);
          }
        }
        return true;
      case "KeyZ":
        if (!rep) toggleInd(-1);
        return true;
      case "KeyX":
        if (!rep) toggleInd(1);
        return true;
      case "KeyB":
        if (!rep) {
          S.hazard = !S.hazard;
          S.blinkT = 0;
        }
        return true;
      case "KeyL":
        if (!rep) S.lights = (S.lights + 1) % 3;
        return true;
      case "KeyC":
        if (!rep) {
          S.cam = (S.cam + 1) % 3;
          S.lookYaw = S.lookPitch = 0;
          getHero().model.getObjectByName("Head")?.scale.setScalar(S.cam === 2 ? 0.001 : 1);
        }
        return true;
      case "KeyH":
      case "KeyG":
        return true;
      default:
        return false;
    }
  }
  function toggleInd(d) {
    S.ind = S.ind === d ? 0 : d;
    S.indArm = 0;
    S.indYawTurn = 0;
    S.blinkT = 0;
  }
  function shift(dir) {
    const v = S.v;
    if (S.mode === "auto") {
      const to = clamp(S.sel + dir, 0, 3);
      if (to === S.sel) return;
      if ((to === 0 || to === 1) && S.speedAbs > 1.5) return logLine("Slow down before selecting " + AUTO_LABEL[to] + ".", true);
      if (to === 3 && v < -1.5) return logLine("Stop before selecting D.", true);
      S.sel = to;
      S.autoGear = 1;
      S.shiftT = 0.3;
      return;
    }
    const to = clamp(S.gear + dir, -1, 5);
    if (to === S.gear) return;
    const clutchOpen = S.autoClutch || S.k < 0.3;
    if (!clutchOpen && (S.engine === "running" || S.speedAbs > 0.5)) {
      sound.gearGrind();
      return logLine("Grrr: press the clutch (Shift) to change gear.", true);
    }
    if ((to < 0 && v > 1.5) || (to > 0 && v < -1.5)) {
      sound.gearGrind();
      return logLine("Grrr: stop before changing direction.", true);
    }
    if (to !== 0 && wheelRpm(to, v, S.car.R) > 7000) {
      sound.gearGrind();
      return logLine("Too fast for that gear.", true);
    }
    S.gear = to;
    S.shiftT = S.autoClutch ? 0.25 : 0.12;
    S.launching = false;
  }

  // ---------- inputs, read once a frame ----------
  const inp = { w: false, s: false, steer: 0, hb: false, clutch: false };
  function readInputs(on) {
    const k = (a, b) => keys.has(a) || (b && keys.has(b));
    inp.w = on && k("KeyW", "ArrowUp");
    inp.s = on && k("KeyS", "ArrowDown");
    inp.steer = on ? (k("KeyA", "ArrowLeft") ? 1 : 0) - (k("KeyD", "ArrowRight") ? 1 : 0) : 0;
    inp.clutch = on && S.mode === "manual" && !S.autoClutch && (keys.has("ShiftLeft") || keys.has("ShiftRight"));
    inp.hb = Boolean(on && S.hbHold && keys.has("Space"));
    if (!keys.has("Space")) S.hbHold = 0;
    inp.starter = on && keys.has("KeyI");
    inp.back = on && keys.has("KeyG");
    const h = on && keys.has("KeyH");
    if (h !== S.horn) {
      S.horn = h;
      sound.horn(h);
    }
  }

  // ---------- one fixed physics step ----------
  function step(dt) {
    const car = S.car;
    const body = car.body;
    const ctl = car.ctl;
    const u = car.u;
    const R = car.R;
    const q = body.rotation();
    const lv = body.linvel();
    const fx = 1 - 2 * (q.y * q.y + q.z * q.z);
    const fy = 2 * (q.x * q.y + q.z * q.w);
    const fz = 2 * (q.x * q.z - q.y * q.w);
    const v = lv.x * fx + lv.y * fy + lv.z * fz;
    S.v = v;
    S.speedAbs = Math.abs(v);
    S.yawRate = body.angvel().y;
    const drive = S.phase === "in";
    const auto = S.mode === "auto";

    // --- pedals
    let thrKey = inp.w;
    let brkKey = inp.s;
    if (auto && S.sel === 1) {
      thrKey = inp.s; // in reverse the pedals swap keys: S is the gas, W stops you
      brkKey = inp.w;
    }
    // standstill: hold S for R or W for D (automatic), 0.4 s
    if (auto && drive && S.speedAbs < 0.8) {
      const toR = inp.s && S.sel !== 1;
      const toD = inp.w && (S.sel === 1 || S.sel === 0 || S.sel === 2);
      if (toR || toD) {
        S.dirHold += dt;
        if (S.dirHold > 0.4) {
          S.sel = toR ? 1 : 3;
          S.autoGear = 1;
          S.dirHold = 0;
          S.shiftT = 0.3;
          logLine(toR ? "Reverse." : "Drive.", true);
        }
      } else S.dirHold = 0;
    } else S.dirHold = 0;
    S.thr += ((thrKey ? 1 : 0) - S.thr) * Math.min(1, dt * (thrKey ? 4.5 : 12));
    S.brk += ((brkKey ? 1 : 0) - S.brk) * Math.min(1, dt * (brkKey ? 7 : 14));
    if (S.thr < 0.002) S.thr = 0;
    if (S.brk < 0.002) S.brk = 0;

    // --- starter
    if (S.engine === "off" || S.engine === "stalled" || S.engine === "cranking") {
      if (inp.starter && drive && starterOk()) {
        if (S.engine !== "cranking") {
          S.engine = "cranking";
          S.crankT = 0;
          S.crankNeed = 0.7 + Math.random() * 0.5;
          sound.crank(true);
        }
        S.crankT += dt;
        S.rpm = lerp(S.rpm, 230 + 40 * Math.sin(S.crankT * 80), Math.min(1, dt * 10));
        if (S.crankT >= S.crankNeed) {
          S.engine = "running";
          S.rpm = 1150; // the engine catches and flares a little
          sound.crank(false);
        }
      } else if (S.engine === "cranking") {
        S.engine = "off";
        sound.crank(false);
        if (inp.starter && drive && !starterOk()) logLine(auto ? "Select P or N to start." : "Press the clutch (Shift) or select neutral to start.", true);
      } else if (inp.starter && drive && !starterOk() && !S.warnStart) {
        S.warnStart = true;
        logLine(auto ? "Select P or N to start." : "Press the clutch (Shift) or select neutral to start.", true);
      }
      if (!inp.starter) S.warnStart = false;
    }

    // --- gear, shifting
    S.shiftT = Math.max(0, S.shiftT - dt);
    S.shiftCool = Math.max(0, S.shiftCool - dt);
    S.antiStall = Math.max(0, S.antiStall - dt);
    if (auto && S.sel === 3) autoShift(v, R);
    const g = gearNow();
    const G = ratioOf(g);

    // --- clutch
    let k;
    if (auto) {
      k = S.sel === 1 || S.sel === 3 ? 1 : 0;
      S.k = k;
    } else if (S.autoClutch) {
      const wr = wheelRpm(g, v, R);
      let target = S.autoK;
      if (g === 0) target = 0;
      else if (S.shiftT > 0) target = 0;
      else if (S.rpm < 700 && S.engine === "running" && S.autoK > 0.05) {
        // anti-stall: the car is held back (handbrake, a wall) and the engine is being dragged down: let go
        target = 0;
        S.launching = false;
        S.antiStall = 0.6;
      } else if (S.antiStall > 0) target = 0;
      else {
        if (S.launching) target = 1;
        if (wr >= 950) target = 1;
        else if (wr < 800 && !S.launching) target = 0;
        if (!S.launching && S.autoK < 0.5 && S.thr > 0.05 && S.rpm > 1300 && S.engine === "running") S.launching = true;
        if (S.launching && (S.thr < 0.02 || S.autoK > 0.98)) S.launching = false;
        if (S.launching) target = 1;
      }
      // closes in 0.6 s (0.25 s after a shift); opens quickly
      const rate = target > S.autoK ? (S.shiftCool > 0 || S.launching ? 1 / 0.6 : 1 / 0.25) : 1 / 0.12;
      S.autoK += clamp(target - S.autoK, -rate * dt, rate * dt);
      if (S.shiftT > 0) S.autoK = Math.min(S.autoK, 0.02);
      k = S.autoK;
      S.k = k;
    } else {
      S.pedal += clamp((inp.clutch ? 1 : 0) - S.pedal, -dt * 1.4, dt * 5.5);
      k = 1 - S.pedal;
      S.k = k;
    }

    // --- engine torque and the clutch
    const running = S.engine === "running";
    let cap = 0;
    if (g !== 0) {
      if (auto) cap = Math.min(420, 26 * (S.rpm / IDLE) ** 2) * (S.shiftT > 0 ? 0.25 : 1);
      else cap = 280 * smooth(0.15, 0.8, k);
    }
    S.cap = cap;
    const wasRpm = S.rpm;
    let omegaE = S.rpm * (Math.PI / 30);
    let force = 0; // total drive force at the front axle (N)
    if (S.engine === "cranking") {
      omegaE = S.rpm * (Math.PI / 30);
    } else {
      let Te;
      if (running) {
        if (S.fuelCut ? S.rpm < LIMITER - 150 : S.rpm > LIMITER) S.fuelCut = !S.fuelCut;
        const thrEff = S.fuelCut ? 0 : S.thr * (S.shiftT > 0 && (auto || S.autoClutch) ? 0.35 : 1) * (g < 0 ? 1 - smooth(5.5, 7.5, -v) : 1); // reversing tops out near 27 km/h
        const full = table(TORQUE, S.rpm) * car.ks.tk;
        Te = full * thrEff - fric(S.rpm) * (1 - thrEff);
        if (S.rpm < IDLE * 1.15) Te += clamp(fric(S.rpm) + 0.6 * (IDLE - S.rpm), 0, 120) * (1 - thrEff); // idle governor
      } else Te = -fric(S.rpm) * (S.engine === "off" && S.rpm < 1 ? 0 : 1);
      const free = omegaE + (Te / ENGINE_INERTIA) * dt;
      if (cap > 0.5) {
        const wheelOmega = (v / R) * G; // where the wheels want the engine to be
        const slip = free - wheelOmega;
        const Iref = (car.ks.mass * 1.08 * R * R) / (G * G);
        const need = slip / (dt * (1 / ENGINE_INERTIA + 1 / Iref));
        const Tc = clamp(need, -cap, cap);
        omegaE = free - (Tc / ENGINE_INERTIA) * dt;
        if (running && S.shiftT > 0 && (auto || S.autoClutch) && S.k < 0.3) omegaE = lerp(omegaE, Math.abs(wheelOmega), Math.min(1, dt * 12));
        force = (Tc * G * EFFICIENCY) / R;
      } else {
        omegaE = free;
        // a gear change with the auto-clutch (or the automatic): the engine settles to the speed of the next gear
        if (running && S.shiftT > 0 && g !== 0 && (auto || S.autoClutch)) omegaE = lerp(omegaE, Math.abs((v / R) * G), Math.min(1, dt * 12));
      }
      omegaE = Math.max(0, omegaE);
      S.rpm = omegaE * (30 / Math.PI);
      if (running && S.rpm < 150 && cap < 0.5) S.rpm = 150;
      if (!running) S.rpm = Math.max(0, S.rpm - 1500 * dt * (cap > 0.5 ? 0 : 1));
      if (running && S.autoClutch && !auto && S.rpm < 520) S.rpm = 520; // the auto-clutch never lets the engine die (it opens the clutch first, see anti-stall)
      if (running && !auto && !S.autoClutch && g !== 0 && cap > 60 && S.rpm < STALL) {
        stopEngine(true);
        S.rpm = Math.max(0, wasRpm * 0.8);
      }
    }
    // the engine's torque at the wheels never pushes a standing car the wrong way
    if (S.speedAbs < 0.15 && force * Math.sign(G || 1) < 0 && g !== 0) force = 0;

    // --- handbrake auto-release: a firm push on the gas in gear lifts the latch (with a note), so a first drive is not
    // a fight with the brake you forgot; the clutch pedal being down (manual) means you are not pulling away
    if (S.hb && drive && S.thr > 0.4 && g !== 0 && running && (auto || S.autoClutch || S.k > 0.3)) {
      S.hbPush = (S.hbPush || 0) + dt;
      if (S.hbPush > 0.35) {
        S.hb = false;
        S.hbPush = 0;
        logLine("Handbrake off.", true);
      }
    } else S.hbPush = 0;
    const hb = S.hb || inp.hb || (auto && S.sel === 0 && drive);

    // --- steering: speed-sensitive lock, rate-limited, self-centring
    const va = S.speedAbs;
    const lock = (8 + 27 * Math.exp(-va / 6.5)) * DEG;
    const gripAngle = Math.atan((1.1 * G0 * car.wb) / (va * va + 1));
    const maxA = Math.min(lock, Math.max(gripAngle * 1.5, 6 * DEG));
    const want = inp.steer * maxA;
    const rate = (inp.steer ? 85 : 140) * DEG * (1 - 0.5 * smooth(5, 30, va));
    S.steer += clamp(want - S.steer, -rate * dt, rate * dt);

    // --- wheel forces
    const m = car.ks.mass;
    ctl.setWheelSteering(0, S.steer);
    ctl.setWheelSteering(1, S.steer);
    const brakeOn = S.brk > 0.1;
    const driveForce = brakeOn || !drive ? 0 : force * 0.5;
    ctl.setWheelEngineForce(0, driveForce);
    ctl.setWheelEngineForce(1, driveForce);
    ctl.setWheelEngineForce(2, 0);
    ctl.setWheelEngineForce(3, 0);
    // brake impulse per wheel per step for the decel wanted (0.9 g at most, 65 % on the front axle)
    const impulse = (decel) => (m * decel * dt) / 4;
    const bFront = impulse(0.9 * G0 * 1.3 * S.brk);
    const bRear = impulse(0.9 * G0 * 0.7 * S.brk);
    let rearHb = hb ? impulse(0.6 * G0) * 2 : 0;
    if (auto && S.sel === 0 && drive) {
      // P: the parking pawl locks the wheels
      ctl.setWheelBrake(0, impulse(1.2 * G0));
      ctl.setWheelBrake(1, impulse(1.2 * G0));
    } else {
      ctl.setWheelBrake(0, bFront);
      ctl.setWheelBrake(1, bFront);
    }
    ctl.setWheelBrake(2, Math.max(bRear, rearHb));
    ctl.setWheelBrake(3, Math.max(bRear, rearHb));
    // brake lamps follow the pedal
    car.brakeLit = S.brk > 0.1;

    // --- rolling resistance and air drag (the raycast wheels have none of their own)
    {
      const roll = 150 * Math.tanh(va / 0.4) + 0.42 * va * va;
      const jI = Math.min(roll * dt, m * va); // never reverses the car
      const flat = Math.hypot(lv.x, lv.z);
      if (flat > 0.01) body.applyImpulse({ x: (-lv.x / flat) * jI, y: 0, z: (-lv.z / flat) * jI }, true);
    }
    // indicators cancel themselves after the turn
    if (S.ind) {
      const dirYaw = S.ind < 0 ? S.yawRate : -S.yawRate;
      S.indYawTurn = (S.indYawTurn || 0) + dirYaw * dt;
      const turned = S.indYawTurn > 40 * DEG || Math.abs(S.steer) * STEER_RATIO > 60 * DEG;
      if (turned) S.indArm = 1;
      const back = S.ind < 0 ? S.steer < 0.02 : S.steer > -0.02;
      if (S.indArm && back) {
        S.ind = 0;
        S.indArm = 0;
        S.indYawTurn = 0;
      }
    } else S.indYawTurn = 0;

    ctl.updateVehicle(dt, undefined, GROUPS);
    world.step();
    // keep the picture of the world with the last two physics states (interpolated when drawing)
    car.prev.p.copy(car.cur.p);
    car.prev.q.copy(car.cur.q);
    const t = body.translation();
    const r = body.rotation();
    car.cur.p.set(t.x, t.y, t.z);
    car.cur.q.set(r.x, r.y, r.z, r.w);
    if (t.y < -15) respawn(car);
  }
  function respawn(car) {
    car.body.setTranslation({ x: car.home.x, y: 0.2, z: car.home.z }, true);
    const q = _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.home.psi);
    car.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    car.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  // automatic gearbox: the shift schedule (light throttle up early, full throttle near the redline, kickdown)
  function autoShift(v, R) {
    if (S.shiftCool > 0 || S.shiftT > 0) return;
    const g = S.autoGear;
    const thr = S.thr;
    if (S.speedAbs < 0.6 && thr < 0.05) {
      S.autoGear = 1;
      return;
    }
    const up = 2400 + 3400 * thr;
    if (g < 5 && S.rpm >= up && v > 0 && S.engine === "running") {
      S.autoGear = g + 1;
      S.shiftT = 0.3;
      S.shiftCool = 0.9;
      return;
    }
    const wr = wheelRpm(g, v, R);
    const lowRpm = wheelRpm(g - 1, v, R);
    const kickdown = thr > 0.85 && lowRpm < 5600 && S.rpm < 3400 + 600 * (g - 2);
    if (g > 1 && (wr < 900 + 700 * thr || kickdown)) {
      S.autoGear = g - 1;
      S.shiftT = 0.3;
      S.shiftCool = 0.7;
    }
  }

  // ---------- the hero in the seat ----------
  const _w = { saddle: new THREE.Vector3(), gripL: new THREE.Vector3(), gripR: new THREE.Vector3(), pedalL: new THREE.Vector3(), pedalR: new THREE.Vector3(), groundL: new THREE.Vector3(), groundR: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), back: new THREE.Vector3() };
  const _qq = new THREE.Quaternion();
  const _rim = new THREE.Vector3();
  const U1 = new THREE.Vector3(0, 0, 1);
  const U2 = new THREE.Vector3();
  function steerWheelPose(car, wheelAngle) {
    // wheel plane basis: u1 to the driver's right, u2 up the wheel (tilted forward with the column)
    U2.crossVectors(car.steerAxis, U1);
    _qq.setFromAxisAngle(car.steerAxis, wheelAngle).multiply(car.steerBase);
    car.steerWheel.quaternion.copy(_qq);
  }
  function rimPoint(car, alpha, wheelAngle, out) {
    const a = alpha + wheelAngle;
    out.copy(car.steerCentre).addScaledVector(U1, Math.cos(a) * 0.18).addScaledVector(U2, Math.sin(a) * 0.18);
    return car.mesh.localToWorld(out);
  }
  function heroPose(dt) {
    const car = S.car;
    const hero = getHero();
    const me = getMe();
    const mesh = car.mesh;
    mesh.updateMatrixWorld(true);
    const s = car.seat;
    const wheelAngle = S.steer * STEER_RATIO;
    steerWheelPose(car, wheelAngle);
    mesh.localToWorld(_w.saddle.set(s.x, s.y, s.z));
    rimPoint(car, Math.PI - 0.5, wheelAngle, _w.gripL);
    rimPoint(car, 0.5, wheelAngle, _w.gripR);
    mesh.localToWorld(_w.pedalL.set(s.x + 0.78, 0.25, s.z - 0.1));
    mesh.localToWorld(_w.pedalR.set(s.x + 0.78, 0.25, s.z + 0.1));
    _w.groundL.copy(_w.pedalL);
    _w.groundR.copy(_w.pedalR);
    const q = mesh.getWorldQuaternion(_qq);
    _w.right.set(0, 0, 1).applyQuaternion(q);
    _w.up.set(0, 1, 0).applyQuaternion(q);
    _w.back.set(-1, 0, 0).applyQuaternion(q);
    hero.update(dt, {
      speed: 0,
      grounded: true,
      turnRate: 0,
      facing: me.group.rotation.y,
      lookAt: null,
      talk: 0,
      ride: { ..._w, crank: 0.6, effort: 0, footDown: 0, backing: 0, posture: 0.05 },
    });
    if (S.cam === 2) hero.model.getObjectByName("Head")?.scale.setScalar(0.001); // no head in our own view
  }

  // ---------- the frame ----------
  const _pq = new THREE.Quaternion();
  function frame(dt) {
    const car = S.car;
    const hero = getHero();
    const me = getMe();
    if (!car || !hero || !me) return;
    dt = Math.min(dt, 0.1);
    S.phaseT += dt;
    if (S.phase === "enter" && S.phaseT >= 0.55) seat();
    else if (S.phase === "exit" && S.phaseT >= 0.45) {
      getOut();
      return;
    }
    const drive = S.phase === "in";
    readInputs(drive);
    S.acc += dt;
    let n = 0;
    while (S.acc >= STEP && n < 6) {
      S.acc -= STEP;
      step(STEP);
      n++;
    }
    if (S.acc > STEP) S.acc = 0;
    // pose the mesh from the two latest physics states
    const a = S.acc / STEP;
    car.mesh.position.lerpVectors(car.prev.p, car.cur.p, a);
    car.mesh.quaternion.slerpQuaternions(car.prev.q, car.cur.q, a);
    car.mesh.updateMatrixWorld(true);
    const psi = carYaw(car);
    me.group.position.set(car.mesh.position.x, car.mesh.position.y, car.mesh.position.z);
    me.group.rotation.y = psi - Math.PI / 2;
    // wheels roll and steer
    S.wheelAngle -= (S.v * dt) / car.R;
    car.u.alloy.map.rotation = S.wheelAngle;
    for (const w of car.wheelSteered) w.rotation.y = S.steer;
    animDoors(dt);
    if (S.phase === "enter") hero.update(dt, { speed: 0, grounded: true, turnRate: 0, facing: me.group.rotation.y, lookAt: null, talk: 0 });
    else heroPose(dt);

    // lights
    S.blinkT += dt;
    const on = Math.floor(S.blinkT * 3) % 2 === 0; // 1.5 Hz
    const blinking = S.ind !== 0 || S.hazard;
    if (blinking && on !== S.blinkOn) sound.tick();
    S.blinkOn = blinking ? on : false;
    const u = car.u;
    u.indL.emissiveIntensity = S.blinkOn && (S.ind < 0 || S.hazard) ? 2.8 : 0;
    u.indR.emissiveIntensity = S.blinkOn && (S.ind > 0 || S.hazard) ? 2.8 : 0;
    u.tail.emissiveIntensity = car.brakeLit ? 2.6 : 0.3 + (S.lights ? 0.9 : 0);
    car.lamps.emissiveIntensity = S.lights ? (S.lights === 2 ? 3 : 1.8) : 0;
    if (headlight.parent !== car.mesh) {
      car.mesh.add(headlight, headlight.target);
      headlight.position.set(car.L / 2 - 0.1, 0.65, 0);
      headlight.target.position.set(car.L / 2 + 20, 0.2, 0);
    }
    headlight.intensity = S.lights ? (S.lights === 2 ? 1400 : 700) : 0;
    headlight.distance = S.lights === 2 ? 70 : 30;
    headlight.angle = S.lights === 2 ? 0.34 : 0.55;

    // sound and HUD
    sound.set({ rpm: S.rpm, throttle: S.thr, running: S.engine === "running" });
    hudState.kmh = S.speedAbs * 3.6;
    hudState.rpm = S.rpm;
    hudState.gear = gearLabel();
    hudState.mode = S.mode;
    hudState.autoClutch = S.autoClutch;
    hudState.engine = S.engine;
    hudState.blinkOn = S.blinkOn;
    hudState.indL = S.ind < 0;
    hudState.indR = S.ind > 0;
    hudState.hazard = S.hazard;
    hudState.lights = S.lights;
    hudState.handbrake = S.hb || inp.hb || (S.mode === "auto" && S.sel === 0);
    hudState.clutch = S.mode === "manual" ? (S.autoClutch ? 1 - S.autoK : S.pedal) : 0;
    hudState.cam = CAMS[S.cam];
    hudState.hint = hint();
    hud.update(hudState);
  }

  // ---------- cameras (run after main.js has placed its own, and replace it) ----------
  const _look = new THREE.Vector3();
  const _cam = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const fixedOnly = (c) => {
    const p = c.parent();
    return !p || p.isFixed();
  };
  let camReach = 5.5;
  function cameraStep(dt) {
    const car = S.car;
    const me = getMe();
    if (!car || S.phase === "enter") return;
    const view = getView();
    // the mouse drag looks around (cockpit +-100 degrees); it eases back to the front when let go
    const dy = view.yaw - S.prevView;
    const dp = view.pitch - S.prevPitch;
    S.prevView = view.yaw;
    S.prevPitch = view.pitch;
    if (view.dragging && Math.abs(dy) < 0.6) {
      S.lookYaw = clamp(S.lookYaw - dy, -100 * DEG, 100 * DEG);
      S.lookPitch = clamp(S.lookPitch - dp, -0.6, 0.6);
    } else if (!view.dragging) {
      S.lookYaw *= Math.exp(-dt * 2.5);
      S.lookPitch *= Math.exp(-dt * 2.5);
    }
    const back = keys.has("KeyG") ? Math.PI : 0;
    S.lookBack = lerpAngle(S.lookBack || 0, back, 1 - Math.exp(-dt * 10));
    const psi = carYaw(car);
    const mesh = car.mesh;
    let fov = 60;
    const kmh = S.speedAbs * 3.6;
    if (S.cam === 0) {
      // chase: behind and above, the heading followed with a spring
      S.chaseYaw = lerpAngle(S.chaseYaw, psi, 1 - Math.exp(-dt * 3.2));
      const yaw = S.chaseYaw - S.lookYaw + S.lookBack;
      const fx = Math.cos(yaw), fz = -Math.sin(yaw);
      _p.set(mesh.position.x, mesh.position.y, mesh.position.z);
      _look.set(_p.x + fx * 3, _p.y + 1.15 + S.lookPitch * -2, _p.z + fz * 3);
      const from = { x: _p.x, y: _p.y + 1.3, z: _p.z };
      const want = { x: _p.x - fx * S.chaseDist, y: _p.y + 1.9 + S.lookPitch * 3, z: _p.z - fz * S.chaseDist };
      _dir.set(want.x - from.x, want.y - from.y, want.z - from.z);
      const len = _dir.length();
      _dir.divideScalar(len);
      const hit = world.castRay(new RAPIER.Ray(from, _dir), len + 0.3, true, undefined, GROUPS, undefined, car.body, fixedOnly);
      const reach = hit ? Math.max(0.8, hit.toi - 0.3) : len;
      camReach += (reach - camReach) * (reach < camReach ? 1 : 1 - Math.exp(-dt * 5));
      _cam.set(from.x + _dir.x * camReach, from.y + _dir.y * camReach, from.z + _dir.z * camReach);
      me.tag.visible = camReach > 2.6;
    } else if (S.cam === 1) {
      // bonnet: on the bonnet, looking forward
      fov = 65;
      mesh.localToWorld(_cam.set(car.L / 2 - 0.9, car.H * 0.58 + 0.15, 0));
      const yaw = psi - S.lookYaw * 0.4 + S.lookBack;
      _look.set(_cam.x + Math.cos(yaw) * 10, _cam.y + 0.2 + S.lookPitch * 6, _cam.z - Math.sin(yaw) * 10);
      me.tag.visible = false;
    } else {
      // cockpit: the driver's eyes, mouse look allowed
      fov = 70;
      mesh.localToWorld(_cam.set(car.seat.x + 0.05, car.seat.y + 0.68, car.seat.z));
      const yaw = psi - S.lookYaw + S.lookBack;
      const pitch = S.lookPitch;
      _look.set(_cam.x + Math.cos(yaw) * Math.cos(pitch) * 10, _cam.y + Math.sin(pitch) * 10, _cam.z - Math.sin(yaw) * Math.cos(pitch) * 10);
      me.tag.visible = false;
    }
    S.shake = Math.max(0, (kmh - 60) / 100) * 0.03;
    if (S.shake > 0) {
      _cam.x += (Math.random() - 0.5) * S.shake;
      _cam.y += (Math.random() - 0.5) * S.shake;
      _cam.z += (Math.random() - 0.5) * S.shake;
    }
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt * 8));
      camera.updateProjectionMatrix();
    }
    if (S.free) {
      _cam.set(S.free[0], S.free[1], S.free[2]);
      _look.set(S.free[3], S.free[4], S.free[5]);
    }
    camera.position.copy(_cam);
    camera.up.set(0, 1, 0);
    camera.lookAt(_look);
  }

  function hint() {
    if (!S.phase) {
      const c = near();
      return c ? `E to get into the ${c.ks.label}` : "";
    }
    if (S.phase !== "in") return "";
    if (S.engine === "cranking") return "Cranking…";
    if (S.engine === "off" || S.engine === "stalled") {
      if (!starterOk()) return S.mode === "auto" ? "Select P or N (R/F) to start" : "Hold Shift (clutch) or select N to start";
      return (S.engine === "stalled" ? "Stalled: hold I to restart" : "Hold I to start the engine") + " · E out";
    }
    if (S.hb) return "Space: handbrake off · W: gas";
    return S.mode === "auto" ? "W gas · S brake · R/F P-R-N-D · M manual" : "W gas · S brake · R/F gears · M auto";
  }

  return {
    get active() {
      return S.phase !== null;
    },
    near,
    hint,
    keydown,
    frame,
    camera: cameraStep,
    streetExtra(lx, lz, vx, vz) {
      return { x: lx, z: lz, r: 1.0, w: 1.8, vx, vz, riding: true };
    },
    debug() {
      const c = S.car;
      return {
        // fast-forward for tests on a slow software renderer: runs the driving frame without drawing
        // put the car in the street frame (x along, lat across) heading along it at speed v (m/s)
        // a fixed camera in world coordinates, for screenshots (null to go back to the car's cameras)
        freeCam(...v) {
          S.free = v.length === 6 ? v : null;
        },
        place(x, lat, v = 0) {
          if (!c) return;
          const [wx, wz] = worldInfo.local(x, lat);
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), worldInfo.phi);
          c.body.setTranslation({ x: wx, y: 0.05, z: wz }, true);
          c.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
          c.body.setLinvel({ x: Math.cos(worldInfo.phi) * v, y: 0, z: -Math.sin(worldInfo.phi) * v }, true);
          c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          c.cur.p.set(wx, 0.05, wz);
          c.prev.p.copy(c.cur.p);
          c.cur.q.copy(q);
          c.prev.q.copy(q);
        },
        sim(seconds, dt = 1 / 30) {
          for (let t = 0; t < seconds && S.phase; t += dt) frame(dt);
        },
        active: S.phase !== null,
        phase: S.phase,
        kmh: +(S.speedAbs * 3.6).toFixed(1),
        v: +S.v.toFixed(2),
        rpm: Math.round(S.rpm),
        gear: gearLabel(),
        gearNum: gearNow(),
        engine: S.engine,
        clutch: +(1 - S.k).toFixed(2),
        k: +S.k.toFixed(2),
        mode: S.mode,
        autoClutch: S.autoClutch,
        throttle: +S.thr.toFixed(2),
        brake: +S.brk.toFixed(2),
        steer: +(S.steer / DEG).toFixed(1),
        handbrake: S.hb,
        ind: S.ind,
        hazard: S.hazard,
        blinkOn: S.blinkOn,
        indL: c ? +c.u.indL.emissiveIntensity.toFixed(2) : 0,
        indR: c ? +c.u.indR.emissiveIntensity.toFixed(2) : 0,
        lights: S.lights,
        cam: CAMS[S.cam],
        x: c ? c.mesh.position.x : null,
        y: c ? c.mesh.position.y : null,
        z: c ? c.mesh.position.z : null,
        heading: c ? carYaw(c) : null,
        upY: c ? +(1 - 2 * (c.mesh.quaternion.x ** 2 + c.mesh.quaternion.z ** 2)).toFixed(3) : null,
        susp: c ? [0, 1, 2, 3].map((i) => +c.ctl.wheelSuspensionLength(i).toFixed(3)) : null,
        contact: c ? [0, 1, 2, 3].map((i) => c.ctl.wheelIsInContact(i)) : null,
        cars: cars.map((p) => ({ kind: p.spec.kind, label: p.ks.label, x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z, heading: carYaw(p), fixed: p.fixed })),
      };
    },
  };
}
