import * as THREE from "three";
import RAPIER from "/vendor/rapier.es.js";
import { buildWorld } from "/world.js";
import { loadHero } from "/character.js";

await RAPIER.init(); // loads the physics engine (WebAssembly)

// ---------- Settings ----------
const CHAT_BUBBLE_MS = 5000;
const VOICE_CONNECT = 20; // metres: start a voice link when closer than this
const VOICE_DROP = 26; // metres: drop the link when farther than this
const NEARBY_RANGE = 20; // metres: who shows in the "Nearby" list
const MAX_VOICE_PEERS = 8; // direct browser-to-browser links; keep small
const WALK_SPEED = 1.9; // a relaxed human walk, metres a second
const RUN_SPEED = 4.8; // a steady run
const GRAVITY = 22;
const JUMP_SPEED = 5.6;
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
renderer.toneMappingExposure = 0.95;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.2, 1500);

// Soft light from the hazy sky plus a warm afternoon sun. The sun's shadow follows the player.
scene.add(new THREE.HemisphereLight("#dfe9f2", "#8a8468", 0.55));
const sun = new THREE.DirectionalLight("#fff0d2", 2.4);
const SUN_OFFSET = new THREE.Vector3(55, 85, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 260 });
sun.position.copy(SUN_OFFSET);
scene.add(sun, sun.target);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
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
  const w = Math.ceil(g.measureText(text).width) + size;
  const h = Math.ceil(size * 1.6);
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
const { places, props, focus, entranceYaw } = buildWorld({ RAPIER, scene, world, renderer, campus, makeLabel });

// My own body: a capsule moved by a character controller, so it walks up steps and
// ramps, slides along walls, falls with gravity and pushes loose objects.
const controller = world.createCharacterController(0.02);
controller.enableAutostep(0.4, 0.2, false);
controller.enableSnapToGround(0.3);
controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
controller.setMinSlopeSlideAngle((35 * Math.PI) / 180);
controller.setApplyImpulsesToDynamicBodies(true);
controller.setCharacterMass(60);
const body = { rigid: null, collider: null, vy: 0, grounded: false };

function spawnBody(x, y, z) {
  body.rigid = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + BODY_CENTRE, z));
  body.collider = world.createCollider(RAPIER.ColliderDesc.capsule(BODY_HALF, BODY_RADIUS), body.rigid);
}
function placeBody(x, y, z) {
  body.rigid.setTranslation({ x, y: y + BODY_CENTRE, z }, true);
  body.vy = 0;
}
// One fixed physics step. vx and vz are the walking speed in metres a second.
function stepPhysics(vx, vz, jump) {
  if (jump && body.grounded) body.vy = JUMP_SPEED;
  body.vy -= GRAVITY * STEP;
  controller.computeColliderMovement(body.collider, { x: vx * STEP, y: body.vy * STEP, z: vz * STEP });
  body.grounded = controller.computedGrounded();
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
  const tag = makeLabel(info.name, { height: 0.5 });
  tag.position.y = 2.95;
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
    bubbleY: 3.65,
    tx: info.x,
    ty: info.y || 0,
    tz: info.z,
    try: info.ry,
    bubble: null,
    bubbleUntil: 0,
    speaking: false,
    dist: Infinity,
  };
}
// My own avatar swaps the simple figure for the detailed animated character once it has loaded.
let hero = null;
const heroLoading = loadHero(renderer).catch((err) => {
  console.warn("Could not load the detailed character; using the simple figure.", err);
  return null;
});
async function attachHero(a) {
  const loaded = await heroLoading;
  if (!loaded) return;
  hero = loaded;
  for (const part of a.simple) part.visible = false;
  a.group.add(hero.model);
  a.tag.position.y = 2.2;
  a.ring.position.y = 2.02;
  a.ring.scale.setScalar(0.7);
  a.bubbleY = 2.85;
}
function removeAvatar(a) {
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
  a.bubble = makeLabel(short, { height: 0.6, color: "#14202e", bg: "rgba(255,255,255,.95)" });
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
        attachHero(me);
        camYaw = msg.you.ry;
        for (const p of msg.players) players.set(p.id, makeAvatar(p));
        $("#join").hidden = true;
        $("#join").style.display = "none";
        $("#hud").hidden = false;
        logLine(`Welcome, ${me.name}. Messages reach people within ${chatRange} m.`, true);
        break;
      case "full":
        $("#joinError").textContent = "The campus is full right now. Try again soon.";
        break;
      case "joined":
        players.set(msg.player.id, makeAvatar(msg.player));
        break;
      case "left": {
        const a = players.get(msg.id);
        if (a) removeAvatar(a);
        players.delete(msg.id);
        closePeer(msg.id);
        break;
      }
      case "snap":
        for (const [id, x, y, z, ry] of msg.p) {
          const a = players.get(id);
          if (a) Object.assign(a, { tx: x, ty: y, tz: z, try: ry });
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
});
addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "KeyV") setTalking(false);
});
addEventListener("blur", () => {
  keys.clear();
  setTalking(false);
});

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
  connect({ name: $("#name").value, dept: $("#dept").value, color: chosenColor });
});

// ---------- Main loop ----------
const clock = new THREE.Clock();
let physicsTime = 0;
let airTime = 0;
const vel = { x: 0, z: 0 };
const lookTarget = new THREE.Vector3();
const DOWN = { x: 0, y: -1, z: 0 };
// Height of the solid ground under a point, ignoring my own body and loose objects.
function groundAt(x, z, fromY) {
  const hit = world.castRay(new RAPIER.Ray({ x, y: fromY, z }, DOWN), 1.5, true, undefined, undefined, undefined, body.rigid, (c) => !c.parent()?.isDynamic());
  return hit ? fromY - hit.toi : null;
}
let camNow = 5.5;
let sendTimer = 0;
let slowTimer = 0;
let lastSent = "";
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();

  if (!me) {
    // Slow fly-around behind the join screen
    const t = now / 9000;
    camera.position.set(focus.x + Math.sin(t) * 120, 55, focus.z + Math.cos(t) * 120);
    camera.lookAt(focus.x, focus.height * 0.4, focus.z);
    renderer.render(scene, camera);
    return;
  }

  // My movement, relative to where the camera looks
  let mx = stickVec.x;
  let mz = stickVec.y;
  if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
  const len = Math.hypot(mx, mz);
  const pos = me.group.position;
  let wantX = 0;
  let wantZ = 0;
  if (len > 0.05) {
    const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? RUN_SPEED : WALK_SPEED) * Math.min(1, len);
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    wantX = ((mx * cos + mz * sin) / len) * speed;
    wantZ = ((-mx * sin + mz * cos) / len) * speed;
  }
  // Speed up and slow down over a moment, and turn the body toward the way it is going
  const accel = 1 - Math.exp(-dt * (len > 0.05 ? 6 : 9));
  vel.x += (wantX - vel.x) * accel;
  vel.z += (wantZ - vel.z) * accel;
  const vx = vel.x;
  const vz = vel.z;
  const speedNow = Math.hypot(vx, vz);
  const facingBefore = me.group.rotation.y;
  if (speedNow > 0.25) me.group.rotation.y = lerpAngle(facingBefore, Math.atan2(-vx, -vz), 1 - Math.exp(-dt * 9));
  const turnRate = Math.atan2(Math.sin(me.group.rotation.y - facingBefore), Math.cos(me.group.rotation.y - facingBefore)) / Math.max(dt, 1e-3);
  const jump = keys.has("Space") || jumpHeld;
  physicsTime += dt;
  for (let i = 0; physicsTime >= STEP && i < 6; i++) {
    physicsTime -= STEP;
    stepPhysics(vx, vz, jump);
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
      grounded: airTime < 0.15,
      turnRate,
      facing: me.group.rotation.y,
      lookAt: nearest ? lookTarget.set(nearest.group.position.x, nearest.group.position.y + 1.8, nearest.group.position.z) : null,
      friendly: Boolean(nearest),
      talk,
      groundAt,
    });
  }
  sun.position.copy(pos).add(SUN_OFFSET);
  sun.target.position.copy(pos);
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
    a.group.rotation.y = lerpAngle(a.group.rotation.y, a.try, k);
    a.dist = Math.hypot(p.x - pos.x, p.z - pos.z);
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
    const state = `${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)},${me.group.rotation.y.toFixed(2)}`;
    if (state !== lastSent) {
      lastSent = state;
      sendMsg({ t: "pos", x: pos.x, y: pos.y, z: pos.z, ry: me.group.rotation.y });
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
  const eye = { x: pos.x, y: pos.y + 1.55, z: pos.z };
  const dir = { x: Math.sin(camYaw) * Math.cos(camPitch), y: Math.sin(camPitch), z: Math.cos(camYaw) * Math.cos(camPitch) };
  const hit = world.castRay(new RAPIER.Ray(eye, dir), camDist + 0.4, true, undefined, undefined, undefined, body.rigid, (c) => !c.parent()?.isDynamic());
  const reach = Math.max(0.6, (hit ? Math.min(camDist, hit.toi - 0.3) : camDist));
  camNow += (reach - camNow) * (reach < camNow ? 1 : 1 - Math.exp(-dt * 6));
  camera.position.set(eye.x + dir.x * camNow, Math.max(0.25, eye.y + dir.y * camNow), eye.z + dir.z * camNow);
  camera.lookAt(eye.x, eye.y, eye.z);
  me.tag.visible = camNow > 2.6; // my own name tag gets in the way up close
  renderer.render(scene, camera);
}
frame();

// Small handle for automated tests and debugging in the console.
window.__tiu = {
  get me() {
    return me && { id: me.id, x: me.group.position.x, y: me.group.position.y, z: me.group.position.z, grounded: body.grounded };
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
    players.set("stand-in", makeAvatar({ id: "stand-in", name: "Riya", dept: "", color: "#2ec4a6", x, y: 0, z, ry: 0, voice: false }));
  },
  stride: () => hero && hero.stride,
  teleport(x, z, y = 0) {
    placeBody(x, y, z);
  },
};
