// The people of Street Number 2. Nobody here is a player; everyone has somewhere to be.
//
//   - Office staff walk briskly to and from Sector V with ID cards and bags; some stop for tea.
//   - Students come and go through the university gate, stand about in small groups talking, and
//     cross over to the tea stalls between classes.
//   - Local people stroll, carry shopping, sit on the stall benches with a cup.
//   - Every stall has its keeper: they greet a customer, make the tea at the kettle, hand the cup
//     over, wipe the counter, watch the street. The ice-cream man waits by his cart, the rickshaw
//     puller by his rickshaw, the guards at the two gates.
//   - People cross at the gap in the median: they wait at the kerb, look toward the oncoming
//     traffic, and go when it is clear (and traffic brakes for anyone on the road).
//   - Walkers keep to their side, step round each other, lamp posts and you, and slow when they
//     cannot pass. Each has their own pace, stride, height, build, clothes and habits (a call, a
//     glance at the phone), so no two move alike.
// Positions are in the street's own frame ("local"): x along the street, z across it toward the
// far side. A heading t faces local (-sin t, -cos t).
import * as THREE from "three";
import { makeCharacter } from "/character.js";
import { officeLook, studentLook, localLook, shopkeeperLook, guardLook } from "/looks.js";
import { pickBody } from "/crowdbodies.js";
import { varyBody } from "/character.js";

const DOMAIN = [-130, 150]; // walkers appear and leave beyond these ends of the street
const NEAR_FOOT = { lo: 6.95, hi: 8.2 }; // between the university's railing and the kerb
const FAR_FOOT = { lo: 26.0, hi: 29.1 }; // between the far kerb and the boundary wall
const CROSS_X = [6.6, 11.4]; // the gap in the median between the two gates
const TIU_DOOR = { x: 12, z: -7.9 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const headingOf = (dx, dz) => Math.atan2(-dx, -dz);

export function buildPeople({ scene, world, RAPIER, local, phi, spots, kitLoading, bodiesLoading, traffic, quality = "high", camera, seed = 31 }) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const range = (a, b) => a + rnd() * (b - a);
  const chance = (p) => rnd() < p;
  const low = quality === "low";
  const WALKERS = low ? 10 : 26;

  // ---------- where things are ----------
  const { stalls, openings, shed } = spots;
  const poles = spots.poles.map(([x, z]) => ({ x, z, r: 0.2 }));
  // the side of the far footpath people use: in front of the stalls and the tea shed there is
  // only the strip between the kerb and the railing or the shed's posts
  function farZ(x, dir) {
    const normal = dir > 0 ? 26.7 : 27.7;
    const zones = [
      [23.6, 50.4, 25.62],
      [58.5, 128.5, 25.62],
      [-6.9, 3.9, 25.72],
    ];
    for (const [a, b, z] of zones) {
      const k = Math.min(clamp((x - (a - 1.6)) / 1.6, 0, 1), clamp((b + 1.6 - x) / 1.6, 0, 1));
      if (k > 0) return normal + (z - normal) * k;
    }
    return normal;
  }
  const nearZ = (x, dir) => (dir > 0 ? 7.3 : 7.9);
  const laneZ = (side, x, dir) => (side === "near" ? nearZ(x, dir) : farZ(x, dir));
  const bounds = (side, x) => {
    if (side === "near") return NEAR_FOOT;
    const z = farZ(x, 1);
    return z < 26 ? { lo: z - 0.3, hi: z + 0.25 } : FAR_FOOT;
  };

  // places to stand, sit and serve from
  const customerSpots = [];
  const benchSeats = [];
  const keepers = [];
  stalls.forEach((st, i) => {
    const opening = openings.reduce((best, o) => (Math.abs(o - (st.cx0 + st.cx1) / 2) < Math.abs(best - (st.cx0 + st.cx1) / 2) ? o : best), openings[0]);
    st.opening = st.open ? (st.cx0 + st.cx1) / 2 : opening; // the northern row has no railing in front
    st.queue = [];
    st.kind = ["tea", "snack", "drink"][i % 3]; // what this stall sells decides what changes hands
    st.qr = [(st.cx0 + st.cx1) / 2, st.counterTop, st.counterFront + 0.14]; // the payment QR code stands here
    st.stock = st.kind === "drink" ? [st.cx1 - 0.45, 1.3, st.zf + 0.62] : [(st.cx0 + st.cx1) / 2 + 0.3, st.counterTop + 0.12, st.counterFront + 0.5];
    for (let x = st.cx0 + 0.4; x <= st.cx1 - 0.35; x += 0.72) customerSpots.push({ stall: st, x, z: st.counterFront - 0.42, face: Math.PI, taken: null });
    for (let x = st.bench.x0 + 0.25; x <= st.bench.x1 - 0.2; x += 0.62) benchSeats.push({ stall: st, x, z: st.bench.z, y: st.bench.y, taken: null });
    keepers.push({ stall: st, x: (st.cx0 + st.cx1) / 2, z: st.counterBack + 0.48, home: (st.cx0 + st.cx1) / 2, kettle: st.kettle, top: st.counterTop, front: st.counterFront });
    void i;
  });
  // the tea shed south of the gate: a long counter facing the road
  shed.queue = [];
  shed.opening = null;
  shed.kind = "tea";
  shed.qr = [(shed.x0 + shed.x1) / 2, shed.counterTop, shed.counterFront + 0.14];
  shed.stock = [(shed.x0 + shed.x1) / 2 + 0.3, shed.counterTop + 0.12, shed.counterFront + 0.5];
  for (let x = shed.x0 + 0.7; x <= shed.x1 - 0.6; x += 0.8) customerSpots.push({ stall: shed, x, z: shed.counterFront - 0.43, face: Math.PI, taken: null });
  keepers.push({ stall: shed, x: (shed.x0 + shed.x1) / 2, z: shed.counterBack + 0.45, home: (shed.x0 + shed.x1) / 2, kettle: shed.kettle, top: shed.counterTop, front: shed.counterFront });

  const groups = [
    { c: [4.6, 4.9], n: 3, kind: "student" }, // inside the gate, left of the drive
    { c: [24.6, 4.7], n: 3, kind: "student" }, // inside the gate, past the guard's cabin
    { c: [7.0, -3.2], n: 2, kind: "student" }, // under the portico
    { c: [17.4, -1.6], n: 2, kind: "office" }, // under the portico, by the reception
    { c: [10.6, 28.0], n: 3, kind: "mixed" }, // across the road, before the institute gate
    { c: [-16, 28.1], n: 2, kind: "local" }, // further along the far footpath
  ].map((g) => ({ ...g, members: [], speaker: 0, until: 0, slots: [] }));
  for (const g of groups) {
    for (let i = 0; i < g.n; i++) {
      const a = (i / g.n) * Math.PI * 2 + range(-0.3, 0.3);
      const r = g.n === 2 ? 0.55 : range(0.7, 0.85);
      g.slots.push({ x: g.c[0] + Math.cos(a) * r, z: g.c[1] + Math.sin(a) * r, taken: null });
    }
  }

  // ---------- the physics side: a capsule per person, and finding the ground ----------
  const staticOnly = (c) => {
    const p = c.parent();
    return !p || p.isFixed();
  };
  const ray = new RAPIER.Ray({ x: 0, y: 3, z: 0 }, { x: 0, y: -1, z: 0 });
  function groundAt(x, z) {
    const [wx, wz] = local(x, z);
    ray.origin = { x: wx, y: 3, z: wz };
    const hit = world.castRay(ray, 4, true, undefined, undefined, undefined, undefined, staticOnly);
    return hit ? 3 - hit.toi : 0.04;
  }
  const toWorld = (x, z, y) => {
    const [wx, wz] = local(x, z);
    return new THREE.Vector3(wx, y, wz);
  };

  // ---------- people ----------
  const ITEMS = ["cup", "phone", "glass", "packet", "softdrink", "note"];
  const hold = (p, item) => {
    for (const g of ITEMS) p.char.showGear(g, g === item);
  };
  const people = [];
  // Every person gets a different set of clothes colours: shirts in the colours a Kolkata office
  // street actually wears, trousers in navy, black, grey, khaki, denim; worked through in a
  // sequence that does not repeat, so even two people on the same body differ.
  const TOPS = [[1, 1, 1], [0.78, 0.86, 1], [1, 0.84, 0.86], [0.86, 1, 0.88], [1, 0.95, 0.78], [0.72, 0.74, 0.8], [1, 0.7, 0.6], [0.66, 0.78, 0.95], [0.9, 0.8, 1], [0.95, 0.95, 0.9]];
  const BOTTOMS = [[1, 1, 1], [0.6, 0.65, 0.85], [0.55, 0.55, 0.58], [1.05, 0.95, 0.78], [0.8, 0.85, 1], [0.7, 0.62, 0.55], [0.45, 0.45, 0.5]];
  let variantNo = 0;
  let transitT = 3;
  function variant(role) {
    const n = variantNo++;
    const plain = role === "guard"; // the guards keep their uniform
    return {
      hue: plain ? 0 : ((n * 0.618034) % 1) * Math.PI * 2,
      sat: plain ? 1 : 0.5 + ((n * 0.381966) % 1) * 0.42, // muted, as worn clothes are
      top: plain ? [1, 1, 1] : TOPS[n % TOPS.length],
      bottom: plain ? [1, 1, 1] : BOTTOMS[Math.floor(n / 3) % BOTTOMS.length],
    };
  }
  const stats = { arrived: 0, vanished: 0, crossed: 0 };
  let kit = null;
  const LOOKS = { office: officeLook, student: studentLook, local: localLook, keeper: shopkeeperLook, guard: guardLook, vendor: shopkeeperLook };
  function person(role, x, z, heading = 0) {
    const look = LOOKS[role](rnd);
    // a photographic body when one has loaded: women and men alike, except at the stalls and gates
    const sex = role === "keeper" || role === "guard" || role === "vendor" ? "m" : chance(role === "local" ? 0.38 : 0.45) ? "f" : "m";
    const bodyKit = pickBody(role === "vendor" ? "keeper" : role, sex, rnd);
    let c;
    if (bodyKit) {
      const gear = [{ kind: "cup", clay: chance(0.5) }, "phone", "glass", { kind: "packet", color: ["#d8262c", "#f0b400", "#1c7a3c", "#2a4fb0", "#e86a10"][(rnd() * 5) | 0] }, "softdrink", "note"];
      if (role === "student" && chance(sex === "m" ? 0.6 : 0.4)) gear.push({ kind: "backpack", color: ["#1f2a3c", "#3a3a3a", "#6a1f22", "#24503a", "#2a2a5a", "#c0782a"][(rnd() * 6) | 0] });
      if (role === "office" && chance(0.4)) gear.push("sling");
      if (role === "local" && chance(0.3)) gear.push({ kind: "carrybag", color: ["#d9c28a", "#c84a3a", "#3a7a5a", "#e8e0d0"][(rnd() * 4) | 0] });
      // and the small things that tell people apart at a glance
      if (chance(role === "office" ? 0.3 : 0.18)) gear.push("glasses");
      if ((role === "local" || role === "student") && sex === "m" && chance(0.1)) gear.push({ kind: "cap", color: ["#a52a22", "#1f2a3c", "#e8e0d0", "#2d5a3a"][(rnd() * 4) | 0] });
      if (role === "office" && chance(0.35)) gear.push("lanyard");
      // heights spread like a real street (about 1.52 to 1.83 m), and clothes coloured per person
      c = makeCharacter(bodyKit.kit, { gear, height: (sex === "f" ? 0.93 : 0.95) + rnd() * 0.12, lite: true });
      varyBody(c, variant(role));
      look.pace *= sex === "f" ? 0.95 : 1;
    } else {
      const gear = [...(look.gear || []), { kind: "cup", clay: chance(0.5) }, "phone", "glass", "packet", "softdrink", "note"];
      c = makeCharacter(kit, { look: look.look, gear, height: look.height, build: look.build, lite: true });
    }
    for (const g of ITEMS) c.showGear(g, false);
    const group = new THREE.Group();
    group.add(c.model);
    scene.add(group);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(RAPIER.ColliderDesc.capsule(0.55 * look.height, 0.24).setTranslation(0, 0.85 * look.height, 0), body);
    const p = {
      role,
      bodyName: bodyKit ? bodyKit.name : "fallback",
      char: c,
      group,
      body,
      x,
      z,
      y: groundAt(x, z),
      groundT: rnd() * 0.4,
      heading,
      want: heading,
      vx: 0,
      vz: 0,
      speed: 0,
      pace: look.pace * range(0.93, 1.07),
      offset: range(-0.18, 0.18),
      side: null,
      tasks: [],
      gesture: {},
      lookAt: null,
      talk: 0,
      nod: 0,
      shake: 0,
      sit: null,
      // a face and manner of their own: the look they wear by default, how often it changes, the
      // small things they do with their hands
      baseExpr: pickW([["neutral", 5], ["softSmile", 2], ["tired", 1], ["concentrating", 1], ["bored", 1], ["squinting", 1.5], ["worried", 0.7], ["proud", 0.7], ["annoyed", 0.6], ["polite", 1], ["thinking", 1]]),
      expr: "neutral",
      exprT: 0,
      fidget: pickW([["watch", 2], ["scratch", 2], ["brow", 2], ["strap", 2], ["chin", 1], ["hip", 1], ["none", 2]]),
      fidgetT: range(6, 30),
      fidgetFor: 0,
      humour: rnd(), // how readily they laugh
      habit: rnd(), // phone habits while walking
      habitT: range(4, 20),
      busy: null, // what a phone habit is doing right now
      glanceT: range(1, 5),
      dtAcc: 0,
      frame: (rnd() * 3) | 0,
      radius: 0.27,
      cup: false,
    };
    people.push(p);
    return p;
  }
  function remove(p) {
    scene.remove(p.group);
    world.removeRigidBody(p.body);
    for (const list of [customerSpots, benchSeats]) for (const sp of list) if (sp.taken === p) sp.taken = null;
    for (const g of groups) {
      g.members = g.members.filter((m) => m !== p);
      for (const sl of g.slots) if (sl.taken === p) sl.taken = null;
    }
    for (const k of keepers) k.stall.queue = k.stall.queue.filter((q) => q !== p);
    people.splice(people.indexOf(p), 1);
    p.group.traverse((o) => {
      if (o.isMesh) o.material.dispose?.();
    });
  }

  // ---------- plans: lists of tasks ----------
  const lane = (side, dir, xTo) => ({ type: "lane", side, dir, xTo });
  const goto = (x, z, opts = {}) => ({ type: "goto", x, z, ...opts });
  function crossTasks(from, xc) {
    if (from === "near")
      return [goto(xc, 8.12), { type: "waitClear", road: "near", x: xc, look: [xc - 30, 12] }, goto(xc + range(-0.3, 0.3), 17.1, { road: true }), { type: "waitClear", road: "far", x: xc, look: [xc + 30, 22] }, goto(xc, 25.8, { road: true, setSide: "far" })];
    return [goto(xc, 25.8), { type: "waitClear", road: "far", x: xc, look: [xc + 30, 22] }, goto(xc + range(-0.3, 0.3), 16.9, { road: true }), { type: "waitClear", road: "near", x: xc, look: [xc - 30, 12] }, goto(xc, 8.05, { road: true, setSide: "near" }), goto(xc, 7.45)];
  }
  // walk from one side's footpath at x to somewhere: the other end, the university, a stall...
  function planFrom(p, side, x, purpose) {
    const t = [];
    let at = { side, x };
    const walkTo = (wantSide, xTo) => {
      if (at.side !== wantSide) {
        const xc = range(...CROSS_X);
        t.push(lane(at.side, Math.sign(xc - at.x) || 1, xc), ...crossTasks(at.side, xc));
        at = { side: wantSide, x: xc };
      }
      t.push(lane(wantSide, Math.sign(xTo - at.x) || 1, xTo));
      at.x = xTo;
    };
    if (purpose === "university") {
      const gx = range(9.3, 14.7);
      walkTo("near", gx);
      const o = range(-1.3, 1.3);
      t.push(goto(gx, 6.0), goto(TIU_DOOR.x + o, 3.9), goto(TIU_DOOR.x + o, 2.6), goto(TIU_DOOR.x + o * 0.7, TIU_DOOR.z), { type: "vanish" });
    } else if (purpose === "tea") {
      const free = customerSpots.filter((sp) => !sp.taken);
      if (!free.length) return planFrom(p, side, x, "pass");
      const sp = free[(rnd() * free.length) | 0];
      sp.taken = p;
      const st = sp.stall;
      if (st.opening) {
        walkTo("far", st.opening);
        t.push(goto(st.opening, 26.32, { free: true }), goto(sp.x, sp.z, { free: true }));
      } else {
        walkTo("far", sp.x);
        t.push(goto(sp.x, sp.z, { free: true }));
      }
      t.push({ type: "customer", spot: sp, T: range(35, 150) });
      if (st.opening) t.push(goto(st.opening, 26.32, { free: true }), goto(st.opening, 25.62, { free: true }));
      else t.push(goto(sp.x, 25.72, { free: true }));
      at = { side: "far", x: st.opening || sp.x };
      // then back to class, or on along the street
      if (p.role === "student" && chance(0.6)) {
        const rest = planFrom(p, "far", at.x, "university");
        t.push(...rest);
        return t;
      }
      const dir = chance(0.5) ? 1 : -1;
      walkTo(chance(0.25) ? "near" : "far", dir > 0 ? DOMAIN[1] + 5 : DOMAIN[0] - 5);
      t.push({ type: "vanish" });
    } else if (purpose === "bench") {
      const free = benchSeats.filter((b) => !b.taken);
      if (!free.length) return planFrom(p, side, x, "tea");
      const seat = free[(rnd() * free.length) | 0];
      seat.taken = p;
      walkTo("far", seat.stall.opening);
      t.push(goto(seat.stall.opening, 26.32, { free: true }), goto(seat.x, 27.55, { free: true }), { type: "bench", seat, T: range(50, 180) }, goto(seat.x, 27.4, { free: true }), goto(seat.stall.opening, 26.32, { free: true }), goto(seat.stall.opening, 25.62, { free: true }));
      at = { side: "far", x: seat.stall.opening };
      walkTo("far", chance(0.5) ? DOMAIN[1] + 5 : DOMAIN[0] - 5);
      t.push({ type: "vanish" });
    } else if (purpose === "group") {
      const options = groups.filter((g) => g.slots.some((sl) => !sl.taken) && (g.kind === "mixed" || g.kind === p.role));
      if (!options.length) return planFrom(p, side, x, p.role === "student" ? "university" : "pass");
      const g = options[(rnd() * options.length) | 0];
      const sl = g.slots.find((q) => !q.taken);
      sl.taken = p;
      const farGroup = g.c[1] > 20;
      if (farGroup) walkTo("far", g.c[0]);
      else {
        const gx = range(9.3, 14.7);
        walkTo("near", gx);
        t.push(goto(gx, 6.0));
        if (g.c[1] < 0) t.push(goto(g.c[0], 3.6), goto(g.c[0], 2.4));
      }
      t.push(goto(sl.x, sl.z, { free: true }), { type: "group", g, slot: sl, T: range(40, 200) });
      // afterwards: into the university, or away
      if (!farGroup && chance(0.7)) {
        const o = range(-1.2, 1.2);
        t.push(goto(TIU_DOOR.x + o, 2.6, { free: true }), goto(TIU_DOOR.x + o, TIU_DOOR.z), { type: "vanish" });
      } else {
        at = { side: farGroup ? "far" : "near", x: g.c[0] };
        if (!farGroup) t.push(goto(range(9.3, 14.7), 6.2, { free: true }), goto(range(9.3, 14.7), 7.4));
        walkTo(at.side, chance(0.5) ? DOMAIN[1] + 5 : DOMAIN[0] - 5);
        t.push({ type: "vanish" });
      }
    } else {
      // passing through: on to the far end (sometimes over the road on the way)
      const dir = x < (DOMAIN[0] + DOMAIN[1]) / 2 ? 1 : -1;
      const endSide = chance(0.12) ? (side === "near" ? "far" : "near") : side;
      walkTo(endSide, dir > 0 ? DOMAIN[1] + 5 : DOMAIN[0] - 5);
      t.push({ type: "vanish" });
    }
    return t;
  }
  const PURPOSES = {
    office: [["pass", 70], ["tea", 18], ["university", 8], ["group", 4]],
    student: [["university", 34], ["tea", 22], ["group", 22], ["bench", 6], ["pass", 16]],
    local: [["pass", 62], ["tea", 16], ["bench", 18], ["group", 4]],
  };
  const pickW = (pairs) => {
    let t = rnd() * pairs.reduce((n, [, w]) => n + w, 0);
    for (const [v, w] of pairs) if ((t -= w) <= 0) return v;
    return pairs[0][0];
  };
  // a new arrival from one of the ends of the street, out of the university, or out of the
  // institute across the road
  function arrive(prefill = false) {
    const role = pickW([["office", 4], ["student", 4], ["local", 3]]);
    const source = pickW([["ends", 6], ["university", role === "local" ? 0 : role === "student" ? 3 : 1], ["institute", 1]]);
    let p;
    if (source === "university" && !prefill) {
      const o = range(-1.3, 1.3);
      p = person(role, TIU_DOOR.x + o, TIU_DOOR.z, Math.PI);
      const gx = range(9.3, 14.7);
      p.tasks.push(goto(TIU_DOOR.x + o, 2.6, { free: true }), goto(TIU_DOOR.x + o, 3.9, { free: true }), goto(gx, 6.0, { free: true }), goto(gx, 7.45, { setSide: "near" }));
      p.side = "near";
      const purpose = role === "student" ? pickW([["tea", 5], ["pass", 4], ["group", 1]]) : "pass";
      p.tasks.push(...planFrom(p, "near", gx, purpose));
    } else if (source === "institute" && !prefill) {
      const gx = range(9, 15);
      p = person(role, gx, 30.8, 0);
      p.tasks.push(goto(gx, 28.4, { free: true }), goto(gx, 27.2, { setSide: "far" }));
      p.side = "far";
      p.tasks.push(...planFrom(p, "far", gx, pickW(PURPOSES[role].filter(([k]) => k !== "university" || role !== "local"))));
    } else {
      const side = chance(0.5) ? "near" : "far";
      const dir = chance(0.5) ? 1 : -1;
      const x = prefill ? range(DOMAIN[0] + 10, DOMAIN[1] - 10) : dir > 0 ? DOMAIN[0] - 2 : DOMAIN[1] + 2;
      p = person(role, x, laneZ(side, x, dir), headingOf(dir, 0));
      p.side = side;
      p.tasks.push(...planFrom(p, side, x, pickW(PURPOSES[role])));
      if (prefill) p.z = laneZ(side, x, Math.sign(p.tasks[0]?.xTo - x || dir)) + p.offset;
    }
    return p;
  }

  // ---------- the people who stay put ----------
  const residents = [];
  function settle() {
    for (const k of keepers) {
      const p = person("keeper", k.x, k.z, 0);
      p.tasks.push({ type: "keeper", k, act: "idle", t: range(1, 4), target: null });
      residents.push(p);
    }
    {
      const [cx, cz] = spots.cart;
      const p = person("vendor", cx + 0.2, cz + 0.95, 0);
      p.tasks.push({ type: "vendor", t: 0 });
      const [rx, rz] = spots.rickshaw;
      const q = person("local", rx - 0.9, rz + 0.95, headingOf(1, 0));
      q.tasks.push({ type: "vendor", t: 0, arms: true });
      residents.push(p, q);
    }
    for (const [gx, gz, face] of [[17.7, 4.75, Math.PI], [15.7, 30.3, 0]]) {
      const p = person("guard", gx, gz, face);
      p.tasks.push({ type: "guard", home: [gx, gz], face, t: range(10, 30) });
      residents.push(p);
    }
    // the morning's crowd, already in place
    for (const g of groups) {
      for (const sl of g.slots) {
        if (chance(0.15)) continue;
        const role = g.kind === "mixed" ? pickW([["student", 2], ["office", 1], ["local", 1]]) : g.kind;
        const p = person(role, sl.x, sl.z, headingOf(g.c[0] - sl.x, g.c[1] - sl.z));
        sl.taken = p;
        p.tasks.push({ type: "group", g, slot: sl, T: range(20, 200) });
        const near = g.c[1] < 20;
        if (near) {
          const o = range(-1.2, 1.2);
          p.tasks.push(goto(TIU_DOOR.x + o, 2.6, { free: true }), goto(TIU_DOOR.x + o, TIU_DOOR.z), { type: "vanish" });
        } else {
          p.side = "far";
          p.tasks.push(goto(g.c[0], 27.2), lane("far", chance(0.5) ? 1 : -1, chance(0.5) ? DOMAIN[1] + 5 : DOMAIN[0] - 5), { type: "vanish" });
        }
      }
    }
    for (const sp of customerSpots) {
      if (!chance(low ? 0.25 : 0.45)) continue;
      const role = pickW([["office", 3], ["student", 3], ["local", 3]]);
      const p = person(role, sp.x, sp.z, sp.face);
      sp.taken = p;
      p.side = "far";
      p.served = true;
      p.tasks.push({ type: "customer", spot: sp, T: range(10, 120), started: true });
      const opening = sp.stall.opening;
      if (opening) p.tasks.push(goto(opening, 26.32, { free: true }), goto(opening, 25.62, { free: true }));
      else p.tasks.push(goto(sp.x, 25.72, { free: true }));
      p.tasks.push(...planFrom(p, "far", opening || sp.x, chance(0.5) && role === "student" ? "university" : "pass").filter((t) => t.type !== "customer"));
    }
    for (const seat of benchSeats) {
      if (!chance(low ? 0.3 : 0.55)) continue;
      const p = person(pickW([["local", 3], ["office", 1], ["student", 2]]), seat.x, seat.z, 0);
      seat.taken = p;
      p.side = "far";
      p.tasks.push({ type: "bench", seat, T: range(20, 160) }, goto(seat.x, 27.4, { free: true }), goto(seat.stall.opening, 26.32, { free: true }), goto(seat.stall.opening, 25.62, { free: true }), lane("far", -1, DOMAIN[0] - 5), { type: "vanish" });
    }
    for (let i = 0; i < WALKERS * 0.8; i++) arrive(true);
  }

  // ---------- moving: toward a point, round everybody else ----------
  const others = []; // everyone to keep clear of this frame: [x, z, radius, vx, vz]
  function steer(p, tx, tz, speed, dt, clampSide) {
    let dx = tx - p.x;
    let dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-3) return 0;
    dx /= dist;
    dz /= dist;
    const v = speed * Math.min(1, dist / 0.6 + 0.35);
    let fx = dx * v;
    let fz = dz * v;
    // personal space: push away from people and posts close by, more from those ahead, and step
    // to one side to pass someone in the way
    let ahead = 0;
    for (const o of others) {
      if (o.p === p) continue;
      const rx = p.x - o.x;
      const rz = p.z - o.z;
      const d = Math.hypot(rx, rz);
      if (d > 3.2 || d < 1e-4) continue;
      const gap = d - (p.radius + o.r);
      const nx = rx / d;
      const nz = rz / d;
      const front = -(nx * dx + nz * dz); // 1 when straight ahead
      const w = 0.45 + 0.55 * Math.max(0, front);
      const push = 1.25 * Math.exp(-gap / 0.38) * w;
      fx += nx * push;
      fz += nz * push;
      if (front > 0.55 && gap < 1.4) {
        // pass on the side they are not on; keep left when it's a draw
        const side = Math.sign(-dz * rx + dx * rz) || 1;
        fx += -dz * side * 0.55;
        fz += dx * side * 0.55;
        // someone slower right in front, and nowhere to go: slow down behind them
        const theirs = o.vx * dx + o.vz * dz;
        if (gap < 0.5) ahead = Math.max(ahead, 1 - Math.max(0, theirs) / Math.max(0.3, v));
      }
    }
    const len = Math.hypot(fx, fz);
    const cap = v * 1.15 * (1 - 0.6 * ahead);
    if (len > cap) {
      fx *= cap / len;
      fz *= cap / len;
    }
    // ease into the new velocity, the way a person shifts their weight
    const k = 1 - Math.exp(-dt * 5);
    p.vx += (fx - p.vx) * k;
    p.vz += (fz - p.vz) * k;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    solidPush(p);
    if (clampSide) {
      const b = bounds(clampSide, p.x);
      p.z = clamp(p.z, b.lo, b.hi);
    }
    return dist;
  }
  // Bodies do not pass through things: after moving, anyone overlapping a fixed thing (a post, a
  // parked bike, a player standing still) or another person is pushed back out along the line
  // between them. Two people share the push; a fixed thing does not move.
  function solidPush(p) {
    for (const o of others) {
      if (o.p === p) continue;
      const rx = p.x - o.x;
      const rz = p.z - o.z;
      const d = Math.hypot(rx, rz);
      const need = p.radius + o.r - 0.04;
      if (d >= need || d < 1e-5) continue;
      const k = (need - d) * (o.p ? 0.5 : 1);
      p.x += (rx / d) * k;
      p.z += (rz / d) * k;
    }
  }
  function stand(p, dt, face) {
    const k = 1 - Math.exp(-dt * 6);
    p.vx -= p.vx * k;
    p.vz -= p.vz * k;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    if (face !== undefined) p.want = face;
  }

  // ---------- behaviour ----------
  const lookPt = (x, z, y) => toWorld(x, z, y);
  const nearestTo = (p, maxD, filter = () => true) => {
    let best = null;
    let bd = maxD;
    for (const o of others) {
      if (o.p === p || !filter(o)) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  };
  const chatter = (t, seed2) => 0.22 + 0.3 * Math.abs(Math.sin(t * 7.3 + seed2) * Math.sin(t * 3.1 + seed2 * 2));
  function act(p, dt, t) {
    const task = p.tasks[0];
    p.gesture = {};
    p.nod = 0;
    p.shake = 0;
    p.talk = 0;
    p.sit = null;
    p.lookAt = null;
    p.exprT -= dt;
    if (p.exprT < 0) {
      // mostly their usual look; now and then something passes across the face
      p.exprNow = chance(0.65) ? p.baseExpr : pickW([["neutral", 3], ["softSmile", 2], ["thinking", 1], ["squinting", 1], ["curious", 1], ["bored", 1], ["relief", 0.5], ["yawn", 0.3], ["amused", 0.8]]);
      p.exprT = p.exprNow === "yawn" ? 2.2 : range(5, 22);
    }
    p.expr = p.exprNow || p.baseExpr;
    if (!task) return remove(p);
    switch (task.type) {
      case "lane": {
        p.side = task.side;
        // stuck behind someone for a while: try the other side of the pavement
        if (p.speed < 0.3) p.stuck = (p.stuck || 0) + dt;
        else p.stuck = 0;
        if (p.stuck > 2.5) {
          p.offset = range(-0.6, 0.6);
          p.stuck = 0;
        }
        const z = laneZ(task.side, p.x, task.dir) + p.offset * (task.side === "near" ? 0.6 : 1);
        steer(p, p.x + task.dir * 2.5, z, p.pace, dt, task.side);
        if ((p.x - task.xTo) * task.dir >= 0) p.tasks.shift();
        walkingHabits(p, dt, t);
        break;
      }
      case "goto": {
        const d = steer(p, task.x, task.z, task.road ? p.pace * 1.2 : p.pace * (task.free ? 0.85 : 1), dt, null);
        if (d < (task.free ? 0.12 : 0.35)) {
          if (task.setSide) p.side = task.setSide;
          p.tasks.shift();
        }
        if (task.road) p.lookAt = lookPt(p.x + (p.z < 17 ? -12 : 12), p.z < 17 ? 12 : 22, 1.2);
        else walkingHabits(p, dt, t);
        break;
      }
      case "waitClear": {
        stand(p, dt, headingOf(0, task.road === "near" ? (p.z < 12 ? 1 : -1) : p.z < 22 ? 1 : -1));
        task.waited = (task.waited || 0) + dt;
        p.lookAt = lookPt(task.look[0], task.look[1], 1.1);
        if (traffic.clearToCross(task.road, task.x, 6.5)) task.clear = (task.clear || 0) + dt;
        else task.clear = 0;
        if (task.clear > range(0.4, 0.9) || task.waited > 40) p.tasks.shift();
        break;
      }
      case "customer":
        customer(p, task, dt, t);
        break;
      case "bench":
        bench(p, task, dt, t);
        break;
      case "group":
        groupTalk(p, task, dt, t);
        break;
      case "keeper":
        keeper(p, task, dt, t);
        break;
      case "guard":
        guard(p, task, dt, t);
        break;
      case "vendor":
        vendor(p, task, dt, t);
        break;
      case "waitTransit":
        waitTransit(p, task, dt, t);
        break;
      case "board":
        board(p, task, dt, t);
        break;
      case "alight":
        alight(p, task, dt, t);
        break;
      case "payDriver":
        payDriver(p, task, dt, t);
        break;
      case "vanish":
        stats.vanished++;
        remove(p);
        return;
    }
  }
  // ---------- buses and autos: waiting, getting on, getting off ----------
  // The stops are where the buses and shared autos pull in (traffic.js). People wait on the
  // pavement beside them looking up the road for their vehicle; when one has stopped they walk to
  // its door and climb in: up the bus's front step (38 cm, holding the rail), or ducking into the
  // auto's open side. Those arriving climb down first; auto passengers walk round to the driver
  // and pay before going on their way. The vehicle waits while anyone is still getting on or off.
  const pavementOf = (road) => (road === "near" ? 7.85 : 25.95);
  const kerbSide = (road) => (road === "near" ? -1 : 1); // from the road toward the pavement
  function door(veh, inside = false) {
    const k = kerbSide(veh.road);
    const along = veh.kind === "bus" ? veh.L / 2 - 1.15 : -0.25;
    return { x: veh.x + veh.dir * along, z: veh.lat + k * (inside ? veh.W / 2 - 0.4 : veh.W / 2 + 0.25) };
  }
  const stopSpots = [];
  for (const road of ["near", "far"]) for (const st of traffic.stops[road]) stopSpots.push({ road, x: st.x, kinds: st.kinds, waiting: [] });
  function transitWaiter() {
    const st = stopSpots[(rnd() * stopSpots.length) | 0];
    if (st.waiting.length >= (st.kinds.includes("bus") ? 5 : 3)) return;
    const role = pickW([["office", 4], ["student", 3], ["local", 3]]);
    const from = chance(0.5) ? -1 : 1;
    const x0 = clamp(st.x + from * range(25, 45), DOMAIN[0] + 2, DOMAIN[1] - 2);
    const p = person(role, x0, laneZ(st.road, x0, -from), headingOf(-from, 0));
    p.side = st.road;
    const spot = { x: st.x + range(-3, 3), z: pavementOf(st.road) + kerbSide(st.road) * -range(0, 0.35) };
    p.tasks.push(lane(st.road, -from, spot.x), goto(spot.x, spot.z), { type: "waitTransit", stop: st, spot, kinds: st.kinds, T: range(60, 200) });
    st.waiting.push(p);
  }
  function waitTransit(p, task, dt, t) {
    const st = task.stop;
    // face the road, looking up it for the vehicle now and then; a phone passes the time
    stand(p, dt, headingOf(0, -kerbSide(st.road)));
    task.look = (task.look || 0) - dt;
    if (task.look < -4) task.look = range(3, 7);
    if (task.look > 0) p.lookAt = lookPt(st.x - (st.road === "near" ? 1 : -1) * 40, st.road === "near" ? 12 : 22, 1.2);
    else p.gesture = { text: 1 };
    task.T -= dt;
    for (const veh of traffic.vehicles) {
      if (veh.road !== st.road || !veh.atStop || !task.kinds.includes(veh.kind) || Math.abs(veh.x - st.x) > 6) continue;
      if ((veh.seats ?? (veh.kind === "bus" ? 6 : 3)) <= 0) continue;
      veh.seats = (veh.seats ?? (veh.kind === "bus" ? 6 : 3)) - 1;
      veh.boarding = (veh.boarding || 0) + 1;
      st.waiting = st.waiting.filter((q) => q !== p);
      p.tasks[0] = { type: "board", veh, stop: st, phase: "walk", t: 0 };
      return;
    }
    if (task.T < 0) {
      // gave up waiting: walk on
      st.waiting = st.waiting.filter((q) => q !== p);
      p.tasks.shift();
      p.tasks.push(lane(st.road, chance(0.5) ? 1 : -1, chance(0.5) ? DOMAIN[0] - 5 : DOMAIN[1] + 5), { type: "vanish" });
    }
  }
  function board(p, task, dt, t) {
    const veh = task.veh;
    const gone = !traffic.vehicles.includes(veh) || !veh.atStop;
    if (gone && task.phase === "walk") {
      // it left without them: back to waiting
      p.tasks[0] = { type: "waitTransit", stop: task.stop, spot: { x: p.x, z: pavementOf(task.stop.road) }, kinds: task.stop.kinds, T: range(40, 120) };
      task.stop.waiting.push(p);
      return;
    }
    const d = door(veh);
    if (task.phase === "walk") {
      if (steer(p, d.x, d.z, p.pace * 1.15, dt, null) < 0.18) {
        task.phase = "in";
        task.t = 0;
        task.from = { x: p.x, z: p.z };
      }
      return;
    }
    // climbing in: facing the door, up the step (bus) or ducking under the roof (auto)
    task.t += dt;
    const bus = veh.kind === "bus";
    const k = Math.min(1, task.t / (bus ? 1.1 : 1.0));
    const inn = door(veh, true);
    p.x = task.from.x + (inn.x - task.from.x) * k;
    p.z = task.from.z + (inn.z - task.from.z) * k;
    p.vx = p.vz = 0;
    p.want = headingOf(inn.x - task.from.x, inn.z - task.from.z);
    if (bus) {
      p.lift = 0.38 * Math.min(1, k * 1.6); // one step up into the bus
      p.gesture = { hold: 0, take: 1 };
      p.gestureAt = null;
    } else {
      p.lift = -0.12 * Math.sin(Math.PI * Math.min(1, k * 1.2)); // ducking under the roof
      p.nod = 0.6 * Math.sin(Math.PI * k);
    }
    if (k >= 1) {
      veh.boarding = Math.max(0, (veh.boarding || 1) - 1);
      stats.boarded = (stats.boarded || 0) + 1;
      p.tasks = [{ type: "vanish" }];
    }
  }
  // someone arrives on a bus or auto that has just stopped
  function unload(veh) {
    veh.unloaded = true;
    const n = veh.kind === "bus" ? pickW([[0, 1], [1, 3], [2, 3], [3, 2], [4, 1]]) : pickW([[0, 2], [1, 3], [2, 2]]);
    for (let i = 0; i < n; i++) {
      const inn = door(veh, true);
      const p = person(pickW([["office", 4], ["student", 3], ["local", 3]]), inn.x, inn.z, headingOf(0, kerbSide(veh.road)));
      p.side = veh.road;
      p.lift = veh.kind === "bus" ? 0.38 : -0.12;
      p.hidden = true;
      veh.boarding = (veh.boarding || 0) + 1;
      p.tasks.push({ type: "alight", veh, wait: i * (veh.kind === "bus" ? 1.3 : 1.6), t: 0 });
      if (veh.kind === "auto") p.tasks.push({ type: "payDriver", veh, t: 0 });
      const dir = chance(0.5) ? 1 : -1;
      p.tasks.push(goto(p.x + dir * 0.8, pavementOf(veh.road) + kerbSide(veh.road) * 0.2), ...planFrom(p, veh.road, p.x + dir * 0.8, pickW([["pass", 5], ["university", veh.road === "near" ? 3 : 1], ["tea", 1]])));
    }
  }
  function alight(p, task, dt, t) {
    const veh = task.veh;
    if (task.wait > 0) {
      task.wait -= dt;
      p.hidden = true; // still inside, behind the one in front
      if (!traffic.vehicles.includes(veh) || !veh.atStop) task.wait = 0; // it is leaving: off now
      return;
    }
    p.hidden = false;
    task.t += dt;
    const bus = veh.kind === "bus";
    const k = Math.min(1, task.t / (bus ? 1.0 : 0.9));
    if (!task.from) {
      const inn = traffic.vehicles.includes(veh) ? door(veh, true) : { x: p.x, z: p.z };
      task.from = inn;
      task.to = traffic.vehicles.includes(veh) ? door(veh) : { x: p.x, z: pavementOf(veh.road) };
    }
    p.x = task.from.x + (task.to.x - task.from.x) * k;
    p.z = task.from.z + (task.to.z - task.from.z) * k;
    p.vx = p.vz = 0;
    p.want = headingOf(task.to.x - task.from.x, task.to.z - task.from.z);
    p.lift = bus ? 0.38 * (1 - Math.min(1, k * 1.5)) : -0.12 * Math.sin(Math.PI * Math.min(1, 0.5 + k * 0.5));
    if (bus) p.gesture = { take: 1 - k };
    if (k >= 1) {
      p.lift = 0;
      veh.boarding = Math.max(0, (veh.boarding || 1) - 1);
      stats.alighted = (stats.alighted || 0) + 1;
      p.tasks.shift();
    }
  }
  // an auto passenger pays the driver through the side before going: a note held out, change back
  function payDriver(p, task, dt, t) {
    const veh = task.veh;
    if (!traffic.vehicles.includes(veh)) return p.tasks.shift();
    const k = kerbSide(veh.road);
    const at = { x: veh.x + veh.dir * 0.75, z: veh.lat + k * (veh.W / 2 + 0.35) };
    if (!task.there) {
      if (steer(p, at.x, at.z, p.pace * 0.8, dt, null) < 0.2) task.there = true;
      return;
    }
    task.t += dt;
    stand(p, dt, headingOf(0, -k));
    p.lookAt = lookPt(veh.x + veh.dir * 0.9, veh.lat, 1.1);
    p.char.showGear("note", task.t > 0.4 && task.t < 2.2);
    p.gesture = task.t < 0.4 ? { pocket: 1 } : task.t < 2.2 ? { serve: 1 } : task.t < 3.0 ? { take: 0.6, pocket: task.t > 2.6 ? 1 : 0 } : {};
    p.talk = task.t > 0.6 && task.t < 1.6 ? 0.3 : 0;
    p.expr = "polite";
    if (task.t > 3.3) p.tasks.shift();
  }

  // phones while walking, a glance at a passer-by
  function walkingHabits(p, dt, t) {
    if (p.role === "keeper" || p.role === "guard") return;
    p.habitT -= dt;
    if (p.habitT < 0) {
      p.busy = p.busy ? null : p.habit < 0.18 ? "text" : p.habit < 0.28 ? "call" : null;
      p.habitT = p.busy ? range(6, 22) : range(10, 40);
      p.char.showGear("phone", Boolean(p.busy));
    }
    // the small things people do: a look at the watch, a scratch, a wipe of the brow, the bag strap
    p.fidgetT -= dt;
    if (p.fidgetT < 0 && !p.busy && p.fidget !== "none") {
      p.fidgetFor = range(1.4, 3);
      p.fidgetT = range(14, 50);
    }
    if (p.fidgetFor > 0 && !p.busy) {
      p.fidgetFor -= dt;
      p.gesture[p.fidget] = 1;
      if (p.fidget === "watch") {
        p.expr = "concentrating";
        p.lookAt = toWorld(p.x - Math.sin(p.heading) * 0.35, p.z - Math.cos(p.heading) * 0.35, 1.15 * p.char.height + p.y);
      } else if (p.fidget === "brow") p.expr = "tired";
      else if (p.fidget === "chin") p.expr = "thinking";
      return;
    }
    if (p.busy === "text") {
      p.expr = Math.sin(t * 0.4 + p.habit * 20) > 0.6 ? "amused" : "concentrating";
      p.gesture.text = 1;
      p.lookAt = toWorld(p.x - Math.sin(p.heading) * 0.5, p.z - Math.cos(p.heading) * 0.5, 0.95 * p.char.height + p.y);
    } else if (p.busy === "call") {
      p.gesture.phone = 1;
      p.talk = Math.sin(t * 0.7 + p.habit * 10) > 0 ? chatter(t, p.habit * 10) : 0;
      p.expr = ["neutral", "smile", "annoyed", "worried", "amused"][Math.floor(p.habit * 50) % 5];
    } else {
      p.glanceT -= dt;
      if (p.glanceT < 0) {
        p.glanceT = range(2, 7);
        const o = nearestTo(p, 5, (o) => o.p && o.p !== p);
        p.glance = o && chance(0.5) ? o.p : null;
        p.glanceUntil = t + range(0.8, 2);
      }
      if (p.glance && t < p.glanceUntil && people.includes(p.glance)) {
        p.lookAt = toWorld(p.glance.x, p.glance.z, p.glance.y + 1.55);
        // someone they know: a smile and a wave
        if ((p.habit * 7 + p.glance.habit * 5) % 1 < 0.22) {
          p.expr = "smile";
          p.gesture.wave = 1;
        }
      }
    }
  }
  function customer(p, task, dt, t) {
    const sp = task.spot;
    const st = sp.stall;
    stand(p, dt, sp.face);
    p.busy = null;
    const keeperP = residents.find((r) => r.tasks[0]?.k?.stall === st);
    const item = st.kind === "tea" ? (p.clay ? "cup" : "glass") : st.kind === "snack" ? "packet" : "softdrink";
    const qr = toWorld(st.qr[0], st.qr[2], st.qr[1]);
    const toKeeper = keeperP ? toWorld((p.x + keeperP.x) / 2, (p.z + keeperP.z) / 2 - 0.1, st.counterTop + 0.32) : qr;
    if (!task.started) {
      task.started = true;
      p.served = false;
      p.deal = { stage: "order", t: 0, pay: chance(0.68) ? "upi" : "cash", kind: st.kind };
      st.queue.push(p);
      task.since = 0;
      hold(p, null);
    }
    task.since = (task.since || 0) + dt;
    const d = p.deal;
    if (d && !p.served) {
      d.t += dt;
      if (keeperP) p.lookAt = toWorld(keeperP.x, keeperP.z, keeperP.y + 1.5);
      switch (d.stage) {
        case "order":
          // says what they want, pointing at it
          p.talk = d.t < 2.6 ? chatter(t, sp.x) : 0;
          if (d.t > 0.5 && d.t < 2.2) {
            p.gesture.point = 0.8;
            p.gesture.at = toWorld(st.stock[0] ?? st.qr[0], st.stock[2] ?? st.qr[2], st.stock[1] ?? 1.1);
          }
          p.expr = "polite";
          break;
        case "making":
          // waits, watching it being made; some check the time
          p.expr = task.since % 9 < 3 ? "curious" : p.baseExpr;
          if (p.fidget === "watch" && d.t % 11 > 8.5) {
            p.gesture.watch = 1;
            p.expr = "concentrating";
          }
          break;
        case "pay":
          if (d.pay === "upi") {
            // phone out of the pocket, held over the QR code, a look at the screen, then shown
            if (d.t < 1.0) p.gesture.pocket = 1;
            else if (d.t < 3.6) {
              hold(p, "phone");
              p.gesture.scan = 1;
              p.gesture.at = qr;
              p.lookAt = qr;
              p.expr = "concentrating";
            } else if (d.t < 5.0) {
              hold(p, "phone");
              p.gesture.show = 1;
              p.expr = "softSmile";
            } else {
              hold(p, null);
              d.stage = "paid";
              d.t = 0;
            }
          } else {
            // a note from the pocket, held out across the counter
            if (d.t < 1.2) p.gesture.pocket = 1;
            else {
              hold(p, "note");
              p.gesture.take = 1;
              p.gesture.at = toKeeper;
              if (d.t > 2.4) {
                d.stage = "cashGiven";
                d.t = 0;
              }
            }
          }
          break;
        case "cashGiven":
          // the keeper has the note and is counting the change
          hold(p, null);
          p.gesture.hold = 0.5;
          break;
        case "change":
          // takes the change and puts it away
          if (d.t < 1.1) {
            p.gesture.take = 1;
            p.gesture.at = toKeeper;
          } else if (d.t < 2.2) p.gesture.pocket = 1;
          else {
            d.stage = "paid";
            d.t = 0;
          }
          break;
        case "paid":
        case "handing":
          // reaches for it as it is handed over
          p.gesture.take = d.stage === "handing" ? 1 : 0.3;
          p.gesture.at = toKeeper;
          p.expr = "softSmile";
          break;
      }
      if (task.since > 70) p.served = true; // something went wrong at the counter: don't wait for ever
      if (!p.served) return;
    }
    hold(p, item);
    p.deal = null;
    task.T -= dt;
    // tea is sipped (and blown on when hot), snacks eaten, cold drinks tipped back; chat in between
    task.sipT = (task.sipT ?? range(3, 8)) - dt;
    if (task.sipT < 0) task.sipT = range(5, 13);
    p.gesture.hold = 1;
    const lift = task.sipT < 2.4 ? Math.sin(((2.4 - task.sipT) / 2.4) * Math.PI) * 1.2 : 0;
    if (lift > 0) {
      if (st.kind === "tea") {
        p.gesture.sip = lift;
        if (task.T > 20 && task.sipT > 1.6) p.expr = "blowing";
      } else if (st.kind === "snack") p.gesture.eat = lift;
      else p.gesture.bottle = lift;
    }
    const mate = nearestTo(p, 1.7, (o) => o.p && o.p.tasks[0]?.type === "customer");
    if (mate) {
      p.lookAt = toWorld(mate.x, mate.z, mate.p.y + 1.55);
      const turn = Math.sin(t * 0.35 + sp.x * 3) > 0;
      if (turn && task.sipT > 2.4) {
        p.talk = chatter(t, sp.x);
        p.expr = ["amused", "smile", "skeptical", "surprised", "neutral"][Math.floor(t / 6 + sp.x) % 5];
      } else if (Math.sin(t * 0.9 + sp.x) > 0.85) {
        p.nod = 0.9;
        p.expr = p.humour > 0.5 ? "laugh" : "amused";
      }
    } else if (keeperP && Math.sin(t * 0.21 + sp.x) > 0.6) {
      p.lookAt = toWorld(keeperP.x, keeperP.z, keeperP.y + 1.5);
    } else if (lift === 0 && st.kind === "tea") p.expr = "relief";
    if (task.T < 0) {
      hold(p, null);
      sp.taken = null;
      st.queue = st.queue.filter((q) => q !== p);
      p.tasks.shift();
    }
  }
  function bench(p, task, dt, t) {
    const seat = task.seat;
    // walk the last steps, turn round, sit
    const d = Math.hypot(seat.x - p.x, seat.z - 0.05 - p.z);
    if (!task.seated) {
      if (d > 0.08) {
        steer(p, seat.x, seat.z - 0.05, 0.6, dt, null);
        return;
      }
      task.seated = true;
    }
    stand(p, dt, 0);
    p.x += (seat.x - p.x) * Math.min(1, dt * 4);
    p.z += (seat.z - 0.05 - p.z) * Math.min(1, dt * 4);
    p.sit = { seat: toWorld(seat.x, seat.z, seat.y), floor: p.y, reach: 0.4 };
    hold(p, p.habit > 0.6 ? "packet" : "cup");
    task.T -= dt;
    task.sipT = (task.sipT ?? range(2, 9)) - dt;
    if (task.sipT < 0) task.sipT = range(6, 15);
    p.gesture.hold = 1;
    p.gesture.knees = 0.6;
    if (task.sipT < 2.4) p.gesture[p.habit > 0.6 ? "eat" : "sip"] = Math.sin(((2.4 - task.sipT) / 2.4) * Math.PI) * 1.2;
    const mate = nearestTo(p, 1.5, (o) => o.p && o.p.tasks[0]?.type === "bench");
    if (mate) {
      p.lookAt = toWorld(mate.x, mate.z, mate.p.y + 1.15);
      if (Math.sin(t * 0.3 + seat.x * 5) > 0.1 && task.sipT > 2.4) p.talk = chatter(t, seat.x);
    } else p.lookAt = toWorld(p.x + Math.sin(t * 0.13 + seat.x) * 8, p.z - 6, 1.3);
    if (task.T < 0) {
      hold(p, null);
      seat.taken = null;
      p.tasks.shift();
    }
  }
  function groupTalk(p, task, dt, t) {
    const g = task.g;
    const sl = task.slot;
    if (!g.members.includes(p)) g.members.push(p);
    stand(p, dt, headingOf(g.c[0] - sl.x, g.c[1] - sl.z));
    p.x += (sl.x - p.x) * Math.min(1, dt * 2);
    p.z += (sl.z - p.z) * Math.min(1, dt * 2);
    // whose turn to talk
    if (t > g.until || !g.members[g.speaker]) {
      g.speaker = (g.speaker + 1 + ((rnd() * Math.max(1, g.members.length - 1)) | 0)) % Math.max(1, g.members.length);
      g.until = t + range(2.5, 7.5);
    }
    const speaker = g.members[g.speaker];
    if (speaker === p) {
      p.talk = chatter(t, sl.x * 3);
      // hands moving as they talk: explaining, pointing, counting off, hands on hips
      const style = ["serve", "point", "count", "hip", "chin"][Math.floor(g.until * 3 + sl.x) % 5];
      p.gesture[style] = style === "serve" ? 0.3 + 0.2 * Math.sin(t * 1.7 + sl.z) : 0.8;
      g.mood = ["amused", "smile", "skeptical", "surprised", "annoyed", "proud", "worried", "grin"][Math.floor(g.until * 7) % 8];
      p.expr = g.mood;
      const listener = g.members[(g.speaker + 1) % g.members.length];
      if (listener && listener !== p) p.lookAt = toWorld(listener.x, listener.z, listener.y + 1.55);
      if (Math.sin(t * 0.8 + sl.x) > 0.9) p.shake = 0.7;
    } else {
      if (speaker) p.lookAt = toWorld(speaker.x, speaker.z, speaker.y + 1.55);
      if (Math.sin(t * 0.6 + sl.x * 7) > 0.7) p.nod = 1;
      // each listener takes it their own way
      const funny = g.mood === "amused" || g.mood === "grin" || g.mood === "smile";
      p.expr = funny ? (p.humour > 0.6 ? "laugh" : p.humour > 0.3 ? "smile" : "softSmile") : g.mood === "skeptical" ? "curious" : g.mood === "annoyed" ? "worried" : p.baseExpr;
      p.gesture[["crossed", "hip", "chin", "behind", "strap"][Math.floor(p.habit * 5)]] = 0.7;
      // now and then somebody checks their phone instead
      task.phoneT = (task.phoneT ?? range(8, 40)) - dt;
      if (task.phoneT < 0 && task.phoneT > -range(5, 12)) {
        p.char.showGear("phone", true);
        p.gesture.text = 1;
        p.lookAt = toWorld(p.x - Math.sin(p.heading) * 0.5, p.z - Math.cos(p.heading) * 0.5, 0.95 * p.char.height + p.y);
      } else if (task.phoneT < -12) {
        task.phoneT = range(15, 50);
        p.char.showGear("phone", false);
      }
      if (p.gesture.text) for (const key of ["crossed", "hip", "chin", "behind", "strap"]) delete p.gesture[key];
    }
    task.T -= dt;
    if (task.T < 0) {
      p.char.showGear("phone", false);
      g.members = g.members.filter((m) => m !== p);
      sl.taken = null;
      p.tasks.shift();
    }
  }
  // Stall keepers. One sale, step by step: greet the customer and take the order; make or fetch
  // what was asked for (tea poured from the kettle into a glass, a packet from the box, a bottle
  // from the cooler); take the payment (a glance at the customer's phone and a nod, or take the
  // note, count out the change and hand it back); hand the item over. Between customers they wipe
  // the counter, tidy the stock, watch the street.
  function keeper(p, task, dt, t) {
    const k = task.k;
    const st = k.stall;
    task.t -= dt;
    const kettle = k.kettle;
    const lo = (st.cx0 ?? st.x0 + 0.5) + 0.1;
    const hi = (st.cx1 ?? st.x1 - 0.5) - 0.1;
    const goX = (x) => {
      const dx = x - p.x;
      if (Math.abs(dx) > 0.08) {
        const v = Math.sign(dx) * Math.min(0.7, Math.abs(dx) * 2);
        p.vx = v;
        p.x += v * dt;
        p.want = headingOf(Math.sign(dx), 0);
        return false;
      }
      p.vx = 0;
      return true;
    };
    p.vz = 0;
    p.expr = p.baseExpr;
    const waiting = st.queue.find((q) => !q.served && q.deal && q.deal.stage === "order" && people.includes(q));
    if (waiting && ["idle", "wipe", "street", "tidy"].includes(task.act)) {
      task.act = "greet";
      task.target = waiting;
      task.t = range(2.2, 3);
      task.hello = chance(0.4);
    }
    const tq = task.target;
    const deal = tq && tq.deal;
    const gone = () => !tq || !people.includes(tq) || !deal || tq.served;
    const face = () => {
      p.want = headingOf(tq.x - p.x, tq.z - p.z);
      p.lookAt = toWorld(tq.x, tq.z, tq.y + 1.55);
    };
    const across = () => toWorld((p.x + tq.x) / 2, (p.z + tq.z) / 2 + 0.1, k.top + 0.32);
    hold(p, null);
    switch (task.act) {
      case "greet":
        if (gone()) task.act = "idle";
        else if (goX(clamp(tq.x, lo, hi))) {
          face();
          if (task.hello && task.t > 1.4) p.gesture.namaste = 1;
          else p.talk = chatter(t, k.x);
          p.expr = "polite";
          if (task.t < 0) {
            task.act = "make";
            task.t = st.kind === "tea" ? range(4.5, 6.5) : range(2, 3);
            deal.stage = "making";
            deal.t = 0;
          }
        }
        break;
      case "make":
        if (gone()) task.act = "idle";
        else if (st.kind === "tea") {
          // at the kettle: a stir, then the pour into the glass held in the other hand
          if (goX(kettle[0] + 0.15)) {
            p.want = 0;
            const glassAt = toWorld(kettle[0] + 0.22, kettle[2] - 0.05, k.top + 0.08);
            if (task.t > 2.6) {
              p.gesture.stir = 1;
              p.gesture.at = toWorld(kettle[0], kettle[2], kettle[1]);
            } else {
              p.gesture.pour = 1;
              p.gesture.at = glassAt;
            }
            p.lookAt = glassAt;
            p.expr = "concentrating";
          } else task.t += dt;
        } else {
          // the packet from the box on the counter, or the bottle out of the cooler
          const stock = toWorld(st.stock[0], st.stock[2], st.stock[1]);
          if (goX(clamp(st.stock[0] - 0.1, lo, hi))) {
            p.want = 0;
            p.gesture.take = 1;
            p.gesture.at = stock;
            p.lookAt = stock;
          } else task.t += dt;
        }
        if (task.act === "make" && task.t < 0) {
          task.act = "payment";
          task.t = 0;
          deal.stage = "pay";
          deal.t = 0;
        }
        break;
      case "payment": {
        if (gone()) {
          task.act = "idle";
          break;
        }
        if (!goX(clamp(tq.x, lo, hi))) break;
        face();
        hold(p, st.kind === "tea" ? "glass" : st.kind === "snack" ? "packet" : "softdrink"); // ready in hand
        p.gesture.hold = 1;
        if (deal.stage === "pay" && deal.pay === "upi") {
          // watches the phone over the code, then reads the screen and nods
          p.lookAt = toWorld(st.qr[0], st.qr[2], st.qr[1] + 0.2);
          if (deal.t > 3.6) {
            p.nod = 1;
            p.expr = "softSmile";
          }
        } else if (deal.stage === "cashGiven") {
          hold(p, "note");
          if (deal.t < 1.0) {
            p.gesture.take = 1;
            p.gesture.at = across();
          } else if (deal.t < 3.4) {
            // counts the change out of the tin
            p.gesture.count = 1;
            p.lookAt = toWorld(p.x - Math.sin(p.heading) * 0.3, p.z - Math.cos(p.heading) * 0.3, k.top + 0.3);
            p.expr = "concentrating";
          } else {
            p.gesture.serve = 1;
            if (deal.t > 4.3) {
              deal.stage = "change";
              deal.t = 0;
            }
          }
        } else if (deal.stage === "paid") {
          task.act = "serve";
          task.t = 1.8;
        }
        break;
      }
      case "serve":
        if (gone()) task.act = "idle";
        else {
          face();
          hold(p, st.kind === "tea" ? "glass" : st.kind === "snack" ? "packet" : "softdrink");
          p.gesture.take = 1;
          p.gesture.at = across();
          p.expr = "softSmile";
          deal.stage = "handing";
          if (task.t < 0.7) {
            tq.clay = false;
            tq.served = true; // it is in the customer's hand now
            hold(p, null);
          }
          if (task.t < 0) {
            task.act = "idle";
            task.t = range(1, 3);
          }
        }
        break;
      case "wipe":
        if (goX(k.home + Math.sin(t * 0.2) * 0.3)) {
          p.want = 0;
          p.gesture.wipe = 1;
          p.gesture.at = toWorld(p.x, k.front + 0.35, k.top);
          p.lookAt = toWorld(p.x, k.front + 0.3, k.top);
        }
        if (task.t < 0) {
          task.act = "idle";
          task.t = range(2, 6);
        }
        break;
      case "tidy":
        // straightens the jars and the stock
        if (goX(clamp((st.stock[0] ?? k.home) - 0.1, lo, hi))) {
          p.want = 0;
          p.gesture.take = 0.9;
          p.gesture.at = toWorld((st.stock[0] ?? k.home) + Math.sin(t * 1.3) * 0.15, (st.stock[2] ?? k.front + 0.5), (st.stock[1] ?? k.top + 0.12));
          p.lookAt = p.gesture.at;
          p.expr = "concentrating";
        }
        if (task.t < 0) {
          task.act = "idle";
          task.t = range(2, 5);
        }
        break;
      case "street":
        goX(k.home);
        p.want = 0;
        p.gesture[task.pose || "crossed"] = 1;
        p.lookAt = toWorld(p.x + Math.sin(t * 0.17 + k.x) * 14, 12, 1.4);
        p.expr = task.pose === "brow" ? "tired" : Math.sin(t * 0.1 + k.x) > 0.7 ? "yawn" : "bored";
        if (task.t < 0) {
          task.act = "idle";
          task.t = range(1, 3);
        }
        break;
      default: {
        goX(k.home);
        p.want = 0;
        const someone = st.queue.find((q) => people.includes(q));
        if (someone) {
          p.lookAt = toWorld(someone.x, someone.z, someone.y + 1.55);
          if (Math.sin(t * 0.5 + k.x) > 0.6) {
            p.talk = chatter(t, k.x);
            p.expr = "amused";
          }
        }
        if (task.t < 0) {
          task.act = pickW([["wipe", 3], ["street", 3], ["tidy", 2]]);
          task.pose = pickW([["crossed", 3], ["hip", 2], ["behind", 1], ["brow", 1], ["chin", 1]]);
          task.t = range(4, 9);
        }
      }
    }
  }
  function guard(p, task, dt, t) {
    task.t -= dt;
    const [hx, hz] = task.home;
    if (task.t < 0 && !task.walk) {
      task.walk = [hx + range(-1.5, 1.5), hz + range(-0.4, 0.4)];
      task.t = range(18, 40);
    }
    if (task.walk) {
      const d = steer(p, task.walk[0], task.walk[1], 0.7, dt, null);
      if (d < 0.1) {
        task.walk = null;
        task.back = !task.back;
      }
    } else stand(p, dt, task.face);
    p.gesture.behind = 1;
    const close = nearestTo(p, 2.6, (o) => o.p !== p);
    task.greetT = (task.greetT || 0) - dt;
    if (close && task.greetT < -6) task.greetT = 1.6;
    if (task.greetT > 0) {
      delete p.gesture.behind;
      p.gesture[p.habit > 0.5 ? "salute" : "namaste"] = 1;
      p.expr = "polite";
    }
    const o = nearestTo(p, 9, (o) => o.p !== p);
    if (o) p.lookAt = toWorld(o.x, o.z, (o.p ? o.p.y : 0) + 1.5);
  }
  function vendor(p, task, dt, t) {
    stand(p, dt, task.arms ? headingOf(1, 0.2) : 0);
    task.t = (task.t || 0) + dt;
    if (task.arms || Math.sin(t * 0.07 + p.habit * 9) > 0.3) p.gesture.crossed = 1;
    else if (Math.sin(t * 0.05 + p.habit * 3) > 0.5) {
      p.char.showGear("phone", true);
      p.gesture.text = 1;
      p.lookAt = toWorld(p.x - Math.sin(p.heading) * 0.5, p.z - Math.cos(p.heading) * 0.5, 0.95 * p.char.height + p.y);
      return;
    }
    p.char.showGear("phone", false);
    const o = nearestTo(p, 8, (o) => o.p !== p);
    if (o) p.lookAt = toWorld(o.x, o.z, (o.p ? o.p.y : 0) + 1.5);
  }

  // ---------- each frame ----------
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1.3);
  const q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  let started = false;
  let arriveT = 0;
  let frameNo = 0;
  let bodiesIn = !bodiesLoading;
  kitLoading.then((k) => {
    if (!k) return;
    kit = k;
    setTimeout(() => (bodiesIn = true), new URLSearchParams(location.search).has("waitbodies") ? 1e9 : 90000); // very slow connection: start with what there is
  });
  bodiesLoading?.then(() => (bodiesIn = true));
  return {
    people,
    stats,
    deals: () => people.filter((q) => q.deal).map((q) => q.deal.stage + ":" + q.deal.pay + ":" + q.deal.kind),
    /** people standing or walking on a carriageway, for the traffic (street frame) */
    onRoad() {
      const out = [];
      for (const p of people) if ((p.z > 8.6 && p.z < 15.3) || (p.z > 19.5 && p.z < 25.35)) out.push({ x: p.x, z: p.z, vx: p.vx, w: 0.6 });
      return out;
    },
    /**
     * dt seconds; t clock seconds; extra: other moving people not run here (players) as
     * [{x, z, r, vx, vz}] in the street frame; camPos: the camera in world space.
     */
    update(dt, t, extra = []) {
      if (!kit || !bodiesIn) return;
      if (!started) {
        started = true;
        settle();
      }
      frameNo++;
      // who is where, for keeping clear of each other
      others.length = 0;
      for (const p of people) others.push({ p, x: p.x, z: p.z, r: p.radius, vx: p.vx, vz: p.vz });
      for (const pole of poles) others.push({ p: null, x: pole.x, z: pole.z, r: pole.r, vx: 0, vz: 0 });
      for (const e of extra) others.push({ p: null, x: e.x, z: e.z, r: e.r || 0.35, vx: e.vx || 0, vz: e.vz || 0 });
      // buses and autos: people waiting at the stops, and those arriving get off
      transitT -= dt;
      if (transitT < 0) {
        transitT = range(4, 10) * (quality === "low" ? 2 : 1);
        transitWaiter();
      }
      for (const veh of traffic.vehicles) if (veh.atStop && !veh.unloaded && (veh.kind === "bus" || veh.kind === "auto")) unload(veh);
      // new walkers keep the street busy
      const walking = people.filter((p) => p.tasks[0] && (p.tasks[0].type === "lane" || p.tasks[0].type === "goto")).length;
      arriveT -= dt;
      if (arriveT < 0 && walking < WALKERS) {
        arriveT = range(0.6, 2.5);
        stats.arrived++;
        arrive(false);
      }
      projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);
      const cam = camera.position;
      for (const p of [...people]) {
        act(p, dt, t);
        if (!people.includes(p)) continue;
        // turn toward where they are going (or told to face)
        const sp = Math.hypot(p.vx, p.vz);
        if (sp > 0.2 && !p.sit && p.tasks[0]?.type !== "keeper") p.want = headingOf(p.vx, p.vz);
        const before = p.heading;
        p.heading += wrap(p.want - p.heading) * Math.min(1, dt * 5);
        const turnRate = wrap(p.heading - before) / Math.max(dt, 1e-3);
        p.speed = sp;
        // ground under the feet, every so often
        p.groundT -= dt;
        if (p.groundT < 0) {
          p.groundT = 0.35;
          p.groundY = groundAt(p.x, p.z);
        }
        if (p.groundY !== undefined) p.y += (p.groundY - p.y) * Math.min(1, dt * 10);
        const [wx, wz] = local(p.x, p.z);
        p.group.position.set(wx, p.y + 0.015 + (p.lift || 0), wz);
        p.group.rotation.y = phi + p.heading;
        q.setFromAxisAngle(UP, phi + p.heading);
        p.body.setNextKinematicTranslation({ x: wx, y: p.y, z: wz });
        // only draw and animate those in view; animate the far ones less often
        sphere.center.set(wx, p.y + 1, wz);
        const dist = cam.distanceTo(sphere.center);
        const visible = dist < 120 && frustum.intersectsSphere(sphere);
        p.group.visible = visible && !p.hidden;
        p.dtAcc += dt;
        if (!visible) continue;
        const every = dist < 35 ? 1 : dist < 70 ? 2 : 4;
        if ((frameNo + p.frame) % every !== 0) continue;
        const step = p.dtAcc;
        p.dtAcc = 0;
        if (p.castShadowNow !== dist < 40) {
          p.castShadowNow = dist < 40;
          p.group.traverse((o) => o.isMesh && (o.castShadow = p.castShadowNow));
        }
        p.char.update(step, {
          speed: sp,
          grounded: true,
          turnRate,
          facing: phi + p.heading,
          lookAt: p.lookAt,
          talk: p.talk,
          friendly: Boolean(p.talk) || p.nod > 0,
          expr: p.expr,
          nod: p.nod,
          shake: p.shake,
          gesture: p.gesture,
          sit: p.sit,
        });
      }
    },
  };
}
