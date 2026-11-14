// TIU Campus prototype server.
// Serves the static site and runs one WebSocket endpoint that carries:
//   - live positions (10 snapshots a second)
//   - nearby text chat (the server decides who is close enough to receive it)
//   - voice call setup messages, passed between two players (WebRTC signalling)
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const CHAT_RANGE = 15; // metres: who receives a chat message
const SIGNAL_RANGE = 30; // metres: who may set up a voice call with whom
const TICK_MS = 100; // snapshot interval
const WORLD_LIMIT = 245; // players are kept inside +/- this many metres
const MAX_PLAYERS = 200;
const HEARTBEAT_MS = 15000; // ping every client this often; drop any that miss a whole interval

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// ---------- Static files ----------
// Files are read once, kept in memory with a gzip copy and an ETag, and re-read only when they
// change on disk. Big files that rarely change (models, bundled libraries) are cached by the
// browser for a week; everything else is checked with the server on each load and answered
// with "304 Not Modified" when unchanged, so a repeat visit downloads almost nothing.
const LONG_CACHE = /^\/(vendor|models)\//;
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg"]);
const fileCache = new Map(); // absolute path -> { mtimeMs, size, data, gz, etag }

function loadFile(file, cb) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return cb(err || new Error("not a file"));
    const hit = fileCache.get(file);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return cb(null, hit);
    fs.readFile(file, (err2, data) => {
      if (err2) return cb(err2);
      const entry = {
        mtimeMs: st.mtimeMs,
        size: st.size,
        data,
        gz: COMPRESSIBLE.has(path.extname(file)) ? zlib.gzipSync(data, { level: 9 }) : null,
        etag: `"${crypto.createHash("sha1").update(data).digest("base64url").slice(0, 16)}"`,
      };
      fileCache.set(file, entry);
      cb(null, entry);
    });
  });
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  if (urlPath === "/ice") {
    iceServers()
      .then((list) => {
        res.writeHead(200, { "content-type": MIME[".json"], "cache-control": "no-store" });
        res.end(JSON.stringify({ iceServers: list }));
      })
      .catch(() => {
        res.writeHead(200, { "content-type": MIME[".json"], "cache-control": "no-store" });
        res.end(JSON.stringify({ iceServers: STUN_ONLY }));
      });
    return;
  }

  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  loadFile(file, (err, entry) => {
    if (err) {
      res.writeHead(404).end("Not found");
      return;
    }
    const headers = {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
      "cache-control": LONG_CACHE.test(urlPath) ? "public, max-age=604800" : "no-cache",
      etag: entry.etag,
      vary: "Accept-Encoding",
    };
    if (req.headers["if-none-match"] === entry.etag) {
      res.writeHead(304, headers).end();
      return;
    }
    const useGzip = entry.gz && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    const body = useGzip ? entry.gz : entry.data;
    if (useGzip) headers["content-encoding"] = "gzip";
    headers["content-length"] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  });
});

// ---------- Voice relay (TURN) ----------
// Direct voice links fail on many campus and mobile networks. A TURN server relays the audio
// when a direct link is blocked. Set ONE of these on the host (all optional; STUN-only otherwise):
//   CF_TURN_KEY_ID + CF_TURN_API_TOKEN  Cloudflare Calls TURN (short-lived credentials, refreshed here)
//   METERED_DOMAIN + METERED_API_KEY    Metered.ca, e.g. METERED_DOMAIN=yourapp.metered.live
//   TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL   any TURN server with fixed credentials;
//                                       TURN_URLS is comma-separated, e.g.
//                                       turn:turn.example.com:3478,turns:turn.example.com:5349
const STUN_ONLY = [{ urls: "stun:stun.l.google.com:19302" }];
const ICE_TTL = 6 * 3600; // seconds that generated credentials stay valid
let iceCache = { list: null, until: 0, pending: null };

async function fetchIceServers() {
  const env = process.env;
  if (env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN) {
    const r = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CF_TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${env.CF_TURN_API_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: ICE_TTL }),
      },
    );
    if (!r.ok) throw new Error(`Cloudflare TURN ${r.status}`);
    const j = await r.json();
    const list = Array.isArray(j.iceServers) ? j.iceServers : [j.iceServers];
    return { list: [...STUN_ONLY, ...list], ttl: ICE_TTL };
  }
  if (env.METERED_DOMAIN && env.METERED_API_KEY) {
    const r = await fetch(
      `https://${env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_API_KEY)}`,
    );
    if (!r.ok) throw new Error(`Metered TURN ${r.status}`);
    return { list: [...STUN_ONLY, ...(await r.json())], ttl: 3600 };
  }
  if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    const urls = env.TURN_URLS.split(",").map((u) => u.trim()).filter(Boolean);
    return {
      list: [...STUN_ONLY, { urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }],
      ttl: 24 * 3600,
    };
  }
  return { list: STUN_ONLY, ttl: 24 * 3600 };
}

// Credentials are shared by everyone and refreshed at half their lifetime, so a voice link
// opened just before a refresh still has hours of validity left.
function iceServers() {
  if (iceCache.list && Date.now() < iceCache.until) return Promise.resolve(iceCache.list);
  if (!iceCache.pending) {
    iceCache.pending = fetchIceServers()
      .then(({ list, ttl }) => {
        iceCache = { list, until: Date.now() + (ttl * 1000) / 2, pending: null };
        return list;
      })
      .catch((err) => {
        console.warn("TURN credentials unavailable, using STUN only:", err.message);
        iceCache = { list: STUN_ONLY, until: Date.now() + 60_000, pending: null }; // retry in a minute
        return STUN_ONLY;
      });
  }
  return iceCache.pending;
}

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });
const players = new Map(); // id -> { ws, id, name, dept, color, x, z, ry, voice, lastChat }

// New arrivals stand on the forecourt in front of the university's main entrance, facing it.
// The numbers match the building's position in public/campus.json.
const ENTRANCE = { x: 0.37, z: 33.67, yaw: 1.116 };
function spawnPoint() {
  const along = (Math.random() - 0.5) * 8; // spread people out along the building front
  const out = 4.6 + Math.random() * 1.2; // metres out from the building
  return {
    x: ENTRANCE.x + along * Math.cos(ENTRANCE.yaw) + out * Math.sin(ENTRANCE.yaw),
    y: 0,
    z: ENTRANCE.z - along * Math.sin(ENTRANCE.yaw) + out * Math.cos(ENTRANCE.yaw),
    ry: ENTRANCE.yaw,
  };
}

const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (n) => (Number.isFinite(n) ? n : 0);
const send = (ws, msg) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const publicView = (p) => ({
  id: p.id,
  name: p.name,
  dept: p.dept,
  color: p.color,
  x: p.x,
  y: p.y,
  z: p.z,
  ry: p.ry,
  voice: p.voice,
});

wss.on("connection", (ws) => {
  let me = null;
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    if (msg.t === "join") {
      if (me) return;
      if (players.size >= MAX_PLAYERS) {
        send(ws, { t: "full" });
        ws.close();
        return;
      }
      me = {
        ws,
        id: crypto.randomBytes(6).toString("hex"),
        name: clean(msg.name, 24) || "Guest",
        dept: clean(msg.dept, 32),
        color: /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : "#4f7cff",
        ...spawnPoint(),
        voice: false,
        lastChat: 0,
      };
      players.set(me.id, me);
      send(ws, {
        t: "welcome",
        id: me.id,
        you: publicView(me),
        players: [...players.values()].filter((p) => p !== me).map(publicView),
        chatRange: CHAT_RANGE,
      });
      for (const p of players.values()) if (p !== me) send(p.ws, { t: "joined", player: publicView(me) });
      return;
    }

    if (!me) return;

    if (msg.t === "pos") {
      me.x = clamp(num(msg.x), -WORLD_LIMIT, WORLD_LIMIT);
      me.y = clamp(num(msg.y), -5, 60);
      me.z = clamp(num(msg.z), -WORLD_LIMIT, WORLD_LIMIT);
      me.ry = num(msg.ry);
    } else if (msg.t === "chat") {
      const text = clean(msg.text, 240);
      const now = Date.now();
      if (!text || now - me.lastChat < 400) return; // simple flood guard
      me.lastChat = now;
      for (const p of players.values()) {
        if (distance(me, p) <= CHAT_RANGE) send(p.ws, { t: "chat", from: me.id, name: me.name, text, at: now });
      }
    } else if (msg.t === "voice") {
      me.voice = Boolean(msg.on);
      for (const p of players.values()) send(p.ws, { t: "voice", id: me.id, on: me.voice });
    } else if (msg.t === "signal") {
      // Passed on only between two players who both turned voice on and are near each other.
      const target = players.get(String(msg.to));
      if (!target || target === me || !me.voice || !target.voice) return;
      if (distance(me, target) > SIGNAL_RANGE) return;
      send(target.ws, { t: "signal", from: me.id, data: msg.data });
    }
  });

  ws.on("close", () => {
    if (!me) return;
    players.delete(me.id);
    for (const p of players.values()) send(p.ws, { t: "left", id: me.id });
  });
  ws.on("error", () => {});
});

// Heartbeat. Browsers answer pings automatically. A phone that lost signal or a laptop that went
// to sleep stops answering; its socket is closed, which runs the "close" handler above and
// removes the player for everyone else instead of leaving a frozen avatar behind.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);
wss.on("close", () => clearInterval(heartbeat));

// Position snapshots. Fine for a prototype; a bigger world would send only nearby zones.
setInterval(() => {
  if (players.size < 2) return;
  const snapshot = JSON.stringify({
    t: "snap",
    p: [...players.values()].map((p) => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2)]),
  });
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(snapshot);
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`TIU Campus running on http://localhost:${PORT}`);
  iceServers().then((list) =>
    console.log(list.length > 1 ? "Voice relay (TURN) configured." : "No TURN server set: voice uses direct links only."),
  );
});
