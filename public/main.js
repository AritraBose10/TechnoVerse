import * as THREE from "three";
import RAPIER from "/vendor/rapier.es.js";
import { buildWorld } from "/world.js";
import { loadCharacterKit, loadCrowdBody, makeCharacter } from "/character.js";
import { buildBicycle, newRide, stepBike, BICYCLE_KINDS } from "/bicycle.js";
import { buildDaylight } from "/daylight.js";
import { buildMotorcycle, MOTORCYCLE_KINDS, MOTORCYCLE_DESIGNS, makeEngineSound, setMotorcycleNight } from "/motorcycle.js";
import { buildTraffic } from "/traffic.js";
import { buildPeople } from "/people.js";
import { loadCrowdBodies, crowdBodies } from "/crowdbodies.js";
import { EffectComposer } from "/vendor/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "/vendor/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "/vendor/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "/vendor/jsm/postprocessing/OutputPass.js";

await RAPIER.init(); // loads the physics engine (WebAssembly)

// ---------- Settings ----------
const CHAT_BUBBLE_MS = 5000;
const VOICE_CONNECT = 20; // metres: start a voice link when closer than this
const VOICE_DROP = 26; // metres: drop the link when farther than this
const NEARBY_RANGE = 20; // metres: who shows in the "Nearby" list
const MAX_VOICE_PEERS = 8; // direct browser-to-browser links; keep small
const WALK_SPEED = 1.9; // a relaxed human walk, metres a second
const RUN_SPEED = 4.8; // a steady run
const GRAVITY = 9.81; // real gravity: jumps and falls take the time they take in life
// A person standing still clears about 45 cm with a two-footed jump; off a run, a little more.
const JUMP_HEIGHT = { stand: 0.45, run: 0.55 };
const STEP = 1 / 60; // physics runs at a fixed 60 steps a second
const BODY_HALF = 0.5; // capsule: half height of the straight part
const BODY_RADIUS = 0.4;
const BODY_CENTRE = BODY_HALF + BODY_RADIUS; // centre of the capsule above the feet
// Replaced by the server's list (which adds a TURN relay when one is configured) on joining voice.
let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
const COLORS = ["#4f7cff", "#ff6b6b", "#2ec4a6", "#ffb53d", "#b072ff", "#ff7ab8"];

const $ = (sel) => document.querySelector(sel);

// ---------- Scene ----------
const canvas = $("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.34;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.2, 1500);

// Soft light from the hazy sky plus a warm afternoon sun. The sun's shadow follows the player.
// The sky itself lights the scene (see world.js); this adds a little bounce from the ground.
const hemi = new THREE.HemisphereLight("#cfd9e2", "#9a927c", 0.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff1dc", 3.6);
const SUN_OFFSET = new THREE.Vector3(55, 85, 35);
sun.castShadow = true;
// Picture quality: "high" adds soft contact shadows where surfaces meet (ambient occlusion) and
// sharper sun shadows. Phones start on "low". Override with ?q=high or ?q=low in the address.
const QUALITY = new URLSearchParams(location.search).get("q") || (matchMedia("(pointer:coarse)").matches ? "low" : "high");
const HIGH = QUALITY !== "low";
sun.shadow.mapSize.set(HIGH ? 4096 : 2048, HIGH ? 4096 : 2048);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 2.5;
Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 1, far: 260 });
sun.position.copy(SUN_OFFSET);
scene.add(sun, sun.target);

let composer = null;
let aoPass = null;
function draw() {
  if (composer) composer.render();
  else renderer.render(scene, camera);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  if (composer) composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// Text drawn on a canvas and shown as a sprite that always faces the camera.
function makeLabel(text, { size = 44, color = "#ffffff", bg = "rgba(16,24,36,.78)", height = 1 } = {}) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const font = `600 ${size}px system-ui, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + size * 0.8;
  const h = Math.ceil(size * 1.45);
  c.width = w;
  c.height = h;
  g.font = font;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, w, h, h / 3);
  g.fill();
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set((height * w) / h, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}
function disposeLabel(sprite) {
  sprite.material.map.dispose();
  sprite.material.dispose();
}

// ---------- World ----------
const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
world.timestep = STEP;
const campus = await (await fetch("/campus.json")).json();
const worldInfo = buildWorld({ RAPIER, scene, world, renderer, campus, makeLabel });
const { places, props, focus, entranceYaw, animate: animateWorld, captureReflections } = worldInfo;
// The walking navmesh and Detour crowd (nav.js): built from the fixed colliders in the background; the
// people wait for it. ?nav=1 also shows the mesh as a green overlay (debug view). Handle: __tiu.nav
let nav = null;
const bikes = []; // parked two-wheelers
let riding = null; // { bike, r }: the machine I am on
const bikeColliders = new Set(); // parked two-wheelers are not part of the mesh: they carve obstacles in it
const navDebug = new URLSearchParams(location.search).get("nav") === "1";
const navLoading = import("/nav.js").then(({ buildNav }) => buildNav({ RAPIER, world, local: worldInfo.local, toLocal: worldInfo.toLocal, scene, debug: navDebug, skip: (c) => bikeColliders.has(c.handle) })).then((n) => {
  nav = n;
  if (navDebug) scene.add(n.debugMesh);
  for (const b of bikes) if (riding?.bike !== b && !b.navObs) bikeObstacle(b);
  return n;
});
if (HIGH) {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  aoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
  aoPass.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 12, screenSpaceRadius: false });
  aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  aoPass.blendIntensity = 0.9;
  composer.addPass(aoPass);
  composer.addPass(new OutputPass());
  composer.setSize(innerWidth, innerHeight);
}

// My own body: a capsule moved by a character controller, so it walks up steps and
// ramps, slides along walls, falls with gravity and pushes loose objects.
const controller = world.createCharacterController(0.02);
controller.enableAutostep(0.4, 0.2, false);
controller.enableSnapToGround(0.3);
controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
controller.setMinSlopeSlideAngle((35 * Math.PI) / 180);
controller.setApplyImpulsesToDynamicBodies(true);
controller.setCharacterMass(60);
const body = { rigid: null, collider: null, vy: 0, grounded: false, impact: 0 };

function spawnBody(x, y, z) {
  body.rigid = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + BODY_CENTRE, z));
  body.collider = world.createCollider(RAPIER.ColliderDesc.capsule(BODY_HALF, BODY_RADIUS), body.rigid);
}
function placeBody(x, y, z) {
  body.rigid.setTranslation({ x, y: y + BODY_CENTRE, z }, true);
  body.vy = 0;
}
// One fixed physics step. vx and vz are the walking speed in metres a second.
// `launch` is the take-off speed (m/s) on the step the feet leave the ground, otherwise 0.
function stepPhysics(vx, vz, launch) {
  if (launch && body.grounded) body.vy = launch;
  body.vy -= GRAVITY * STEP;
  const wasGrounded = body.grounded;
  const vyBefore = body.vy;
  controller.computeColliderMovement(body.collider, { x: vx * STEP, y: body.vy * STEP, z: vz * STEP });
  body.grounded = controller.computedGrounded() && !(launch && body.vy > 0);
  if (body.grounded && !wasGrounded) body.impact = Math.max(0, -vyBefore); // speed at touchdown
  if (body.grounded && body.vy < 0) body.vy = 0;
  const move = controller.computedMovement();
  const t = body.rigid.translation();
  body.rigid.setNextKinematicTranslation({ x: t.x + move.x, y: t.y + move.y, z: t.z + move.z });
  world.step();
}

// ---------- Avatars ----------
const players = new Map(); // id -> avatar (other people)
let me = null; // my avatar
const muted = new Set(); // ids I muted (voice and chat)

function makeAvatar(info) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.2, 12), new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.8 }));
  body.position.y = 0.95;
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10), new THREE.MeshStandardMaterial({ color: "#2c3440" }));
  legs.position.y = 0.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), new THREE.MeshStandardMaterial({ color: "#d9a57e", roughness: 0.7 }));
  head.position.y = 1.9;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.16), new THREE.MeshStandardMaterial({ color: "#c08f6a" }));
  nose.position.set(0, 1.88, -0.36); // shows which way the avatar faces (-z is forward)
  body.castShadow = head.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: "#5be08a" }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 2.45;
  ring.visible = false;
  const tag = makeLabel(info.name, { height: 0.2 });
  tag.position.y = 2.6;
  group.add(body, legs, head, nose, ring, tag);
  const simple = [body, legs, head, nose];
  group.position.set(info.x, info.y || 0, info.z);
  group.rotation.y = info.ry;
  scene.add(group);
  return {
    ...info,
    group,
    ring,
    tag,
    simple,
    bubbleY: 2.98,
    tx: info.x,
    ty: info.y || 0,
    tz: info.z,
    try: info.ry,
    bikeOn: info.bike | 0,
    tlean: info.lean || 0,
    bubble: null,
    bubbleUntil: 0,
    speaking: false,
    dist: Infinity,
  };
}
// Every player swaps the simple figure for the detailed animated character once it has loaded:
// the same body and TIU polo for everyone, each with their own animation.
let hero = null;
const kitLoading = loadCharacterKit(renderer).catch((err) => {
  console.warn("Could not load the detailed character; using the simple figure.", err);
  return null;
});
// The street's own life: traffic on both carriageways, and the people on the pavements and at
// the stalls (see traffic.js and people.js).
const streetLife = new URLSearchParams(location.search).get("life") !== "off";
const traffic = streetLife ? buildTraffic({ scene, world, RAPIER, local: worldInfo.local, phi: worldInfo.phi, kitLoading, quality: HIGH ? "high" : "low" }) : null;
const bodiesLoading = streetLife ? loadCrowdBodies(renderer, HIGH ? 12 : 8, HIGH ? 99 : 10) : null;
const crowd = streetLife ? buildPeople({ scene, world, RAPIER, local: worldInfo.local, phi: worldInfo.phi, spots: worldInfo.spots, kitLoading, bodiesLoading, traffic, quality: HIGH ? "high" : "low", camera, nav: navLoading }) : null;
// the real time of day in Salt Lake: sun, moon, sky, lamps (see daylight.js)
const daylight = buildDaylight({ scene, renderer, sun, hemi, sunOffset: SUN_OFFSET, worldInfo, traffic, high: HIGH, clockEl: document.getElementById("clock") });
let lastLocal = null;
let streetT = 0; // the street's own clock
function updateStreet(dt, pos) {
  if (!traffic) return;
  streetT += dt;
  const t = streetT;
  // me and the other players, in the street's frame: obstacles for drivers and walkers
  const [lx, lz] = worldInfo.toLocal(pos.x, pos.z);
  const vx = lastLocal ? (lx - lastLocal[0]) / Math.max(dt, 1e-3) : 0;
  const vz = lastLocal ? (lz - lastLocal[1]) / Math.max(dt, 1e-3) : 0;
  lastLocal = [lx, lz];
  const extra = [{ x: lx, z: lz, r: riding ? 0.7 : 0.35, vx, vz }];
  for (const a of players.values()) {
    const [ax, az] = worldInfo.toLocal(a.group.position.x, a.group.position.z);
    extra.push({ x: ax, z: az, r: a.bikeOn ? 0.7 : 0.35, vx: 0, vz: 0 });
  }
  // (parked bicycles and motorcycles are obstacles in the navmesh, see bikeObstacle)
  const onRoad = crowd.onRoad();
  for (const e of extra) if ((e.z > 8.4 && e.z < 15.4) || (e.z > 19.4 && e.z < 25.6)) onRoad.push({ x: e.x, z: e.z, vx: e.vx, w: e.r > 0.5 ? 0.9 : 0.7 });
  for (const b of bikes) {
    if (riding?.bike === b) continue;
    const [bx, bz] = worldInfo.toLocal(b.x, b.z);
    if ((bz > 8.4 && bz < 15.4) || (bz > 19.4 && bz < 25.6)) onRoad.push({ x: bx, z: bz, vx: 0, w: 0.9 });
  }
  traffic.update(dt, onRoad, t, [lx, lz]);
  if (nav) nav.update(dt);
  crowd.update(dt, t, extra);
}
// Someone else on a bike: a lighter copy of the bike under their figure, leaning as they lean.
function showRemoteBike(a, dt, roll) {
  if (a.bikeOn && a.bikeCode !== a.bikeOn) {
    // which machine they are on (see RIDE_KINDS); built the first time, rebuilt if they change
    if (a.bikeModel) a.bikeRig.remove(a.bikeModel.group);
    a.bikeCode = a.bikeOn;
    a.bikeModel = buildRide(a.bikeOn, { detail: false });
    if (!a.bikeRig) {
      a.bikeRig = new THREE.Group();
      a.group.add(a.bikeRig);
      for (const part of a.simple) {
        part.userData.baseY = part.position.y;
        a.bikeRig.attach(part);
      }
      a.lean = 0;
      a.crank = 0;
    }
    a.bikeRig.add(a.bikeModel.group);
  }
  if (!a.bikeModel) return;
  if (a.char) {
    const holder = a.char.model;
    const want = a.bikeOn ? a.bikeRig : a.group;
    if (holder.parent !== want) want.add(holder);
  }
  a.bikeModel.group.visible = Boolean(a.bikeOn);
  if (a.char && a.helmetOn !== Boolean(a.bikeOn && a.bikeModel.spec.motor)) {
    a.helmetOn = Boolean(a.bikeOn && a.bikeModel.spec.motor);
    a.char.showGear("helmet", a.helmetOn);
  }
  for (const part of a.simple) part.position.y = part.userData.baseY + (a.bikeOn ? 0.45 : 0); // seated on the saddle
  a.lean += ((a.bikeOn ? a.tlean : 0) - a.lean) * (1 - Math.exp(-dt * 8));
  a.bikeRig.rotation.z = -a.lean;
  if (a.bikeOn) {
    a.crank += roll / a.bikeModel.spec.wheelRadius / a.bikeModel.spec.gear;
    a.bikeModel.pose({ roll, crankAngle: a.crank });
  }
}
// Players wear a photographic body in a short-sleeved collared shirt, dyed and printed as the
// chosen T-shirt (see dressRocketboxShirt in character.js); the older stylised body is the
// fallback if it cannot load. A MetaHuman replaces this when it is ready.
const playerKitLoading = loadCrowdBody(renderer, "/models/people/Male_Adult_09.glb").catch((err) => {
  console.warn("Could not load the player body; using the older one.", err);
  return null;
});
async function attachCharacter(a, mine = false) {
  const kit = (await playerKitLoading) || (await kitLoading);
  if (!kit || a.removed) return;
  const c = makeCharacter(kit, { uniform: true, shirt: a.shirt, gear: [{ kind: "polocollar", color: a.shirt === "reboot" ? "#141416" : "#14203f" }, { kind: "helmet", color: mine ? "#1b1d22" : ["#1b1d22", "#c41e24", "#e8e8e8", "#1e3a8a"][a.id.length % 4] }] });
  c.showGear("helmet", false); // worn on a motorcycle
  a.char = c;
  if (mine) {
    hero = c;
    window.__heroModel = hero.model; // for checking the character in the console
  }
  for (const part of a.simple) part.visible = false;
  (a.bikeOn && a.bikeRig ? a.bikeRig : a.group).add(c.model);
  a.tag.position.y = 2.02;
  a.ring.position.y = 2.02;
  a.ring.scale.setScalar(0.7);
  a.bubbleY = 2.32;
}
const JUMP_PHASES = [null, "prep", "air", "land"];
// ---------- Greetings between people ----------
// 1 nomoshkar (palms together), 2 a wave, 3 a handshake. Others see yours; when someone beside
// you offers a hand, your character takes it.
const GREETINGS = [null, "namaste", "wave", "handshake"];
const myGreet = { code: 0, until: 0, cool: 0 };
const _hand = new THREE.Vector3();
const _g = {};
function partnerOf(a) {
  // whoever stands closest to this person, within arm's reach
  let best = null;
  let bd = 2.0;
  for (const o of [me, ...players.values()]) {
    if (!o || o === a) continue;
    const d = Math.hypot(o.group.position.x - a.group.position.x, o.group.position.z - a.group.position.z);
    if (d < bd && d > 0.25) {
      bd = d;
      best = o;
    }
  }
  return best;
}
function greet(code, answering = false, ms = 0) {
  if (!me || riding) return;
  const now = performance.now();
  if (code === 3 && !partnerOf(me)) {
    if (!answering) logLine("Step up to someone to shake hands.", true);
    return;
  }
  Object.assign(myGreet, { code, until: now + (ms || (code === 2 ? 2200 : 2600)) });
}
function greetingOf(a, now) {
  const code = a === me ? (now < myGreet.until ? myGreet.code : 0) : a.gest || 0;
  for (const k in _g) delete _g[k];
  if (!code) return _g;
  _g[GREETINGS[code]] = 1;
  if (code === 3) {
    const other = partnerOf(a);
    if (other) {
      // hands meet halfway between the two, at about waist-to-chest height
      _hand.copy(a.group.position).add(other.group.position).multiplyScalar(0.5);
      _hand.y += 1.02;
      _g.at = _hand;
      // turn to face them
      const want = Math.atan2(-(other.group.position.x - a.group.position.x), -(other.group.position.z - a.group.position.z));
      if (a === me && Math.hypot(vel.x, vel.z) < 0.3) me.group.rotation.y = lerpAngle(me.group.rotation.y, want, 0.2);
    }
  }
  return _g;
}
const _r = { saddle: new THREE.Vector3(), gripL: new THREE.Vector3(), gripR: new THREE.Vector3(), pedalL: new THREE.Vector3(), pedalR: new THREE.Vector3(), groundL: new THREE.Vector3(), groundR: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), back: new THREE.Vector3() };
// Someone else's character, animated from what the network tells us: how fast they move, whether
// they are jumping, riding, talking.
function animateRemote(a, dt, moved, turned, now) {
  const c = a.char;
  if (!c) return;
  const speed = moved / Math.max(dt, 1e-3);
  a.spd = (a.spd || 0) + (Math.min(speed, 9) - (a.spd || 0)) * (1 - Math.exp(-dt * 6));
  if (a.dist > 70) return; // too far to see the detail; keep the cost down
  let talk = 0;
  if (a.speaking) talk = 0.3 + 0.3 * Math.abs(Math.sin(now / 90 + a.id.length));
  else if (a.bubble && now - (a.bubbleUntil - CHAT_BUBBLE_MS) < 1600) talk = 0.25 + 0.25 * Math.sin(now / 55) * Math.sin(now / 23);
  if (a.bikeOn && a.bikeModel) {
    a.group.updateMatrixWorld(true);
    const m = a.bikeModel;
    m.saddle.getWorldPosition(_r.saddle);
    m.grips[0].getWorldPosition(_r.gripL);
    m.grips[1].getWorldPosition(_r.gripR);
    m.pedals[1].getWorldPosition(_r.pedalL);
    m.pedals[0].getWorldPosition(_r.pedalR);
    const q = a.bikeRig.getWorldQuaternion(new THREE.Quaternion());
    _r.right.set(1, 0, 0).applyQuaternion(q);
    _r.up.set(0, 1, 0).applyQuaternion(q);
    _r.back.set(0, 0, 1).applyQuaternion(q);
    a.group.localToWorld(_r.groundL.set(-0.36, 0.1, 0.12));
    a.group.localToWorld(_r.groundR.set(0.36, 0.1, 0.12));
    c.update(dt, { speed: 0, grounded: true, turnRate: 0, facing: a.group.rotation.y, ride: { ..._r, crank: a.bikeModel.spec.motor ? 0.6 : a.crank, effort: a.bikeModel.spec.motor ? 0.1 : Math.min(1, a.spd / 7), footDown: a.spd < 0.3 ? 1 : 0, backing: 0, backDist: 0, posture: a.bikeModel.spec.posture } });
    return;
  }
  const phase = JUMP_PHASES[a.jump || 0];
  c.update(dt, {
    speed: phase === "air" ? a.spd : a.spd < 0.15 ? 0 : a.spd,
    grounded: phase !== "air",
    jump: { phase, t: phase === "prep" ? 0.5 : 0, crouch: a.crouch || 0, run: a.spd > 2.5 ? 1 : 0, vy: (a.ty - a.group.position.y) * 10, launchV: 3 },
    turnRate: turned / Math.max(dt, 1e-3),
    facing: a.group.rotation.y,
    lookAt: null,
    talk,
    friendly: false,
    gesture: greetingOf(a, now),
    groundAt: a.dist < 25 ? groundAt : null,
  });
}
function removeAvatar(a) {
  a.removed = true;
  scene.remove(a.group);
  a.group.traverse((o) => {
    if (o.isSprite) disposeLabel(o);
    else if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}
function showBubble(a, text) {
  if (a.bubble) {
    a.group.remove(a.bubble);
    disposeLabel(a.bubble);
  }
  const short = text.length > 48 ? text.slice(0, 47) + "…" : text;
  a.bubble = makeLabel(short, { height: 0.28, color: "#14202e", bg: "rgba(255,255,255,.95)" });
  a.bubble.position.y = a.bubbleY;
  a.group.add(a.bubble);
  a.bubbleUntil = performance.now() + CHAT_BUBBLE_MS;
}

// ---------- Network ----------
let ws = null;
let chatRange = 15;
const sendMsg = (msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));

function connect(profile) {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => sendMsg({ t: "join", ...profile });
  ws.onerror = () => ($("#joinError").textContent = "Could not reach the server.");
  ws.onclose = () => {
    if (!me) return;
    logLine("Disconnected from the server. Reload the page to rejoin.", true);
    for (const id of [...peers.keys()]) closePeer(id);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.t) {
      case "welcome":
        chatRange = msg.chatRange;
        me = makeAvatar(msg.you);
        spawnBody(msg.you.x, 0, msg.you.z);
        attachCharacter(me, true);
        camYaw = msg.you.ry;
        for (const p of msg.players) {
          const a = makeAvatar(p);
          players.set(p.id, a);
          attachCharacter(a);
        }
        $("#join").hidden = true;
        $("#join").style.display = "none";
        $("#hud").hidden = false;
        logLine(`Welcome, ${me.name}. Messages reach people within ${chatRange} m.`, true);
        break;
      case "full":
        $("#joinError").textContent = "The campus is full right now. Try again soon.";
        break;
      case "joined":
        {
          const a = makeAvatar(msg.player);
          players.set(msg.player.id, a);
          attachCharacter(a);
        }
        break;
      case "left": {
        const a = players.get(msg.id);
        if (a) removeAvatar(a);
        players.delete(msg.id);
        closePeer(msg.id);
        break;
      }
      case "snap":
        for (const [id, x, y, z, ry, bk, lean, jump, crouch, gest] of msg.p) {
          const a = players.get(id);
          if (a) Object.assign(a, { tx: x, ty: y, tz: z, try: ry, bikeOn: bk | 0, tlean: lean || 0, jump: jump || 0, crouch: crouch || 0, gest: gest || 0 });
        }
        break;
      case "chat": {
        if (muted.has(msg.from)) break;
        const a = msg.from === me.id ? me : players.get(msg.from);
        if (a) showBubble(a, msg.text);
        logChat(msg.name, msg.text);
        break;
      }
      case "voice": {
        const a = players.get(msg.id);
        if (a) a.voice = msg.on;
        if (!msg.on) closePeer(msg.id);
        break;
      }
      case "signal":
        onSignal(msg.from, msg.data);
        break;
    }
  };
}

// ---------- Chat UI ----------
const chatLog = $("#chatLog");
function addLine(node) {
  chatLog.append(node);
  while (chatLog.children.length > 60) chatLog.firstChild.remove();
  chatLog.scrollTop = chatLog.scrollHeight;
}
function logLine(text, sys = false) {
  const d = document.createElement("div");
  if (sys) d.className = "sys";
  d.textContent = text;
  addLine(d);
}
function logChat(name, text) {
  const d = document.createElement("div");
  const b = document.createElement("b");
  b.textContent = name + ": ";
  d.append(b, text);
  addLine(d);
}
$("#chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#chatInput");
  const text = input.value.trim();
  if (text) sendMsg({ t: "chat", text });
  input.value = "";
  input.blur();
});

// ---------- Voice ----------
// Each nearby pair of players gets a direct audio link (WebRTC). The sound of each
// person is placed at their position in the 3D world, so it fades with distance and
// comes from the correct side.
const voice = { on: false, ctx: null, stream: null, track: null, talking: false, analyser: null };
const peers = new Map(); // id -> { pc, panner, gain, analyser, audioEl, pending: [], hasRemote }
const levelBuf = new Uint8Array(256);

function level(analyser) {
  analyser.getByteTimeDomainData(levelBuf);
  let sum = 0;
  for (let i = 0; i < levelBuf.length; i++) {
    const v = (levelBuf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / levelBuf.length);
}

async function joinVoice() {
  try {
    voice.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    $("#voiceHint").textContent = "Microphone was blocked. Allow it in your browser and try again.";
    return;
  }
  try {
    const res = await fetch("/ice", { cache: "no-store" });
    const list = (await res.json()).iceServers;
    if (Array.isArray(list) && list.length) iceServers = list;
  } catch {
    // Keep the STUN-only default; voice still works on open networks.
  }
  voice.ctx = voice.ctx || new (window.AudioContext || window.webkitAudioContext)();
  await voice.ctx.resume();
  voice.track = voice.stream.getAudioTracks()[0];
  voice.track.enabled = false; // push-to-talk: silent until you hold the button
  voice.analyser = voice.ctx.createAnalyser();
  voice.analyser.fftSize = 256;
  voice.ctx.createMediaStreamSource(voice.stream).connect(voice.analyser);
  voice.on = true;
  sendMsg({ t: "voice", on: true });
  $("#voiceJoin").textContent = "Leave voice";
  $("#voiceJoin").classList.add("on");
  $("#talk").hidden = false;
  $("#voiceHint").textContent = "You can hear people nearby. Hold V or the button to talk.";
}
function leaveVoice() {
  voice.on = false;
  setTalking(false);
  sendMsg({ t: "voice", on: false });
  for (const id of [...peers.keys()]) closePeer(id);
  voice.stream?.getTracks().forEach((t) => t.stop());
  voice.stream = voice.track = voice.analyser = null;
  $("#voiceJoin").textContent = "🎙 Join voice";
  $("#voiceJoin").classList.remove("on");
  $("#talk").hidden = true;
  $("#voiceHint").textContent = "Voice is off. Nobody can hear you.";
}
function setTalking(on) {
  if (!voice.track || voice.talking === on) return;
  voice.talking = on;
  voice.track.enabled = on;
  $("#talk").classList.toggle("live", on);
  $("#talk").textContent = on ? "Talking…" : "Hold to talk (V)";
}
$("#ride").addEventListener("click", () => toggleRide());
for (const b of document.querySelectorAll("#greet button")) b.addEventListener("click", () => greet(+b.dataset.g));
$("#voiceJoin").addEventListener("click", () => (voice.on ? leaveVoice() : joinVoice()));
const talkBtn = $("#talk");
talkBtn.addEventListener("pointerdown", (e) => {
  talkBtn.setPointerCapture(e.pointerId);
  setTalking(true);
});
for (const ev of ["pointerup", "pointercancel"]) talkBtn.addEventListener(ev, () => setTalking(false));

function createPeer(id) {
  const pc = new RTCPeerConnection({ iceServers });
  const peer = { pc, panner: null, gain: null, analyser: null, audioEl: null, pending: [], hasRemote: false };
  peers.set(id, peer);
  pc.addTrack(voice.track, voice.stream);
  pc.onicecandidate = (e) => e.candidate && sendMsg({ t: "signal", to: id, data: { ice: e.candidate } });
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(id);
  };
  pc.ontrack = (e) => {
    if (peer.panner) return;
    const stream = e.streams[0] || new MediaStream([e.track]);
    // Chrome only feeds a remote stream into Web Audio if it is also attached to a media element.
    peer.audioEl = new Audio();
    peer.audioEl.muted = true;
    peer.audioEl.srcObject = stream;
    peer.audioEl.play().catch(() => {});
    const src = voice.ctx.createMediaStreamSource(stream);
    peer.analyser = voice.ctx.createAnalyser();
    peer.analyser.fftSize = 256;
    peer.panner = new PannerNode(voice.ctx, {
      panningModel: "HRTF",
      distanceModel: "linear",
      refDistance: 3,
      maxDistance: VOICE_CONNECT + 2,
      rolloffFactor: 1,
    });
    peer.gain = voice.ctx.createGain();
    peer.gain.gain.value = muted.has(id) ? 0 : 1;
    src.connect(peer.analyser);
    src.connect(peer.panner).connect(peer.gain).connect(voice.ctx.destination);
  };
  return peer;
}
function closePeer(id) {
  const peer = peers.get(id);
  if (!peer) return;
  peers.delete(id);
  peer.pc.onconnectionstatechange = null;
  peer.pc.close();
  peer.gain?.disconnect();
  if (peer.audioEl) peer.audioEl.srcObject = null;
  const a = players.get(id);
  if (a) a.speaking = a.ring.visible = false;
}
async function callPeer(id) {
  const peer = createPeer(id);
  try {
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    sendMsg({ t: "signal", to: id, data: { sdp: peer.pc.localDescription } });
  } catch {
    closePeer(id);
  }
}
async function onSignal(from, data) {
  if (!voice.on || !data) return;
  let peer = peers.get(from);
  try {
    if (data.sdp?.type === "offer") {
      if (peer) closePeer(from);
      peer = createPeer(from);
      await peer.pc.setRemoteDescription(data.sdp);
      peer.hasRemote = true;
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      sendMsg({ t: "signal", to: from, data: { sdp: peer.pc.localDescription } });
    } else if (data.sdp?.type === "answer" && peer) {
      await peer.pc.setRemoteDescription(data.sdp);
      peer.hasRemote = true;
    } else if (data.ice && peer) {
      if (!peer.hasRemote) peer.pending.push(data.ice);
      else await peer.pc.addIceCandidate(data.ice);
      return;
    } else return;
    for (const ice of peer.pending.splice(0)) await peer.pc.addIceCandidate(ice);
  } catch {
    closePeer(from);
  }
}

// Decide who to link with, a few times a second. The player with the smaller id makes the call.
function updateVoiceLinks() {
  if (!voice.on) return;
  for (const [id, peer] of peers) {
    const a = players.get(id);
    if (!a || !a.voice || a.dist > VOICE_DROP) closePeer(id);
  }
  const wanted = [...players.values()]
    .filter((a) => a.voice && a.dist < VOICE_CONNECT && !peers.has(a.id) && me.id < a.id)
    .sort((a, b) => a.dist - b.dist);
  for (const a of wanted) {
    if (peers.size >= MAX_VOICE_PEERS) break;
    callPeer(a.id);
  }
}

function updateAudioPositions(yaw) {
  if (!voice.ctx) return;
  const L = voice.ctx.listener;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  if (L.positionX) {
    L.positionX.value = me.group.position.x;
    L.positionY.value = me.group.position.y + 1.8;
    L.positionZ.value = me.group.position.z;
    L.forwardX.value = fx;
    L.forwardY.value = 0;
    L.forwardZ.value = fz;
    L.upX.value = 0;
    L.upY.value = 1;
    L.upZ.value = 0;
  } else {
    L.setPosition(me.group.position.x, me.group.position.y + 1.8, me.group.position.z);
    L.setOrientation(fx, 0, fz, 0, 1, 0);
  }
  for (const [id, peer] of peers) {
    const a = players.get(id);
    if (!a || !peer.panner) continue;
    peer.panner.positionX.value = a.group.position.x;
    peer.panner.positionY.value = a.group.position.y + 1.8;
    peer.panner.positionZ.value = a.group.position.z;
    a.speaking = !muted.has(id) && level(peer.analyser) > 0.02;
    a.ring.visible = a.speaking;
  }
  if (voice.analyser) me.ring.visible = voice.talking && level(voice.analyser) > 0.02;
}

// ---------- Nearby list ----------
const nearbyList = $("#nearbyList");
function updateNearby() {
  const near = [...players.values()].filter((a) => a.dist <= NEARBY_RANGE).sort((a, b) => a.dist - b.dist);
  $("#nearbyEmpty").hidden = near.length > 0;
  $("#count").textContent = players.size + 1;
  nearbyList.replaceChildren(
    ...near.map((a) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "dot" + (a.speaking ? " talk" : "");
      dot.style.background = a.color;
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = `${a.voice ? "🎙 " : ""}${a.name} `;
      const small = document.createElement("small");
      small.textContent = `${a.dept ? a.dept + " · " : ""}${Math.round(a.dist)} m`;
      who.append(small);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = muted.has(a.id) ? "Muted" : "Mute";
      btn.setAttribute("aria-pressed", muted.has(a.id));
      btn.addEventListener("click", () => {
        muted.has(a.id) ? muted.delete(a.id) : muted.add(a.id);
        const peer = peers.get(a.id);
        if (peer?.gain) peer.gain.gain.value = muted.has(a.id) ? 0 : 1;
        updateNearby();
      });
      li.append(dot, who, btn);
      return li;
    }),
  );
  let best = places[0];
  for (const p of places) {
    if (Math.hypot(p.x - me.group.position.x, p.z - me.group.position.z) < Math.hypot(best.x - me.group.position.x, best.z - me.group.position.z)) best = p;
  }
  $("#place").textContent = best.name;
}

// ---------- Controls ----------
const keys = new Set();
const typing = () => ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
addEventListener("keydown", (e) => {
  if (!me) return;
  if (typing()) {
    if (e.key === "Escape") document.activeElement.blur();
    return;
  }
  if (e.key === "Enter") {
    $("#chatInput").focus();
    e.preventDefault();
    return;
  }
  keys.add(e.code);
  if (e.code === "Space") e.preventDefault();
  if (e.code === "KeyV") setTalking(true);
  if (e.code === "KeyE" && !e.repeat) toggleRide();
  if (!e.repeat && (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3")) greet(+e.code.slice(5));
});
addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "KeyV") setTalking(false);
});
addEventListener("blur", () => {
  keys.clear();
  setTalking(false);
});

let timeScale = 1; // slow motion for checking animation: __tiu.slow(0.2)
let debugCam = null; // set from the console with __tiu.cam(), for screenshots
let camYaw = 0; // 0 = camera looks toward -z (into the campus from the gate)
let camPitch = 0.3;
let camDist = 5.5;
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  document.activeElement?.blur?.();
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  camYaw -= (e.clientX - drag.x) * 0.006;
  camPitch = Math.max(-0.1, Math.min(1.2, camPitch + (e.clientY - drag.y) * 0.004));
  drag.x = e.clientX;
  drag.y = e.clientY;
});
for (const ev of ["pointerup", "pointercancel"]) canvas.addEventListener(ev, () => (drag = null));
canvas.addEventListener("wheel", (e) => {
  camDist = Math.max(2.5, Math.min(14, camDist + e.deltaY * 0.01));
}, { passive: true });

// Touch joystick
const stick = $("#stick");
const knob = stick.querySelector("i");
const stickVec = { x: 0, y: 0 };
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  stickVec.x = x;
  stickVec.y = y;
  knob.style.transform = `translate(${x * 32}px, ${y * 32}px)`;
}
stick.addEventListener("pointerdown", (e) => {
  stick.setPointerCapture(e.pointerId);
  stickMove(e);
});
stick.addEventListener("pointermove", (e) => stick.hasPointerCapture(e.pointerId) && stickMove(e));
for (const ev of ["pointerup", "pointercancel"]) {
  stick.addEventListener(ev, () => {
    stickVec.x = stickVec.y = 0;
    knob.style.transform = "";
  });
}

// Jump button (phones)
let jumpHeld = false;
const jumpBtn = $("#jump");
jumpBtn.addEventListener("pointerdown", (e) => {
  jumpBtn.setPointerCapture(e.pointerId);
  jumpHeld = true;
});
for (const ev of ["pointerup", "pointercancel"]) jumpBtn.addEventListener(ev, () => (jumpHeld = false));

// ---------- Join form ----------
let chosenColor = COLORS[Math.floor(Math.random() * COLORS.length)];
// which T-shirt (see shirt.js): remembered on this device
let chosenShirt = "tiu";
try {
  chosenShirt = localStorage.getItem("tv-shirt") || "tiu";
} catch {}
for (const b of document.querySelectorAll("#shirts button")) {
  b.setAttribute("aria-pressed", b.dataset.shirt === chosenShirt);
  b.addEventListener("click", () => {
    chosenShirt = b.dataset.shirt;
    try {
      localStorage.setItem("tv-shirt", chosenShirt);
    } catch {}
    for (const o of document.querySelectorAll("#shirts button")) o.setAttribute("aria-pressed", o === b);
  });
}
const swatches = $("#swatches");
for (const c of COLORS) {
  const b = document.createElement("button");
  b.type = "button";
  b.style.background = c;
  b.setAttribute("aria-label", "Colour " + c);
  b.setAttribute("aria-pressed", c === chosenColor);
  b.addEventListener("click", () => {
    chosenColor = c;
    for (const o of swatches.children) o.setAttribute("aria-pressed", o === b);
  });
  swatches.append(b);
}
$("#joinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (ws && ws.readyState <= 1) return;
  $("#joinError").textContent = "";
  connect({ name: $("#name").value, dept: $("#dept").value, color: chosenColor, shirt: chosenShirt });
});

// ---------- Main loop ----------
const clock = new THREE.Clock();
let physicsTime = 0;
let airTime = 0;
const vel = { x: 0, z: 0 };
// The jump, in the phases a person goes through:
//   prep  dip at the knees and hips, arms swing back, then drive up (the push-off)
//   air   ballistic flight: momentum kept, almost no steering
//   land  feet touch, knees and hips give to soak up the impact, then stand back up
// Falls that were not jumps (off a step or a wall) use the same air and land phases.
let pendingLaunch = 0;
const jumpState = { phase: null, t: 0, dur: 0, depth: 0, crouch: 0, run: 0, launchV: 0, held: false };
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => t * t * (3 - 2 * t);
function updateJump(dt, wantJump, speedNow) {
  const j = jumpState;
  const pressed = wantJump && !j.held; // one jump per press, as with a real body
  j.held = wantJump;
  let launch = 0;
  if (!j.phase) {
    if (pressed && body.grounded) {
      j.run = Math.min(1, speedNow / RUN_SPEED);
      j.phase = "prep";
      j.t = 0;
      j.dur = lerp(0.26, 0.09, j.run); // a deep dip from standing, a quick one in stride
      j.depth = lerp(0.17, 0.06, j.run);
    } else if (!body.grounded && airTime > 0.12) {
      j.phase = "air"; // stepped off something
      j.launchV = 0;
    }
  }
  if (j.phase === "prep") {
    j.t += dt / j.dur;
    if (!body.grounded) {
      j.phase = "air";
      j.launchV = 0;
    } else if (j.t < 0.68) {
      j.crouch = j.depth * Math.sin((j.t / 0.68) * (Math.PI / 2)); // going down
    } else if (j.t < 1) {
      const k = (j.t - 0.68) / 0.32;
      j.crouch = j.depth * (1 - easeInOut(k)) - 0.03 * k; // driving up onto the toes
    } else {
      const h = lerp(JUMP_HEIGHT.stand, JUMP_HEIGHT.run, j.run);
      launch = j.launchV = Math.sqrt(2 * GRAVITY * h);
      j.phase = "air";
      j.t = 0;
      j.crouch = 0;
    }
  } else if (j.phase === "air") {
    j.t += dt;
    j.crouch = 0;
    if (body.grounded && !pendingLaunch && j.t > 0.05) {
      const v = body.impact;
      j.phase = "land";
      j.t = 0;
      j.depth = Math.min(0.4, Math.max(0.05, 0.03 + 0.055 * v)); // harder landings bend further
      j.dur = Math.min(0.6, Math.max(0.18, 0.14 + 0.07 * v));
    }
  } else if (j.phase === "land") {
    j.t += dt / j.dur;
    if (j.t < 0.3) j.crouch = j.depth * easeOut(j.t / 0.3);
    else j.crouch = j.depth * (1 - easeInOut((j.t - 0.3) / 0.7));
    if (j.t >= 1) {
      j.phase = null;
      j.crouch = 0;
    }
    if (!body.grounded && airTime > 0.12) j.phase = "air";
  }
  return launch;
}
const lookTarget = new THREE.Vector3();
const DOWN = { x: 0, y: -1, z: 0 };
// Height of the solid ground under a point, ignoring my own body and loose objects.
// ---------- Bicycles and motorcycles ----------
// Five kinds of bicycle and three everyday motorcycles stand on the forecourt and along the
// street. Each visitor's machines are their own (like the footballs); other people see you on
// the one you ride.
const RIDE_KINDS = [...BICYCLE_KINDS.map((d) => ["bicycle", d]), ...MOTORCYCLE_KINDS.map((d) => ["motorcycle", d])]; // place in this list + 1 is what goes over the network
function buildRide(code, opts = {}) {
  const [kind, design] = RIDE_KINDS[code - 1] || RIDE_KINDS[0];
  return kind === "bicycle" ? buildBicycle({ design, ...opts }) : buildMotorcycle({ design, ...opts });
}
const rideCode = (model) => RIDE_KINDS.findIndex(([k, d]) => k === model.kind && d === model.design) + 1;
function parkBike(b, x, y, z, heading) {
  Object.assign(b, { x, y, z, heading });
  scene.add(b.stand);
  b.stand.add(b.model.group);
  b.model.group.position.set(0, 0, 0);
  b.model.group.rotation.set(0, 0, b.model.spec.parkLean); // resting on its side stand, leaning left (upright on a centre stand)
  b.stand.position.set(x, y, z);
  b.stand.rotation.set(0, heading, 0);
  b.model.pose({ steerAngle: b.model.spec.parkLean ? -0.3 : 0, kickstand: true });
  const { L, H } = b.model.size;
  b.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.24, H / 2, L / 2 - 0.05).setTranslation(x, y + H / 2, z).setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }));
  bikeColliders.add(b.collider.handle);
  bikeObstacle(b);
}
// A parked machine blocks the walkers' navmesh: three circles along its length (a wheel at each end
// and the middle), wide enough that a walker's body stays clear of it. Taking it frees the spot.
function bikeObstacle(b) {
  unbikeObstacle(b);
  if (!nav) return; // the navmesh loads in the background: it adds the parked ones when it is ready
  const half = b.model.size.L / 2 - 0.3;
  b.navObs = [-1, 0, 1].map((s) => {
    const [bx, bz] = worldInfo.toLocal(b.x - Math.sin(b.heading) * half * s, b.z - Math.cos(b.heading) * half * s);
    return nav.addObstacle(bx, bz, 0.6);
  });
}
function unbikeObstacle(b) {
  if (b.navObs && nav) for (const id of b.navObs) nav.removeObstacle(id);
  b.navObs = null;
}
function addRide(model, lx, lz, turn = Math.PI / 2) {
  const b = { model, stand: new THREE.Group() };
  const [x, z] = worldInfo.local(lx, lz);
  parkBike(b, x, 0, z, entranceYaw + turn);
  bikes.push(b);
  return b;
}
{
  const plates = ["WB 06 AF 6627", "WB 02 AK 3391", "WB 08 H 5012", "WB 04 J 8847", "WB 12 BC 1204", "WB 26 S 7730", "WB 10 P 4459"];
  const moto = (design, i) => buildMotorcycle({ design, color: MOTORCYCLE_DESIGNS[design].colors[i % MOTORCYCLE_DESIGNS[design].colors.length][0], plate: plates[i % plates.length] });
  // On the forecourt between the raised entrance floor (ends 3 m out) and the railing (6.3 m out):
  // one of each bicycle side by side, front wheels toward the gate, then the three motorcycles.
  addRide(buildBicycle({ design: "city" }), 25.2, 3.6);
  addRide(buildBicycle({ design: "roadster" }), 25.2, 4.2);
  addRide(buildBicycle({ design: "mtb" }), 25.2, 4.8);
  addRide(buildBicycle({ design: "ladies" }), 25.2, 5.4);
  addRide(buildBicycle({ design: "sport" }), 25.2, 6.0);
  // the motorcycles stand in a row at the kerb just outside the gate, the way they do
  ["commuter", "scooter", "classic", "bullet", "commuter", "bullet"].forEach((d, i) => addRide(moto(d, i === 4 ? 1 : i === 5 ? 2 : i === 1 ? 2 : 0), 33.2 + i * 1.25, 9.0, Math.PI * 0.82));
  // and by the stalls opposite
  addRide(moto("classic", 2), -3.2, 25.1, -Math.PI * 0.2);
  addRide(moto("scooter", 4), -4.4, 25.1, -Math.PI * 0.2);
  addRide(moto("commuter", 3), 9.5, 25.1, -Math.PI * 0.2);
  addRide(buildBicycle({ design: "roadster", color: "#15301f" }), 10.9, 25.2, -Math.PI * 0.35);
  addRide(buildBicycle({ design: "ladies", color: "#1f8a8a" }), 14.5, 25.2, -Math.PI * 0.35);
}
const engine = makeEngineSound();
const rideRig = new THREE.Group(); // leans the bike and rider together about the tyre contact line
let rideGrade = 0;
let landBob = 0;
function nearestBike() {
  if (!me) return null;
  const p = me.group.position;
  let best = null;
  for (const b of bikes) {
    if (riding?.bike === b) continue;
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d < 1.8 && Math.abs(b.y - p.y) < 1 && (!best || d < best.d)) best = { b, d };
  }
  return best?.b || null;
}
// ---------- Getting on and off ----------
// Getting on is a sequence, as it is in life. On a motorcycle: stand on its left, take the helmet
// off the handlebar, lift it over your head, pull it down and fasten the strap; hands on the
// grips, lift the bike upright off its side stand, swing the right leg over the seat and sit,
// flick the side stand up with the left foot, put the key in and turn it, then press the starter
// (or, on the 350, unfold the kick lever and kick it through). Getting off runs it backwards: key
// off, side stand down, lean the bike onto it, leg back over, strap undone, helmet off and hung
// back on the bar. A bicycle: hands on the bars, lift it upright and knock the stand up, leg over.
let seq = null; // { bike, steps, i, t, then }
const ss = (k) => {
  const t = Math.max(0, Math.min(1, k));
  return t * t * (3 - 2 * t);
};
const span = (k, a, b) => ss((k - a) / (b - a)); // 0 before a, 1 after b, smooth between
const _m = { saddle: new THREE.Vector3(), gripL: new THREE.Vector3(), gripR: new THREE.Vector3(), pedalL: new THREE.Vector3(), pedalR: new THREE.Vector3(), groundL: new THREE.Vector3(), groundR: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), back: new THREE.Vector3(), fwd: new THREE.Vector3(), at: new THREE.Vector3(), key: new THREE.Vector3(), kick: new THREE.Vector3(), head: new THREE.Vector3() };
const _h = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), p0: new THREE.Vector3(), q0: new THREE.Quaternion(), p1: new THREE.Vector3(), q1: new THREE.Quaternion(), mtx: new THREE.Matrix4(), s: new THREE.Vector3() };
const V = () => new THREE.Vector3();
const bez = (a, b, c, k, out) => out.copy(a).multiplyScalar((1 - k) * (1 - k)).addScaledVector(b, 2 * k * (1 - k)).addScaledVector(c, k * k);
// where things are this frame, in the world
function markers(bike) {
  const m = bike.model;
  me.group.updateMatrixWorld(true);
  m.saddle.getWorldPosition(_m.saddle);
  m.grips[0].getWorldPosition(_m.gripL);
  m.grips[1].getWorldPosition(_m.gripR);
  m.pedals[1].getWorldPosition(_m.pedalL);
  m.pedals[0].getWorldPosition(_m.pedalR);
  const q = rideRig.getWorldQuaternion(new THREE.Quaternion());
  _m.right.set(1, 0, 0).applyQuaternion(q);
  _m.up.set(0, 1, 0).applyQuaternion(q);
  _m.back.set(0, 0, 1).applyQuaternion(q);
  _m.fwd.set(0, 0, -1).applyQuaternion(me.group.quaternion);
  me.group.localToWorld(_m.groundL.set(-0.36, 0.09, 0.12));
  me.group.localToWorld(_m.groundR.set(0.36, 0.09, 0.12));
  // standing beside it on the left, level with the seat
  const sl = me.group.worldToLocal(_m.saddle.clone());
  me.group.localToWorld(_m.at.set(-0.52, 0, sl.z - 0.05));
  if (m.key) m.key.getWorldPosition(_m.key);
  m.kick.getWorldPosition(_m.kick);
  hero.model.getObjectByName("Head").getWorldPosition(_m.head);
}
// the helmet's world place when worn (from the reference helmet on the character's head) and
// when hanging on the handlebar
function helmetWorn(pos, quat) {
  const ref = hero.model.getObjectByName("gear-helmet");
  ref.updateWorldMatrix(true, false);
  ref.matrixWorld.decompose(pos, quat, _h.s);
}
function helmetHung(hung, pos, quat) {
  hung.hang.updateWorldMatrix(true, false);
  _h.mtx.compose(hung.home.position, hung.home.quaternion, _h.s.set(1, 1, 1));
  _h.mtx.premultiply(hung.hang.matrixWorld).decompose(pos, quat, _h.s);
}
function placeHelmet(h, pos, quat) {
  if (h.group.parent !== scene) scene.attach(h.group);
  h.group.position.copy(pos);
  h.group.quaternion.copy(quat);
}
// where the feet stand beside the machine
const footSpot = (side, out) => out.copy(_m.at).addScaledVector(_m.right, side * 0.11).addScaledVector(_m.fwd, side > 0 ? 0.05 : -0.02).setY(_m.at.y + 0.085);

function stepsOn(bike) {
  const m = bike.model;
  const motor = m.spec.motor;
  const lean0 = m.spec.parkLean;
  const hung = m.hung;
  const steps = [];
  const P = {}; // the pose being built this frame (see seqFrame)
  const relaxed = (side) => false;
  if (motor && hung) {
    steps.push({
      name: "take the helmet", dur: 0.75,
      run(k) {
        helmetHung(hung, _h.pos, _h.quat);
        P.handL = V().copy(_m.at).addScaledVector(UPV, 0.86).addScaledVector(_m.right, -0.22).lerp(V().copy(_h.pos).addScaledVector(UPV, 0.13), ss(k * 1.2));
        P.handR = relaxed(1);
        P.stoop = 0.12 * Math.sin(Math.PI * k);
      },
    });
    steps.push({
      name: "lift it up", dur: 0.8,
      start() {
        helmetHung(hung, _h.p0, _h.q0);
      },
      run(k) {
        helmetWorn(_h.p1, _h.q1);
        const front = V().copy(_m.head).addScaledVector(_m.fwd, 0.34).addScaledVector(UPV, 0.08);
        bez(_h.p0, V().copy(_h.p0).lerp(front, 0.5).addScaledVector(UPV, 0.25), front, ss(k), _h.pos);
        _h.quat.slerpQuaternions(_h.q0, _h.q1, ss(k));
        placeHelmet(hung.helmet, _h.pos, _h.quat);
        P.handL = V().copy(_h.pos).addScaledVector(_m.right, -0.15).addScaledVector(UPV, -0.03);
        P.handR = k < 0.35 ? relaxed(1) : V().copy(_h.pos).addScaledVector(_m.right, 0.15).addScaledVector(UPV, -0.03);
      },
    });
    steps.push({
      name: "put it on", dur: 0.7,
      start() {
        _h.p0.copy(hung.helmet.group.position);
      },
      run(k) {
        helmetWorn(_h.p1, _h.q1);
        // over the head first, then pulled down onto it
        const over = V().copy(_h.p1).addScaledVector(UPV, 0.12).addScaledVector(_m.fwd, 0.05);
        bez(_h.p0, over, _h.p1, ss(k), _h.pos);
        placeHelmet(hung.helmet, _h.pos, _h.q1);
        P.handL = V().copy(_h.pos).addScaledVector(_m.right, -0.16).addScaledVector(UPV, -0.06);
        P.handR = V().copy(_h.pos).addScaledVector(_m.right, 0.16).addScaledVector(UPV, -0.06);
      },
      end() {
        // now it sits on the head and moves with it
        hero.model.getObjectByName("Head").attach(hung.helmet.group);
        const ref = hero.model.getObjectByName("gear-helmet");
        hung.helmet.group.position.copy(ref.position);
        hung.helmet.group.quaternion.copy(ref.quaternion);
        hung.strap.visible = false;
      },
    });
    steps.push({
      name: "fasten the strap", dur: 0.7,
      run(k) {
        const chin = V().copy(_m.head).addScaledVector(UPV, -0.1).addScaledVector(_m.fwd, 0.1);
        const w = Math.sin(Math.PI * Math.min(1, k * 1.1));
        P.handL = V().copy(_m.at).addScaledVector(UPV, 0.86).addScaledVector(_m.right, -0.22).lerp(V().copy(chin).addScaledVector(_m.right, -0.025), w);
        P.handR = V().copy(_m.at).addScaledVector(UPV, 0.86).addScaledVector(_m.right, 0.0).lerp(V().copy(chin).addScaledVector(_m.right, 0.025), w);
        if (k > 0.5) hung.helmet.strap(true);
      },
    });
  }
  steps.push({
    name: "hands on the bars", dur: 0.55,
    run(k) {
      const rest = (side) => V().copy(_m.at).addScaledVector(UPV, 0.86).addScaledVector(_m.right, side * 0.22);
      P.handL = rest(-1).lerp(V().copy(_m.gripL).addScaledVector(_m.back, 0.05), ss(k));
      P.handR = rest(1).lerp(V().copy(_m.gripR).addScaledVector(_m.back, 0.05), ss(k));
      P.stoop = 0.15 * ss(k);
    },
  });
  if (lean0) {
    steps.push({
      name: "lift it upright", dur: motor ? 0.75 : 0.45,
      run(k) {
        P.lean = lean0 * (1 - ss(k));
        P.stoop = 0.15 + (motor ? 0.1 : 0.04) * Math.sin(Math.PI * k); // a heavy bike takes some effort
      },
    });
  }
  steps.push({
    name: "leg over", dur: motor ? 1.0 : 0.85,
    run(k) {
      P.stand = 1 - span(k, 0.25, 0.9);
      P.lift = 0.07 * Math.sin(Math.PI * span(k, 0.1, 0.85));
      // the right foot lifts behind, swings over the back of the seat and comes down on the far side
      const from = footSpot(1, V());
      const top = V().copy(_m.saddle).addScaledVector(_m.back, m.kind === "bicycle" && m.design === "ladies" ? -0.25 : 0.32).addScaledVector(UPV, m.kind === "bicycle" && m.design === "ladies" ? -0.25 : 0.2);
      const to = motor ? V().copy(_m.pedalR) : V().copy(_m.groundR);
      P.footR = bez(from, top, to, span(k, 0.05, 0.85), V());
      P.footL = footSpot(-1, V()).lerp(V().copy(_m.groundL), span(k, 0.55, 1));
      P.stoop = 0.15 * (1 - k);
    },
  });
  // the stand goes up: kicked back with the left foot
  if (!m.centreStand && !(m.kind === "bicycle" && m.design === "roadster")) {
    steps.push({
      name: "stand up", dur: 0.55,
      run(k) {
        const onIt = V().copy(_m.kick).addScaledVector(UPV, -0.05).addScaledVector(_m.right, -0.05);
        P.footL = bez(V().copy(_m.groundL), onIt, V().copy(_m.groundL), ss(k), V());
        P.kick = 1 - span(k, 0.35, 0.75);
        if (motor) P.footR = V().copy(_m.pedalR);
      },
    });
  } else {
    steps.push({
      name: "roll off the stand", dur: 0.6,
      run(k) {
        P.roll = 0.25 * span(k, 0, 0.8); // pushed forward off the centre stand
        P.kick = 1 - span(k, 0.1, 0.6);
        if (motor) P.footR = V().copy(_m.pedalR);
      },
    });
  }
  if (motor) {
    steps.push({
      name: "key", dur: 1.0,
      run(k) {
        const w = span(k, 0, 0.35) * (1 - span(k, 0.7, 1));
        P.handR = V().copy(_m.gripR).addScaledVector(_m.back, 0.05).lerp(V().copy(_m.key).addScaledVector(_m.back, 0.04).addScaledVector(UPV, 0.02), w);
        if (k > 0.5 && !this.done) {
          this.done = true;
          setMotorcycleNight(Math.max(daylight.state.night, 0.35)); // dash and headlamp come on with the ignition
          engine.click();
        }
        P.footR = V().copy(_m.pedalR);
      },
    });
    if (m.kickLever) {
      steps.push({
        name: "kick start", dur: 1.5,
        run(k) {
          // unfold the lever with the right foot, then stand on the left peg and kick it through
          const lever = m.kickLever;
          lever.rotation.x = -1.2 + 1.2 * span(k, 0.05, 0.3) + 0.35 * span(k, 0.45, 0.65) - 1.55 * span(k, 0.8, 0.98);
          const pad = lever.localToWorld(V().set(0.04, 0.22, 0));
          P.footR = V().copy(_m.pedalR).lerp(pad.addScaledVector(UPV, 0.07), span(k, 0, 0.12) * (1 - span(k, 0.75, 0.95)));
          P.lift = 0.09 * span(k, 0.35, 0.45) * (1 - span(k, 0.55, 0.7)); // rises a little to put weight into the kick
          if (k > 0.6 && !this.done) {
            this.done = true;
            engine.start();
          }
        },
      });
    } else {
      steps.push({
        name: "starter", dur: 0.9,
        run(k) {
          if (k > 0.1 && !this.done) {
            this.done = true;
            engine.start();
          }
          P.footR = V().copy(_m.pedalR);
        },
      });
    }
  }
  return { steps, P };
}
function stepsOff(bike) {
  const m = bike.model;
  const motor = m.spec.motor;
  const lean0 = m.spec.parkLean;
  const hung = m.hung;
  const steps = [];
  const P = {};
  if (motor) {
    steps.push({
      name: "key off", dur: 0.9,
      run(k) {
        const w = span(k, 0, 0.35) * (1 - span(k, 0.7, 1));
        P.handR = V().copy(_m.gripR).addScaledVector(_m.back, 0.05).lerp(V().copy(_m.key).addScaledVector(_m.back, 0.04).addScaledVector(UPV, 0.02), w);
        if (k > 0.5 && !this.done) {
          this.done = true;
          engine.stop();
          setMotorcycleNight(daylight.state.night);
        }
        P.footR = V().copy(_m.pedalR);
        P.footL = V().copy(_m.groundL);
      },
    });
  }
  if (!m.centreStand && !(m.kind === "bicycle" && m.design === "roadster")) {
    steps.push({
      name: "stand down", dur: 0.55,
      run(k) {
        const onIt = V().copy(_m.kick).addScaledVector(UPV, -0.04).addScaledVector(_m.right, -0.08);
        P.footL = bez(V().copy(_m.groundL), onIt, V().copy(_m.groundL), ss(k), V());
        P.kick = span(k, 0.25, 0.7);
        if (motor) P.footR = V().copy(_m.pedalR);
      },
    });
  } else {
    steps.push({
      name: "onto the stand", dur: 0.6,
      run(k) {
        P.kick = span(k, 0, 0.5);
        P.roll = -0.2 * span(k, 0.3, 1); // pulled back up onto the centre stand
        if (motor) P.footR = V().copy(_m.pedalR);
        P.footL = V().copy(_m.groundL);
      },
    });
  }
  steps.push({
    name: "leg back over", dur: motor ? 1.0 : 0.85,
    run(k) {
      P.kick = 1;
      P.lean = lean0 * span(k, 0.6, 1);
      P.stand = span(k, 0.1, 0.75);
      P.lift = 0.07 * Math.sin(Math.PI * span(k, 0.15, 0.9));
      const from = motor ? V().copy(_m.pedalR) : V().copy(_m.groundR);
      const top = V().copy(_m.saddle).addScaledVector(_m.back, m.kind === "bicycle" && m.design === "ladies" ? -0.25 : 0.32).addScaledVector(UPV, m.kind === "bicycle" && m.design === "ladies" ? -0.25 : 0.2);
      P.footR = bez(from, top, footSpot(1, V()), span(k, 0.15, 0.95), V());
      P.footL = V().copy(_m.groundL).lerp(footSpot(-1, V()), span(k, 0, 0.45));
    },
  });
  if (motor && hung) {
    steps.push({
      name: "undo the strap", dur: 0.6,
      run(k) {
        P.kick = 1;
        P.lean = lean0;
        const chin = V().copy(_m.head).addScaledVector(UPV, -0.1).addScaledVector(_m.fwd, 0.1);
        const w = Math.sin(Math.PI * k);
        P.handL = V().copy(_m.gripL).lerp(V().copy(chin).addScaledVector(_m.right, -0.025), w);
        P.handR = V().copy(_m.gripR).lerp(V().copy(chin).addScaledVector(_m.right, 0.025), w);
        if (k > 0.5) hung.helmet.strap(false);
      },
    });
    steps.push({
      name: "helmet off", dur: 0.75,
      start() {
        helmetWorn(_h.p0, _h.q0);
        scene.attach(hung.helmet.group);
      },
      run(k) {
        P.kick = 1;
        P.lean = lean0;
        helmetHung(hung, _h.p1, _h.q1);
        const front = V().copy(_m.head).addScaledVector(_m.fwd, 0.3).addScaledVector(UPV, 0.0);
        bez(_h.p0, V().copy(_h.p0).addScaledVector(UPV, 0.15), front, ss(k), _h.pos);
        placeHelmet(hung.helmet, _h.pos, _h.q0);
        P.handL = V().copy(_h.pos).addScaledVector(_m.right, -0.16).addScaledVector(UPV, -0.05);
        P.handR = V().copy(_h.pos).addScaledVector(_m.right, 0.16).addScaledVector(UPV, -0.05);
      },
    });
    steps.push({
      name: "hang it up", dur: 0.7,
      start() {
        _h.p0.copy(hung.helmet.group.position);
        _h.q0.copy(hung.helmet.group.quaternion);
      },
      run(k) {
        P.kick = 1;
        P.lean = lean0;
        helmetHung(hung, _h.p1, _h.q1);
        bez(_h.p0, V().copy(_h.p0).lerp(_h.p1, 0.5).addScaledVector(UPV, 0.12), _h.p1, ss(k), _h.pos);
        _h.quat.slerpQuaternions(_h.q0, _h.q1, ss(k));
        placeHelmet(hung.helmet, _h.pos, _h.quat);
        P.handL = V().copy(_h.pos).addScaledVector(UPV, 0.13).addScaledVector(_m.right, -0.02);
        P.handR = k < 0.4 ? V().copy(_h.pos).addScaledVector(_m.right, 0.15) : false;
      },
      end() {
        hung.hang.attach(hung.helmet.group);
        hung.helmet.group.position.copy(hung.home.position);
        hung.helmet.group.quaternion.copy(hung.home.quaternion);
        hung.strap.visible = true;
      },
    });
  } else {
    steps.push({ name: "step back", dur: 0.35, run() { P.kick = 1; P.lean = lean0; P.handL = false; P.handR = false; } });
  }
  return { steps, P };
}
const UPV = new THREE.Vector3(0, 1, 0);

function toggleRide() {
  if (!me || !hero || seq) return;
  if (riding) {
    const { bike, r } = riding;
    if (Math.abs(r.v) > 0.6) {
      logLine("Stop first to get off.", true);
      return;
    }
    if (!body.grounded) return;
    r.v = 0;
    const { steps, P } = stepsOff(bike);
    seq = { bike, steps, P, i: -1, t: 0, off: true, lean: r.lean, kickK: 0 };
    me.group.add(hero.model); // standing up beside it, the body no longer leans with the bike
    return;
  }
  const b = nearestBike();
  if (!b) return;
  world.removeCollider(b.collider, true);
  unbikeObstacle(b);
  scene.remove(b.stand);
  b.stand.remove(b.model.group);
  b.model.group.rotation.set(0, 0, 0);
  me.group.add(rideRig);
  rideRig.add(b.model.group);
  me.group.add(hero.model);
  placeBody(b.x, b.y, b.z);
  me.group.position.set(b.x, b.y, b.z);
  me.group.rotation.y = b.heading;
  vel.x = vel.z = 0;
  myGreet.code = 0;
  jumpState.phase = null;
  camYaw = b.heading;
  const { steps, P } = stepsOn(b);
  seq = { bike: b, steps, P, i: -1, t: 0, off: false, lean: b.model.spec.parkLean, kickK: 1 };
}
function seqFrame(dt) {
  const q = seq;
  const m = q.bike.model;
  // next step when this one is done
  if (q.i < 0 || q.t >= q.steps[q.i].dur) {
    if (q.i >= 0) q.steps[q.i].end?.call(q.steps[q.i]);
    q.i++;
    q.t = 0;
    if (q.i >= q.steps.length) return finishSeq();
    q.steps[q.i].start?.call(q.steps[q.i]);
  }
  q.t += dt;
  const step = q.steps[q.i];
  const P = q.P;
  // what holds unless the step says otherwise
  for (const key of ["handL", "handR", "footL", "footR", "lift", "stoop", "roll"]) delete P[key];
  P.lean = q.lean;
  P.kick = q.kickK;
  P.stand = q.off ? 0 : 1;
  if (q.off) P.stand = q.standNow ?? 0;
  markers(q.bike);
  step.run.call(step, Math.min(1, q.t / step.dur));
  q.lean = P.lean;
  q.kickK = P.kick;
  q.standNow = P.stand;
  // the machine: leaning on its stand or held upright, the stand, a little roll off a centre stand
  rideRig.rotation.z = P.lean;
  if (P.roll !== undefined) rideRig.position.z = -P.roll;
  m.pose({ steerAngle: 0, roll: 0, crankAngle: 0, kickstand: P.kick });
  // the person: standing beside it or seated, hands and feet where the step puts them
  if (P.stand > 0.5 && P.footL === undefined) P.footL = footSpot(-1, V());
  if (P.stand > 0.5 && P.footR === undefined) P.footR = footSpot(1, V());
  if (P.stand <= 0.5 && P.footL === undefined) P.footL = V().copy(_m.groundL);
  if (P.stand <= 0.5 && P.footR === undefined && m.spec.motor) P.footR = V().copy(_m.pedalR);
  hero.update(dt, {
    speed: 0,
    grounded: true,
    turnRate: 0,
    facing: me.group.rotation.y,
    lookAt: null,
    talk: 0,
    ride: { ..._m, crank: m.spec.motor ? 0.6 : 0, effort: 0, footDown: 0, backing: 0, backDist: 0, posture: m.spec.posture, stand: P.stand, at: _m.at, lift: P.lift || 0, stoop: P.stoop || 0, handL: P.handL, handR: P.handR, footL: P.footL, footR: P.footR },
  });
}
function finishSeq() {
  const { bike, off } = seq;
  seq = null;
  rideRig.position.set(0, 0, 0);
  if (!off) {
    rideRig.rotation.z = 0;
    rideRig.add(hero.model);
    riding = { bike, r: newRide(me.group.rotation.y) };
    riding.r.footDown = 1;
    return;
  }
  const p = me.group.position;
  const heading = riding.r.heading;
  rideRig.remove(bike.model.group);
  parkBike(bike, p.x, p.y, p.z, heading);
  engine.set(1300, 0, false);
  engine.horn(false);
  me.group.add(hero.model);
  me.group.remove(rideRig);
  // the body steps to where the person is standing, on the left of the machine
  placeBody(p.x - Math.cos(heading) * 0.55, p.y, p.z + Math.sin(heading) * 0.55);
  vel.x = vel.z = 0;
  riding = null;
}
const _w = { saddle: new THREE.Vector3(), gripL: new THREE.Vector3(), gripR: new THREE.Vector3(), pedalL: new THREE.Vector3(), pedalR: new THREE.Vector3(), groundL: new THREE.Vector3(), groundR: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), back: new THREE.Vector3() };
function rideFrame(dt) {
  const { bike, r } = riding;
  let pedal = keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0;
  let brake = keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0;
  let steer = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  if (stickVec.y < -0.2) pedal = Math.max(pedal, Math.min(1, -stickVec.y * 1.25));
  if (stickVec.y > 0.2) brake = Math.max(brake, Math.min(1, stickVec.y * 1.25));
  steer = Math.max(-1, Math.min(1, steer + stickVec.x));
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight") || Math.hypot(stickVec.x, stickVec.y) > 0.95;
  const before = body.rigid.translation();
  const spec = bike.model.spec;
  const { vx, vz } = stepBike(r, { pedal, brake, steer, sprint }, { grounded: body.grounded, grade: rideGrade }, dt, spec);
  if (spec.motor) {
    engine.set(r.rpm, r.throttle, true);
    engine.horn(keys.has("KeyH"));
  }
  // Nothing passes through a wall: look ahead of the front wheel (or behind the back one)
  const dir = Math.sign(r.v);
  if (dir) {
    const f = { x: (-Math.sin(r.heading) * dir), y: 0, z: (-Math.cos(r.heading) * dir) };
    const hit = world.castRay(new RAPIER.Ray({ x: before.x, y: before.y - BODY_CENTRE + 0.5, z: before.z }, f), 1.2, true, undefined, undefined, undefined, body.rigid, (c) => !c.parent()?.isDynamic());
    if (hit && hit.toi < 0.92 + Math.abs(r.v) * dt) {
      if (Math.abs(r.v) > 3) logLine("Bump! Mind the walls.", true);
      r.v = 0;
    }
  }
  physicsTime += dt;
  const moveX = r.v ? vx : 0;
  const moveZ = r.v ? vz : 0;
  let steps = 0;
  for (; physicsTime >= STEP && steps < 6; steps++) {
    physicsTime -= STEP;
    stepPhysics(moveX, moveZ, 0);
  }
  if (physicsTime > STEP) physicsTime = 0;
  const after = body.rigid.translation();
  const flat = Math.hypot(after.x - before.x, after.z - before.z);
  if (body.grounded && flat > 0.02) {
    // the road's slope under the wheels, from how far the body rose per metre travelled
    const g = Math.max(-0.25, Math.min(0.25, ((after.y - before.y) / flat) * Math.sign(r.v || 1)));
    rideGrade += (g - rideGrade) * (1 - Math.exp(-dt * 6));
  } else if (body.grounded) rideGrade *= 1 - Math.min(1, dt * 3);
  // blocked by something the look-ahead missed (a corner, a kerb too tall to climb)
  const expected = Math.abs(r.v) * steps * STEP; // physics may take 0, 1 or 2 steps in a frame
  if (body.grounded && expected > 0.03 && flat < expected * 0.3) r.v *= 0.3;
  if (body.impact > 0.5 && body.grounded) {
    landBob = Math.min(0.09, body.impact * 0.025); // tyres and saddle give a little on landing
    body.impact = 0;
  }
  landBob *= Math.exp(-dt * 9);
  me.group.position.set(after.x, after.y - BODY_CENTRE, after.z);
  me.group.rotation.y = r.heading;
  rideRig.rotation.z = -r.lean;
  rideRig.position.y = -landBob;
  bike.model.pose({ steerAngle: r.steer, roll: r.roll, crankAngle: r.crank, kickstand: false, brake: brake > 0 });
  me.group.updateMatrixWorld(true);
  const m = bike.model;
  m.saddle.getWorldPosition(_w.saddle);
  m.grips[0].getWorldPosition(_w.gripL);
  m.grips[1].getWorldPosition(_w.gripR);
  m.pedals[1].getWorldPosition(_w.pedalL);
  m.pedals[0].getWorldPosition(_w.pedalR);
  const q = rideRig.getWorldQuaternion(new THREE.Quaternion());
  _w.right.set(1, 0, 0).applyQuaternion(q);
  _w.up.set(0, 1, 0).applyQuaternion(q);
  _w.back.set(0, 0, 1).applyQuaternion(q);
  me.group.localToWorld(_w.groundL.set(-0.36, 0.1, 0.12));
  me.group.localToWorld(_w.groundR.set(0.36, 0.1, 0.12));
  hero.update(dt, {
    speed: 0,
    grounded: true,
    turnRate: 0,
    facing: r.heading,
    lookAt: null,
    talk: 0,
    ride: { ...(_w), crank: spec.motor ? 0.6 : r.crank, effort: r.effort, footDown: r.footDown, backing: r.backing, backDist: r.backDist, posture: spec.posture },
  });
  // camera swings round behind the rider while moving, unless you are looking around
  if (!drag && Math.abs(r.v) > 1) camYaw = lerpAngle(camYaw, r.heading, 1 - Math.exp(-dt * 1.6));
  airTime = body.grounded ? 0 : airTime + dt;
}

const fixedOnly = (c) => {
  const p = c.parent();
  return !p || p.isFixed();
};
function groundAt(x, z, fromY) {
  const hit = world.castRay(new RAPIER.Ray({ x, y: fromY, z }, DOWN), 1.5, true, undefined, undefined, undefined, body.rigid, fixedOnly);
  return hit ? fromY - hit.toi : null;
}
let camNow = 5.5;
let sendTimer = 0;
let slowTimer = 0;
let lastSent = "";
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1) * timeScale;
  const now = performance.now();

  if (!me) {
    daylight.update(dt, camera.position);
    sun.position.copy(camera.position).add(SUN_OFFSET);
    sun.target.position.copy(camera.position);
    // Slow fly-around behind the join screen
    const t = now / 9000;
    camera.position.set(focus.x + Math.sin(t) * 120, 55, focus.z + Math.cos(t) * 120);
    camera.lookAt(focus.x, focus.height * 0.4, focus.z);
    draw();
    return;
  }

  const pos = me.group.position;
  if (seq && hero) seqFrame(dt);
  else if (riding && hero) rideFrame(dt);
  else walkFrame(dt, now);
  updateRideHint();
  daylight.update(dt / (timeScale || 1), pos);
  sun.position.copy(pos).add(SUN_OFFSET);
  sun.target.position.copy(pos);
  afterMove(dt, now, pos);
}
function updateRideHint() {
  const hint = $("#rideHint");
  const btn = $("#ride");
  let text = "";
  if (seq) {
    // what the character is doing while getting on or off
    const name = seq.steps[Math.max(0, seq.i)]?.name || "";
    hint.textContent = name.charAt(0).toUpperCase() + name.slice(1) + "…";
    hint.hidden = false;
    btn.hidden = true;
    return;
  }
  const near = riding ? null : nearestBike();
  if (riding && riding.bike.model.spec.motor) {
    const r = riding.r;
    const kmh = Math.round(Math.abs(r.v) * 3.6);
    text = r.v < -0.05 ? "Paddling it back · W to stop" : Math.abs(r.v) > 1.5 ? `${kmh} km/h${riding.bike.model.spec.cvt ? "" : " · gear " + r.gearNo} · W throttle · Shift full · S brake · H horn` : "E to get off · W throttle · hold S to back up · H horn";
  } else if (riding) text = riding.r.v < -0.05 ? "Walking it back · W to stop" : Math.abs(riding.r.v) > 1.5 ? "W pedal · S brake · A D steer · Shift sprint" : "E to get off · hold S to back up";
  else if (near) text = `E to ride the ${near.model.label}`;
  hint.textContent = text;
  hint.hidden = !text;
  btn.hidden = !(riding || near);
  btn.textContent = riding ? "Get off" : "Ride";
}
function walkFrame(dt, now) {
  const pos = me.group.position;
  // My movement, relative to where the camera looks
  let mx = stickVec.x;
  let mz = stickVec.y;
  if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
  const len = Math.hypot(mx, mz);
  let wantX = 0;
  let wantZ = 0;
  if (len > 0.05) {
    const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? RUN_SPEED : WALK_SPEED) * Math.min(1, len);
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    wantX = ((mx * cos + mz * sin) / len) * speed;
    wantZ = ((-mx * sin + mz * cos) / len) * speed;
  }
  // Speed up and slow down over a moment, and turn the body toward the way it is going.
  // In the air there is nothing to push against, so the body keeps the speed it left the ground with.
  const inAir = jumpState.phase === "air" && !body.grounded;
  if (jumpState.phase === "land") {
    const give = Math.sin(Math.PI * Math.min(1, jumpState.t)) * Math.min(1, jumpState.depth / 0.2);
    wantX *= 1 - 0.6 * give;
    wantZ *= 1 - 0.6 * give;
  }
  const accel = 1 - Math.exp(-dt * (inAir ? 0.4 : len > 0.05 ? 6 : 9));
  vel.x += (wantX - vel.x) * accel;
  vel.z += (wantZ - vel.z) * accel;
  const vx = vel.x;
  const vz = vel.z;
  const speedNow = Math.hypot(vx, vz);
  const facingBefore = me.group.rotation.y;
  if (speedNow > 0.25 && !inAir) me.group.rotation.y = lerpAngle(facingBefore, Math.atan2(-vx, -vz), 1 - Math.exp(-dt * 9));
  const turnRate = Math.atan2(Math.sin(me.group.rotation.y - facingBefore), Math.cos(me.group.rotation.y - facingBefore)) / Math.max(dt, 1e-3);
  const launchNow = updateJump(dt, keys.has("Space") || jumpHeld, speedNow);
  if (launchNow) pendingLaunch = launchNow; // used by the next physics step, which may come a frame later
  physicsTime += dt;
  for (let i = 0; physicsTime >= STEP && i < 6; i++) {
    physicsTime -= STEP;
    stepPhysics(vx, vz, pendingLaunch);
    pendingLaunch = 0;
  }
  if (physicsTime > STEP) physicsTime = 0; // fell too far behind (tab was in the background)
  const t = body.rigid.translation();
  if (t.y < -20) placeBody(0, 0, 72); // safety net: fell out of the world
  pos.set(t.x, t.y - BODY_CENTRE, t.z);
  airTime = body.grounded ? 0 : airTime + dt;
  if (hero) {
    // Who to look at: the closest person within a few metres
    let nearest = null;
    for (const a of players.values()) if (a.dist < 7 && (!nearest || a.dist < nearest.dist)) nearest = a;
    let talk = 0;
    if (voice.talking && voice.analyser) talk = Math.min(1, level(voice.analyser) * 9);
    else if (me.bubble && now - (me.bubbleUntil - CHAT_BUBBLE_MS) < 1600) talk = 0.25 + 0.25 * Math.sin(now / 55) * Math.sin(now / 23);
    hero.update(dt, {
      speed: speedNow,
      grounded: jumpState.phase === "air" ? false : airTime < 0.15,
      jump: { phase: jumpState.phase, t: jumpState.t, crouch: jumpState.crouch, run: jumpState.run, vy: body.vy, launchV: jumpState.launchV || Math.sqrt(2 * GRAVITY * JUMP_HEIGHT.stand) },
      turnRate,
      facing: me.group.rotation.y,
      lookAt: nearest ? lookTarget.set(nearest.group.position.x, nearest.group.position.y + 1.8, nearest.group.position.z) : null,
      friendly: Boolean(nearest),
      gesture: greetingOf(me, now),
      talk,
      groundAt,
    });
  }
}
let reflectionsDone = false;
// If the device cannot keep up with high quality, step down on its own after a few seconds.
const perf = { t: 0, frames: 0, checked: false };
function watchPerformance(dt) {
  if (perf.checked || !composer) return;
  perf.t += dt;
  perf.frames++;
  if (perf.t < 4) return;
  perf.checked = true;
  if (perf.frames / perf.t < 24) {
    composer = null;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    logLine("Switched to faster graphics for this device. Add ?q=high to the address to force full quality.", true);
  }
}
function afterMove(dt, now, pos) {
  watchPerformance(dt / (timeScale || 1));
  if (!reflectionsDone) {
    reflectionsDone = true;
    captureReflections();
  }
  animateWorld(now / 1000); // leaves moving in the breeze
  updateStreet(dt, pos);
  for (const p of props) {
    const pt = p.body.translation();
    if (pt.y < -20) {
      p.body.setTranslation(p.home, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    p.mesh.position.copy(pt);
    p.mesh.quaternion.copy(p.body.rotation());
  }

  // Other people: glide toward their latest known position
  const k = 1 - Math.exp(-dt * 12);
  for (const a of players.values()) {
    const p = a.group.position;
    p.x += (a.tx - p.x) * k;
    p.y += (a.ty - p.y) * k;
    p.z += (a.tz - p.z) * k;
    const moved = Math.hypot(a.tx - p.x, a.tz - p.z);
    const before = a.group.rotation.y;
    a.group.rotation.y = lerpAngle(a.group.rotation.y, a.try, k);
    a.dist = Math.hypot(p.x - pos.x, p.z - pos.z);
    showRemoteBike(a, dt, moved * k);
    // someone beside me offers a hand: take it
    if (a.gest === 3 && a.dist < 1.9 && !riding && now > myGreet.until && now > myGreet.cool && partnerOf(a) === me) {
      greet(3, true);
      myGreet.cool = now + 6000;
      logLine(`You shook hands with ${a.name}.`, true);
    }
    animateRemote(a, dt, moved * k, Math.atan2(Math.sin(a.group.rotation.y - before), Math.cos(a.group.rotation.y - before)), now);
  }
  for (const a of [me, ...players.values()]) {
    if (a.bubble && now > a.bubbleUntil) {
      a.group.remove(a.bubble);
      disposeLabel(a.bubble);
      a.bubble = null;
    }
    a.ring.rotation.z += dt * 2;
  }

  // Send my position 10 times a second, only when it changed
  sendTimer += dt;
  if (sendTimer >= 0.1) {
    sendTimer = 0;
    const lean = riding ? riding.r.lean : 0;
    const code = riding ? rideCode(riding.bike.model) : 0;
    const gcode = now < myGreet.until ? myGreet.code : 0;
    const state = `${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)},${me.group.rotation.y.toFixed(2)},${code},${lean.toFixed(2)},${jumpState.phase},${(jumpState.crouch || 0).toFixed(2)},${gcode}`;
    if (state !== lastSent) {
      lastSent = state;
      sendMsg({ t: "pos", x: pos.x, y: pos.y, z: pos.z, ry: me.group.rotation.y, b: code, l: lean, j: Math.max(0, JUMP_PHASES.indexOf(jumpState.phase)), c: +(jumpState.crouch || 0).toFixed(2), g: gcode });
    }
  }
  slowTimer += dt;
  if (slowTimer >= 0.3) {
    slowTimer = 0;
    updateVoiceLinks();
    updateNearby();
  }
  updateAudioPositions(camYaw);

  // Camera follows behind and above, and moves in closer rather than passing through a wall
  const eye = { x: pos.x, y: pos.y + (riding ? 1.75 : 1.55), z: pos.z };
  const dir = { x: Math.sin(camYaw) * Math.cos(camPitch), y: Math.sin(camPitch), z: Math.cos(camYaw) * Math.cos(camPitch) };
  const hit = world.castRay(new RAPIER.Ray(eye, dir), camDist + 0.4, true, undefined, undefined, undefined, body.rigid, fixedOnly);
  const reach = Math.max(0.6, (hit ? Math.min(camDist, hit.toi - 0.3) : camDist));
  camNow += (reach - camNow) * (reach < camNow ? 1 : 1 - Math.exp(-dt * 6));
  camera.position.set(eye.x + dir.x * camNow, Math.max(0.25, eye.y + dir.y * camNow), eye.z + dir.z * camNow);
  camera.lookAt(eye.x, eye.y, eye.z);
  if (debugCam) {
    camera.position.set(debugCam[0], debugCam[1], debugCam[2]);
    camera.lookAt(debugCam[3], debugCam[4], debugCam[5]);
  }
  me.tag.visible = camNow > 2.6; // my own name tag gets in the way up close
  draw();
}
frame();

// Small handle for automated tests and debugging in the console.
window.__tiu = {
  get nav() {
    return nav;
  },
  world,
  RAPIER,
  toLocal: worldInfo.toLocal,
  local: worldInfo.local,
  spots: worldInfo.spots,
  // free camera for screenshots: __tiu.cam(x, y, z, lookX, lookY, lookZ); __tiu.cam() to go back
  bikes: () => bikes.map((b) => ({ x: b.x, y: b.y, z: b.z, heading: b.heading, kind: b.model.kind, design: b.model.design })),
  // move a parked machine somewhere (street frame), for testing: __tiu.moveBike(i, lx, lz, turn)
  moveBike(i, lx, lz, turn = Math.PI / 2) {
    const b = bikes[i];
    world.removeCollider(b.collider, true);
    unbikeObstacle(b);
    scene.remove(b.stand);
    const [x, z] = worldInfo.local(lx, lz);
    parkBike(b, x, 0, z, entranceYaw + turn);
    return { x: b.x, z: b.z, heading: b.heading };
  },
  rideInfo: () => riding && { v: +riding.r.v.toFixed(2), kmh: +(riding.r.v * 3.6).toFixed(1), rpm: Math.round(riding.r.rpm), gear: riding.r.gearNo, design: riding.bike.model.design, heading: riding.r.heading, steer: +riding.r.steer.toFixed(3), lean: +riding.r.lean.toFixed(3), footDown: +riding.r.footDown.toFixed(2), grade: +rideGrade.toFixed(3) },
  slow(k = 1) {
    timeScale = k;
  },
  cam(...v) {
    debugCam = v.length === 6 ? v : null;
  },
  get me() {
    return me && { id: me.id, x: me.group.position.x, y: me.group.position.y, z: me.group.position.z, grounded: body.grounded, jump: jumpState.phase, crouch: jumpState.crouch, vy: body.vy };
  },
  players: () => [...players.values()].map((a) => ({ id: a.id, name: a.name, x: a.tx, y: a.ty, z: a.tz, dist: a.dist, voice: a.voice, speaking: a.speaking })),
  peers: () => [...peers].map(([id, p]) => ({ id, state: p.pc.connectionState, audio: Boolean(p.panner) })),
  props: () => props.map((p) => p.body.translation()),
  view(yaw, pitch = camPitch, dist = camDist) {
    camYaw = yaw;
    camPitch = pitch;
    camDist = dist;
  },
  entranceYaw,
  hero: () => Boolean(hero),
  // run the getting-on/off sequence ahead without drawing: __tiu.advance(1.5); returns the step
  advance(seconds) {
    for (let t = 0; t < seconds && seq; t += 1 / 30) seqFrame(1 / 30);
    return seq ? seq.steps[seq.i]?.name : riding ? "riding" : "walking";
  },
  ride: () => riding && { v: +riding.r.v.toFixed(2), heading: riding.r.heading, design: riding.bike.model.design },
  greet,
  // +1 when the character's face points the way the body is travelling, -1 when it is backwards
  facingCheck() {
    const eye = hero.model.getObjectByName("LeftEye").getWorldPosition(new THREE.Vector3());
    const head = hero.model.getObjectByName("Neck").getWorldPosition(new THREE.Vector3());
    const ry = me.group.rotation.y;
    const d = Math.hypot(eye.x - head.x, eye.z - head.z);
    return { dot: +(((eye.x - head.x) * -Math.sin(ry) + (eye.z - head.z) * -Math.cos(ry)) / d).toFixed(2), holderY: hero.model.rotation.y };
  },
  renderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }),
  // adds a stand-in person at a spot, to test looking at people without a second browser
  standIn(x, z) {
    const a = makeAvatar({ id: "stand-in", name: "Riya", dept: "", color: "#2ec4a6", x, y: 0, z, ry: 0, voice: false });
    players.set("stand-in", a);
    attachCharacter(a);
    return a.id;
  },
  stride: () => hero && hero.stride,
  // run the street on its own for a while (traffic and people only), to check how it behaves
  simulate(seconds, step = 0.1) {
    const pos = me.group.position;
    for (let i = 0; i < seconds / step; i++) updateStreet(step, pos);
  },
  traffic: () => traffic && traffic.vehicles.map((v) => ({ kind: v.kind, road: v.road, x: +v.x.toFixed(1), lat: +v.lat.toFixed(2), v: +v.v.toFixed(2), state: v.state, ind: v.ind })),
  crowd: () => crowd && crowd.people.map((p) => ({ role: p.role, x: +p.x.toFixed(1), z: +p.z.toFixed(2), task: p.tasks[0]?.type, act: p.tasks[0]?.act, left: p.tasks.length, sp: +p.speed.toFixed(2), body: p.bodyName })),
  crowdStats: () => crowd && crowd.stats,
  people: () => crowd && crowd.people, // the live person objects (tests)
  deals: () => crowd && crowd.deals(),
  bodies: () => crowdBodies.map((b) => b.name),
  vehicleDetail: () => traffic && traffic.vehicles.filter((v) => v.state !== "parked" && v.state !== "drive").map((v) => ({ kind: v.kind, road: v.road, state: v.state, x: +v.x.toFixed(2), lat: +v.lat.toFixed(2), latT: +v.latTarget.toFixed(2), v: +v.v.toFixed(2), slot: v.slot && v.slot.x, stopX: v.stopX })),
  // the clock: __tiu.time("19:30") fixes Indian time, __tiu.time() goes back to the real clock
  time(t) {
    daylight.setTime(t);
    return daylight.state;
  },
  daylight: () => daylight.state,
  teleport(x, z, y = 0) {
    placeBody(x, y, z);
  },
};
