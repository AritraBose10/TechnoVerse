// Tests for public/streamer.js in simulated time, no browser. Usage: node tools/streamer.test.mjs  (run `npm run bake` first)
// 1. Drive along the longest road and count "holes" (a tile within HOLE_R metres of the player not loaded yet).
// 2. Edge cases: teleport (own tile first), stop-and-go (no churn), NaN input, failing fetches, memory ceiling.
import { readFileSync, statSync } from "node:fs";
import { createStreamer } from "../public/streamer.js";

const HOLE_R = 100, SPEED = 15, DT = 1 / 30;
const manifest = JSON.parse(readFileSync("public/tiles/manifest.json", "utf8"));
const campus = JSON.parse(readFileSync("public/campus.json", "utf8"));
const leaves = [];
(function walk(n) { n.children ? n.children.forEach(walk) : leaves.push(n); })(manifest.root);
const length = (p) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
const route = campus.roads.filter((r) => r.pts.length > 2).sort((a, b) => length(b.pts) - length(a.pts))[0].pts;
const total = length(route);
function at(d) { // point and heading at distance d along the route
  for (let i = 1; i < route.length; i++) {
    const l = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    if (d <= l || i === route.length - 1) { const t = Math.min(1, d / l), ux = (route[i][0] - route[i - 1][0]) / l, uz = (route[i][1] - route[i - 1][1]) / l; return [route[i - 1][0] + (route[i][0] - route[i - 1][0]) * t, route[i - 1][1] + (route[i][1] - route[i - 1][1]) * t, ux, uz]; }
    d -= l;
  }
}
const rectD = (r, x, z) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]));
const contains = (r, x, z) => rectD(r, x, z) === 0;

// A fake network in simulated time. Parallel requests SHARE the bandwidth. `fail(file, attempt)` can make a request reject.
function net({ rtt, mbps }, fail = () => false) {
  let now = 0;
  const due = [], attempts = {}, log = [];
  const fetchJson = (url) => new Promise((resolve, reject) => {
    const file = url.split("/").pop(), f = `public/tiles/${file}`;
    const n = (attempts[file] = (attempts[file] ?? 0) + 1);
    log.push(file);
    const at = now + rtt + (statSync(f).size / (mbps * 1000)) * (due.length + 1);
    due.push({ at, go: () => (fail(file, n) ? reject(new Error("net")) : resolve(JSON.parse(readFileSync(f, "utf8")))) });
  });
  return {
    fetchJson, log, attempts,
    async tick(ms) { now += ms; for (let i = due.length - 1; i >= 0; i--) if (due[i].at <= now) due.splice(i, 1)[0].go(); await new Promise((r) => setImmediate(r)); },
    get now() { return now; },
  };
}

async function drive({ radius, lookahead, rtt, mbps }) {
  const n = net({ rtt, mbps });
  const s = createStreamer({ fetchJson: n.fetchJson, radius, lookahead, maxLoads: 4 });
  await s.init(manifest);
  let holes = 0, frames = 0, maxReady = 0, d = 0;
  for (;;) {
    const moving = n.now >= 3000; // 3 s standing still first = the loading screen
    if (moving) d += SPEED * DT;
    if (d >= total) break;
    await n.tick(DT * 1000);
    const [x, z, ux, uz] = at(d);
    s.update(x, z, moving ? ux * SPEED : 0, moving ? uz * SPEED : 0, n.now);
    if (moving) { frames++; if (leaves.some((l) => rectD(l.ext, x, z) <= HOLE_R && !s.ready(l.id))) holes++; maxReady = Math.max(maxReady, s.stats().ready); }
  }
  return { holes, frames, maxReady, loads: s.stats().loads };
}

const nets = { wifi: { rtt: 80, mbps: 5 }, slow: { rtt: 300, mbps: 0.5 }, bad: { rtt: 1500, mbps: 0.2 } }; // bad = overloaded campus Wi-Fi / mobile
const cases = [["R110 no lookahead", 110, 0], ["R110 look 4s", 110, 4], ["R300 look 4s", 300, 4]];
console.log(`route ${Math.round(total)} m at ${SPEED} m/s, ${leaves.length} tiles; hole = a tile within ${HOLE_R} m not loaded`);
const res = {};
for (const [nn, p] of Object.entries(nets)) for (const [name, radius, lookahead] of cases) {
  const r = (res[`${nn}/${name}`] = await drive({ radius, lookahead, ...p }));
  console.log(`${nn.padEnd(5)} ${name.padEnd(18)} holes ${String(r.holes).padStart(4)}/${r.frames} frames  max tiles in memory ${String(r.maxReady).padStart(3)}  loads ${r.loads}`);
}
let bad = 0;
const chk = (ok, msg) => { if (!ok) { bad++; console.error(`FAIL ${msg}`); } else console.log(`ok   ${msg}`); };
for (const nn of Object.keys(nets)) chk(res[`${nn}/R110 look 4s`].holes <= res[`${nn}/R110 no lookahead`].holes, `${nn}: lookahead is never worse than plain radius loading`);
chk(res["wifi/R300 look 4s"].holes === 0, "wifi R300 look 4s has no holes");
const worstNone = Math.max(...Object.keys(nets).map((k) => res[`${k}/R110 no lookahead`].holes));
chk(worstNone === 0 || Object.keys(nets).every((k) => res[`${k}/R110 look 4s`].holes === 0), "where plain loading has holes, lookahead removes them");
chk(Math.max(...Object.values(res).map((r) => r.maxReady)) <= 40, "memory ceiling: at most 40 tiles in memory on the whole route");

// --- edge cases ---
{ // teleport: far from the last position, the tile under the player must load first and unrelated old tiles must never be built
  const n = net({ rtt: 80, mbps: 5 });
  const built = [];
  const s = createStreamer({ fetchJson: n.fetchJson, radius: 150, lookahead: 4, maxLoads: 1, onLoad: (t) => built.push(t.id) });
  await s.init(manifest);
  const [x0, z0] = at(0), [x1, z1] = at(total * 0.9);
  s.update(x0, z0, 0, 0, 0); // starts a load near the start
  s.update(x1, z1, 0, 0, 1); // teleport before it arrives
  for (let i = 0; i < 200; i++) { await n.tick(33); s.update(x1, z1, 0, 0, n.now); }
  const own = leaves.find((l) => contains(l.ext, x1, z1));
  chk(built.includes(own.id), "teleport: the tile under the player is loaded");
  chk(built.every((id) => rectD(leaves.find((l) => l.id === id).ext, x1, z1) < 150 * 1.4 + 1), "teleport: no tile from the old position is built after the jump");
}
{ // stop-and-go and reversal: tiles must not be unloaded and reloaded over and over
  const n = net({ rtt: 80, mbps: 5 });
  let unloads = 0;
  const s = createStreamer({ fetchJson: n.fetchJson, radius: 110, lookahead: 4, maxLoads: 4, onUnload: () => unloads++ });
  await s.init(manifest);
  let d = 500;
  for (let i = 0; i < 4000; i++) { // 15 m/s for 2 s, stop 2 s, reverse 2 s, stop 2 s ...
    const phase = Math.floor(i / 60) % 4, v = phase === 0 ? SPEED : phase === 2 ? -SPEED : 0;
    d = Math.max(0, d + v * DT);
    const [x, z, ux, uz] = at(d);
    await n.tick(DT * 1000);
    s.update(x, z, ux * v, uz * v, n.now);
  }
  chk(s.stats().loads <= leaves.length && unloads <= 8, `stop-and-go: ${s.stats().loads} loads, ${unloads} unloads in 133 s (a churning streamer would be in the hundreds)`);
}
{ // NaN must not load the whole map
  const n = net({ rtt: 80, mbps: 5 });
  const s = createStreamer({ fetchJson: n.fetchJson, radius: 110 });
  await s.init(manifest);
  const [x, z] = at(300);
  s.update(x, z, NaN, 0, 0); s.update(NaN, z, 0, 0, 1);
  chk(s.stats().loads === 0, "NaN input is ignored");
}
{ // failures: a tile that fails twice then works must end up ready; a 404 forever must stop retrying
  const n = net({ rtt: 80, mbps: 5 }, (file, attempt) => (file.startsWith("r") && attempt <= 2));
  const s = createStreamer({ fetchJson: n.fetchJson, radius: 110, retryMs: 500 });
  await s.init(manifest);
  const [x, z] = at(300), own = leaves.find((l) => contains(l.ext, x, z));
  for (let i = 0; i < 1500; i++) { await n.tick(33); s.update(x, z, 0, 0, n.now); }
  chk(s.ready(own.id), "a tile that fails twice is retried and loads");
  const n2 = net({ rtt: 80, mbps: 5 }, () => true);
  const s2 = createStreamer({ fetchJson: n2.fetchJson, radius: 110, retryMs: 500, maxFails: 4 });
  await s2.init(manifest);
  for (let i = 0; i < 4000; i++) { await n2.tick(33); s2.update(x, z, 0, 0, n2.now); }
  chk(Math.max(...Object.values(n2.attempts)) <= 4 && s2.stats().dead > 0, "a tile that always fails stops after maxFails (no endless retry)");
}
{ // a builder that throws must not leave a half-built tile marked ready
  const n = net({ rtt: 80, mbps: 5 });
  const s = createStreamer({ fetchJson: n.fetchJson, radius: 110, onLoad: () => { throw new Error("builder bug"); } });
  await s.init(manifest);
  const [x, z] = at(300);
  const err = console.error; console.error = () => {};
  for (let i = 0; i < 100; i++) { await n.tick(33); s.update(x, z, 0, 0, n.now); }
  console.error = err;
  chk(s.stats().ready === 0 && s.stats().dead > 0, "onLoad throwing marks the tile dead, not ready");
}
console.log(bad ? `${bad} failed` : "all checks passed");
process.exit(bad ? 1 : 0);
