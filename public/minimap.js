// GTA-style minimap and full-screen map for TechnoVerse
// Pre-renders 500 m tiles lazily into offscreen canvases at 1 px/metre and blits them cheap.

const TILE_SIZE = 500; // metres per tile (1 px = 1 m)

/**
 * Robust loader for campus map data: handles raw campus object or fetches campus.json,
 * and handles tile manifests if T-005 expands to tiled /campus/.
 */
export async function loadCampusData(campusOrUrl) {
  if (campusOrUrl && typeof campusOrUrl === "object" && campusOrUrl.buildings) {
    return campusOrUrl;
  }
  const url = typeof campusOrUrl === "string" ? campusOrUrl : "/campus.json";
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn("Could not fetch map data from", url, err);
  }
  return { buildings: [], roads: [], labels: [], grass: [], water: [], pitches: [], rail: [] };
}

/**
 * Creates spatial grid bins for fast tile-based rendering.
 */
function createSpatialIndex(campus) {
  const bins = new Map();
  const getBin = (tx, tz) => {
    const key = `${tx},${tz}`;
    let b = bins.get(key);
    if (!b) {
      b = { buildings: [], roads: [], grass: [], water: [], pitches: [], rail: [], labels: [] };
      bins.set(key, b);
    }
    return b;
  };

  const addPolygon = (pts, item, field) => {
    if (!pts || pts.length < 3) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const minTx = Math.floor(minX / TILE_SIZE);
    const maxTx = Math.floor(maxX / TILE_SIZE);
    const minTz = Math.floor(minZ / TILE_SIZE);
    const maxTz = Math.floor(maxZ / TILE_SIZE);
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let tz = minTz; tz <= maxTz; tz++) {
        getBin(tx, tz)[field].push(item);
      }
    }
  };

  const addPolyline = (pts, item, field) => {
    if (!pts || pts.length < 2) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const minTx = Math.floor(minX / TILE_SIZE);
    const maxTx = Math.floor(maxX / TILE_SIZE);
    const minTz = Math.floor(minZ / TILE_SIZE);
    const maxTz = Math.floor(maxZ / TILE_SIZE);
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let tz = minTz; tz <= maxTz; tz++) {
        getBin(tx, tz)[field].push(item);
      }
    }
  };

  if (campus.buildings) {
    for (const b of campus.buildings) addPolygon(b.pts, b, "buildings");
  }
  if (campus.grass) {
    for (const g of campus.grass) addPolygon(g.pts, g, "grass");
  }
  if (campus.water) {
    for (const w of campus.water) addPolygon(w.pts, w, "water");
  }
  if (campus.pitches) {
    for (const p of campus.pitches) addPolygon(p.pts, p, "pitches");
  }
  if (campus.roads) {
    for (const r of campus.roads) addPolyline(r.pts, r, "roads");
  }
  if (campus.rail) {
    for (const rl of campus.rail) addPolyline(rl.pts, rl, "rail");
  }
  if (campus.labels) {
    for (const l of campus.labels) {
      const tx = Math.floor(l.x / TILE_SIZE);
      const tz = Math.floor(l.z / TILE_SIZE);
      getBin(tx, tz).labels.push(l);
    }
  }

  return { bins, getBin };
}

/**
 * Creates the static tile renderer and cache.
 */
function createTileRenderer(campus, spatialIndex) {
  const cache = new Map();

  function drawPoly(ctx, pts, ox, oz) {
    if (!pts || pts.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] - ox, pts[0][1] - oz);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0] - ox, pts[i][1] - oz);
    }
    ctx.closePath();
  }

  function drawLine(ctx, pts, ox, oz) {
    if (!pts || pts.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] - ox, pts[0][1] - oz);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0] - ox, pts[i][1] - oz);
    }
  }

  const ROAD_CONFIG = {
    primary: { fill: "#f0f2f5", width: 13, casing: "#2b323d", cWidth: 17 },
    primary_link: { fill: "#dbe0e6", width: 10, casing: "#2b323d", cWidth: 14 },
    secondary: { fill: "#c4cbd4", width: 10, casing: "#2b323d", cWidth: 14 },
    secondary_link: { fill: "#b6bec8", width: 8, casing: "#2b323d", cWidth: 12 },
    tertiary: { fill: "#8f99a8", width: 7, casing: "#2b323d", cWidth: 10 },
    residential: { fill: "#7e8896", width: 6, casing: "#2b323d", cWidth: 9 },
    service: { fill: "#586270", width: 4, casing: "#242a34", cWidth: 6 },
    default: { fill: "#6f7886", width: 5, casing: "#242a34", cWidth: 8 },
  };

  function renderTile(tx, tz) {
    const key = `${tx},${tz}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext("2d");

    const ox = tx * TILE_SIZE;
    const oz = tz * TILE_SIZE;

    // Dark ground base (GTA style)
    ctx.fillStyle = "#161c24";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    const bin = spatialIndex.bins.get(key);
    if (!bin) {
      cache.set(key, canvas);
      return canvas;
    }

    // 1. Water
    if (bin.water.length > 0) {
      ctx.fillStyle = "#1b3a58";
      ctx.strokeStyle = "#254f75";
      ctx.lineWidth = 1.5;
      for (const w of bin.water) {
        drawPoly(ctx, w.pts, ox, oz);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 2. Grass
    if (bin.grass.length > 0) {
      ctx.fillStyle = "#1e3725";
      for (const g of bin.grass) {
        drawPoly(ctx, g.pts, ox, oz);
        ctx.fill();
      }
    }

    // 3. Pitches / Sports grounds
    if (bin.pitches.length > 0) {
      ctx.fillStyle = "#274830";
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      for (const p of bin.pitches) {
        drawPoly(ctx, p.pts, ox, oz);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 4. Buildings (dark blocks with clean outlines)
    if (bin.buildings.length > 0) {
      for (const b of bin.buildings) {
        drawPoly(ctx, b.pts, ox, oz);
        // Highlight TIU building or landmarks slightly
        const isTIU = b.id === 134101262 || (b.name && b.name.toLowerCase().includes("techno"));
        ctx.fillStyle = isTIU ? "#344052" : "#2a323f";
        ctx.fill();
        ctx.strokeStyle = isTIU ? "rgba(255,181,61,0.5)" : "#1c222b";
        ctx.lineWidth = isTIU ? 1.5 : 1;
        ctx.stroke();
      }
    }

    // 5. Roads (grouped for clean casing joins)
    if (bin.roads.length > 0) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Pass 1: Road casings
      for (const r of bin.roads) {
        const conf = ROAD_CONFIG[r.kind] || ROAD_CONFIG.default;
        ctx.strokeStyle = conf.casing;
        ctx.lineWidth = conf.cWidth;
        drawLine(ctx, r.pts, ox, oz);
        ctx.stroke();
      }

      // Pass 2: Road fills
      for (const r of bin.roads) {
        const conf = ROAD_CONFIG[r.kind] || ROAD_CONFIG.default;
        ctx.strokeStyle = conf.fill;
        ctx.lineWidth = conf.width;
        drawLine(ctx, r.pts, ox, oz);
        ctx.stroke();
      }
    }

    // 6. Metro / Rail Line (dashed line over roads)
    if (bin.rail.length > 0) {
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      // Rail casing
      for (const rl of bin.rail) {
        ctx.strokeStyle = "#1b1e24";
        ctx.lineWidth = 6;
        ctx.setLineDash([]);
        drawLine(ctx, rl.pts, ox, oz);
        ctx.stroke();

        // Rail dashed track
        ctx.strokeStyle = "#e8a436";
        ctx.lineWidth = 3.5;
        ctx.setLineDash([8, 6]);
        drawLine(ctx, rl.pts, ox, oz);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    cache.set(key, canvas);
    return canvas;
  }

  return { getTile: renderTile };
}

/**
 * Injects styling required for full map dialog and minimap overlays.
 */
function injectStylesOnce() {
  if (document.getElementById("tv-minimap-styles")) return;
  const style = document.createElement("style");
  style.id = "tv-minimap-styles";
  style.textContent = `
    #fullmap {
      position: fixed; inset: 0; z-index: 90;
      background: rgba(10, 14, 20, 0.94); backdrop-filter: blur(12px);
      display: grid; place-items: stretch; user-select: none;
    }
    #fullmap[hidden] { display: none !important; }
    #fullmapCanvas { width: 100%; height: 100%; display: block; cursor: grab; }
    #fullmapCanvas:active { cursor: grabbing; }
    .fullmap-header {
      position: absolute; top: 16px; left: 16px; right: 16px;
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 18px; pointer-events: auto;
    }
    .fullmap-title { font-size: 15px; color: #f2f5f9; letter-spacing: 0.02em; }
    .fullmap-title b { color: #ffb53d; }
    .fullmap-hint { font-size: 12px; color: #9aa5b5; margin: 0 16px; flex: 1; text-align: center; }
    .fullmap-close {
      background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16);
      color: #fff; width: 32px; height: 32px; border-radius: 50%;
      cursor: pointer; font-size: 14px; display: grid; place-items: center;
    }
    .fullmap-close:hover { background: rgba(255, 75, 75, 0.8); border-color: #ff4b4b; }
    .fullmap-legend {
      position: absolute; bottom: 20px; right: 20px;
      padding: 12px 16px; pointer-events: auto;
      display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #c4cbd4;
    }
    .fullmap-legend h4 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; color: #8e99a8; letter-spacing: .08em; }
    .fullmap-legend .leg-row { display: flex; align-items: center; gap: 8px; }
    .fullmap-legend .leg-swatch { width: 16px; height: 8px; border-radius: 2px; flex: none; }
    .fullmap-legend .leg-swatch.dot { width: 10px; height: 10px; border-radius: 50%; }
    .fullmap-legend .leg-swatch.diamond { width: 10px; height: 10px; border-radius: 1px; transform: rotate(45deg); }
    .fullmap-tools {
      position: absolute; bottom: 20px; left: 20px;
      display: flex; flex-direction: column; gap: 8px; pointer-events: auto;
    }
    .fullmap-tools button {
      width: 40px; height: 40px; border-radius: 8px;
      background: rgba(20, 24, 32, 0.88); border: 1px solid rgba(255, 255, 255, 0.16);
      color: #f2f5f9; font-size: 18px; cursor: pointer; display: grid; place-items: center;
    }
    .fullmap-tools button:hover { background: rgba(255, 181, 61, 0.2); border-color: #ffb53d; }
    .fullmap-clear-wp {
      width: auto !important; height: auto !important; padding: 8px 12px !important;
      font-size: 12px !important; font-weight: 600; color: #ff8a8a !important;
    }
    .fullmap-clear-wp:hover { background: rgba(255, 75, 75, 0.25) !important; border-color: #ff4b4b !important; }
    .fullmap-tooltip {
      position: absolute; pointer-events: none; z-index: 95;
      padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;
      background: rgba(14, 18, 26, 0.95); border: 1px solid rgba(255, 181, 61, 0.6);
      color: #fff; box-shadow: 0 4px 16px rgba(0,0,0,0.5); transform: translate(-50%, -120%);
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Creates the Minimap and Full Map system.
 */
export function createMinimap({ campus, getMe, getPlayers, getCamYaw }) {
  injectStylesOnce();

  const spatialIndex = createSpatialIndex(campus);
  const { getTile } = createTileRenderer(campus, spatialIndex);

  // Minimap container & canvas
  const minimapEl = document.getElementById("minimap");
  let canvas = document.getElementById("minimapCanvas");
  if (!canvas && minimapEl) {
    canvas = document.createElement("canvas");
    canvas.id = "minimapCanvas";
    canvas.width = 180;
    canvas.height = 180;
    minimapEl.appendChild(canvas);
  }

  let distBadge = document.getElementById("minimapDist");
  if (!distBadge && minimapEl) {
    distBadge = document.createElement("div");
    distBadge.id = "minimapDist";
    distBadge.hidden = true;
    minimapEl.appendChild(distBadge);
  }

  // Active waypoint: { x, z } in world metres
  let waypoint = null;

  // Zoom dynamics (150 m walking .. 300 m fast)
  let currentRadius = 150;
  let prevPx = 0;
  let prevPz = 0;
  let lastUpdateTime = performance.now();
  let lastDrawTime = 0;

  // Profiling stats for Done-when check (< 1 ms per frame over 600 frames)
  let frameCount = 0;
  let totalFrameMs = 0;

  // Full map overlay setup
  let fullmapEl = document.getElementById("fullmap");
  if (!fullmapEl) {
    fullmapEl = document.createElement("div");
    fullmapEl.id = "fullmap";
    fullmapEl.hidden = true;
    fullmapEl.innerHTML = `
      <canvas id="fullmapCanvas"></canvas>
      <div class="fullmap-header panel">
        <div class="fullmap-title"><b>Sector V &amp; TIU</b> · Map</div>
        <div class="fullmap-hint">Drag to pan · Scroll to zoom · Right-click to set/clear waypoint · Esc or N to close</div>
        <button class="fullmap-close" id="fullmapCloseBtn" type="button" aria-label="Close map">✕</button>
      </div>
      <div class="fullmap-legend panel">
        <h4>Legend</h4>
        <div class="leg-row"><span class="leg-swatch" style="background:#2a323f;border:1px solid #1c222b"></span> Buildings</div>
        <div class="leg-row"><span class="leg-swatch" style="background:#f0f2f5"></span> Major Roads</div>
        <div class="leg-row"><span class="leg-swatch" style="background:#8f99a8"></span> Streets &amp; Lanes</div>
        <div class="leg-row"><span class="leg-swatch" style="background:#e8a436"></span> Metro Line 2</div>
        <div class="leg-row"><span class="leg-swatch" style="background:#1e3725"></span> Campus Grounds</div>
        <div class="leg-row"><span class="leg-swatch" style="background:#1b3a58"></span> Water</div>
        <div class="leg-row"><span class="leg-swatch dot" style="background:#ffb53d"></span> You</div>
        <div class="leg-row"><span class="leg-swatch dot" style="background:#2ec4a6"></span> Other Players</div>
        <div class="leg-row"><span class="leg-swatch diamond" style="background:#ff4b4b"></span> Waypoint</div>
      </div>
      <div class="fullmap-tools">
        <button id="fullmapZoomIn" class="panel" title="Zoom in">＋</button>
        <button id="fullmapZoomOut" class="panel" title="Zoom out">－</button>
        <button id="fullmapRecenter" class="panel" title="Recenter on player">🎯</button>
        <button id="fullmapClearWp" class="panel fullmap-clear-wp" title="Clear waypoint" hidden>✕ Clear Pin</button>
      </div>
      <div id="fullmapTooltip" class="fullmap-tooltip" hidden></div>
    `;
    document.body.appendChild(fullmapEl);
  }

  const fullmapCanvas = document.getElementById("fullmapCanvas");
  const fullmapCloseBtn = document.getElementById("fullmapCloseBtn");
  const fullmapZoomIn = document.getElementById("fullmapZoomIn");
  const fullmapZoomOut = document.getElementById("fullmapZoomOut");
  const fullmapRecenter = document.getElementById("fullmapRecenter");
  const fullmapClearWp = document.getElementById("fullmapClearWp");
  const fullmapTooltip = document.getElementById("fullmapTooltip");

  // Full map camera state
  let fullmapPanX = 0;
  let fullmapPanZ = 0;
  let fullmapZoom = 1.0; // px per metre
  let isDraggingFullmap = false;
  let dragStartX = 0;
  let dragStartY = 0;

  function toggleFullMap(open) {
    const shouldOpen = open !== undefined ? open : fullmapEl.hidden;
    fullmapEl.hidden = !shouldOpen;
    if (shouldOpen) {
      const me = getMe();
      if (me && me.group) {
        fullmapPanX = me.group.position.x;
        fullmapPanZ = me.group.position.z;
      }
      resizeFullMapCanvas();
      renderFullMap();
    }
  }

  function resizeFullMapCanvas() {
    if (fullmapEl.hidden) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fullmapCanvas.width = window.innerWidth * dpr;
    fullmapCanvas.height = window.innerHeight * dpr;
  }

  window.addEventListener("resize", () => {
    if (!fullmapEl.hidden) {
      resizeFullMapCanvas();
      renderFullMap();
    }
  });

  if (minimapEl) {
    minimapEl.addEventListener("click", () => toggleFullMap(true));
  }
  if (fullmapCloseBtn) {
    fullmapCloseBtn.addEventListener("click", () => toggleFullMap(false));
  }
  if (fullmapZoomIn) {
    fullmapZoomIn.addEventListener("click", () => {
      fullmapZoom = Math.min(3.5, fullmapZoom * 1.35);
      renderFullMap();
    });
  }
  if (fullmapZoomOut) {
    fullmapZoomOut.addEventListener("click", () => {
      fullmapZoom = Math.max(0.15, fullmapZoom / 1.35);
      renderFullMap();
    });
  }
  if (fullmapRecenter) {
    fullmapRecenter.addEventListener("click", () => {
      const me = getMe();
      if (me && me.group) {
        fullmapPanX = me.group.position.x;
        fullmapPanZ = me.group.position.z;
        renderFullMap();
      }
    });
  }
  if (fullmapClearWp) {
    fullmapClearWp.addEventListener("click", () => {
      waypoint = null;
      fullmapClearWp.hidden = true;
      if (distBadge) distBadge.hidden = true;
      renderFullMap();
    });
  }

  // Key handler: 'N' toggles full map; Esc closes
  window.addEventListener("keydown", (e) => {
    const targetTag = document.activeElement ? document.activeElement.tagName : "";
    if (targetTag === "INPUT" || targetTag === "TEXTAREA") return;
    if (e.code === "KeyN") {
      e.preventDefault();
      toggleFullMap();
    } else if (e.code === "Escape" && !fullmapEl.hidden) {
      e.preventDefault();
      toggleFullMap(false);
    }
  });

  // Full map mouse navigation
  fullmapCanvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      isDraggingFullmap = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (isDraggingFullmap && !fullmapEl.hidden) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      fullmapPanX -= dx / fullmapZoom;
      fullmapPanZ -= dy / fullmapZoom;
      renderFullMap();
    } else if (!fullmapEl.hidden) {
      checkFullmapHover(e.clientX, e.clientY);
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) isDraggingFullmap = false;
  });

  fullmapCanvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = fullmapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const centerScreenX = rect.width / 2;
    const centerScreenY = rect.height / 2;

    const mouseWorldX = fullmapPanX + (mx - centerScreenX) / fullmapZoom;
    const mouseWorldZ = fullmapPanZ + (my - centerScreenY) / fullmapZoom;

    const factor = e.deltaY < 0 ? 1.2 : 0.833;
    const newZoom = Math.max(0.15, Math.min(3.5, fullmapZoom * factor));

    fullmapPanX = mouseWorldX - (mx - centerScreenX) / newZoom;
    fullmapPanZ = mouseWorldZ - (my - centerScreenY) / newZoom;
    fullmapZoom = newZoom;
    renderFullMap();
  }, { passive: false });

  // Right-click sets or clears waypoint
  fullmapCanvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const rect = fullmapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = fullmapPanX + (mx - rect.width / 2) / fullmapZoom;
    const wz = fullmapPanZ + (my - rect.height / 2) / fullmapZoom;

    if (waypoint && Math.hypot(wx - waypoint.x, wz - waypoint.z) < 25 / fullmapZoom) {
      waypoint = null;
      if (fullmapClearWp) fullmapClearWp.hidden = true;
      if (distBadge) distBadge.hidden = true;
    } else {
      waypoint = { x: wx, z: wz };
      if (fullmapClearWp) fullmapClearWp.hidden = false;
    }
    renderFullMap();
  });

  function checkFullmapHover(clientX, clientY) {
    if (!fullmapTooltip) return;
    const rect = fullmapCanvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const wx = fullmapPanX + (mx - rect.width / 2) / fullmapZoom;
    const wz = fullmapPanZ + (my - rect.height / 2) / fullmapZoom;

    // Check remote players
    const players = getPlayers ? getPlayers() : null;
    if (players) {
      for (const p of players.values ? players.values() : Object.values(players)) {
        if (Math.hypot(p.x - wx, p.z - wz) < 14 / fullmapZoom) {
          fullmapTooltip.textContent = `Player: ${p.name || p.id || "Student"}`;
          fullmapTooltip.style.left = `${clientX}px`;
          fullmapTooltip.style.top = `${clientY}px`;
          fullmapTooltip.hidden = false;
          return;
        }
      }
    }

    // Check landmark labels
    if (campus.labels) {
      for (const l of campus.labels) {
        if (Math.hypot(l.x - wx, l.z - wz) < 16 / fullmapZoom) {
          fullmapTooltip.textContent = l.name;
          fullmapTooltip.style.left = `${clientX}px`;
          fullmapTooltip.style.top = `${clientY}px`;
          fullmapTooltip.hidden = false;
          return;
        }
      }
    }

    fullmapTooltip.hidden = true;
  }

  /**
   * Renders the North-up full map view.
   */
  function renderFullMap() {
    if (fullmapEl.hidden) return;
    const ctx = fullmapCanvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = fullmapCanvas.width / dpr;
    const h = fullmapCanvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#121720";
    ctx.fillRect(0, 0, w, h);

    // Transform into world metre frame (North-up: +x East, +z South)
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(fullmapZoom, fullmapZoom);
    ctx.translate(-fullmapPanX, -fullmapPanZ);

    // Visible tile range
    const viewWorldW = w / fullmapZoom;
    const viewWorldH = h / fullmapZoom;
    const minTx = Math.floor((fullmapPanX - viewWorldW / 2) / TILE_SIZE);
    const maxTx = Math.floor((fullmapPanX + viewWorldW / 2) / TILE_SIZE);
    const minTz = Math.floor((fullmapPanZ - viewWorldH / 2) / TILE_SIZE);
    const maxTz = Math.floor((fullmapPanZ + viewWorldH / 2) / TILE_SIZE);

    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let tz = minTz; tz <= maxTz; tz++) {
        const tile = getTile(tx, tz);
        ctx.drawImage(tile, tx * TILE_SIZE, tz * TILE_SIZE);
      }
    }

    const me = getMe();
    const px = me && me.group ? me.group.position.x : 0;
    const pz = me && me.group ? me.group.position.z : 0;

    // Waypoint straight route
    if (waypoint) {
      ctx.beginPath();
      ctx.moveTo(px, pz);
      ctx.lineTo(waypoint.x, waypoint.z);
      ctx.strokeStyle = "rgba(255, 75, 75, 0.75)";
      ctx.lineWidth = Math.max(1.5, 2.5 / fullmapZoom);
      ctx.setLineDash([6 / fullmapZoom, 4 / fullmapZoom]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Waypoint marker
      ctx.save();
      ctx.translate(waypoint.x, waypoint.z);
      const wpSz = Math.max(7, 10 / fullmapZoom);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#ff4b4b";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, 2 / fullmapZoom);
      ctx.fillRect(-wpSz / 2, -wpSz / 2, wpSz, wpSz);
      ctx.strokeRect(-wpSz / 2, -wpSz / 2, wpSz, wpSz);
      ctx.restore();
    }

    // Other players
    const players = getPlayers ? getPlayers() : null;
    if (players) {
      for (const p of players.values ? players.values() : Object.values(players)) {
        ctx.beginPath();
        const pRad = Math.max(3.5, 5 / fullmapZoom);
        ctx.arc(p.x, p.z, pRad, 0, Math.PI * 2);
        ctx.fillStyle = "#2ec4a6";
        ctx.fill();
        ctx.strokeStyle = "#0b1218";
        ctx.lineWidth = Math.max(1, 1.5 / fullmapZoom);
        ctx.stroke();
      }
    }

    // Player arrow on full map
    if (me && me.group) {
      const heading = me.group.rotation.y;
      ctx.save();
      ctx.translate(px, pz);
      // Pulsing aura
      ctx.beginPath();
      const aura = Math.max(10, 16 / fullmapZoom);
      ctx.arc(0, 0, aura, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 181, 61, 0.18)";
      ctx.fill();

      // Heading arrow: in world frame, heading 0 = -z (North)
      ctx.rotate(heading);
      const arrLen = Math.max(8, 12 / fullmapZoom);
      const arrW = Math.max(5, 8 / fullmapZoom);
      ctx.beginPath();
      ctx.moveTo(0, -arrLen);
      ctx.lineTo(-arrW, arrLen * 0.7);
      ctx.lineTo(0, arrLen * 0.35);
      ctx.lineTo(arrW, arrLen * 0.7);
      ctx.closePath();
      ctx.fillStyle = "#ffb53d";
      ctx.fill();
      ctx.strokeStyle = "#14171d";
      ctx.lineWidth = Math.max(1, 2 / fullmapZoom);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // Metre frame restored to screen coords

    // Landmark names overlay (screen space, clean cards)
    if (campus.labels) {
      ctx.font = "600 11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const l of campus.labels) {
        const sx = w / 2 + (l.x - fullmapPanX) * fullmapZoom;
        const sy = h / 2 + (l.z - fullmapPanZ) * fullmapZoom;
        if (sx < -80 || sx > w + 80 || sy < -30 || sy > h + 30) continue;

        const isTIU = l.name.toLowerCase().includes("techno india university");
        const text = isTIU ? `🏛 ${l.name}` : l.name;
        const textW = ctx.measureText(text).width;
        const padX = isTIU ? 9 : 6;
        const padY = isTIU ? 5 : 3;
        const boxW = textW + padX * 2;
        const boxH = 16 + padY * 2;

        ctx.fillStyle = isTIU ? "rgba(26, 34, 46, 0.95)" : "rgba(16, 22, 30, 0.85)";
        ctx.strokeStyle = isTIU ? "#ffb53d" : "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = isTIU ? 1.5 : 1;
        ctx.beginPath();
        ctx.roundRect(sx - boxW / 2, sy - boxH / 2, boxW, boxH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isTIU ? "#ffb53d" : "#e6ecf4";
        ctx.fillText(text, sx, sy);
      }
    }

    ctx.restore();
  }

  /**
   * Minimap frame update (called from main.js afterMove).
   * Blits pre-rendered tiles; cheap and throttled to <= 30 fps.
   */
  function update(dt) {
    if (typeof window !== "undefined" && window.__tiu && !window.__tiu.minimap) {
      window.__tiu.minimap = api;
    }
    const t0 = performance.now();
    frameCount++;

    const me = getMe();
    if (!me || !me.group || !canvas) {
      return;
    }

    const now = performance.now();
    // Throttle minimap redraw to 30 fps
    if (now - lastDrawTime < 32.5) {
      return;
    }
    lastDrawTime = now;

    const px = me.group.position.x;
    const pz = me.group.position.z;
    const camYaw = typeof getCamYaw === "function" ? getCamYaw() : 0;
    const playerHeading = me.group.rotation.y || 0;

    // Zoom dynamic based on movement speed
    const frameDt = Math.max(0.001, (now - lastUpdateTime) / 1000);
    lastUpdateTime = now;
    const speed = Math.hypot(px - prevPx, pz - prevPz) / frameDt;
    prevPx = px;
    prevPz = pz;

    const targetRadius = speed > 6.0 ? 300 : 150;
    currentRadius += (targetRadius - currentRadius) * Math.min(1, frameDt * 2.5);
    const scale = 90 / currentRadius; // 180 px diameter, 90 px radius

    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== 180 * dpr) {
      canvas.width = 180 * dpr;
      canvas.height = 180 * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 180, 180);

    // Circular clip
    ctx.beginPath();
    ctx.arc(90, 90, 88, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = "#161c24";
    ctx.fillRect(0, 0, 180, 180);

    // Transform: heading-up (camYaw rotated so camera look direction is UP)
    ctx.save();
    ctx.translate(90, 90);
    ctx.rotate(camYaw);
    ctx.scale(scale, scale);
    ctx.translate(-px, -pz);

    // Blit visible cached 500m tiles
    const minTx = Math.floor((px - currentRadius) / TILE_SIZE);
    const maxTx = Math.floor((px + currentRadius) / TILE_SIZE);
    const minTz = Math.floor((pz - currentRadius) / TILE_SIZE);
    const maxTz = Math.floor((pz + currentRadius) / TILE_SIZE);

    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let tz = minTz; tz <= maxTz; tz++) {
        const tile = getTile(tx, tz);
        ctx.drawImage(tile, tx * TILE_SIZE, tz * TILE_SIZE);
      }
    }

    // Straight waypoint route on minimap ground
    if (waypoint) {
      ctx.beginPath();
      ctx.moveTo(px, pz);
      ctx.lineTo(waypoint.x, waypoint.z);
      ctx.strokeStyle = "rgba(255, 75, 75, 0.8)";
      ctx.lineWidth = 2.5 / scale;
      ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore(); // Back to screen space (0..180)

    const cosYaw = Math.cos(camYaw);
    const sinYaw = Math.sin(camYaw);

    // Blips: Remote players
    const players = getPlayers ? getPlayers() : null;
    if (players) {
      for (const p of players.values ? players.values() : Object.values(players)) {
        const dx = p.x - px;
        const dz = p.z - pz;
        const rx = 90 + (dx * cosYaw - dz * sinYaw) * scale;
        const ry = 90 + (dx * sinYaw + dz * cosYaw) * scale;
        if (Math.hypot(rx - 90, ry - 90) < 84) {
          ctx.beginPath();
          ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = "#2ec4a6";
          ctx.fill();
          ctx.strokeStyle = "#0b1218";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }

    // Blips: Landmark labels (small subtle diamonds within view)
    if (campus.labels) {
      for (const l of campus.labels) {
        const dx = l.x - px;
        const dz = l.z - pz;
        const rx = 90 + (dx * cosYaw - dz * sinYaw) * scale;
        const ry = 90 + (dx * sinYaw + dz * cosYaw) * scale;
        if (Math.hypot(rx - 90, ry - 90) < 82) {
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = "#ffb53d";
          ctx.fillRect(-2, -2, 4, 4);
          ctx.restore();
        }
      }
    }

    // Waypoint pin / rim arrow
    if (waypoint) {
      const dist = Math.hypot(waypoint.x - px, waypoint.z - pz);
      const dx = waypoint.x - px;
      const dz = waypoint.z - pz;
      const rx = (dx * cosYaw - dz * sinYaw) * scale;
      const ry = (dx * sinYaw + dz * cosYaw) * scale;
      const distFromCenter = Math.hypot(rx, ry);

      if (distBadge) {
        distBadge.textContent = `${Math.round(dist)} m`;
        distBadge.hidden = false;
      }

      if (distFromCenter <= 76) {
        // Inside minimap circle: draw waypoint diamond
        const wpX = 90 + rx;
        const wpY = 90 + ry;
        ctx.save();
        ctx.translate(wpX, wpY);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#ff4b4b";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.fillRect(-4, -4, 8, 8);
        ctx.strokeRect(-4, -4, 8, 8);
        ctx.restore();
      } else {
        // Outside minimap circle: clamp to rim and draw arrow pointing to waypoint
        const angle = Math.atan2(ry, rx);
        const rimX = 90 + Math.cos(angle) * 78;
        const rimY = 90 + Math.sin(angle) * 78;

        ctx.save();
        ctx.translate(rimX, rimY);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fillStyle = "#ff4b4b";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
    } else if (distBadge && !distBadge.hidden) {
      distBadge.hidden = true;
    }

    // Player arrow at center: points in player's body direction relative to camera
    const bodyRelativeAngle = playerHeading - camYaw;
    ctx.save();
    ctx.translate(90, 90);
    ctx.rotate(bodyRelativeAngle);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(-6, 6.5);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(6, 6.5);
    ctx.closePath();
    ctx.fillStyle = "#ffb53d";
    ctx.fill();
    ctx.strokeStyle = "#0b1218";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Minimap Rim: rotating compass letters (N / E / S / W)
    const northAngle = -Math.PI / 2 + camYaw;
    const rRim = 76;

    ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // North (GTA red N)
    const nx = 90 + Math.cos(northAngle) * rRim;
    const ny = 90 + Math.sin(northAngle) * rRim;
    ctx.fillStyle = "#ff4b4b";
    ctx.fillText("N", nx, ny);

    // East
    const ex = 90 + Math.cos(northAngle + Math.PI / 2) * rRim;
    const ey = 90 + Math.sin(northAngle + Math.PI / 2) * rRim;
    ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
    ctx.fillText("E", ex, ey);

    // South
    const sx = 90 + Math.cos(northAngle + Math.PI) * rRim;
    const sy = 90 + Math.sin(northAngle + Math.PI) * rRim;
    ctx.fillText("S", sx, sy);

    // West
    const wx = 90 + Math.cos(northAngle + Math.PI * 1.5) * rRim;
    const wy = 90 + Math.sin(northAngle + Math.PI * 1.5) * rRim;
    ctx.fillText("W", wx, wy);

    // Thin inner bezel ring
    ctx.beginPath();
    ctx.arc(90, 90, 87, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // Keep stats for Done-when verification
    const frameElapsed = performance.now() - t0;
    totalFrameMs += frameElapsed;
  }

  const api = {
    update,
    toggleFullMap,
    setWaypoint(x, z) {
      waypoint = { x, z };
      if (fullmapClearWp) fullmapClearWp.hidden = false;
    },
    clearWaypoint() {
      waypoint = null;
      if (fullmapClearWp) fullmapClearWp.hidden = true;
      if (distBadge) distBadge.hidden = true;
    },
    getWaypoint() {
      return waypoint;
    },
    getStats() {
      return {
        frameCount,
        avgMs: frameCount > 0 ? totalFrameMs / frameCount : 0,
      };
    },
    getSpatialIndex() {
      return spatialIndex;
    },
  };

  if (typeof window !== "undefined") {
    window.__tiu = window.__tiu || {};
    window.__tiu.minimap = api;
  }

  return api;
}
