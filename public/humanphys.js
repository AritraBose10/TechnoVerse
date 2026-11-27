// How a human body moves, as physics rather than animation: the player's walking, running,
// turning, stopping, slopes, tiredness, being pushed and landing from a height.
//
// A walking person is a 70 kg mass carried on legs that can only push against the ground through
// friction, with the centre of mass about 0.95 m up. Everything below follows from that:
//
//  - Acceleration is limited. The feet can push at most mu*g (about 7.8 m/s^2 on dry asphalt), and
//    people use only part of it: about 1.5-2 m/s^2 to set off walking, 4-5 m/s^2 into a run, and they
//    brake harder than they speed up (3-6 m/s^2). Speeding up, braking and turning all share the same
//    grip (the "friction circle"), so a sharp turn at speed costs speed.
//  - Turning takes time and room. Standing, a person pivots on the spot at up to about a turn per
//    second; moving, the turn radius is set by the sideways acceleration they accept
//    (r = v^2 / a): a run curves wide, a walk turns tight. Reversing means slowing through a stop.
//  - Slopes change speed. Walking speed follows Tobler's hiking function: fastest on a slight
//    downhill (about -5%), slower uphill and on steep downhills.
//  - Running tires. A sprint can be held for about 15-20 s; after that the top speed falls toward a
//    jog until the runner recovers by walking.
//  - Balance is an inverted pendulum. A push changes the body's velocity by impulse / mass; whether
//    the person stands, staggers a few steps or falls depends on whether one step can still catch
//    the body (the "capture point", x + v / omega0, with omega0 = sqrt(g / 0.95 m) = 3.2 /s).
//  - Landing: legs absorb about 4-5 m/s of impact (a 1-1.2 m drop) by bending; harder landings
//    make the person stumble or roll; above about 9 m/s (a 4 m fall) they go down.
//  - The body leans into acceleration: forward when speeding up, back when braking, into turns,
//    by atan(a / g), as a real body must to keep its weight over the feet.
//
// stepHuman() returns the velocity to move the body by this physics step, plus the lean and state
// for the animation. It works in the horizontal plane; gravity and the vertical are handled by the
// character controller in main.js.

const G = 9.81;
export const HUMAN = {
  mass: 70, // kg
  comHeight: 0.95, // m, centre of mass when standing
  mu: 0.8, // dry asphalt or tiles with shoes
  walk: 1.9, // m/s, the game's relaxed walk (a real stroll is 1.3-1.5)
  run: 4.8, // m/s, a steady run
  sprint: 6.2, // m/s, flat out (fresh)
  accelWalk: 1.8, // m/s^2 setting off at a walk
  accelRun: 4.5, // m/s^2 setting off into a run
  brakeWalk: 3.2, // m/s^2 stopping from a walk
  brakeRun: 6.0, // m/s^2 stopping from a run (a few hard steps)
  lateralWalk: 2.5, // m/s^2 sideways, turning at a walk
  lateralRun: 4.0, // m/s^2 sideways, turning at a run
  pivotRate: 6.0, // rad/s, turning on the spot
  sprintSeconds: 18, // how long a fresh sprint lasts
  recoverSeconds: 30, // walking time to recover fully
};
const OMEGA0 = Math.sqrt(G / HUMAN.comHeight);

export function newHuman(heading = 0) {
  return {
    vx: 0,
    vz: 0,
    heading, // the way the body faces (radians; forward is (-sin h, -cos h), as in main.js)
    stamina: 1, // 1 fresh .. 0 spent
    leanFwd: 0, // radians, + leaning forward
    leanSide: 0, // radians, + leaning right
    stagger: 0, // seconds of staggering left
    fallen: 0, // seconds lying left (0 = on their feet)
    state: "stand", // stand | walk | run | stagger | fallen
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Tobler's hiking function, as a factor of flat-ground speed. grade: rise per metre (+ uphill). */
export function slopeFactor(grade) {
  return Math.exp(-3.5 * Math.abs(grade + 0.05)) / Math.exp(-3.5 * 0.05);
}

/**
 * One physics step.
 * h: from newHuman(). input: { x, z } wished direction in the world (length 0..1), run (bool).
 * ground: { grounded, grade (rise per metre along the motion), mu (optional) }.
 * Returns { vx, vz } to move by.
 */
export function stepHuman(h, input, ground, dt) {
  const H = HUMAN;
  const mu = ground.mu ?? H.mu;
  const speed = Math.hypot(h.vx, h.vz);

  // ---- lying down after a fall: no control until back on their feet ----
  if (h.fallen > 0) {
    h.fallen -= dt;
    const slow = Math.max(0, 1 - (mu * G * dt) / Math.max(speed, 1e-3)); // sliding to a stop
    h.vx *= slow;
    h.vz *= slow;
    h.state = h.fallen > 0 ? "fallen" : "stand";
    h.leanFwd = h.leanSide = 0;
    return { vx: h.vx, vz: h.vz };
  }

  // ---- what the legs are asked to do ----
  const len = Math.min(1, Math.hypot(input.x, input.z));
  // tiredness: a sprint drains, walking and standing recover
  const running = input.run && len > 0.1 && ground.grounded;
  if (running && speed > H.run * 0.8) h.stamina = Math.max(0, h.stamina - dt / H.sprintSeconds);
  else h.stamina = Math.min(1, h.stamina + dt / H.recoverSeconds);
  const runTop = H.run - (H.run - 2.6) * clamp((0.3 - h.stamina) / 0.3, 0, 1); // the run sags toward a 2.6 m/s jog when spent
  const top = (running ? runTop : H.walk) * slopeFactor(ground.grade || 0);
  let wx = 0;
  let wz = 0;
  if (len > 0.05) {
    wx = (input.x / Math.hypot(input.x, input.z)) * top * len;
    wz = (input.z / Math.hypot(input.x, input.z)) * top * len;
  }

  // ---- staggering after a push: the legs chase the body, the wish is mostly ignored ----
  if (h.stagger > 0) {
    h.stagger -= dt;
    wx = h.vx * 0.6;
    wz = h.vz * 0.6;
  }

  // ---- grip: how hard the feet can push this step ----
  const runK = clamp((speed - H.walk) / (H.run - H.walk), 0, 1);
  const dvx = wx - h.vx;
  const dvz = wz - h.vz;
  // split the change into along the motion (speeding up / braking) and across it (turning)
  let ax = 0;
  let az = 0;
  if (ground.grounded) {
    const ux = speed > 0.05 ? h.vx / speed : 0;
    const uz = speed > 0.05 ? h.vz / speed : 0;
    const along = dvx * ux + dvz * uz;
    const acrossX = dvx - along * ux;
    const acrossZ = dvz - along * uz;
    const accelMax = along >= 0 || speed < 0.05 ? H.accelWalk + (H.accelRun - H.accelWalk) * (running ? 1 : runK) : H.brakeWalk + (H.brakeRun - H.brakeWalk) * runK;
    const latMax = H.lateralWalk + (H.lateralRun - H.lateralWalk) * runK;
    // ask for the change over one tenth of a second, then cap each part
    let aAlong = clamp(along / 0.1, -accelMax, accelMax);
    let aAcrossX = acrossX / 0.1;
    let aAcrossZ = acrossZ / 0.1;
    const acrossLen = Math.hypot(aAcrossX, aAcrossZ);
    if (acrossLen > latMax) {
      aAcrossX *= latMax / acrossLen;
      aAcrossZ *= latMax / acrossLen;
    }
    // standing still: the first step goes straight where wished (no "across" yet)
    if (speed < 0.05) {
      const l = Math.hypot(dvx, dvz) / 0.1;
      const c = Math.min(1, accelMax / Math.max(l, 1e-6));
      ax = (dvx / 0.1) * c;
      az = (dvz / 0.1) * c;
    } else {
      ax = aAlong * ux + aAcrossX;
      az = aAlong * uz + aAcrossZ;
    }
    // the friction circle: everything together within mu*g
    const total = Math.hypot(ax, az);
    const grip = mu * G * (running ? 0.75 : 0.5);
    if (total > grip) {
      ax *= grip / total;
      az *= grip / total;
    }
  } else {
    // in the air there is nothing to push against: a little body twist only
    ax = clamp(dvx, -0.4, 0.4);
    az = clamp(dvz, -0.4, 0.4);
  }
  const before = { vx: h.vx, vz: h.vz };
  h.vx += ax * dt;
  h.vz += az * dt;
  // don't overshoot the wish (no jitter around it)
  if ((wx - before.vx) * (wx - h.vx) < 0) h.vx = wx;
  if ((wz - before.vz) * (wz - h.vz) < 0) h.vz = wz;

  // ---- facing: pivot when slow, follow the curve when moving ----
  const sp = Math.hypot(h.vx, h.vz);
  if (sp > 0.2 && h.stagger <= 0) {
    const want = Math.atan2(-h.vx, -h.vz);
    const rate = Math.max(1.5, Math.min(H.pivotRate, (H.lateralWalk + (H.lateralRun - H.lateralWalk) * runK) / Math.max(sp, 0.3) + 2.5));
    const d = wrap(want - h.heading);
    h.heading += clamp(d, -rate * dt, rate * dt);
  } else if (len > 0.05 && sp <= 0.2) {
    // turning on the spot toward where they want to go
    const want = Math.atan2(-input.x, -input.z);
    const d = wrap(want - h.heading);
    h.heading += clamp(d, -H.pivotRate * dt, H.pivotRate * dt);
  }

  // ---- lean: the body tips into its acceleration, a = g tan(lean) ----
  const fx = -Math.sin(h.heading);
  const fz = -Math.cos(h.heading);
  const aFwd = ax * fx + az * fz;
  const aRight = ax * -fz + az * fx;
  const k = 1 - Math.exp(-dt * 8);
  h.leanFwd += (clamp(Math.atan(aFwd / G), -0.35, 0.35) - h.leanFwd) * k;
  h.leanSide += (clamp(Math.atan(aRight / G), -0.35, 0.35) - h.leanSide) * k;

  h.state = h.stagger > 0 ? "stagger" : sp < 0.1 ? "stand" : sp > H.walk * 1.3 ? "run" : "walk";
  return { vx: h.vx, vz: h.vz };
}

// How long the get-up off the ground takes (seconds, character.js getUp, rolling over included). `fallen`
// is set so that the body lies a moment first and then has this long left to get up.
export const GETUP_TIME = 3.75;

/**
 * Pushed: impulse (N*s) in the world (jx, jz) — a shoulder bump is about 40-70 N*s, a car at
 * walking pace 300+. Returns "sway" | "stagger" | "fall".
 * The push changes velocity by J/m; the body can still catch itself with steps if the capture
 * point (how far the centre of mass will travel before it can be stopped, v / omega0) is within
 * reach: about 0.2 m in place, up to about 1 m with quick steps.
 */
export function pushHuman(h, jx, jz) {
  h.vx += jx / HUMAN.mass;
  h.vz += jz / HUMAN.mass;
  const capture = Math.hypot(h.vx, h.vz) / OMEGA0;
  if (capture < 0.2) return "sway";
  if (capture < 1.0) {
    h.stagger = 0.4 + capture * 0.9; // a few quick steps to catch the body
    return "stagger";
  }
  h.fallen = GETUP_TIME + 1.8 + 0.4 * capture; // down, sliding to a stop, lying a moment, then getting up
  return "fall";
}

/** Landing at impact speed v (m/s, downward). Returns "soft" | "hard" | "stumble" | "fall". */
export function landHuman(h, v) {
  if (v < 3) return "soft";
  if (v < 5) return "hard"; // knees bend deep (handled by the jump code)
  if (v < 9) {
    h.stagger = 0.5 + (v - 5) * 0.15;
    h.vx *= 0.6;
    h.vz *= 0.6;
    return "stumble";
  }
  h.fallen = GETUP_TIME + 1.8;
  return "fall";
}
