// T-005 step 1+2: find the Sector V boundary features on OpenStreetMap and download the map extract for their bounding box.
// Run from the repo root:  node tools/fetch-sector-v.mjs
//   --reuse-bbox   skip steps 1+2 and use the bbox already saved in tools/sector-v-bbox.json
//   --full         step 3 downloads every element (nwr) instead of the lean query (see LEAN below)
//   --osm-api      step 3 skips Overpass and uses the main OSM API (api.openstreetmap.org) directly
// Writes (all gitignored / scratch): tools/sector-v-features.json, tools/sector-v-bbox.json, tools/osm-extract.json
// (the old 600 m extract is kept as tools/osm-extract-600m.json). Each finished tile of step 3 is saved in
// tools/osm-tiles/, so if the run dies, just run the same command again: finished tiles are skipped.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARGS = new Set(process.argv.slice(2));
const ENV = process.env;
// Public Overpass instances listed on wiki.openstreetmap.org/wiki/Overpass_API (Nov 2026). overpass.kumi.systems is no longer listed.
const MIRRORS = ENV.OVERPASS_MIRRORS ? ENV.OVERPASS_MIRRORS.split(",") : ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const OSM_API = ENV.OSM_API_BASE || "https://api.openstreetmap.org/api/0.6";
const UA = "TechnoVerse-campus-builder/2.0 (one-off campus map extract; node fetch)";
const T = Number(ENV.FETCH_TIME_SCALE || 1); // test hook: scales every wait
const REQUEST_TIMEOUT = Number(ENV.FETCH_REQUEST_TIMEOUT_MS || 240000); // longer than the [timeout:180] asked of the server
const MAX_TRIES = Number(ENV.FETCH_MAX_TRIES || 7); // per query, across all mirrors
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * T));
const secs = (t0) => ((Date.now() - t0) / 1000).toFixed(1) + " s";
const clip = (t) => t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

// Explain a failed fetch: undici's "fetch failed" hides the real reason in e.cause (ECONNRESET, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT, cert errors ...)
export function why(e) {
  if (e.name === "AbortError" || e.name === "TimeoutError") return `no complete answer within ${REQUEST_TIMEOUT / 1000} s (our timeout)`;
  const c = e.cause;
  let s = e.message;
  if (c) s += ` <- ${c.code || c.name || ""} ${c.message || ""}`.trimEnd();
  if (c && c.cause) s += ` <- ${c.cause.code || ""} ${c.cause.message || ""}`.trimEnd();
  return s;
}

// one HTTP request with a hard timeout; never throws, returns { ok, status, text, retryAfter, err, ms, bytes }
export async function request(url, init) {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const text = await res.text();
    const ra = res.headers.get("retry-after");
    let retryAfter = null;
    if (ra) retryAfter = /^\d+$/.test(ra.trim()) ? Number(ra) : Math.max(0, (Date.parse(ra) - Date.now()) / 1000) || null;
    return { ok: res.ok, status: res.status, text, retryAfter, ms: Date.now() - t0, bytes: Buffer.byteLength(text) };
  } catch (e) {
    return { ok: false, status: 0, text: "", err: why(e), ms: Date.now() - t0, bytes: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// Overpass /api/status: "N slots available now." or "Slot available after: <time>, in N seconds." -> seconds to wait (0 = go)
export async function slotWait(interpreterUrl) {
  const r = await request(interpreterUrl.replace(/interpreter$/, "status"), { headers: { "User-Agent": UA } });
  if (!r.ok) return 0; // some mirrors have no status page; just try the query
  const free = r.text.match(/(\d+) slots? available now/);
  if (free && Number(free[1]) > 0) return 0;
  const waits = [...r.text.matchAll(/in (\d+) seconds/g)].map((m) => Number(m[1]));
  return waits.length ? Math.min(...waits) + 2 : 0;
}

// exponential backoff with jitter: 15, 30, 60, 120, 240 s (+-30 %)
const backoff = (n) => Math.min(240, 15 * 2 ** n) * (0.7 + Math.random() * 0.6);

export async function overpass(query, label) {
  let lastErr = "";
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    const host = new URL(url).host;
    const slot = await slotWait(url);
    if (slot > 0) { console.log(`  ${label}: ${host} has no free slot, waiting ${slot} s`); await sleep(slot * 1000); }
    console.log(`  ${label}: try ${attempt + 1}/${MAX_TRIES} on ${host} ...`);
    // no Accept header: Overpass picks the format from [out:json]
    const r = await request(url, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query) });
    let wait;
    if (r.ok) {
      try {
        const data = JSON.parse(r.text);
        // Overpass reports a timeout / out-of-memory as HTTP 200 with a "remark" and a truncated element list
        if (data.remark && /error|timed out|out of memory/i.test(data.remark)) throw new Error("server remark: " + data.remark);
        if (!Array.isArray(data.elements)) throw new Error("no elements array");
        console.log(`  ${label}: OK from ${host} in ${(r.ms / 1000).toFixed(1)} s, ${(r.bytes / 1e6).toFixed(2)} MB`);
        return data;
      } catch (e) {
        lastErr = `${host}: HTTP 200 but bad answer after ${(r.ms / 1000).toFixed(1)} s (${clip(e.message)})`;
        wait = backoff(attempt);
      }
    } else if (r.status === 429 || r.status === 406) {
      // rate limited / refused: the operators ask for at least 30 s before the next query and ban clients that do not wait
      lastErr = `${host}: HTTP ${r.status}: ${clip(r.text)}`;
      wait = Math.max(30, r.retryAfter || 0, backoff(attempt));
    } else {
      lastErr = r.status ? `${host}: HTTP ${r.status} after ${(r.ms / 1000).toFixed(1)} s: ${clip(r.text)}` : `${host}: ${r.err} (after ${(r.ms / 1000).toFixed(1)} s)`;
      wait = Math.max(r.retryAfter || 0, backoff(attempt));
    }
    console.log(`  ${label}: ${lastErr}`);
    if (attempt + 1 < MAX_TRIES) { console.log(`  ${label}: waiting ${Math.round(wait)} s before the next try`); await sleep(wait * 1000); }
  }
  throw new Error(`Overpass failed for ${label} after ${MAX_TRIES} tries; last error: ${lastErr}`);
}

// ---- OSM API fallback: XML from /api/0.6/map -> the same JSON element shape as Overpass "out body; >; out skel qt;" ----
const unesc = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, g) => {
  if (g[0] === "#") return String.fromCodePoint(g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10));
  return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[g.toLowerCase()];
});
const attrs = (s) => { const a = {}; for (const m of s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[m[1]] = unesc(m[2] ?? m[3]); return a; };
export function osmXmlToElements(xml) {
  const out = [];
  for (const m of xml.matchAll(/<(node|way|relation)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g)) {
    const [, type, head, , inner = ""] = m;
    const a = attrs(head);
    if (a.visible === "false") continue;
    const el = { type, id: Number(a.id) };
    if (type === "node") { el.lat = Number(a.lat); el.lon = Number(a.lon); }
    if (type === "way") el.nodes = [...inner.matchAll(/<nd\b([^>]*?)\/?>/g)].map((x) => Number(attrs(x[1]).ref));
    if (type === "relation") el.members = [...inner.matchAll(/<member\b([^>]*?)\/?>/g)].map((x) => { const b = attrs(x[1]); return { type: b.type, ref: Number(b.ref), role: b.role || "" }; });
    const tags = {};
    for (const t of inner.matchAll(/<tag\b([^>]*?)\/?>/g)) { const b = attrs(t[1]); tags[b.k] = b.v; }
    if (Object.keys(tags).length) el.tags = tags;
    out.push(el);
  }
  return out;
}

export async function osmApiMap([s, w, n, e], label) {
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    console.log(`  ${label}: OSM API try ${attempt + 1}/4 ...`);
    const r = await request(`${OSM_API}/map?bbox=${w},${s},${e},${n}`, { headers: { "User-Agent": UA } });
    if (r.ok && r.text.includes("<osm")) {
      const elements = osmXmlToElements(r.text);
      console.log(`  ${label}: OK from OSM API in ${(r.ms / 1000).toFixed(1)} s, ${(r.bytes / 1e6).toFixed(2)} MB`);
      return { elements };
    }
    lastErr = r.status ? `HTTP ${r.status} after ${(r.ms / 1000).toFixed(1)} s: ${clip(r.text)}` : r.err;
    console.log(`  ${label}: OSM API ${lastErr}`);
    if (r.status === 400) break; // too many nodes / area too big: retrying will not help
    if (attempt < 3) await sleep(Math.max(r.retryAfter || 0, backoff(attempt)) * 1000);
  }
  throw new Error(`OSM API failed for ${label}: ${lastErr}`);
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  let bbox;
  if (ARGS.has("--reuse-bbox")) {
    bbox = JSON.parse(fs.readFileSync(path.join(HERE, "sector-v-bbox.json"), "utf8")).bbox;
    console.log("1-2/3 skipped (--reuse-bbox); bbox (S,W,N,E):", bbox.map((x) => +x.toFixed(5)).join(","));
  } else {
    // ---- 1. the named features ----
    console.log("1/3 boundary features");
    const WIDE = "22.50,88.37,22.66,88.50";
    const feat = await overpass(`[out:json][timeout:90];(
  way(325486011);
  node["name"~"College More",i](${WIDE});
  way["name"~"College More",i](${WIDE});
  node["railway"="station"]["name"~"Sector.?V",i](${WIDE});
  node["public_transport"="station"]["name"~"Sector.?V",i](${WIDE});
  way["name"~"Eastern Metropolitan Bypass",i](${WIDE});
  way["ref"~"EM Bypass",i](${WIDE});
  way["name"="New Town Road"](${WIDE});
); out tags geom;`, "features");
    fs.writeFileSync(path.join(HERE, "sector-v-features.json"), JSON.stringify(feat));
    const els = feat.elements;
    const pts = (e) => (e.geometry ? e.geometry.map((g) => [g.lat, g.lon]) : [[e.lat, e.lon]]);
    const summary = els.map((e) => ({ id: `${e.type}/${e.id}`, name: e.tags && (e.tags.name || e.tags.ref), hw: e.tags && e.tags.highway, n: pts(e).length, first: pts(e)[0], last: pts(e).at(-1) }));
    console.log(`   ${els.length} features:`);
    for (const s of summary) console.log("   ", JSON.stringify(s));

    // ---- 2. bounding box: the station, College More, the east way and the Bypass segment between them ----
    const station = els.filter((e) => e.type === "node" && e.tags && (e.tags.railway === "station" || e.tags.public_transport === "station"));
    // several places are called College More; the one that matters is the junction by the university (within 1 km of its pin)
    const near = (e) => pts(e).every((p) => Math.abs(p[0] - 22.5760302) < 0.009 && Math.abs(p[1] - 88.4284409) < 0.009);
    const more = els.filter((e) => e.tags && /College More/i.test(e.tags.name || "") && near(e));
    const east = els.find((e) => e.type === "way" && e.id === 325486011);
    if (!station.length || !more.length || !east) {
      console.log("!! missing a boundary feature (station:", station.length, "College More:", more.length, "east way:", Boolean(east), "). Paste this output to Claude.");
      process.exit(1);
    }
    const anchor = [...station.flatMap(pts), ...more.flatMap(pts), ...pts(east)];
    const lat0 = Math.min(...anchor.map((p) => p[0])), lat1 = Math.max(...anchor.map((p) => p[0]));
    const lon1 = Math.max(...anchor.map((p) => p[1]));
    const bypass = els.filter((e) => e.type === "way" && /Eastern Metropolitan Bypass|EM Bypass/i.test((e.tags && (e.tags.name || e.tags.ref)) || ""));
    const bypassPts = bypass.flatMap(pts).filter((p) => p[0] >= lat0 - 0.003 && p[0] <= lat1 + 0.003);
    const lon0 = bypassPts.length ? Math.min(...bypassPts.map((p) => p[1])) : 88.40;
    const PAD = 0.0004; // about 40 m
    bbox = [lat0 - PAD, lon0 - PAD, lat1 + PAD, lon1 + PAD];
    console.log("2/3 bbox (S,W,N,E):", bbox.map((x) => +x.toFixed(5)).join(","), "~", Math.round((bbox[3] - bbox[1]) * 102000), "m x", Math.round((bbox[2] - bbox[0]) * 110574), "m");
    fs.writeFileSync(path.join(HERE, "sector-v-bbox.json"), JSON.stringify({ bbox, station: station.map((e) => ({ id: e.id, name: e.tags.name, lat: e.lat, lon: e.lon })), collegeMore: more.map((e) => ({ id: `${e.type}/${e.id}`, pts: pts(e)[0] })), eastWay: east.id, bypassWays: bypass.map((e) => e.id), fetched: new Date().toISOString().slice(0, 10) }, null, 1));
  }

  // ---- 3. the extract, in a 2 x 8 grid of ~1 x 0.9 km tiles; each finished tile is cached in tools/osm-tiles/ ----
  // lean (default): every node and way, but only multipolygon relations (all build-campus.py uses). The full nwr query also
  // pulls bus-route / boundary relations whose ">" recursion drags in kilometres of ways far outside the tile.
  const MODE = ARGS.has("--osm-api") ? "osmapi" : ARGS.has("--full") ? "full" : "lean";
  console.log(`3/3 map extract (${MODE === "osmapi" ? "OSM API" : MODE + " Overpass query, OSM API as fallback"})`);
  const old = path.join(HERE, "osm-extract.json");
  if (fs.existsSync(old) && !fs.existsSync(path.join(HERE, "osm-extract-600m.json"))) fs.copyFileSync(old, path.join(HERE, "osm-extract-600m.json"));
  const TILES = path.join(HERE, "osm-tiles");
  fs.mkdirSync(TILES, { recursive: true });
  const NI = 2, NJ = 8, merged = new Map(), failed = [];
  let done = 0, preferApi = MODE === "osmapi"; // after Overpass has failed a whole tile but the OSM API worked, use the OSM API first
  for (let i = 0; i < NI; i++) {
    for (let j = 0; j < NJ; j++) {
      const s = bbox[0] + ((bbox[2] - bbox[0]) * i) / NI, n = bbox[0] + ((bbox[2] - bbox[0]) * (i + 1)) / NI;
      const w = bbox[1] + ((bbox[3] - bbox[1]) * j) / NJ, e = bbox[1] + ((bbox[3] - bbox[1]) * (j + 1)) / NJ;
      const box = [s, w, n, e].map((x) => x.toFixed(6)).join(",");
      const label = `tile ${i}_${j} (${i * NJ + j + 1}/${NI * NJ})`;
      const file = path.join(TILES, `tile_${i}_${j}.json`);
      let tile = null;
      if (fs.existsSync(file)) {
        try { tile = JSON.parse(fs.readFileSync(file, "utf8")); } catch { tile = null; }
        if (tile && tile.box === box && Array.isArray(tile.elements)) console.log(`   ${label}: already downloaded (${tile.source}), skipping`);
        else tile = null; // different bbox or broken file: fetch again
      }
      if (!tile) {
        const t0 = Date.now();
        let data = null, source = MODE;
        if (preferApi) {
          try { data = await osmApiMap([s, w, n, e].map((x) => +x.toFixed(6)), label); source = "osm-api"; } catch (err) { console.log(`   ${label}: ${err.message}`); }
        }
        if (!data && MODE !== "osmapi") {
          const q = MODE === "full"
            ? `[out:json][timeout:180][maxsize:134217728];(nwr(${box}););out body;>;out skel qt;`
            : `[out:json][timeout:180][maxsize:134217728];(node(${box});way(${box});relation["type"="multipolygon"](${box}););out body;>;out skel qt;`;
          try { data = await overpass(q, label); source = "overpass-" + MODE; } catch (err) { console.log(`   ${label}: ${err.message}; trying the OSM API instead`); }
        }
        if (!data && !preferApi) {
          try { data = await osmApiMap([s, w, n, e].map((x) => +x.toFixed(6)), label); source = "osm-api"; preferApi = true; } catch (err) { console.log(`   ${label}: ${err.message}`); }
        }
        if (!data) { failed.push(label); console.log(`   ${label}: FAILED, moving on (run the command again later to retry just the missing tiles)`); continue; }
        tile = { box, source, fetched: new Date().toISOString(), elements: data.elements };
        fs.writeFileSync(file + ".part", JSON.stringify(tile));
        fs.renameSync(file + ".part", file);
        console.log(`   ${label}: saved ${data.elements.length} elements from ${source} in ${secs(t0)}`);
        await sleep(5000); // be gentle with the shared servers
      }
      for (const el of tile.elements) merged.set(el.type + el.id, el);
      done++;
      console.log(`   progress: ${done}/${NI * NJ} tiles, ${merged.size} unique elements so far`);
    }
  }
  if (failed.length) {
    console.log(`!! ${failed.length} tile(s) still missing: ${failed.join(", ")}. tools/osm-extract.json was NOT changed.`);
    console.log("   Wait 10-15 minutes and run: node tools/fetch-sector-v.mjs --reuse-bbox  (finished tiles are kept). Paste this output to Claude if it keeps failing.");
    process.exit(2);
  }
  const out = { version: 0.6, generator: "fetch-sector-v.mjs", osm3s: { timestamp_osm_base: new Date().toISOString() }, elements: [...merged.values()] };
  fs.writeFileSync(old, JSON.stringify(out));
  console.log(`done: ${merged.size} elements -> tools/osm-extract.json (${(fs.statSync(old).size / 1e6).toFixed(1)} MB). Tell Claude.`);
}
