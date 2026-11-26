// World streamer (Phase 1b-i): decides WHICH tiles should be in memory, from the player's position and velocity.
// It knows nothing about meshes: onLoad(tile) / onUnload(tile) are where the world builders plug in (next step).
// Pure JS, no THREE, so tools/streamer.test.mjs runs it in Node. Tiles come from tools/bake.mjs (public/tiles/).
// A tile is wanted if it is within `radius` metres of the path the player will take in the next `lookahead` seconds
// (a capsule around the line position -> position + velocity*lookahead). Nearest to the PLAYER loads first, at most
// `maxLoads` at a time. A tile is dropped only when it is further than radius*keep + (fastest speed seen)*lookahead
// from the player, so stopping or reversing does not make tiles flicker out and back in.
// shortcut: lookahead is a straight line from velocity; Phase 3 replaces it with the road graph.
// shortcut: tiles are fetched whole as JSON; Phase 1b-iii makes them binary and decodes them in a worker.

const rectDist = (r, x, z) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]));
function ptSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
function segHitsRect(ax, az, bx, bz, r) { // Liang-Barsky
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - r[0]], [dx, r[2] - ax], [-dz, az - r[1]], [dz, r[3] - az]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
export function distSegRect(ax, az, bx, bz, r) {
  if (segHitsRect(ax, az, bx, bz, r)) return 0;
  return Math.min(rectDist(r, ax, az), rectDist(r, bx, bz), ptSeg(r[0], r[1], ax, az, bx, bz), ptSeg(r[2], r[1], ax, az, bx, bz), ptSeg(r[2], r[3], ax, az, bx, bz), ptSeg(r[0], r[3], ax, az, bx, bz));
}

export function createStreamer({
  base = "/tiles/",
  fetchJson = (u, signal) => fetch(u, { signal }).then((r) => { if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); }),
  radius = 300, lookahead = 4, maxLoads = 3, keep = 1.4, retryMs = 2000, maxFails = 5,
  onLoad = () => {}, onUnload = () => {},
} = {}) {
  let root = null, inflight = 0, loads = 0, frame = 0, vmax = 0, lastNow = 0;
  const tiles = new Map(); // id -> { node, state: "queued"|"loading"|"ready"|"failed"|"dead", seen, fails, retryAt, abort, data }
  const pending = new Set();

  async function init(manifest) {
    manifest ??= await fetchJson(`${base}manifest.json`);
    root = manifest.root;
    return manifest;
  }

  const drop = (t) => { // forget a tile: cancel its fetch, or tell the builder to free it
    if (t.state === "loading") t.abort.abort();
    else if (t.state === "ready") { try { onUnload(t.data); } catch (e) { console.error("streamer onUnload", e); } }
  };

  // Call every frame. x,z metres; vx,vz metres/second; now in ms.
  function update(x, z, vx, vz, now = performance.now()) {
    if (!root || ![x, z, vx, vz].every(Number.isFinite)) return; // a bad frame must not make every tile "wanted"
    lastNow = now; frame++; vmax = Math.max(vmax, Math.hypot(vx, vz));
    const bx = x + vx * lookahead, bz = z + vz * lookahead, want = [];
    (function walk(n) {
      if (distSegRect(x, z, bx, bz, n.ext) > radius) return;
      if (n.children) n.children.forEach(walk); else want.push(n);
    })(root);
    for (const n of want) {
      const t = tiles.get(n.id);
      if (!t) tiles.set(n.id, { node: n, state: "queued", seen: frame, fails: 0, retryAt: 0 });
      else { t.seen = frame; if (t.state === "failed" && now >= t.retryAt) t.state = "queued"; }
    }
    const far = radius * keep + vmax * lookahead;
    for (const [id, t] of tiles) if (t.seen !== frame && rectDist(t.node.ext, x, z) > far) { tiles.delete(id); drop(t); }
    const order = want.map((n) => [rectDist(n.ext, x, z), n]).sort((a, b) => a[0] - b[0]);
    for (const [, n] of order) {
      if (inflight >= maxLoads) break;
      const t = tiles.get(n.id);
      if (t.state !== "queued") continue;
      t.state = "loading"; t.abort = new AbortController(); inflight++; loads++;
      const p = fetchJson(`${base}${n.file}`, t.abort.signal).then(
        (data) => {
          inflight--;
          if (tiles.get(n.id) !== t) return; // dropped while loading: never build it
          try { onLoad(data); t.state = "ready"; t.data = data; } catch (e) { console.error("streamer onLoad", e); t.state = "dead"; }
        },
        () => {
          inflight--;
          if (tiles.get(n.id) !== t) return;
          t.fails++;
          t.state = t.fails >= maxFails ? "dead" : "failed";
          t.retryAt = lastNow + retryMs * 2 ** (t.fails - 1); // backoff: 2 s, 4 s, 8 s ...
        },
      ).finally(() => pending.delete(p));
      pending.add(p);
    }
  }

  const count = (s) => { let c = 0; for (const t of tiles.values()) if (t.state === s) c++; return c; };
  return {
    init, update,
    ready: (id) => tiles.get(id)?.state === "ready",
    stats: () => ({ ready: count("ready"), loading: count("loading"), queued: count("queued"), failed: count("failed"), dead: count("dead"), loads }),
    idle: async () => { while (pending.size) await Promise.all([...pending]); },
    dispose() { for (const t of tiles.values()) drop(t); tiles.clear(); root = null; },
  };
}
