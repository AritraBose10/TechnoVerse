// Real characters sitting in a vehicle: the drivers and passengers of cars, autos and buses.
// A figure is made and posed once with the vehicle at the origin, so the pose rides along with it. traffic.js then brings the
// figures near the viewer to life (animateSeated below), again with the vehicle moved to the origin for the moment of the update.
import * as THREE from "three";
import { makeCharacter } from "/character.js";
import { riderLook } from "/looks.js";
import { pickBody } from "/crowdbodies.js";

const SEAT_GEAR = ["glasses"];
// slot: { x, y, z, driver } in the vehicle's frame (nose +x, y up); y is the seat cushion. Returns the figure's group.
export function seatCharacter(mesh, slot, kit, rnd) {
  const pos = mesh.position.clone();
  const rot = mesh.rotation.clone();
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.updateMatrixWorld(true);
  const sex = !slot.driver && rnd() < 0.4 ? "f" : "m";
  const role = slot.driver ? "rider" : ["local", "office", "student"][(rnd() * 3) | 0];
  const body = pickBody(role, sex, rnd);
  const opts = riderLook(rnd, { helmet: false });
  const gear = rnd() < 0.15 ? [...SEAT_GEAR] : [];
  const c = body ? makeCharacter(body.kit, { gear, lite: true }) : makeCharacter(kit, { ...opts, lite: true });
  const holderParent = new THREE.Group();
  holderParent.rotation.y = -Math.PI / 2; // the figure's forward (-z) along the vehicle's nose (+x)
  holderParent.position.set(slot.x, 0, slot.z);
  mesh.add(holderParent);
  holderParent.add(c.model);
  holderParent.updateMatrixWorld(true);
  const state = {
    speed: 0,
    grounded: true,
    turnRate: 0,
    facing: -Math.PI / 2,
    sit: { seat: new THREE.Vector3(slot.x, slot.y, slot.z), floor: slot.floor ?? 0.15, reach: slot.reach ?? 0.38, lean: 0, sway: 0 },
    gesture: slot.driver ? { hold: 1 } : { knees: 1 },
  };
  for (let i = 0; i < 4; i++) c.update(0.5, state); // eases the pose in
  c.model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  mesh.position.copy(pos);
  mesh.rotation.copy(rot);
  mesh.updateMatrixWorld(true);
  holderParent.userData.char = c;
  holderParent.userData.state = state; // kept so animateSeated can keep driving the same figure
  return holderParent;
}

const clamp = THREE.MathUtils.clamp;
const HOLD = { hold: 1 };
const PHONE = { text: 1 };
const KNEES = { knees: 1 };

/**
 * One update of a seated figure. The vehicle must be at the origin with no rotation while this runs (traffic.js does that), so the
 * points below are in the vehicle's frame, which is then also the world frame the character code works in.
 * ctx: { t (street seconds), acc (m/s^2, smoothed), yawRate (rad/s, positive = turning left), speed (m/s),
 *        wheel ({ spin, r } or null), sitters (the slots of every real figure aboard) }
 * Driver: eyes on the road, now and then the mirror or the kerb-side window, both hands on the wheel (which traffic.js turns).
 * Passengers: every few seconds idle, look out of the window, use a phone, or talk to a neighbour.
 * Everyone leans forward when the car brakes and sideways in a turn.
 */
export function animateSeated(fig, slot, dt, ctx) {
  const c = fig.userData.char;
  const st = fig.userData.state;
  if (!c || !st) return;
  const a = (fig.userData.act ||= { mode: "", until: 0, lean: 0, sway: 0, ph: Math.random() * 6.28, look: new THREE.Vector3(), nb: null, g: null });
  const t = ctx.t;
  const k = Math.min(1, dt * 4);
  a.lean += (clamp(-ctx.acc * 0.04, -0.1, 0.18) - a.lean) * k;
  a.sway += (clamp(ctx.yawRate * ctx.speed * 0.012, -0.08, 0.08) - a.sway) * k;
  st.sit.lean = a.lean;
  st.sit.sway = a.sway;
  const head = slot.y + 0.8; // about head height above the cushion
  if (t > a.until) {
    if (slot.driver) {
      a.mode = a.mode === "road" ? (Math.random() < 0.65 ? "mirror" : "side") : "road";
      a.until = t + (a.mode === "road" ? 3 + Math.random() * 5 : 0.6 + Math.random() * 0.8);
    } else {
      const r = Math.random();
      a.mode = r < 0.3 ? "idle" : r < 0.55 ? "window" : r < 0.8 ? "phone" : "chat";
      a.nb = null;
      if (a.mode === "chat") {
        let best = 1e9;
        for (const o of ctx.sitters) {
          if (o === slot) continue;
          const d = Math.hypot(o.x - slot.x, o.z - slot.z);
          if (d < best) {
            best = d;
            a.nb = o;
          }
        }
        if (!a.nb) a.mode = "idle";
      }
      a.until = t + 4 + Math.random() * 10;
    }
  }
  const side = slot.z >= 0 ? 1 : -1;
  switch (a.mode) {
    case "mirror": a.look.set(slot.x + 0.7, slot.y + 0.95, 0); break;
    case "side": a.look.set(slot.x + 1, head, -6); break; // the kerb side (traffic keeps left)
    case "window": a.look.set(slot.x + 1.5, head, side * 7); break;
    case "phone": a.look.set(slot.x + 0.35, slot.y + 0.4, slot.z); break;
    case "chat": a.look.set(a.nb.x, a.nb.y + 0.8, a.nb.z); break;
    default: a.look.set(slot.x + 10, head, slot.z * 0.3);
  }
  st.lookAt = a.look;
  if (slot.driver) {
    if (ctx.wheel) {
      // both hands on the rim at nine and three; the rim points turn with the wheel
      const g = (a.g ||= { wheel: 1, wheelR: new THREE.Vector3(), wheelL: new THREE.Vector3() });
      ctx.wheel.spin.localToWorld(g.wheelR.set(ctx.wheel.r, -0.01, 0));
      ctx.wheel.spin.localToWorld(g.wheelL.set(-ctx.wheel.r, -0.01, 0));
      st.gesture = g;
    } else st.gesture = HOLD;
    st.talk = 0;
    st.expr = "neutral";
  } else {
    st.gesture = a.mode === "phone" ? PHONE : KNEES;
    const talking = a.mode === "chat" && Math.sin(t * 0.9 + a.ph) > 0;
    st.talk = talking ? 0.25 + 0.3 * Math.abs(Math.sin(t * 6.1 + a.ph) * Math.sin(t * 2.3)) : 0;
    st.expr = a.mode === "chat" ? "softSmile" : "neutral";
  }
  c.update(dt, st);
}
