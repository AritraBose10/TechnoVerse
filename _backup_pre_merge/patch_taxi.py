import sys, os
root = os.path.expanduser("~/mnt/Metaverse-all/public")

def rep(name, old, new):
    p = os.path.join(root, name)
    s = open(p, encoding="utf-8").read()
    n = s.count(old)
    if n != 1:
        print(f"FAIL {name}: anchor found {n}x: {old[:70]!r}")
        sys.exit(1)
    open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new))
    print(f"ok   {name}: {old[:50]!r}")

# ---------------- traffic.js ----------------
rep("traffic.js", 'import { seatCharacter } from "/seated.js";', 'import { seatCharacter, animateSeated } from "/seated.js";')
rep("traffic.js",
    '  near: [{ x: 1.5, kinds: ["auto"] }, { x: -9, kinds: ["auto"] }, { x: -66, kinds: ["bus", "auto"] }],\n  far: [{ x: 22.5, kinds: ["auto"] }, { x: -19.5, kinds: ["auto"] }, { x: 64, kinds: ["bus", "auto"] }],',
    '  near: [{ x: 1.5, kinds: ["auto", "taxi"] }, { x: -9, kinds: ["auto", "taxi"] }, { x: -66, kinds: ["bus", "auto", "taxi"] }],\n  far: [{ x: 22.5, kinds: ["auto", "taxi"] }, { x: -19.5, kinds: ["auto", "taxi"] }, { x: 64, kinds: ["bus", "auto", "taxi"] }],')
rep("traffic.js", "  let s = seed;\n",
    "  let s = seed;\n"
    "  const hail = {}; // \"road:stopX\" -> street time until which someone waits there with a hand out for a taxi (people.js sets it)\n"
    "  const freeSeats = (veh) => 3 - (veh.mesh?.userData.occupants?.count() ?? 0);\n"
    "  let seatTicks = 0; // vehicles whose seated people may be animated this frame\n")
rep("traffic.js", 'wantsStop: kind === "auto" ? rnd() < 0.55 : kind === "bus",', 'wantsStop: kind === "auto" ? rnd() < 0.55 : kind === "bus" || kind === "taxi",')
rep("traffic.js",
    '          if (st.kinds.includes(veh.kind) && ahead > 20 && ahead < 45 && rnd() < 0.7) {\n            veh.stopX = st.x;\n            veh.stopFor = veh.kind === "bus" ? range(8, 16) : range(4, 12);',
    '          // a taxi only pulls in for someone with a hand out, and only with a seat free\n'
    '          const fare = veh.kind !== "taxi" || ((hail[`${veh.road}:${st.x}`] ?? 0) > clock && freeSeats(veh) > 0);\n'
    '          if (fare && st.kinds.includes(veh.kind) && ahead > 20 && ahead < 45 && rnd() < 0.7) {\n'
    '            veh.stopX = st.x;\n'
    '            veh.stopFor = veh.kind === "bus" ? range(8, 16) : veh.kind === "taxi" ? range(5, 9) : range(4, 12);\n'
    '            if (veh.kind === "taxi") veh.seats = freeSeats(veh);')
rep("traffic.js", "          veh.wantsStop = rnd() < 0.3;", '          veh.wantsStop = veh.kind === "taxi" || rnd() < 0.3;')
rep("traffic.js", "      seatBudget = 3;\n", "      seatBudget = 3;\n      seatTicks = quality === \"low\" ? 2 : 5;\n")
rep("traffic.js",
    "      u.occupants.setNear(near, (slot) => { seatBudget--; return seatCharacter(veh.mesh, slot, kit, rnd); }, Math.max(0, seatBudget));\n    }\n",
    "      u.occupants.setNear(near, (slot) => { seatBudget--; return seatCharacter(veh.mesh, slot, kit, rnd); }, Math.max(0, seatBudget));\n"
    "      // people already seated come alive: the driver steers and checks the mirrors, passengers look about, use a phone, talk\n"
    "      if (near && u.occupants.hasReal && Math.hypot(veh.x - eye[0], veh.lat - eye[1]) < 32) animateOccupants(veh, u, dt, t);\n"
    "    }\n")
rep("traffic.js", "      u.door.set(veh.doorK);\n    }\n",
    "      u.door.set(veh.doorK);\n    }\n"
    "    if (u.rearDoor) {\n"
    "      // a taxi's kerb-side rear door, open while someone climbs in or out (people.js stamps veh.rearOpenT)\n"
    "      const want = clock - (veh.rearOpenT ?? -9) < 0.6 ? 1 : 0;\n"
    "      veh.rearK = (veh.rearK || 0) + (want - (veh.rearK || 0)) * Math.min(1, dt * 2.8);\n"
    "      u.rearDoor.set(veh.rearK);\n"
    "    }\n")
rep("traffic.js", "  let spawnTimer = { near: 1, far: 2 };\n",
    """  // The seated people of a vehicle near the viewer. The wheel turns with how fast the car is yawing (lane changes, tucking in,
  // pulling out) and the driver's hands stay on it; everyone leans a little with braking and turns. The figures are posed with the
  // car moved to the origin (seated.js works in the car's own frame), then it goes back.
  function animateOccupants(veh, u, dt, t) {
    const occ = u.occupants;
    const sp = Math.max(0, veh.v);
    const yr = veh._yp === undefined ? 0 : THREE.MathUtils.clamp((veh.yaw - veh._yp) / dt, -2, 2);
    veh._yp = veh.yaw;
    veh._yr = (veh._yr || 0) + (yr - (veh._yr || 0)) * Math.min(1, dt * 6);
    const ac = veh._vp === undefined ? 0 : (veh.v - veh._vp) / dt;
    veh._vp = veh.v;
    veh._ac = (veh._ac || 0) + (ac - (veh._ac || 0)) * Math.min(1, dt * 3);
    veh._ph ??= rnd() * 6.28;
    const want = sp > 0.4
      ? THREE.MathUtils.clamp((veh._yr * u.size.L * 0.65 * 15) / Math.max(sp, 1.5), -1.6, 1.6) + 0.04 * Math.sin(t * 1.3 + veh._ph) + 0.025 * Math.sin(t * 3.1 + veh._ph * 2)
      : (veh._steer || 0) * 0.97;
    veh._steer = (veh._steer || 0) + (want - (veh._steer || 0)) * Math.min(1, dt * 10);
    if (occ.wheel) occ.wheel.spin.rotation.z = veh._steer; // positive = anticlockwise for the driver = turning left
    veh._at = (veh._at || 0) + dt;
    if (veh._at < 0.05 || seatTicks <= 0) return;
    seatTicks--;
    const adt = Math.min(veh._at, 0.25);
    veh._at = 0;
    veh._pt = (veh._pt || 0) + adt;
    const pax = veh._pt >= 0.1; // passengers at 10 Hz, the driver at 20
    const pdt = Math.min(veh._pt, 0.5);
    if (pax) veh._pt = 0;
    const m = veh.mesh;
    const p0 = m.position.clone();
    const r0 = m.rotation.clone();
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.updateMatrixWorld(true);
    const list = occ.real();
    const ctx = { t, acc: veh._ac, yawRate: veh._yr, speed: sp, wheel: occ.wheel, sitters: list.map((q) => q.slot) };
    for (const q of list) if (q.slot.driver || pax) animateSeated(q.fig, q.slot, q.slot.driver ? adt : pdt, ctx);
    m.position.copy(p0);
    m.rotation.copy(r0);
    m.updateMatrixWorld(true);
  }

  let spawnTimer = { near: 1, far: 2 };
""")
rep("traffic.js", "    vehicles: all,\n    get playerStruck() {", "    vehicles: all,\n    hail,\n    get playerStruck() {")

# ---------------- vehicles.js ----------------
rep("vehicles.js",
    "  let near = false;\n  const sync = () => {\n    for (const q of seats) {\n      q.fig.visible = q.on && !(near && q.real);\n      if (q.real) q.real.visible = q.on && near;\n    }\n  };",
    """  // a steering wheel for the cars (the models have no interior): a ring, hub and spoke, tilted toward the driver, that traffic.js
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
  };""")
rep("vehicles.js", "    get hasReal() { return seats.some((q) => q.real); },",
    "    get hasReal() { return seats.some((q) => q.real); },\n"
    "    // the real figures now in their seats, for traffic.js to animate\n"
    "    real() { return seats.filter((q) => q.real && q.on).map((q) => ({ fig: q.real, slot: q.slot })); },\n"
    "    wheel,")
rep("vehicles.js", "  let door = null;\n", "  let door = null, rearDoor = null;\n")
rep("vehicles.js", "pivot.rotation.y = 1.1 * k; } };\n  }\n  const wheels = [];",
    """pivot.rotation.y = 1.1 * k; } };
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
      rearDoor = { set(k) { rp.visible = ropening.visible = k > 0.03; rp.rotation.y = -1.1 * k; } };
    }
  }
  const wheels = [];""")
rep("vehicles.js", "    doorX: m.doorX,\n", "    doorX: m.doorX ?? (kind === \"taxi\" ? m.wb * (0.08 - 0.3) : undefined), // where people climb in: a taxi's rear door\n    rearDoor,\n")

# ---------------- character.js ----------------
rep("character.js", "lean: 0, handshake: 0 };", "lean: 0, handshake: 0, wheel: 0 };")
rep("character.js", "      [gw.lean, (o) => o.copy(at).addScaledVector(rightW, 0.18)],\n",
    "      [gw.lean, (o) => o.copy(at).addScaledVector(rightW, 0.18)],\n      [gw.wheel, (o) => (g.wheelR ? o.copy(g.wheelR) : o.copy(C))], // both hands on the steering wheel (g.wheelR / g.wheelL)\n")
rep("character.js", "      [gw.lean, (o) => o.copy(at).addScaledVector(rightW, -0.18)],\n",
    "      [gw.lean, (o) => o.copy(at).addScaledVector(rightW, -0.18)],\n      [gw.wheel, (o) => (g.wheelL ? o.copy(g.wheelL) : o.copy(C))],\n")
rep("character.js", "    turn(spine, -0.08);\n",
    "    turn(spine, -0.08 - (sit.lean || 0)); // leans forward when the car brakes (sit.lean) ...\n    if (sit.sway) turnInWorld(spine, qc.setFromAxisAngle(fwdW, sit.sway)); // ... and sideways in a turn\n")

# ---------------- people.js ----------------
rep("people.js", "  let transitT = 3;\n", "  let transitT = 3;\n  let hailT = 9;\n")
rep("people.js", '{ type: "waitTransit", stop: st, kinds: st.kinds, T: range(60, 200) });',
    '{ type: "waitTransit", stop: st, kinds: st.kinds.filter((k) => k !== "taxi"), T: range(60, 200) });')
rep("people.js", "  function waitTransit(p, task, dt, t) {\n",
    """  // someone with a hand out for a taxi: waits at a stop's kerb, and a taxi that sees them (traffic.hail) pulls in
  function hailer() {
    const active = people.filter((q) => q.hailStop);
    if (active.length >= 2) return;
    const free = stopSpots.filter((s) => s.kinds.includes("taxi") && !active.some((q) => q.hailStop === s) && s.waiting.length + s.coming < s.cap);
    if (!free.length) return;
    const st = free[(rnd() * free.length) | 0];
    const role = pickW([["office", 4], ["student", 3], ["local", 3]]);
    const from = chance(0.5) ? -1 : 1;
    let x0 = clamp(st.x + from * range(25, 45), DOMAIN[0] + 2, DOMAIN[1] - 2);
    if (st.road === "far" && x0 > AISLE.x0 - 2 && x0 < AISLE.x1 + 2) x0 = AISLE.x1 + range(2, 8);
    const p = person(role, x0, laneZ(st.road, x0, -from), headingOf(-from, 0));
    if (!p) return;
    p.side = st.road;
    p.hailStop = st;
    const tailX = st.headX + st.tail * (st.waiting.length + st.coming);
    p.tasks.push(lane(st.road, Math.sign(tailX - x0) || 1, tailX), { type: "waitTransit", stop: st, kinds: ["taxi"], T: range(45, 100) });
    st.coming++;
    p.comingStop = st;
  }
  function waitTransit(p, task, dt, t) {
""")
rep("people.js", "    else p.gesture = { text: 1 };\n    task.T -= dt;\n    for (const veh of traffic.vehicles) {\n      if (i !== 0) break; // in turn\n",
    """    else p.gesture = { text: 1 };
    const hailing = task.kinds.length === 1 && task.kinds[0] === "taxi";
    if (hailing && task.there) {
      traffic.hail[`${st.road}:${st.x}`] = t + 0.7; // taxis ask for this each time they look for a fare
      let coming = null;
      let nearest = 70;
      for (const veh of traffic.vehicles) {
        if (veh.kind !== "taxi" || veh.road !== st.road || veh.atStop) continue;
        const ahead = (st.x - veh.x) * veh.dir;
        if (ahead > -3 && ahead < nearest) {
          nearest = ahead;
          coming = veh;
        }
      }
      if (coming) {
        // an arm out toward the taxi coming up the road, eyes on it
        const at = toWorld(coming.x, coming.lat, 1.35);
        p.gesture = { point: 1, at };
        p.lookAt = at;
      }
    }
    task.T -= dt;
    for (const veh of traffic.vehicles) {
      if (i !== 0 && !hailing) break; // in turn (a hand out for a taxi is nobody's turn but its own)
""")
rep("people.js", 'p.tasks[0] = { type: "board", veh, stop: st, phase: "walk", t: 0 };', 'p.tasks[0] = { type: "board", veh, stop: st, kinds: task.kinds, phase: "walk", t: 0 };')
rep("people.js", "kinds: task.stop.kinds, T: range(40, 120), in: true };", "kinds: task.kinds ?? task.stop.kinds, T: range(40, 120), in: true };")
rep("people.js", "      task.still = p.speed < 0.08 && left < 1.2 ? (task.still || 0) + dt : 0;\n      if ((left < 0.18 || task.still > 0.6)",
    "      task.still = p.speed < 0.08 && left < 1.2 ? (task.still || 0) + dt : 0;\n      if (veh.kind === \"taxi\" && left < 2.2) veh.rearOpenT = t; // the rear door opens as they arrive\n      if ((left < 0.18 || task.still > 0.6)")
rep("people.js", "    const dur = bus ? 1.6 : 1.1;\n", "    const dur = bus ? 1.6 : 1.1;\n    if (veh.kind === \"taxi\") veh.rearOpenT = t;\n")
rep("people.js", "    const dur = bus ? 1.7 : 1.0;\n", "    const dur = bus ? 1.7 : 1.0;\n    if (veh.kind === \"taxi\") veh.rearOpenT = t;\n")
rep("people.js", '(veh.kind === "bus" || veh.kind === "auto")) unload(veh);', '(veh.kind === "bus" || veh.kind === "auto" || veh.kind === "taxi")) unload(veh);')
rep("people.js", "    const n = veh.kind === \"bus\" ? pickW([[0, 1], [1, 3], [2, 3], [3, 2], [4, 1]]) : pickW([[0, 2], [1, 3], [2, 2]]);",
    "    const n = veh.kind === \"bus\" ? pickW([[0, 1], [1, 3], [2, 3], [3, 2], [4, 1]]) : veh.kind === \"taxi\" ? pickW([[0, 3], [1, 4], [2, 1]]) : pickW([[0, 2], [1, 3], [2, 2]]);")
rep("people.js", "        transitWaiter();\n      }\n", "        transitWaiter();\n      }\n      hailT -= dt;\n      if (hailT < 0) {\n        hailT = range(18, 40) * (quality === \"low\" ? 2 : 1);\n        hailer();\n      }\n")
print("ALL PATCHES APPLIED")
