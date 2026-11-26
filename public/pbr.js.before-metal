// Surface materials built in code as full sets: colour, surface relief (normal map) and
// roughness, the three things light reacts to. Each is painted from the same layout so the
// relief lines up with the colour (a joint is dark, recessed and rough all at once).
// Textures are sized in metres: `tile` is how many metres one repeat covers, and geometry made
// by geom.js carries UVs in metres, so a brick is the same size on every wall.
import * as THREE from "three";

export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

// Smooth tiling noise painted as soft blobs that wrap round the edges.
function blotches(g, size, rnd, count, minR, maxR, colors, alpha) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = minR + rnd() * (maxR - minR);
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        const c = colors[(rnd() * colors.length) | 0];
        grad.addColorStop(0, c.replace("A", String(alpha)));
        grad.addColorStop(1, c.replace("A", "0"));
        g.fillStyle = grad;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
}
function grain(g, size, rnd, count, lo, hi, alpha = 0.5, dot = 1) {
  for (let i = 0; i < count; i++) {
    const v = (lo + rnd() * (hi - lo)) | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(rnd() * size, rnd() * size, dot + rnd() * dot, dot + rnd() * dot);
  }
}

// Height (grey canvas, white = high) to a tangent-space normal map that tiles.
function normalFromHeight(heightCanvas, strength) {
  const size = heightCanvas.width;
  const src = heightCanvas.getContext("2d").getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const g = out.getContext("2d");
  const img = g.createImageData(size, size);
  const h = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return out;
}

let maxAniso = 8;
export function setAnisotropy(n) {
  maxAniso = n;
}
function tex(c, tile, srgb) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile[0], 1 / tile[1]);
  t.anisotropy = maxAniso;
  return t;
}

/**
 * paint(colour ctx, height ctx, roughness ctx, size, rnd): draw the three layers.
 * Roughness canvas: white = rough, black = mirror smooth.
 */
export function surface({ size = 512, tile = 2, seed = 1, bump = 2, paint, ...material }) {
  const rnd = seeded(seed);
  const col = canvas(size);
  const hgt = canvas(size);
  const rgh = canvas(size);
  const [gc, gh, gr] = [col, hgt, rgh].map((c) => c.getContext("2d"));
  gh.fillStyle = "#808080";
  gh.fillRect(0, 0, size, size);
  gr.fillStyle = "#ffffff";
  gr.fillRect(0, 0, size, size);
  paint(gc, gh, gr, size, rnd);
  const t = Array.isArray(tile) ? tile : [tile, tile];
  return new THREE.MeshStandardMaterial({
    map: tex(col, t, true),
    normalMap: tex(normalFromHeight(hgt, bump), t, false),
    roughnessMap: tex(rgh, t, false),
    roughness: 1,
    metalness: 0,
    ...material,
  });
}

const both = (ctxs, fn) => ctxs.forEach(fn);

// ---------------------------------------------------------------- the library
export function makeMaterials() {
  const M = {};

  // Painted cement plaster: off-white, patchy from weather, fine sandy relief, faint hairline cracks.
  const plaster = (seed, base, tint) =>
    surface({
      seed, tile: 3, bump: 1.6,
      paint(c, h, r, s, rnd) {
        c.fillStyle = base;
        c.fillRect(0, 0, s, s);
        blotches(c, s, rnd, 30, 50, 190, tint, 0.15);
        grain(c, s, rnd, 9000, 150, 255, 0.05);
        blotches(h, s, rnd, 30, 30, 120, ["rgba(255,255,255,A)", "rgba(0,0,0,A)"], 0.08);
        grain(h, s, rnd, 26000, 60, 200, 0.35);
        r.fillStyle = "#d8d8d8";
        r.fillRect(0, 0, s, s);
        blotches(r, s, rnd, 20, 40, 140, ["rgba(255,255,255,A)", "rgba(150,150,150,A)"], 0.3);
        for (let i = 0; i < 5; i++) {
          let x = rnd() * s;
          let y = rnd() * s;
          both([c, h], (g) => {
            g.strokeStyle = g === c ? "rgba(90,86,78,0.25)" : "rgba(0,0,0,0.5)";
            g.lineWidth = 0.8;
            g.beginPath();
            g.moveTo(x, y);
          });
          for (let k = 0; k < 14; k++) {
            x += (rnd() - 0.5) * 16;
            y += 6 + rnd() * 10;
            c.lineTo(x, y);
            h.lineTo(x, y);
          }
          c.stroke();
          h.stroke();
        }
      },
    });
  M.plaster = plaster(11, "#d9d6cc", ["rgba(190,184,168,A)", "rgba(232,230,222,A)", "rgba(172,168,152,A)"]);
  M.plasterGrey = plaster(12, "#b7b5ae", ["rgba(170,168,160,A)", "rgba(215,213,206,A)"]);
  M.plasterCream = plaster(13, "#e3d9c2", ["rgba(200,188,160,A)", "rgba(240,232,214,A)"]);

  // Aluminium composite panels: satin grey sheets with dark recessed joints.
  M.acp = surface({
    seed: 21, tile: [2.44, 2.44], bump: 3, metalness: 0.55,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#a9adb1";
      c.fillRect(0, 0, s, s);
      const n = 2;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const v = 166 + rnd() * 14;
          c.fillStyle = `rgb(${v},${v + 3},${v + 7})`;
          c.fillRect((i * s) / n, (j * s) / n, s / n, s / n);
        }
      blotches(c, s, rnd, 14, 30, 110, ["rgba(140,144,150,A)", "rgba(196,200,204,A)"], 0.12);
      r.fillStyle = "#6a6a6a";
      r.fillRect(0, 0, s, s);
      grain(r, s, rnd, 9000, 80, 150, 0.4, 2);
      both([c, h, r], (g) => {
        g.fillStyle = g === c ? "#3d4044" : g === h ? "#000" : "#fff";
        for (let i = 0; i < n; i++) {
          g.fillRect((i * s) / n - 3, 0, 6, s);
          g.fillRect(0, (i * s) / n - 3, s, 6);
        }
        g.fillRect(s - 3, 0, 3, s);
        g.fillRect(0, s - 3, s, 3);
      });
    },
  });

  // Curtain-wall glass: blue-green coated panes. Each pane differs a little in tint, a few have
  // blinds drawn or a lit room behind. One repeat = 4 x 4 panes; frames are real geometry.
  const glass = (seed, hue, opts = {}) =>
    surface({
      seed, tile: opts.tile || [4.8, 4.92], bump: 0.6, metalness: opts.metal ?? 0.72, envMapIntensity: opts.env ?? 1.25,
      paint(c, h, r, s, rnd) {
        const n = 4;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            const kind = rnd();
            const l = kind < 0.12 ? 52 : kind < 0.2 ? 20 : 27 + rnd() * 8; // blinds, dark room, normal
            const sat = kind < 0.12 ? 10 : 26;
            const grad = c.createLinearGradient(0, (j * s) / n, 0, ((j + 1) * s) / n);
            grad.addColorStop(0, `hsl(${hue + rnd() * 8},${sat}%,${l + 5}%)`);
            grad.addColorStop(1, `hsl(${hue + rnd() * 8},${sat}%,${l - 5}%)`);
            c.fillStyle = grad;
            c.fillRect((i * s) / n, (j * s) / n, s / n, s / n);
            if (kind < 0.12) {
              c.fillStyle = "rgba(255,255,255,0.10)";
              for (let y = 0; y < s / n; y += 5) c.fillRect((i * s) / n, (j * s) / n + y, s / n, 2);
            }
            const v = kind < 0.12 ? 120 : 14 + rnd() * 18;
            r.fillStyle = `rgb(${v},${v},${v})`;
            r.fillRect((i * s) / n, (j * s) / n, s / n, s / n);
          }
        // slight waviness of large panes
        blotches(h, s, rnd, 18, 60, 160, ["rgba(255,255,255,A)", "rgba(0,0,0,A)"], 0.05);
        grain(r, s, rnd, 500, 40, 90, 0.25, 3); // dust and water marks
      },
    });
  M.glass = glass(31, 186);
  M.glassDark = glass(32, 205, { metal: 0.55, env: 1.0 });
  M.glassShop = surface({
    seed: 33, tile: 3, bump: 0.4, metalness: 0.6, envMapIntensity: 1.1,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#1b2428";
      c.fillRect(0, 0, s, s);
      blotches(c, s, rnd, 10, 60, 200, ["rgba(60,74,80,A)", "rgba(10,14,16,A)"], 0.3);
      r.fillStyle = "#161616";
      r.fillRect(0, 0, s, s);
      grain(r, s, rnd, 700, 40, 110, 0.3, 3);
    },
  });

  // Anodised aluminium frames and steel.
  M.aluminium = new THREE.MeshStandardMaterial({ color: "#b9bcc0", roughness: 0.38, metalness: 0.85 });
  M.frameDark = new THREE.MeshStandardMaterial({ color: "#2b2f33", roughness: 0.45, metalness: 0.7 });
  M.frameWhite = new THREE.MeshStandardMaterial({ color: "#e8e8e4", roughness: 0.55, metalness: 0.1 });
  M.steelBlue = surface({
    seed: 41, tile: 1.5, bump: 1.2, metalness: 0.35,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#1f62b0";
      c.fillRect(0, 0, s, s);
      blotches(c, s, rnd, 30, 10, 60, ["rgba(20,70,140,A)", "rgba(60,120,190,A)", "rgba(96,70,50,A)"], 0.22); // fading and rust blooms
      r.fillStyle = "#7c7c7c";
      r.fillRect(0, 0, s, s);
      blotches(r, s, rnd, 30, 10, 60, ["rgba(255,255,255,A)"], 0.4);
      grain(h, s, rnd, 6000, 90, 170, 0.3);
    },
  });

  // Polished red-brown granite (name wall, pillar caps) and brick-red cladding tiles (pillars).
  M.granite = surface({
    seed: 51, tile: 1.2, bump: 0.5,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#6d3a2c";
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 16000; i++) {
        const k = rnd();
        c.fillStyle = k < 0.4 ? "rgba(40,22,18,0.55)" : k < 0.75 ? "rgba(150,88,66,0.5)" : "rgba(196,150,128,0.45)";
        const d = 1 + rnd() * 3;
        c.fillRect(rnd() * s, rnd() * s, d, d);
      }
      r.fillStyle = "#2a2a2a";
      r.fillRect(0, 0, s, s);
    },
  });
  M.brickTile = surface({
    seed: 52, tile: [0.92, 0.6], bump: 3.5,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#77706a";
      c.fillRect(0, 0, s, s);
      h.fillStyle = "#202020";
      h.fillRect(0, 0, s, s);
      const rows = 8;
      const cols = 4;
      for (let j = 0; j < rows; j++)
        for (let i = -1; i < cols; i++) {
          const x = (i + (j % 2 ? 0.5 : 0)) * (s / cols) + 3;
          const y = j * (s / rows) + 3;
          const w = s / cols - 6;
          const hh = s / rows - 6;
          const v = rnd();
          c.fillStyle = `hsl(${10 + v * 8},${42 + v * 10}%,${28 + rnd() * 9}%)`;
          const hv = 150 + rnd() * 50;
          h.fillStyle = `rgb(${hv},${hv},${hv})`;
          for (const ox of [0, s]) {
            c.fillRect(x + ox - (x > s ? s : 0), y, w, hh);
            h.fillRect(x + ox - (x > s ? s : 0), y, w, hh);
          }
        }
      grain(c, s, rnd, 9000, 40, 120, 0.12);
      grain(h, s, rnd, 9000, 80, 200, 0.25);
      r.fillStyle = "#c4c4c4";
      r.fillRect(0, 0, s, s);
    },
  });

  // Floors and ground.
  M.paver = surface({
    seed: 61, tile: 1.6, bump: 3,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#5a554f";
      c.fillRect(0, 0, s, s);
      h.fillStyle = "#101010";
      h.fillRect(0, 0, s, s);
      const n = 8;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const red = (i + j) % 2 === 0;
          const l = 44 + rnd() * 10;
          c.fillStyle = red ? `hsl(${12 + rnd() * 8},${26 + rnd() * 10}%,${l}%)` : `hsl(40,${4 + rnd() * 5}%,${l + 8}%)`;
          c.fillRect((i * s) / n + 2, (j * s) / n + 2, s / n - 4, s / n - 4);
          const hv = 170 + rnd() * 40;
          h.fillStyle = `rgb(${hv},${hv},${hv})`;
          h.fillRect((i * s) / n + 2, (j * s) / n + 2, s / n - 4, s / n - 4);
        }
      blotches(c, s, rnd, 22, 30, 120, ["rgba(40,38,34,A)", "rgba(120,112,100,A)"], 0.22); // dirt, tyre marks
      grain(c, s, rnd, 12000, 30, 160, 0.1);
      grain(h, s, rnd, 16000, 90, 190, 0.3);
      r.fillStyle = "#e2e2e2";
      r.fillRect(0, 0, s, s);
    },
  });
  M.stoneFloor = surface({
    seed: 62, tile: 1.2, bump: 1.2,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#b4b0a8";
      c.fillRect(0, 0, s, s);
      blotches(c, s, rnd, 40, 20, 90, ["rgba(150,146,138,A)", "rgba(205,202,194,A)", "rgba(120,116,110,A)"], 0.25);
      grain(c, s, rnd, 6000, 90, 230, 0.08, 2);
      r.fillStyle = "#4a4a4a";
      r.fillRect(0, 0, s, s);
      blotches(r, s, rnd, 20, 30, 100, ["rgba(190,190,190,A)"], 0.35); // scuffed, dull patches
      both([c, h, r], (g) => {
        g.strokeStyle = g === c ? "#3a3835" : g === h ? "#000" : "#fff";
        g.lineWidth = 5;
        g.strokeRect(0, 0, s, s);
        g.beginPath();
        g.moveTo(s / 2, 0);
        g.lineTo(s / 2, s);
        g.moveTo(0, s / 2);
        g.lineTo(s, s / 2);
        g.stroke();
      });
    },
  });
  M.concrete = surface({
    seed: 63, tile: 3, bump: 2.2,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#96938c";
      c.fillRect(0, 0, s, s);
      blotches(c, s, rnd, 34, 30, 140, ["rgba(110,108,102,A)", "rgba(170,167,160,A)", "rgba(80,84,74,A)"], 0.25);
      grain(c, s, rnd, 14000, 50, 210, 0.12);
      blotches(h, s, rnd, 30, 20, 90, ["rgba(255,255,255,A)", "rgba(0,0,0,A)"], 0.12);
      grain(h, s, rnd, 22000, 50, 210, 0.35);
    },
  });
  // Flat roof: grey screed with dark algae where water stands, and patched waterproofing.
  M.roofSlab = surface({
    seed: 64, tile: 6, bump: 1.6,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#8c8a84";
      c.fillRect(0, 0, s, s);
      blotches(c, s, rnd, 40, 30, 160, ["rgba(52,56,48,A)", "rgba(150,148,140,A)", "rgba(70,66,60,A)"], 0.35);
      for (let i = 0; i < 6; i++) {
        c.fillStyle = `rgba(${40 + rnd() * 30},${40 + rnd() * 30},${44 + rnd() * 30},0.5)`;
        c.fillRect(rnd() * s, rnd() * s, 30 + rnd() * 90, 20 + rnd() * 60);
      }
      grain(c, s, rnd, 12000, 40, 200, 0.12);
      grain(h, s, rnd, 16000, 70, 190, 0.3);
    },
  });
  const sheet = (seed, colour, dark) =>
    surface({
      seed, tile: [1.0, 4], bump: 5, metalness: 0.3,
      paint(c, h, r, s, rnd) {
        c.fillStyle = colour;
        c.fillRect(0, 0, s, s);
        for (let x = 0; x < s; x++) {
          const v = Math.sin((x / s) * Math.PI * 2 * 5) * 0.5 + 0.5; // 5 corrugations per metre
          h.fillStyle = `rgb(${v * 255},${v * 255},${v * 255})`;
          h.fillRect(x, 0, 1, s);
          c.fillStyle = `rgba(0,0,0,${(1 - v) * 0.22})`;
          c.fillRect(x, 0, 1, s);
        }
        blotches(c, s, rnd, 26, 20, 110, [dark, "rgba(255,255,255,A)"], 0.16); // fading, dirt wash
        r.fillStyle = "#8a8a8a";
        r.fillRect(0, 0, s, s);
        blotches(r, s, rnd, 20, 20, 100, ["rgba(255,255,255,A)"], 0.4);
      },
    });
  M.roofRed = sheet(71, "#a8402f", "rgba(70,30,24,A)");
  M.roofBlue = sheet(72, "#3c62a6", "rgba(26,40,72,A)");
  M.roofWhite = sheet(73, "#dcd9cf", "rgba(120,116,104,A)");
  M.turf = surface({
    seed: 74, tile: 2, bump: 2.5,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#2f7a52";
      c.fillRect(0, 0, s, s);
      blotches(c, s, rnd, 30, 20, 100, ["rgba(30,96,62,A)", "rgba(70,140,96,A)", "rgba(90,96,70,A)"], 0.3);
      grain(c, s, rnd, 20000, 30, 150, 0.12);
      grain(h, s, rnd, 30000, 40, 220, 0.4);
    },
  });

  // Small parts.
  M.pvc = new THREE.MeshStandardMaterial({ color: "#d9d6cc", roughness: 0.6 });
  M.pipeDark = new THREE.MeshStandardMaterial({ color: "#3b3936", roughness: 0.7 });
  M.tank = new THREE.MeshStandardMaterial({ color: "#161617", roughness: 0.55 });
  M.gold = new THREE.MeshStandardMaterial({ color: "#c9a23a", roughness: 0.3, metalness: 0.9 });
  M.black = new THREE.MeshStandardMaterial({ color: "#141516", roughness: 0.6 });
  M.acBody = new THREE.MeshStandardMaterial({ color: "#e4e3dc", roughness: 0.55, metalness: 0.1 });
  M.wood = surface({
    seed: 81, tile: 1.2, bump: 1.5,
    paint(c, h, r, s, rnd) {
      c.fillStyle = "#8a5a2e";
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 240; i++) {
        const y = rnd() * s;
        c.strokeStyle = `rgba(${50 + rnd() * 60},${30 + rnd() * 30},${12 + rnd() * 16},0.35)`;
        c.lineWidth = 1 + rnd() * 2;
        c.beginPath();
        c.moveTo(0, y);
        c.bezierCurveTo(s / 3, y + rnd() * 8 - 4, (2 * s) / 3, y + rnd() * 8 - 4, s, y);
        c.stroke();
      }
      r.fillStyle = "#6c6c6c";
      r.fillRect(0, 0, s, s);
    },
  });
  return M;
}

// ---------------------------------------------------------------- one-off pictures
export function picture(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// Dirty rain streaks that run down from ledges and sills. Laid over walls as thin see-through
// sheets; this is most of what makes a painted wall look lived in.
export function streakMaterial(seed = 5) {
  const rnd = seeded(seed);
  const t = picture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 150; i++) {
      const x = rnd() * w;
      const len = h * (0.25 + rnd() * 0.75);
      const wd = 3 + rnd() * 26;
      const grad = g.createLinearGradient(0, 0, 0, len);
      const a = 0.04 + rnd() * 0.16;
      const tone = rnd() < 0.3 ? "38,44,34" : "58,54,48"; // algae green-black or dust brown
      grad.addColorStop(0, `rgba(${tone},${a})`);
      grad.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = grad;
      g.fillRect(x, 0, wd, len);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
