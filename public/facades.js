// Richer facade textures. world.js draws each building front as a flat 256 px picture (plain fills, two rectangles
// for windows). This redraws the same layouts at 512 px with what makes a wall read as a wall: grain, recessed
// windows with frames, sills and lintel shadows, sky reflections in the glass, mullions, AC units with grilles,
// rain streaks and grime. Same bay geometry (it draws in the old 256 space, scaled up), so UVs and window-light
// picking in world.js are untouched. Called from look.js; the textures are found by their top-left pixel.

const R = (a, b) => a + Math.random() * (b - a);

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function grain(g, rnd, n, alpha, colors) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.3 + rnd());
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    g.fillRect(rnd() * 256, rnd() * 256, 0.6 + rnd() * 1.4, 0.6 + rnd() * 1.4);
  }
  g.globalAlpha = 1;
}

function vgrad(g, x, y, w, h, top, bottom) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
}

// glass with a sky gradient, a soft diagonal reflection and a darker band (a cloud or a neighbour)
function glass(g, x, y, w, h, top, bottom, rnd, refl = 0.2) {
  vgrad(g, x, y, w, h, top, bottom);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const slant = h * 0.5;
  const bx = x + w * (0.1 + rnd() * 0.5);
  g.globalAlpha = refl;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(bx, y);
  g.lineTo(bx + w * 0.28, y);
  g.lineTo(bx + w * 0.28 - slant, y + h);
  g.lineTo(bx - slant, y + h);
  g.fill();
  g.globalAlpha = refl * 0.7;
  g.fillStyle = "#0b1f33";
  g.fillRect(x, y + h * (0.55 + rnd() * 0.2), w, h * 0.12);
  g.restore();
  g.globalAlpha = 1;
}

// a window set into a wall: dark reveal, frame, glass, mullion(s), sill with its shadow, lintel shadow
function windowAt(g, x, y, w, h, rnd, { panes = 2, top = "#3f5a69", bottom = "#86a8b9", frame = "#e8eae8", sill = true } = {}) {
  g.fillStyle = "rgba(20,24,26,0.45)"; // reveal (the depth of the opening)
  g.fillRect(x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = frame;
  g.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  glass(g, x + 2, y + 2, w - 4, h - 4, top, bottom, rnd);
  g.fillStyle = frame;
  for (let i = 1; i < panes; i++) g.fillRect(x + (w * i) / panes - 1.5, y, 3, h);
  g.fillRect(x, y + h * 0.38, w, 2.5); // transom
  g.fillStyle = "rgba(0,0,0,0.38)"; // shade under the lintel
  g.fillRect(x + 2, y + 2, w - 4, 5);
  if (sill) {
    g.fillStyle = "#f1f2f0";
    g.fillRect(x - 5, y + h + 1.5, w + 10, 5);
    vgrad(g, x - 5, y + h + 6.5, w + 10, 9, "rgba(0,0,0,0.28)", "rgba(0,0,0,0)");
  }
}

// rain and dirt running down from the sills
function stains(g, rnd, xs, y0, h) {
  for (const x of xs) {
    for (let i = 0; i < 3; i++) {
      const sx = x + R(-3, 3) * 4 * (i - 1) * 0.5 + (rnd() - 0.5) * 6;
      const len = 30 + rnd() * (h - y0 - 20);
      const gr = g.createLinearGradient(0, y0, 0, y0 + len);
      gr.addColorStop(0, "rgba(60,55,45,0.22)");
      gr.addColorStop(1, "rgba(60,55,45,0)");
      g.fillStyle = gr;
      g.fillRect(sx, y0, 2 + rnd() * 3, len);
    }
  }
}

function grime(g, h, a = 0.12) {
  vgrad(g, 0, h - 60, 256, 60, "rgba(50,45,35,0)", `rgba(50,45,35,${a})`);
}

function acUnit(g, x, y, w, h) {
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(x + 2, y + 3, w, h); // shadow on the wall
  g.fillStyle = "#e6e8e6";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#9da3a2";
  for (let i = 0; i < 6; i++) g.fillRect(x + 4, y + 4 + i * ((h - 8) / 6), w * 0.55, 1.4);
  g.beginPath();
  g.arc(x + w * 0.76, y + h * 0.5, h * 0.3, 0, 7);
  g.fillStyle = "#5c6362";
  g.fill();
  vgrad(g, x + 4, y + h, 5, 40, "rgba(60,55,45,0.3)", "rgba(60,55,45,0)"); // drip stain
}

const STYLES = {
  // by the colour at pixel (2, 2) of the original texture
  "2f3b44": {
    name: "glassTower",
    draw(g, rnd) {
      const FR = "#e24a18", FR_HI = "#ff8f50", FR_LO = "#8a2a0e"; // orange-red powder-coated frames: thin, so the glass stays blue at a distance
      g.fillStyle = FR;
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2; i++) {
        const x = 4 + i * 126;
        glass(g, x, 4, 122, 96, "#12468a", "#5a9fd6", rnd, 0.3);     // upper light: deep sky blue with a reflected cloud streak
        glass(g, x, 104, 122, 98, "#1a5a9e", "#7db6e0", rnd, 0.32);
        g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(x, 4, 122, 1.4); g.fillRect(x, 104, 122, 1.4); // lit top edges
        g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(x, 98, 122, 2); g.fillRect(x, 200, 122, 2);          // shadowed bottom edges
        g.fillStyle = FR_LO; g.fillRect(x + 120, 4, 2, 198);                                              // frame depth
        g.fillStyle = FR_HI; g.fillRect(x - 1.5, 4, 1.2, 198);                                            // sun catching the frame
      }
      vgrad(g, 4, 207, 248, 41, "#1d4b7c", "#0f2a49");              // spandrel: dark blue glass
      g.fillStyle = "rgba(255,255,255,0.2)"; g.fillRect(4, 207, 248, 1.2);
      g.fillStyle = FR_HI; g.fillRect(0, 202, 256, 1.2);            // floor-line band
      g.fillStyle = FR_LO; g.fillRect(0, 205, 256, 1.5);
      grain(g, rnd, 900, 0.07, ["#ffffff", "#000000"]);
    },
  },
  cfd3d2: {
    name: "punched",
    draw(g, rnd) {
      g.fillStyle = "#cfd3d2";
      g.fillRect(0, 0, 256, 256);
      grain(g, rnd, 5000, 0.16, ["#a9aeac", "#e8ebea", "#8f9593"]);
      g.fillStyle = "#b4b9b7";
      g.fillRect(0, 246, 256, 10);
      vgrad(g, 0, 0, 256, 18, "rgba(255,255,255,0.18)", "rgba(255,255,255,0)"); // lit slab edge
      windowAt(g, 40, 60, 76, 110, rnd);
      windowAt(g, 150, 60, 76, 110, rnd);
      acUnit(g, 132, 150, 40, 26);
      stains(g, rnd, [78, 188], 176, 256);
      grime(g, 256);
    },
  },
  b8664a: {
    name: "terracotta",
    draw(g, rnd) {
      g.fillStyle = "#b8664a";
      g.fillRect(0, 0, 256, 256);
      grain(g, rnd, 5000, 0.2, ["#8f4a34", "#d08466", "#a5593f"]);
      g.fillStyle = "#a95a40";
      for (let x = 0; x < 256; x += 128) g.fillRect(x, 0, 18, 256);
      for (let i = 0; i < 2; i++) {
        const x = 26 + i * 128;
        g.fillStyle = "rgba(20,24,26,0.4)";
        g.fillRect(x - 3, -3, 100, 233);
        glass(g, x, 0, 94, 230, "#487fb0", "#8db4d0", rnd, 0.22);
        g.fillStyle = "#d9d6d0";
        g.fillRect(x + 46, 0, 3, 230);
      }
      g.fillStyle = "#c98a6c";
      g.fillRect(0, 230, 256, 26);
      vgrad(g, 0, 230, 256, 8, "rgba(0,0,0,0.25)", "rgba(0,0,0,0)");
      grime(g, 256, 0.14);
    },
  },
  e4dccb: {
    name: "plaster",
    draw(g, rnd) {
      g.fillStyle = "#e4dccb";
      g.fillRect(0, 0, 256, 256);
      grain(g, rnd, 6000, 0.2, ["#cfc6b3", "#efe8d8", "#bdb4a2"]);
      g.fillStyle = "#c8bea9";
      g.fillRect(0, 244, 256, 12);
      windowAt(g, 88, 78, 80, 84, rnd, { top: "#4a5a62", bottom: "#7f979f", frame: "#d7d2c4" });
      stains(g, rnd, [128], 168, 256);
      grime(g, 256, 0.16);
    },
  },
  e6e2d6: {
    name: "shed",
    draw(g, rnd) {
      g.fillStyle = "#e6e2d6";
      g.fillRect(0, 0, 256, 256);
      for (let x = 0; x < 256; x += 12) { // corrugations: a lit and a shaded side to every ridge
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(x, 0, 3, 256);
        g.fillStyle = "rgba(60,55,45,0.28)";
        g.fillRect(x + 6, 0, 4, 256);
      }
      grain(g, rnd, 2500, 0.12, ["#bdb7a8", "#f4f1e8"]);
      windowAt(g, 40, 70, 70, 60, rnd, { panes: 3, top: "#46586a", bottom: "#78909f", frame: "#9aa0a2", sill: false });
      g.fillStyle = "#6b4a33";
      g.fillRect(150, 60, 56, 196);
      g.fillStyle = "rgba(255,255,255,0.12)";
      for (let y = 66; y < 256; y += 14) g.fillRect(150, y, 56, 1.5);
      g.fillStyle = "#c9ccce";
      g.fillRect(196, 150, 5, 12); // door handle
      grime(g, 256, 0.18);
    },
  },
  d9b982: {
    name: "ochre",
    draw(g, rnd) {
      g.fillStyle = "#d9b982";
      g.fillRect(0, 0, 256, 256);
      grain(g, rnd, 6000, 0.2, ["#bf9d66", "#e8cc98", "#c9a872"]);
      g.fillStyle = "#c4a46e";
      g.fillRect(0, 0, 256, 14);
      vgrad(g, 0, 14, 256, 8, "rgba(0,0,0,0.2)", "rgba(0,0,0,0)");
      windowAt(g, 56, 64, 144, 104, rnd, { panes: 2, top: "#4b6068", bottom: "#86a0a6", frame: "#efe3c6" });
      stains(g, rnd, [80, 176], 176, 256);
      grime(g, 256, 0.15);
    },
  },
  d8cfbd: {
    name: "ribbon",
    draw(g, rnd) {
      g.fillStyle = "#d8cfbd";
      g.fillRect(0, 0, 256, 256);
      grain(g, rnd, 5000, 0.16, ["#b9b09d", "#ece4d2"]);
      g.fillStyle = "rgba(20,24,26,0.4)";
      g.fillRect(0, 56, 256, 118);
      glass(g, 0, 60, 256, 110, "#43667a", "#7fa0ae", rnd, 0.22);
      g.fillStyle = "#c9bfab";
      for (let x = 0; x < 256; x += 64) g.fillRect(x, 60, 6, 110);
      g.fillStyle = "rgba(255,255,255,0.3)";
      g.fillRect(0, 60, 256, 1.5);
      vgrad(g, 0, 170, 256, 10, "rgba(0,0,0,0.3)", "rgba(0,0,0,0)");
      stains(g, rnd, [32, 96, 160, 224], 176, 256);
      grime(g, 256, 0.14);
    },
  },
};

/** Redraw a world.js facade texture richer, if `map` is one of them. Returns true if it was replaced. */
export function upgradeFacade(THREE, map) {
  const c = map?.image;
  if (!c || c.tagName !== "CANVAS" || c.width !== 256 || c.height !== 256 || map.userData.richFacade) return false;
  const p = c.getContext("2d").getImageData(2, 2, 1, 1).data;
  const key = [p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  const style = STYLES[key];
  if (!style) return false;
  const big = document.createElement("canvas");
  big.width = big.height = 512;
  const g = big.getContext("2d");
  g.scale(2, 2);
  style.draw(g, seeded(key.charCodeAt(0) * 977 + key.charCodeAt(3) * 31));
  map.image = big;
  map.userData.richFacade = style.name;
  map.generateMipmaps = true;
  if (style.name === "glassTower") { // hand-made mip chain: averaged, orange + blue go lavender-grey in the distance; from 64 px down push each level back toward glass blue with a hint of frame orange
    const chain = [big];
    for (let n = 256, prev = big; n >= 1; n >>= 1) {
      const c = document.createElement("canvas");
      c.width = c.height = n;
      const cg = c.getContext("2d");
      cg.imageSmoothingQuality = "high";
      cg.drawImage(prev, 0, 0, n, n);
      if (n <= 64) {
        const k = n <= 8 ? 0.4 : n <= 16 ? 0.3 : 0.18;
        cg.globalAlpha = k; cg.fillStyle = "#2c6fb5"; cg.fillRect(0, 0, n, n);     // glass blue
        cg.globalAlpha = k * 0.3; cg.fillStyle = "#e24a18"; cg.fillRect(0, 0, n, n); // a trace of the orange frames
        cg.globalAlpha = 1;
      }
      chain.push(c); prev = c;
    }
    map.mipmaps = chain;
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearMipmapLinearFilter;
  }
  map.needsUpdate = true;
  return true;
}
