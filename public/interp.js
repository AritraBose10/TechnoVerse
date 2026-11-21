// Entity interpolation for other people (remote players).
// Server snapshots arrive ~10x/s. Instead of chasing the latest one, we keep a short history per
// person and draw them slightly in the past (INTERP.delay ms), always BETWEEN two real samples.
// Result: constant-speed, jitter-free motion at any frame rate. See Gambetta, "Entity Interpolation".
export const INTERP = {
  delay: 120, // ms in the past we render at (a bit over one 100 ms snapshot interval)
  minDelay: 100,
  maxDelay: 260,
  maxExtrap: 150, // ms we may extrapolate if snapshots stall, then we hold still
  teleport: 8, // metres between consecutive samples = a jump, not a walk: snap, don't slide
  keep: 1500, // ms of history retained
};

export function createTrack(x, y, z, ry, now = performance.now()) {
  return { s: [{ t: now, x, y, z, ry }], starve: 0, delay: INTERP.delay, snapped: false };
}

const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

export function pushSample(tr, x, y, z, ry, now = performance.now()) {
  const s = tr.s;
  const last = s[s.length - 1];
  if (last && Math.hypot(x - last.x, z - last.z) > INTERP.teleport) {
    s.length = 0; // teleport / respawn: forget the past
    tr.snapped = true;
  }
  // keep the angle continuous across the +-PI seam so interpolation never spins the long way
  const prev = s[s.length - 1];
  if (prev) ry = prev.ry + wrap(ry - prev.ry);
  s.push({ t: now, x, y, z, ry });
  const cut = now - INTERP.keep;
  while (s.length > 3 && s[1].t < cut) s.shift();
}

// Fills out = {x,y,z,ry,vx,vy,vz} for the moment `now`. Returns true if we had to snap.
export function sampleTrack(tr, now, out, dt = 0.016) {
  const s = tr.s;
  const n = s.length;
  const first = s[0];
  let snapped = tr.snapped;
  tr.snapped = false;
  const rt = now - tr.delay;
  let x, y, z, ry, vx = 0, vy = 0, vz = 0;
  if (n === 1 || rt <= first.t) {
    ({ x, y, z, ry } = first);
  } else {
    const lastS = s[n - 1];
    if (rt >= lastS.t) {
      // ran out of data: coast briefly on last velocity, then stand. Widen delay a little (adaptive).
      const p = s[n - 2];
      const span = Math.max(lastS.t - p.t, 1);
      const ahead = Math.min(rt - lastS.t, INTERP.maxExtrap);
      vx = (lastS.x - p.x) / span; vy = (lastS.y - p.y) / span; vz = (lastS.z - p.z) / span;
      x = lastS.x + vx * ahead; y = lastS.y + vy * ahead; z = lastS.z + vz * ahead;
      ry = lastS.ry;
      if (rt - lastS.t > INTERP.maxExtrap) { vx = vy = vz = 0; x = lastS.x; y = lastS.y; z = lastS.z; }
      tr.starve = Math.min(tr.starve + 1, 30);
      if (tr.starve > 3) tr.delay = Math.min(INTERP.maxDelay, tr.delay + 4);
    } else {
      let i = 1;
      while (s[i].t < rt) i++;
      const a = s[i - 1], b = s[i];
      const u = (rt - a.t) / Math.max(b.t - a.t, 1);
      x = a.x + (b.x - a.x) * u; y = a.y + (b.y - a.y) * u; z = a.z + (b.z - a.z) * u;
      ry = a.ry + (b.ry - a.ry) * u;
      const span = (b.t - a.t) / 1000;
      vx = (b.x - a.x) / span; vy = (b.y - a.y) / span; vz = (b.z - a.z) / span;
      // healthy: let the delay drift back down toward the minimum, slowly
      tr.starve = Math.max(0, tr.starve - 0.05);
      if (tr.starve < 1 && tr.delay > INTERP.delay) tr.delay = Math.max(INTERP.delay, tr.delay - 2 * dt * 60 * 0.1);
    }
  }
  out.x = x; out.y = y; out.z = z; out.ry = ry; out.vx = vx; out.vy = vy; out.vz = vz;
  return snapped;
}
