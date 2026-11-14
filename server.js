// TIU Campus prototype server.
// Serves the static site and runs one WebSocket endpoint that carries:
//   - live positions (10 snapshots a second)
//   - nearby text chat (the server decides who is close enough to receive it)
//   - voice call setup messages, passed between two players (WebRTC signalling)
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const CHAT_RANGE = 15; // metres: who receives a chat message
const SIGNAL_RANGE = 30; // metres: who may set up a voice call with whom
const TICK_MS = 100; // snapshot interval
const WORLD_LIMIT = 245; // players are kept inside +/- this many metres
const MAX_PLAYERS = 200;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(data);
  });
});

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

// Position snapshots. Fine for a prototype; a bigger world would send only nearby zones.
setInterval(() => {
  if (players.size < 2) return;
  const snapshot = JSON.stringify({
    t: "snap",
    p: [...players.values()].map((p) => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2)]),
  });
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(snapshot);
}, TICK_MS);

server.listen(PORT, () => console.log(`TIU Campus running on http://localhost:${PORT}`));
