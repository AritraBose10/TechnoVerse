// The far side of Street Number 2, facing the university's main gate, modelled from street-level
// photographs (January 2026) and the satellite view:
//   - the median: painted kerb stones and the green bamboo railing, with the gap and the
//     yellow-striped speed breaker at the crossing
//   - the institute gate straight across from the university's: brick pillars carrying a curved
//     blue name board, open grille gates, a red-roofed guard hut
//   - north of it, the row of tea and snack stalls under patched tarpaulins behind a white
//     railing, with their counters, jars, benches and stools
//   - south of it, the brick boundary wall with a notice board, a tin-roofed shed, and the open
//     ground behind
//   - an ice-cream cart with a yellow canopy and a cycle rickshaw at the kerb
// Coordinates are the university building's own (see tiu.js): x along the street, z out from the
// university's front wall. The far carriageway runs along z = 22; this side's footpath starts at 25.5.
import * as THREE from "three";
import { Batch } from "/geom.js";
import { surface, picture, seeded } from "/pbr.js";

const KERB = 25.6; // edge of the far carriageway
const WALL = 29.6; // boundary line behind the footpath
const GATE = [7.2, 16.8]; // the institute gate, along x
const MEDIAN = 17; // centre of the median

export function buildOpposite({ RAPIER, world, scene, mid, phi, M, forest, places }) {
  const rnd = seeded(909);
  const range = (a, b) => a + rnd() * (b - a);
  const G = new THREE.Group();
  G.position.set(mid[0], 0, mid[1]);
  G.rotation.y = phi;
  G.userData.staticGroup = true; // its meshes are merged into chunks by world.js
  scene.add(G);
  const B = new Batch(G);
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const local = (x, z) => [mid[0] + x * cosP + z * sinP, mid[1] - x * sinP + z * cosP];
  const quat = { x: 0, y: Math.sin(phi / 2), z: 0, w: Math.cos(phi / 2) };
  function solid(x0, x1, y0, y1, z0, z1) {
    const [wx, wz] = local((x0 + x1) / 2, (z0 + z1) / 2);
    world.createCollider(RAPIER.ColliderDesc.cuboid(Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2).setTranslation(wx, (y0 + y1) / 2, wz).setRotation(quat));
  }
  const offset = (mat, k = 3) => Object.assign(mat.clone(), { polygonOffset: true, polygonOffsetFactor: -k, polygonOffsetUnits: -k });
  const flat = (hex, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, ...extra });
  const add = (mesh, cast = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    G.add(mesh);
    return mesh;
  };

  // ---------- materials of this side ----------
  // Tarpaulin: cream and yellow sheets, sun-bleached, patched and creased.
  const tarp = (seed, base, patch) =>
    surface({
      seed, tile: 3, bump: 2.5, side: THREE.DoubleSide,
      paint(c, h, r, s, rr) {
        c.fillStyle = base;
        c.fillRect(0, 0, s, s);
        for (let i = 0; i < 7; i++) {
          c.fillStyle = patch[(rr() * patch.length) | 0];
          c.globalAlpha = 0.55;
          c.fillRect(rr() * s, rr() * s, 60 + rr() * 160, 50 + rr() * 140);
        }
        c.globalAlpha = 1;
        for (let i = 0; i < 60; i++) {
          // creases and water stains
          const x = rr() * s;
          const y = rr() * s;
          const len = 40 + rr() * 200;
          const a = rr() * Math.PI;
          for (const [g, col] of [[c, "rgba(90,80,60,0.18)"], [h, rr() < 0.5 ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"]]) {
            g.strokeStyle = col;
            g.lineWidth = 1 + rr() * 3;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
            g.stroke();
          }
        }
        r.fillStyle = "#9a9a9a";
        r.fillRect(0, 0, s, s);
      },
    });
  const tarpCream = tarp(1, "#d8cdb0", ["#e6c46a", "#c9bda0", "#b9a988", "#e0863a"]);
  const tarpGrey = tarp(2, "#a9a8a0", ["#8f9094", "#c2c0b6", "#6f7a86"]);
  const tin = Object.assign(M.roofWhite.clone(), { color: new THREE.Color("#8d8377"), side: THREE.DoubleSide });
  const dirt = surface({
    seed: 3, tile: 5, bump: 2.2, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    paint(c, h, r, s, rr) {
      c.fillStyle = "#8a7558";
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) {
        const x = rr() * s;
        const y = rr() * s;
        const rad = 20 + rr() * 90;
        const grad = c.createRadialGradient(x, y, 0, x, y, rad);
        const tone = ["110,92,66", "150,130,100", "92,96,60", "70,60,46"][(rr() * 4) | 0];
        grad.addColorStop(0, `rgba(${tone},0.4)`);
        grad.addColorStop(1, `rgba(${tone},0)`);
        c.fillStyle = grad;
        c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 18000; i++) {
        const v = 60 + rr() * 150;
        c.fillStyle = `rgba(${v},${v * 0.9},${v * 0.7},0.14)`;
        c.fillRect(rr() * s, rr() * s, 2, 2);
        h.fillStyle = `rgba(${v},${v},${v},0.4)`;
        h.fillRect(rr() * s, rr() * s, 2 + rr() * 3, 2 + rr() * 3);
      }
    },
  });
  // small textured surfaces for props: base colour, soft blotches, specks, streaks, scratches (tile = metres per repeat)
  const tex = (seed, base, o = {}) =>
    surface({
      size: 256, seed, tile: o.tile ?? 0.6, bump: o.bump ?? 1.2, ...(o.side != null ? { side: o.side } : {}),
      paint(c, h, r, s, rr) {
        c.fillStyle = base; c.fillRect(0, 0, s, s);
        const tones = o.tones || ["0,0,0", "255,255,255"];
        for (let k = 0; k < (o.blots ?? 10); k++) {
          const x = rr() * s, y = rr() * s, rad = 20 + rr() * 70, gr = c.createRadialGradient(x, y, 0, x, y, rad);
          gr.addColorStop(0, `rgba(${tones[(rr() * tones.length) | 0]},${o.blotA ?? 0.14})`); gr.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        const sp = o.specks || ["rgba(0,0,0,0.14)", "rgba(255,255,255,0.12)"];
        for (let k = 0; k < (o.n ?? 1500); k++) {
          const x = rr() * s, y = rr() * s, z = (o.sz ?? 2) * (0.5 + rr());
          c.fillStyle = sp[(rr() * sp.length) | 0]; c.fillRect(x, y, z, z);
          h.fillStyle = rr() < 0.5 ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"; h.fillRect(x, y, z, z);
        }
        for (let k = 0; k < (o.streaks ?? 0); k++) {
          const x = rr() * s, len = 30 + rr() * 140; c.strokeStyle = o.streakCol || "rgba(0,0,0,0.12)"; c.lineWidth = 1 + rr() * 2;
          c.beginPath(); if (o.across) { c.moveTo(0, x); c.lineTo(s, x + (rr() - 0.5) * 6); } else { c.moveTo(x, rr() * s); c.lineTo(x + (rr() - 0.5) * 4, rr() * s + len); } c.stroke();
          h.strokeStyle = "rgba(0,0,0,0.3)"; h.lineWidth = 1; h.beginPath(); h.moveTo(x, 0); h.lineTo(x, s); h.stroke();
        }
        for (let k = 0; k < (o.scratch ?? 0); k++) {
          const x = rr() * s, y = rr() * s, a = rr() * 6.28, len = 10 + rr() * 40;
          c.strokeStyle = "rgba(235,230,220,0.5)"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke();
        }
        r.fillStyle = o.rough ?? "#b4b4b4"; r.fillRect(0, 0, s, s);
      },
    });
  const bamboo = tex(11, "#b59a5a", { tile: 0.4, tones: ["120,90,40", "230,210,140"], streaks: 60, specks: ["rgba(90,70,30,0.3)"], n: 500 });
  const bambooGreen = M.railGreen; // painted steel pipe railing (textured, see pbr.js)
  const whitePaint = tex(12, "#e9e7df", { tile: 0.6, tones: ["150,140,120", "255,255,255"], blotA: 0.12, n: 700, scratch: 6, rough: "#9a9a9a" });
  const woodDark = tex(13, "#5a4028", { tile: 0.5, tones: ["30,20,10", "120,90,60"], streaks: 50, across: true, streakCol: "rgba(20,10,0,0.25)", n: 500, rough: "#c0c0c0" });
  const cloth = flat("#2a2623", 1, { side: THREE.DoubleSide });

  // ---------- median: painted kerb stones and the green bamboo railing ----------
  {
    const gap = [5.5, 12.5]; // the crossing in front of the gates
    const kerbTex = picture(128, 32, (g, w, h) => {
      g.fillStyle = "#e8e6de";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#1d1d1f";
      g.fillRect(0, 0, w / 2, h);
      g.fillStyle = "rgba(120,110,95,0.25)";
      for (let i = 0; i < 300; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    });
    kerbTex.wrapS = kerbTex.wrapT = THREE.RepeatWrapping;
    kerbTex.repeat.set(1 / 1.2, 1);
    const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.85 });
    // the whole length of the dual carriageway, from Meen Bhavan in the south to the bend in the
    // north, with openings where vehicles turn (one seen at about x = -425 in the Dec 2022 capture)
    for (const [a, b] of [[-584, -432], [-418, -237], [-223, gap[0]], [gap[1], 78], [92, 128]]) {
      B.box(kerbMat, a, b, 0, 0.28, MEDIAN - 0.9, MEDIAN + 0.9, "-y");
      B.box(offset(dirt, 1), a + 0.15, b - 0.15, 0.28, 0.3, MEDIAN - 0.75, MEDIAN + 0.75, "-y");
      solid(a, b, 0, 0.28, MEDIAN - 0.9, MEDIAN + 0.9);
      // railing: posts with three rails, lashed bamboo painted green, never quite straight
      for (const z of [MEDIAN - 0.7, MEDIAN + 0.7]) {
        for (let x = a + 0.4; x < b; x += 2.2) {
          B.cyl(bambooGreen, x, z, 0.045, 0.28, 1.25 + range(-0.04, 0.06), 6);
          if (x + 2.2 < b)
            for (const y of [0.55, 0.85, 1.15]) {
              const m = new THREE.Matrix4().makeRotationZ(range(-0.03, 0.03)).setPosition(x + 1.1, y + range(-0.03, 0.03), z);
              B.obox(bambooGreen, m, 2.3, 0.05, 0.05);
            }
          if (x + 2.2 < b) for (let k = 0.22; k < 2.1; k += 0.22) B.cyl(bambooGreen, x + k, z, 0.011, 0.58, 1.12, 4); // vertical bars between the rails
        }
        solid(a, b, 0, 1.2, z - 0.05, z + 0.05);
      }
      // scrub growing inside the railing
      for (let x = a + 2; x < b - 1; x += range(2.5, 5)) forest.add(rnd() < 0.3 ? "shrubWhite" : "shrub", ...local3(x, MEDIAN), { yaw: rnd() * 6, scale: range(0.6, 1.0) });
    }
    // speed breaker across both carriageways at the crossing: black hump with yellow stripes
    const humpTex = picture(256, 64, (g, w, h) => {
      g.fillStyle = "#26272a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#e3b21c";
      for (let x = 0; x < w; x += 64) g.fillRect(x + 8, 10, 40, h - 20);
      g.fillStyle = "rgba(0,0,0,0.25)";
      for (let i = 0; i < 400; i++) g.fillRect(Math.random() * w, Math.random() * h, 4, 2);
    });
    for (const zc of [12, 22]) {
      const hump = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6.6, 12, 1, true, Math.PI - 0.38, 0.76), new THREE.MeshStandardMaterial({ map: humpTex, roughness: 0.9 }));
      hump.rotation.x = Math.PI / 2;
      hump.position.set(9, -0.83, zc);
      G.add(hump);
    }
  }
  function local3(x, z, y = 0) {
    const p = local(x, z);
    return [p[0], y, p[1]];
  }

  // ---------- ground: footpath edge, open ground behind the wall ----------
  B.box(M.concrete, -50, 50, 0, 0.16, KERB, KERB + 0.25, "-y"); // kerb stone
  B.quad(dirt, [[-50, 0.04, 78], [GATE[0] - 1, 0.04, 78], [GATE[0] - 1, 0.04, WALL], [-50, 0.04, WALL]], [[-50, 78], [GATE[0] - 1, 78], [GATE[0] - 1, WALL], [-50, WALL]], [0, 1, 0]);
  B.quad(dirt, [[24, 0.04, WALL], [50, 0.04, WALL], [50, 0.04, KERB + 0.25], [24, 0.04, KERB + 0.25]], [[24, WALL], [50, WALL], [50, KERB], [24, KERB]], [0, 1, 0]); // beaten earth under the stalls

  // ---------- the institute gate ----------
  {
    const [g0, g1] = GATE;
    const zg = WALL;
    for (const x of [g0, g1]) {
      B.box(M.brickTile, x - 0.6, x + 0.6, 0, 4.4, zg - 0.6, zg + 0.6);
      B.box(M.concrete, x - 0.72, x + 0.72, 4.4, 4.6, zg - 0.72, zg + 0.72);
      B.box(M.brickTile, x - 0.45, x + 0.45, 4.6, 5.0, zg - 0.45, zg + 0.45);
      B.box(M.concrete, x - 0.55, x + 0.55, 5.0, 5.12, zg - 0.55, zg + 0.55);
      solid(x - 0.6, x + 0.6, 0, 5, zg - 0.6, zg + 0.6);
    }
    // curved name board springing from pillar to pillar
    const span = g1 - g0;
    const rise = 1.5;
    const R = (span * span) / 4 / (2 * rise) + rise / 2;
    const cy = 4.3 + rise - R;
    const half = Math.asin(span / 2 / R);
    const cx = (g0 + g1) / 2;
    const band = 0.95;
    const nameTex = picture(2048, 190, (g, w, h) => {
      g.fillStyle = "#2b5fa5";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,0.08)";
      for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, 0, 30 + Math.random() * 80, h); // faded panels
      g.strokeStyle = "#e9eef5";
      g.lineWidth = 6;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = "#f3f5f8";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = "700 74px Arial, Helvetica, sans-serif";
      g.fillText("CENTRAL STAFF TRAINING AND RESEARCH INSTITUTE", w / 2, h / 2 + 4);
    });
    const blue = new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.6, metalness: 0.2 });
    const edge = flat("#1f4a86", 0.6, { metalness: 0.3 });
    const N = 24;
    const pos = [];
    const uv = [];
    const idx = [];
    for (const [z, flip] of [[zg - 0.14, true], [zg + 0.14, false]]) {
      const base = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const a = -half + (2 * half * i) / N;
        for (const [rr, v] of [[R, 0], [R + band, 1]]) {
          pos.push(cx + rr * Math.sin(a), cy + rr * Math.cos(a), z);
          uv.push(flip ? 1 - i / N : i / N, v);
        }
        if (i < N) {
          const k = base + i * 2;
          if (flip) idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
          else idx.push(k, k + 2, k + 1, k + 2, k + 3, k + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    add(new THREE.Mesh(geo, blue));
    for (let i = 0; i < N; i++) {
      // top and bottom edges of the board
      const a = -half + (2 * half * i) / N;
      const b = -half + (2 * half * (i + 1)) / N;
      for (const [rr, up] of [[R, -1], [R + band, 1]]) {
        const p = (t, z) => [cx + rr * Math.sin(t), cy + rr * Math.cos(t), z];
        B.quad(edge, [p(a, zg - 0.14), p(b, zg - 0.14), p(b, zg + 0.14), p(a, zg + 0.14)], [[0, 0], [1, 0], [1, 1], [0, 1]], [Math.sin((a + b) / 2) * up, Math.cos((a + b) / 2) * up, 0]);
      }
    }
    // grille gates standing open into the drive
    const leaf = (hx, yaw) => {
      const m = (lx, y) => new THREE.Matrix4().makeRotationY(yaw).setPosition(hx + Math.cos(yaw) * lx, y, zg + 0.5 - Math.sin(yaw) * lx);
      for (const y of [0.25, 1.3, 2.5]) B.obox(M.steelBlue, m(2.1, y), 4.2, 0.07, 0.05);
      for (const lx of [0.04, 4.16]) B.obox(M.steelBlue, m(lx, 1.4), 0.07, 2.5, 0.07);
      for (let lx = 0.2; lx < 4.2; lx += 0.14) B.obox(M.steelBlue, m(lx, 1.4), 0.018, 2.3, 0.018);
    };
    leaf(g0 + 0.6, -Math.PI / 2 - 0.15);
    leaf(g1 - 0.6, -Math.PI / 2 + 0.15);
    // guard hut with a red sheet roof, just inside on the north
    B.box(M.plasterCream, g1 + 1.2, g1 + 4.6, 0, 2.6, zg + 1.0, zg + 4.2);
    B.hip(M.roofRed, g1 + 0.8, g1 + 5.0, zg + 0.6, zg + 4.6, 2.6, 1.0);
    B.quad(M.glassShop, [[g1 + 1.19, 1.0, zg + 1.8], [g1 + 1.19, 1.0, zg + 3.4], [g1 + 1.19, 2.0, zg + 3.4], [g1 + 1.19, 2.0, zg + 1.8]], [[0, 0], [1, 0], [1, 1], [0, 1]], [-1, 0, 0]);
    B.box(M.frameDark, g1 + 2.4, g1 + 3.3, 0, 2.05, zg + 0.96, zg + 1.0);
    solid(g1 + 1.2, g1 + 4.6, 0, 2.6, zg + 1.0, zg + 4.2);
    places.push({ name: "CSTARI Gate", x: local(cx, zg)[0], z: local(cx, zg)[1] });
    forest.add("palm", ...local3(g1 + 6.5, zg + 2.5), { yaw: 1, scale: 1.15 });
  }

  // ---------- boundary wall ----------
  {
    // south of the gate: brick wall with piers, a blue notice board near the gate
    const wall = (a, b, h = 2.3) => {
      B.box(M.brickTile, a, b, 0, h, WALL - 0.15, WALL + 0.15);
      B.box(M.concrete, a, b, h, h + 0.1, WALL - 0.2, WALL + 0.2);
      for (let x = a; x <= b + 0.01; x += 4) {
        B.box(M.brickTile, x - 0.25, x + 0.25, 0, h + 0.25, WALL - 0.25, WALL + 0.25);
        B.box(M.concrete, x - 0.3, x + 0.3, h + 0.25, h + 0.35, WALL - 0.3, WALL + 0.3);
      }
      solid(a, b, 0, h, WALL - 0.15, WALL + 0.15);
    };
    wall(-50, GATE[0] - 0.6);
    const board = picture(256, 256, (g, w, h) => {
      g.fillStyle = "#2a5a9c";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#dfe6ee";
      g.lineWidth = 5;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = "#eef2f6";
      g.font = "700 26px Arial";
      g.textAlign = "center";
      g.fillText("C S T A R I", w / 2, 60);
      g.font = "16px Arial";
      for (let i = 0; i < 7; i++) g.fillRect(34, 90 + i * 22, w - 68 - (i % 3) * 30, 4);
    });
    const nb = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshStandardMaterial({ map: board, roughness: 0.6 }));
    nb.position.set(GATE[0] - 3.2, 1.35, WALL - 0.16);
    nb.rotation.y = Math.PI;
    G.add(nb);
    // north of the gate, behind the stalls: low wall with a rusting grille
    const rust = flat("#6a4a36", 0.9, { metalness: 0.3 });
    B.box(M.brickTile, GATE[1] + 0.6, 50, 0, 0.7, WALL - 0.12, WALL + 0.12);
    for (let x = GATE[1] + 0.8; x < 50; x += 0.16) B.box(rust, x - 0.008, x + 0.008, 0.7, 2.2, WALL - 0.008, WALL + 0.008);
    for (const y of [0.9, 2.1]) B.box(rust, GATE[1] + 0.6, 50, y, y + 0.04, WALL - 0.02, WALL + 0.02);
    solid(GATE[1] + 0.6, 50, 0, 2.2, WALL - 0.12, WALL + 0.12);
    // shade trees standing behind the wall, their crowns over the footpath
    for (const [x, kind, s] of [[-44, "rain", 1.15], [-30, "neem", 1.1], [-17, "rain", 1.2], [-5, "neem", 1.0], [29, "rain", 1.25], [41, "rain", 1.15], [35, "neem", 0.95]]) forest.add(kind, ...local3(x, WALL + 2.2 + rnd() * 2), { yaw: rnd() * 6, scale: s, variant: (rnd() * 2) | 0 });
  }

  // ---------- tin-roofed shed south of the gate ----------
  {
    const x0 = -6;
    const x1 = 3.2;
    const z0 = KERB + 0.6;
    const z1 = WALL - 0.3;
    for (const x of [x0, (x0 + x1) / 2, x1]) for (const z of [z0, z1]) B.cyl(bamboo, x, z, 0.05, 0, z === z0 ? 2.2 : 2.6, 6);
    B.quad(tin, [[x0 - 0.4, 2.15, z0 - 0.6], [x1 + 0.4, 2.15, z0 - 0.6], [x1 + 0.4, 2.68, z1 + 0.2], [x0 - 0.4, 2.68, z1 + 0.2]], [[x0, 0], [x1, 0], [x1, 4], [x0, 4]], [0, 1, 0]);
    B.box(woodDark, x0 + 0.3, x1 - 0.3, 0.78, 0.84, z0 + 0.3, z0 + 1.1); // counter
    for (const x of [x0 + 0.4, x1 - 0.4]) B.box(woodDark, x - 0.04, x + 0.04, 0, 0.78, z0 + 0.35, z0 + 1.05);
    B.box(woodDark, x0 + 0.6, x1 - 0.6, 0.4, 0.45, z1 - 0.9, z1 - 0.55); // bench
    solid(x0 + 0.3, x1 - 0.3, 0, 0.84, z0 + 0.3, z0 + 1.1);
    const sign = picture(256, 96, (g, w, h) => {
      g.fillStyle = "#c8452a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffe9a8";
      g.font = "700 40px Arial";
      g.textAlign = "center";
      g.fillText("TEA · SNACKS", w / 2, 62);
    });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.7 }));
    sm.position.set(x0 + 1.6, 1.75, z0 - 0.05);
    sm.rotation.y = Math.PI;
    G.add(sm);
  }

  // ---------- the row of stalls north of the gate ----------
  const packets = picture(64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `hsl(${(i * 67) % 360},80%,${45 + (i % 3) * 8}%)`;
      g.fillRect(8, i * 28 + 4, w - 16, 24);
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.fillRect(16, i * 28 + 10, w - 34, 5);
    }
  });
  const packetMat = new THREE.MeshStandardMaterial({ map: packets, transparent: true, alphaTest: 0.5, roughness: 0.4, side: THREE.DoubleSide });
  const jarMat = [flat("#d9a441", 0.25), flat("#b8432e", 0.25), flat("#e8dcc0", 0.25), flat("#7a4a2a", 0.3)];
  const plastic = (seed, c) => tex(seed, c, { tile: 0.3, bump: 0.6, blots: 14, blotA: 0.12, n: 900, sz: 2, scratch: 10, rough: "#707070" });
  const stoolRed = plastic(21, "#b8231f");
  const stoolBlue = plastic(22, "#2456a8");
  const stoolGreen = plastic(23, "#2f8a4a");
  const stoolWhite = plastic(24, "#e6e4dc");
  const qrMat = new THREE.MeshStandardMaterial({
    map: picture(64, 96, (g, w, h) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#5b2d91";
      g.fillRect(0, 0, w, 18);
      g.fillStyle = "#111";
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if ((x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0) g.fillRect(8 + x * 4, 26 + y * 4, 4, 4);
      for (const [x, y] of [[8, 26], [44, 26], [8, 62]]) {
        g.fillRect(x, y, 12, 12);
        g.fillStyle = "#fff";
        g.fillRect(x + 2, y + 2, 8, 8);
        g.fillStyle = "#111";
        g.fillRect(x + 4, y + 4, 4, 4);
      }
    }),
    roughness: 0.5,
  });

  // ---- stall stock: every object is its own shape with its own colours, nothing is a plain block ----
  const lab = (w, h, draw) => new THREE.MeshStandardMaterial({ map: picture(w, h, draw), roughness: 0.55, side: THREE.DoubleSide });
  const swirl = (g, w, h, col) => { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); for (let k = 0; k < 8; k++) g.lineTo(w * (0.15 + 0.7 * ((k * 0.37) % 1)), h * (0.3 + 0.05 * k)); g.stroke(); };
  // printed snack / biscuit / noodle packets (generic designs): colour field, crimped top and bottom, a banner, a picture, tiny print
  const PACK_DESIGNS = [["#d62b1f", "#ffd23a", "#ffffff"], ["#1f58b8", "#ffffff", "#ffd23a"], ["#f2a900", "#c8261b", "#ffffff"], ["#2f9a4a", "#ffe97a", "#ffffff"], ["#7a2a8f", "#ffd23a", "#f6efe0"], ["#e8691c", "#fff3c4", "#1b3d8f"], ["#f5f0e1", "#c8261b", "#1f58b8"], ["#12306b", "#ff5a36", "#ffffff"]];
  const packFront = PACK_DESIGNS.map(([a, b, c]) => lab(64, 96, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.25)"; for (let x = 0; x < w; x += 3) { g.fillRect(x, 0, 1.4, 6); g.fillRect(x, h - 6, 1.4, 6); } // crimped seals
    g.fillStyle = b; g.fillRect(0, 18, w, 22);                                                                                   // banner
    g.fillStyle = c; g.fillRect(8, 24, w - 16, 3); g.fillRect(14, 30, w - 28, 3);
    g.beginPath(); g.arc(w / 2, 62, 14, 0, 7); g.fillStyle = b; g.fill(); g.beginPath(); g.arc(w / 2, 62, 8, 0, 7); g.fillStyle = a; g.fill(); // picture of the contents
    g.fillStyle = c; for (let k = 0; k < 4; k++) g.fillRect(8 + k * 12, 84, 8, 2);
  }));
  const packSide = ["#c9a14a", "#d8d2c0"].map((c) => flat(c, 0.7));
  const BOTTLES = [
    { body: flat("#24140a", 0.1), label: lab(32, 32, (g, w, h) => { g.fillStyle = "#c0151d"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.fillRect(0, 12, w, 5); }), cap: flat("#c0151d", 0.4) },      // dark cola
    { body: flat("#3f9a4c", 0.12, { transparent: true, opacity: 0.85 }), label: lab(32, 32, (g, w, h) => { g.fillStyle = "#14733a"; g.fillRect(0, 0, w, h); g.fillStyle = "#f4e84a"; g.fillRect(0, 12, w, 6); }), cap: flat("#14733a", 0.4) }, // lemon-lime
    { body: flat("#e8831a", 0.2, { transparent: true, opacity: 0.9 }), label: lab(32, 32, (g, w, h) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); g.fillStyle = "#e8831a"; g.fillRect(0, 10, w, 8); }), cap: flat("#f2f2f2", 0.4) }, // orange drink
    { body: flat("#cfe6f2", 0.08, { transparent: true, opacity: 0.55 }), label: lab(32, 32, (g, w, h) => { g.fillStyle = "#2a6fd0"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.fillRect(0, 8, w, 3); g.fillRect(0, 20, w, 3); }), cap: flat("#2a6fd0", 0.4) }, // packaged water
  ];
  const jarGlass = new THREE.MeshStandardMaterial({ color: "#e4eef2", roughness: 0.06, transparent: true, opacity: 0.32, depthWrite: false });
  const jarFill = [flat("#e7c279", 0.7), flat("#d9d0b8", 0.7), flat("#b5632a", 0.7), flat("#f0e3c2", 0.7)];   // biscuits, toffees, nankhatai, puffed rice
  const lidRed = flat("#c0261b", 0.4), lidBlue = flat("#1f58b8", 0.4);
  const glassTea = new THREE.MeshStandardMaterial({ color: "#d99a3c", roughness: 0.1, transparent: true, opacity: 0.6, depthWrite: false });
  const lpgRed = flat("#b8231a", 0.45, { metalness: 0.2 });
  const coolerRed = flat("#c2231c", 0.35);
  const coolerDecal = lab(128, 48, (g, w, h) => { g.fillStyle = "#c2231c"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "700 22px Arial"; g.textAlign = "center"; g.fillText("ICE CREAM", w / 2, 30); g.fillRect(8, 36, w - 16, 3); });
  const SIGNS = [["TEA  ·  SNACKS", "#c8452a", "#ffe9a8"], ["CHAI  ·  TOAST", "#1f58b8", "#ffffff"], ["COLD DRINKS  ·  PAAN", "#2f8f4a", "#fff3c4"], ["SHARMA TEA STALL", "#7a2a8f", "#ffe97a"], ["NEW BENGAL CAFE", "#d8a21c", "#3a1a0a"], ["ICE CREAM  ·  SODA", "#17306b", "#ffd23a"], ["MAA TARA STORE", "#b8231a", "#ffffff"]]
    .map(([t, bg, fg]) => new THREE.MeshStandardMaterial({ map: picture(512, 96, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(7, 7, w - 14, h - 14);
      g.fillStyle = "rgba(255,255,255,0.08)"; for (let k = 0; k < 14; k++) g.fillRect(k * 40 + (k % 3) * 6, 0, 10, h); // brush marks
      g.fillStyle = fg; g.font = "700 46px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, w / 2, h / 2 + 3);
    }), roughness: 0.6 }));
  const bulbMat = flat("#fff6d8", 0.3, { emissive: "#fff2c0", emissiveIntensity: 0.25 });

  // ---- more stock, each with its own texture ----
  const TARPS = [tarpCream, tarpGrey, tarp(4, "#3d6fa8", ["#2f5c92", "#5a88bd", "#86a9cf"]), tarp(5, "#4f8a4c", ["#3d7340", "#6aa066", "#8bb887"]), tarp(6, "#d9822b", ["#c76f1c", "#e8a04f", "#f2c27a"]), tarp(7, "#c9c1ab", ["#a89f86", "#ddd5bf", "#7f8a96"])];
  const paintBlue = tex(31, "#2f5f9e", { tile: 0.6, tones: ["10,20,50", "170,200,240"], blotA: 0.18, n: 800, scratch: 18, streaks: 20, rough: "#a0a0a0" });
  const paintGreen = tex(32, "#3f8a55", { tile: 0.6, tones: ["10,40,20", "170,230,180"], blotA: 0.18, n: 800, scratch: 18, streaks: 20, rough: "#a0a0a0" });
  const paintCream = tex(33, "#dcd4bd", { tile: 0.6, tones: ["120,100,70", "255,255,255"], blotA: 0.16, n: 800, scratch: 14, streaks: 20, rough: "#a8a8a8" });
  const paintMaroon = tex(34, "#7a2a2a", { tile: 0.6, tones: ["30,0,0", "200,120,110"], blotA: 0.18, n: 800, scratch: 18, streaks: 20, rough: "#a0a0a0" });
  const COUNTERS = [paintBlue, paintGreen, paintCream, woodDark, paintMaroon];
  const coolerT = tex(35, "#c2231c", { tile: 0.5, bump: 0.8, tones: ["60,0,0", "255,200,190"], blotA: 0.2, n: 900, scratch: 30, streaks: 14, rough: "#808080" });
  const cardboard = tex(36, "#b88d56", { tile: 0.4, tones: ["90,60,30", "230,200,150"], streaks: 40, across: true, streakCol: "rgba(70,45,20,0.22)", n: 600, rough: "#d0d0d0" });
  const fryT = tex(37, "#c98a2e", { tile: 0.12, bump: 2.2, tones: ["120,60,10", "245,200,110"], blotA: 0.4, blots: 18, n: 900, sz: 3, specks: ["rgba(90,40,5,0.5)", "rgba(250,215,120,0.4)"], rough: "#7c7c7c" });
  const biscuitT = tex(38, "#d6a45c", { tile: 0.1, bump: 2, tones: ["120,70,20", "240,200,130"], blotA: 0.35, n: 800, sz: 3, specks: ["rgba(100,55,15,0.5)", "rgba(250,225,160,0.5)"], rough: "#a0a0a0" });
  const toffeeT = tex(39, "#d9a35a", { tile: 0.1, bump: 2, n: 800, sz: 4, specks: ["rgba(200,40,40,0.7)", "rgba(40,120,200,0.7)", "rgba(240,200,50,0.8)", "rgba(60,160,80,0.7)"], rough: "#707070" });
  const riceT = tex(40, "#efe6d0", { tile: 0.1, bump: 1.6, n: 1200, sz: 3, specks: ["rgba(190,170,130,0.6)", "rgba(255,255,250,0.7)", "rgba(200,120,40,0.4)"], rough: "#b0b0b0" });
  const breadT = tex(41, "#c68a45", { tile: 0.2, bump: 1.5, tones: ["110,60,20", "245,205,140"], blotA: 0.3, n: 500, sz: 3, rough: "#a8a8a8" });
  const clayT = tex(42, "#b5542c", { tile: 0.2, bump: 1.5, tones: ["80,25,10", "220,130,90"], blotA: 0.25, n: 900, sz: 2, rough: "#d8d8d8" });
  const orangeT = tex(43, "#e8831a", { tile: 0.08, bump: 2.2, n: 1400, sz: 2, specks: ["rgba(180,80,0,0.4)", "rgba(255,190,90,0.4)"], rough: "#909090" });
  const lemonT = tex(44, "#d8d93e", { tile: 0.08, bump: 2, n: 1200, sz: 2, specks: ["rgba(150,150,10,0.4)", "rgba(255,255,140,0.4)"], rough: "#909090" });
  const onionT = tex(45, "#a3507a", { tile: 0.1, bump: 1.2, tones: ["60,10,40", "240,190,210"], blotA: 0.25, streaks: 30, streakCol: "rgba(70,20,50,0.3)", rough: "#a0a0a0" });
  const chilliT = tex(46, "#3f9a30", { tile: 0.1, bump: 1, tones: ["10,50,10", "170,240,130"], blotA: 0.25, n: 400, rough: "#909090" });
  const bananaT = tex(47, "#e8cf3a", { tile: 0.12, bump: 1, tones: ["110,80,0", "255,245,150"], blotA: 0.25, streaks: 30, streakCol: "rgba(120,90,10,0.3)", n: 300, rough: "#909090" });
  const hessian = tex(48, "#9c8458", { tile: 0.3, bump: 1.8, tones: ["60,45,20", "210,190,140"], streaks: 90, across: true, streakCol: "rgba(60,45,20,0.28)", n: 900, rough: "#e0e0e0", side: THREE.DoubleSide });
  const iceT = tex(49, "#d4e9f4", { tile: 0.3, bump: 1, tones: ["150,200,230", "255,255,255"], blotA: 0.3, n: 400, rough: "#404040" });
  const crateBlue = tex(50, "#2b6fbf", { tile: 0.3, bump: 0.8, n: 700, scratch: 20, tones: ["0,20,60", "150,200,250"], rough: "#808080" });
  const carboy = new THREE.MeshStandardMaterial({ color: "#7fb4e0", roughness: 0.08, transparent: true, opacity: 0.5, depthWrite: false });
  const oilMat = new THREE.MeshStandardMaterial({ color: "#b8791a", roughness: 0.1, metalness: 0.1 });
  const steelWorn = M.aluminium;
  const calendarMat = new THREE.MeshStandardMaterial({ map: picture(128, 192, (g, w, h) => {
    g.fillStyle = "#f2ead6"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#b8231a"; g.fillRect(0, 0, w, 70);
    g.fillStyle = "#f5c518"; g.beginPath(); g.arc(w / 2, 36, 22, 0, 7); g.fill();
    g.fillStyle = "#b8231a"; g.beginPath(); g.arc(w / 2, 36, 12, 0, 7); g.fill();
    g.fillStyle = "#222"; for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) g.fillRect(8 + c * 16, 82 + r * 20, 9, 9);
    g.fillStyle = "#b8231a"; for (let c = 0; c < 7; c += 6) for (let r = 0; r < 5; r++) g.fillRect(8 + c * 16, 82 + r * 20, 9, 9);
    g.fillStyle = "#222"; g.fillRect(0, 180, w, 12);
  }), roughness: 0.7 });
  const framedMat = new THREE.MeshStandardMaterial({ map: picture(128, 160, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#f7c85a"); gr.addColorStop(1, "#c7541e");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff0b0"; g.beginPath(); g.arc(w / 2, 62, 34, 0, 7); g.fill();
    g.fillStyle = "#7a2a1a"; g.beginPath(); g.arc(w / 2, 58, 14, 0, 7); g.fill(); g.fillRect(w / 2 - 22, 78, 44, 60);
    g.fillStyle = "#f08a1c"; for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(10 + k * 8.5, 148, 5, 0, 7); g.fill(); }
  }), roughness: 0.45 });
  const signCache = {};
  const signMat = (t, bg, fg) => signCache[t] || (signCache[t] = new THREE.MeshStandardMaterial({ map: picture(512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = "rgba(255,255,255,0.08)"; for (let k = 0; k < 14; k++) g.fillRect(k * 40 + (k % 3) * 6, 0, 10, h);
    g.fillStyle = "rgba(0,0,0,0.18)"; for (let k = 0; k < 90; k++) g.fillRect((k * 53) % w, (k * 31) % h, 3, 2);
    g.fillStyle = fg; g.font = "700 46px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, w / 2, h / 2 + 3);
  }), roughness: 0.6 }));
  const SIGNS_BY_KIND = [
    [["SHARMA TEA STALL", "#7a2a8f", "#ffe97a"], ["CHAI  ·  TOAST", "#1f58b8", "#ffffff"], ["NEW BENGAL CAFE", "#d8a21c", "#3a1a0a"], ["TEA  ·  BISCUIT", "#c8452a", "#ffe9a8"]],
    [["MAA TARA STORE", "#b8231a", "#ffffff"], ["GARAM SAMOSA  ·  CHOP", "#e8691c", "#2a1200"], ["JHAL MURI  ·  CHAAT", "#2f8f4a", "#fff3c4"], ["BISCUIT  ·  NAMKEEN", "#17306b", "#ffd23a"]],
    [["COLD DRINKS  ·  SODA", "#2f8f4a", "#fff3c4"], ["ICE CREAM  ·  SODA", "#17306b", "#ffd23a"], ["FRESH JUICE", "#e8831a", "#ffffff"], ["COLD DRINKS  ·  WATER", "#1f58b8", "#ffffff"]],
  ];
  const DECALS = ["ICE CREAM", "COLD DRINKS", "SODA"].map((t, k) => lab(128, 48, (g, w, h) => {
    g.fillStyle = ["#c2231c", "#1f58b8", "#2f8f4a"][k]; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "700 20px Arial"; g.textAlign = "center"; g.fillText(t, w / 2, 29); g.fillRect(8, 36, w - 16, 3);
  }));
  const stalls = []; // where the people of the stalls stand and sit (see people.js)
  function stall(x0, x1, i) {
    const zf = KERB + 0.9; // front posts
    const zb = WALL - 0.4;
    const mat = TARPS[(i * 5 + 4) % TARPS.length];
    const hF = 2.15 + range(-0.08, 0.08);
    const hB = 2.55 + range(-0.08, 0.08);
    for (const x of [x0 + 0.1, x1 - 0.1]) {
      B.cyl(bamboo, x, zf, 0.045, 0, hF + 0.1, 6);
      B.cyl(bamboo, x, zb, 0.045, 0, hB + 0.1, 6);
      solid(x - 0.06, x + 0.06, 0, 2, zf - 0.06, zf + 0.06);
    }
    // roof sheet: sags between its supports; a flap hangs over the front
    const nx = 4;
    const nz = 3;
    const P = (u, v) => {
      const sag = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.16 + Math.sin(u * 9 + i) * 0.015;
      return [x0 - 0.15 + (x1 - x0 + 0.3) * u, hF + (hB - hF) * v - sag, zf + (zb - zf) * v];
    };
    for (let a = 0; a < nx; a++)
      for (let b = 0; b < nz; b++) {
        const c = [P(a / nx, b / nz), P((a + 1) / nx, b / nz), P((a + 1) / nx, (b + 1) / nz), P(a / nx, (b + 1) / nz)];
        B.quad(mat, c, c.map((p) => [p[0], p[2]]), [0, 1, 0]);
      }
    for (let a = 0; a < nx; a++) {
      const p0 = P(a / nx, 0);
      const p1 = P((a + 1) / nx, 0);
      // the flap is tied up so its lower edge stays above head height (2.05 m and more): people walk
      // under it, they never pass through it
      const drop = Math.min(0.22 + Math.sin(a * 1.7 + i) * 0.05, Math.min(p0[1], p1[1]) - 2.05);
      B.quad(mat, [[p0[0], p0[1] - drop, zf - 0.55], [p1[0], p1[1] - drop, zf - 0.55], p1, p0], [[p0[0], 0], [p1[0], 0], [p1[0], 1], [p0[0], 1]], [0, 0.4, -1]);
    }
    for (const [za, ya] of [[zf, hF], [zb, hB]]) B.box(bamboo, x0, x1, ya + 0.02, ya + 0.09, za - 0.035, za + 0.035); // ridge poles
    // What this stall sells follows people.js (index % 3: tea, snack, drink); the variant (index / 3) changes what it stocks and how it is laid out.
    const kind = i % 3, v = Math.floor(i / 3) % 3;
    const hh = (k) => { const q = Math.sin((k + 1) * 12.9898 + i * 78.233) * 43758.5453; return q - Math.floor(q); };
    const wallMat = TARPS[(i * 5 + 1) % TARPS.length];
    B.quad(wallMat, [[x0, 0, zb], [x1, 0, zb], [x1, hB, zb], [x0, hB, zb]], [[x0, 0], [x1, 0], [x1, hB], [x0, hB]], [0, 0, -1]);
    if (i % 2 === 0) B.quad(wallMat, [[x1, 0, zf + 0.6], [x1, 0, zb], [x1, hB - 0.2, zb], [x1, hF - 0.2, zf + 0.6]], [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 0, 0]);
    const cx0 = x0 + 0.5;
    const cx1 = x0 + (x1 - x0) * 0.58;
    const cmid = (cx0 + cx1) / 2;
    const CTR = COUNTERS[(i * 5 + 1) % COUNTERS.length];
    const stockAt = kind === 0 ? [cx1 - 0.3, 0.98, zf + 0.45] : kind === 1 ? [cx1 - 0.2, 0.98, zf + 0.58] : [cx1 - 0.45, 1.3, zf + 0.62];
    stalls.push({ open: x0 > 55, x0, x1, cx0, cx1, zf, zb, counterFront: zf + 0.25, counterBack: zf + 0.95, counterTop: 0.86, kettle: [cx0 + 0.3, 1.06, zf + 0.78], bench: { x0: cx1 + 0.4, x1: x1 - 0.4, z: zb - 0.775, y: 0.47 }, kindIndex: kind, variant: v, stockAt, workAt: kind === 2 ? [cx0 + 0.4, 1.0, zf + 0.62] : [cx0 + 0.3, 1.0, zf + 0.78] });

    // ---- helpers ----
    const ball = (m, x, y, z, r) => { B.cyl(m, x, z, r * 0.78, y - r, y - r * 0.4, 9); B.cyl(m, x, z, r, y - r * 0.4, y + r * 0.4, 9); B.cyl(m, x, z, r * 0.78, y + r * 0.4, y + r, 9, true); };
    const bottle = (bk, px, pz, y0, s = 1) => {
      B.cyl(bk.body, px, pz, 0.034 * s, y0, y0 + 0.17 * s, 10); B.cyl(bk.body, px, pz, 0.017 * s, y0 + 0.17 * s, y0 + 0.23 * s, 8);
      B.cyl(bk.cap, px, pz, 0.019 * s, y0 + 0.23 * s, y0 + 0.245 * s, 8, true); B.cyl(bk.label, px, pz, 0.0352 * s, y0 + 0.05 * s, y0 + 0.12 * s, 10);
    };
    const jar = (px, pz, y0, n, hgt = 0.27) => {
      B.cyl(jarGlass, px, pz, 0.085, y0, y0 + hgt, 12); B.cyl([biscuitT, toffeeT, riceT, biscuitT][n % 4], px, pz, 0.078, y0 + 0.01, y0 + hgt * 0.8, 12, true);
      B.cyl(n % 2 ? lidBlue : lidRed, px, pz, 0.09, y0 + hgt, y0 + hgt + 0.035, 12, true);
    };
    const tinOn = (px, pz, y0, n) => { const tm = n % 2 ? lidRed : lidBlue; B.cyl(steelWorn, px, pz, 0.065, y0, y0 + 0.17, 12); B.cyl(tm, px, pz, 0.0665, y0 + 0.05, y0 + 0.12, 12); B.cyl(tm, px, pz, 0.068, y0 + 0.17, y0 + 0.2, 12, true); };
    const packOn = (px, pz, y0, n) => { const d = (n * 3 + i) % PACK_DESIGNS.length, w = 0.12, h = 0.16 + (n % 3) * 0.02; B.box(packSide[n % 2], px - w / 2, px + w / 2, y0, y0 + h, pz - 0.035, pz + 0.035); B.quad(packFront[d], [[px - w / 2, y0, pz - 0.0356], [px + w / 2, y0, pz - 0.0356], [px + w / 2, y0 + h, pz - 0.0356], [px - w / 2, y0 + h, pz - 0.0356]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]); };
    const loaf = (px, pz, y0, n) => { B.box(breadT, px - 0.1, px + 0.1, y0, y0 + 0.09, pz - 0.06, pz + 0.06); B.box(breadT, px - 0.09, px + 0.09, y0 + 0.09, y0 + 0.12, pz - 0.05, pz + 0.05); };
    const kulhad = (px, pz, y0, n) => { for (let k = 0; k < n; k++) { B.cyl(clayT, px, pz, 0.047, y0 + k * 0.045, y0 + k * 0.045 + 0.06, 10); } B.cyl(clayT, px, pz, 0.05, y0 + (n - 1) * 0.045 + 0.06, y0 + (n - 1) * 0.045 + 0.07, 10, true); };

    // ---- counter: planked top with an overhang, painted front panel, legs, lower shelf ----
    B.box(M.wood, cx0 - 0.03, cx1 + 0.03, 0.82, 0.86, zf + 0.22, zf + 0.97);
    B.box(CTR, cx0, cx1, 0.1, 0.82, zf + 0.28, zf + 0.31);
    for (const x of [cx0 + 0.05, cx1 - 0.05]) B.box(woodDark, x - 0.04, x + 0.04, 0, 0.82, zf + 0.3, zf + 0.9);
    B.box(woodDark, cx0 + 0.05, cx1 - 0.05, 0.3, 0.33, zf + 0.3, zf + 0.9);
    for (let k = 0; k < 3; k++) B.box(k === 1 && kind === 2 ? crateBlue : M.frameDark, cx0 + 0.15 + k * ((cx1 - cx0 - 0.4) / 2.4), cx0 + 0.19 + k * ((cx1 - cx0 - 0.4) / 2.4) + (k === 1 ? 0.2 : 0.04), 0.33, 0.33 + 0.07 + k * 0.03, zf + 0.34, zf + 0.5);
    solid(cx0, cx1, 0, 0.86, zf + 0.25, zf + 0.95);
    B.box(M.frameDark, cmid - 0.07, cmid + 0.07, 0.86, 1.06, zf + 0.37, zf + 0.39); B.box(qrMat, cmid - 0.07, cmid + 0.07, 0.86, 1.06, zf + 0.368, zf + 0.372);
    B.box(M.frameDark, cmid - 0.02, cmid + 0.02, 0.86, 0.9, zf + 0.39, zf + 0.43);
    const lpg = () => { B.cyl(lpgRed, x0 + 0.34, zf + 0.6, 0.155, 0, 0.5, 12); B.cyl(lpgRed, x0 + 0.34, zf + 0.6, 0.1, 0.5, 0.56, 12, true); B.cyl(steelWorn, x0 + 0.34, zf + 0.6, 0.03, 0.56, 0.62, 8, true); };
    const burner = (bx, bz) => { B.cyl(M.frameDark, bx, bz, 0.15, 0.86, 0.9, 14, true); for (let k = 0; k < 3; k++) { const an = (k / 3) * 6.28; B.box(M.frameDark, bx + Math.sin(an) * 0.1 - 0.015, bx + Math.sin(an) * 0.1 + 0.015, 0.9, 0.95, bz + Math.cos(an) * 0.1 - 0.015, bz + Math.cos(an) * 0.1 + 0.015); } };

    if (kind === 0) {
      // ================= TEA STALL =================
      const kx = cx0 + 0.3, kz = zf + 0.78;
      lpg(); burner(kx, kz);
      B.cyl(steelWorn, kx, kz, 0.125, 0.95, 1.0, 14); B.cyl(steelWorn, kx, kz, 0.11, 1.0, 1.07, 14); B.cyl(steelWorn, kx, kz, 0.075, 1.07, 1.1, 12); B.cyl(steelWorn, kx, kz, 0.06, 1.1, 1.115, 12, true); B.cyl(M.frameDark, kx, kz, 0.015, 1.115, 1.14, 6, true);
      B.obox(steelWorn, new THREE.Matrix4().makeRotationZ(-0.7).setPosition(kx + 0.16, 1.04, kz), 0.18, 0.035, 0.035);
      for (const hy of [1.0, 1.09]) B.obox(M.frameDark, new THREE.Matrix4().setPosition(kx - 0.14, hy, kz), 0.1, 0.03, 0.03);
      B.obox(M.frameDark, new THREE.Matrix4().setPosition(kx - 0.19, 1.045, kz), 0.025, 0.12, 0.03);
      B.box(steelWorn, cx0 + 0.55, cx0 + 0.93, 0.86, 0.875, zf + 0.5, zf + 0.75);
      const clay = v !== 1 && hh(1) > 0.35;
      for (let gx = 0; gx < 3; gx++) for (let gz = 0; gz < 2; gz++) { if (clay && gz === 1) kulhad(cx0 + 0.63 + gx * 0.11, zf + 0.68, 0.875, 1); else B.cyl(glassTea, cx0 + 0.63 + gx * 0.11, zf + 0.56 + gz * 0.12, 0.027, 0.875, 0.95, 10); }
      B.cyl(steelWorn, cx0 + 1.05, zf + 0.86, 0.055, 0.86, 1.12, 10); B.cyl(lidBlue, cx0 + 1.05, zf + 0.86, 0.058, 1.12, 1.17, 10, true);
      if (v === 0) { kulhad(cx1 - 0.22, zf + 0.7, 0.86, 6); jar(cx1 - 0.2, zf + 0.42, 0.86, 0); jar(cx1 - 0.45, zf + 0.42, 0.86, 3); loaf(cx0 + 1.2, zf + 0.84, 0.86, 0); }
      if (v === 1) { jar(cx1 - 0.2, zf + 0.42, 0.86, 1); jar(cx1 - 0.45, zf + 0.42, 0.86, 2); for (let k = 0; k < 3; k++) loaf(cx1 - 0.32, zf + 0.82, 0.86 + k * 0.12, k); }
      if (v === 2) { for (let k = 0; k < 2; k++) tinOn(cx1 - 0.2 - k * 0.17, zf + 0.5, 0.86, k); for (let k = 0; k < 4; k++) B.box(paintCream, cx0 + 1.14, cx0 + 1.45, 0.86 + k * 0.012, 0.87 + k * 0.012, zf + 0.7 + k * 0.01, zf + 0.9); B.cyl(M.frameDark, cx1 - 0.18, zf + 0.82, 0.05, 0.86, 0.95, 8); B.box(M.frameDark, cx1 - 0.2, cx1 - 0.16, 0.95, 1.12, zf + 0.82, zf + 0.84); }
      if (v === 1) { B.cyl(steelWorn, x1 - 0.55, zb - 0.35, 0.16, 0, 0.55, 14); B.cyl(M.frameDark, x1 - 0.55, zb - 0.35, 0.165, 0.5, 0.56, 14, true); B.cyl(steelWorn, x1 - 0.55, zb - 0.35, 0.1, 0.56, 0.6, 10, true); } // milk can
      if (v !== 2) for (let k = 0; k < 2 + v; k++) { B.cyl(bananaT, cx0 + 0.25 + k * 0.05, zf + 0.3, 0.02, hF - 0.5 - k * 0.04, hF - 0.1, 6); B.obox(bananaT, new THREE.Matrix4().makeRotationZ(0.4 * (k - 0.5)).setPosition(cx0 + 0.25 + k * 0.05, hF - 0.62 - k * 0.04, zf + 0.3), 0.015, 0.14, 0.04); }
    } else if (kind === 1) {
      // ================= SNACK STALL =================
      const kx = cx0 + 0.3, kz = zf + 0.78;
      if (v !== 1) { lpg(); burner(kx, kz); }
      if (v === 0) {
        // kadai (wok) of hot oil on the burner, a skimmer, and a glass display case of fried snacks
        B.cyl(M.frameDark, kx, kz, 0.13, 0.95, 0.99, 16); B.cyl(M.frameDark, kx, kz, 0.19, 0.99, 1.04, 16); B.cyl(M.frameDark, kx, kz, 0.23, 1.04, 1.08, 16, true); B.cyl(oilMat, kx, kz, 0.2, 1.07, 1.075, 16, true);
        B.box(M.frameDark, kx + 0.22, kx + 0.34, 1.05, 1.07, kz - 0.015, kz + 0.015); B.box(M.frameDark, kx - 0.34, kx - 0.22, 1.05, 1.07, kz - 0.015, kz + 0.015);
        for (let k = 0; k < 4; k++) B.cyl(fryT, kx - 0.08 + (k % 2) * 0.13, kz - 0.06 + (k >> 1) * 0.12, 0.04, 1.07, 1.1, 8, true);
        B.box(M.frameDark, kx + 0.05, kx + 0.5, 1.08, 1.1, kz + 0.2, kz + 0.22);
        const gx0 = cx0 + 0.62, gx1 = Math.min(cx0 + 1.2, cx1 - 0.45), gz0 = zf + 0.4, gz1 = zf + 0.88;
        B.box(steelWorn, gx0, gx1, 0.86, 0.9, gz0, gz1);
        for (const [xa, za] of [[gx0, gz0], [gx1 - 0.02, gz0], [gx0, gz1 - 0.02], [gx1 - 0.02, gz1 - 0.02]]) B.box(M.frameDark, xa, xa + 0.02, 0.9, 1.22, za, za + 0.02);
        for (const ty of [0.9, 1.05]) { B.box(steelWorn, gx0 + 0.02, gx1 - 0.02, ty, ty + 0.012, gz0 + 0.02, gz1 - 0.02); for (let sx = gx0 + 0.07, n = 0; sx < gx1 - 0.06; sx += 0.1, n++) for (let sz = gz0 + 0.08; sz < gz1 - 0.05; sz += 0.12) { if ((n + ty * 7) % 2) { B.cyl(fryT, sx, sz, 0.05, ty + 0.012, ty + 0.04, 3); B.cyl(fryT, sx, sz, 0.03, ty + 0.04, ty + 0.06, 3); } else { B.cyl(fryT, sx, sz, 0.045, ty + 0.012, ty + 0.05, 10, true); } } }
        B.box(jarGlass, gx0, gx1, 0.9, 1.2, gz0, gz1); B.box(M.frameDark, gx0, gx1, 1.2, 1.23, gz0, gz1);
      }
      if (v === 1) {
        // jhal muri: big steel drum of puffed rice with a scoop, onion and chilli baskets, oil and spice tins
        const dx = kx, dz = kz - 0.02;
        B.cyl(steelWorn, dx, dz, 0.2, 0.86, 1.16, 16); B.cyl(riceT, dx, dz, 0.185, 1.12, 1.17, 16, true);
        B.box(M.frameDark, dx + 0.12, dx + 0.3, 1.2, 1.22, dz - 0.015, dz + 0.015);
        for (let k = 0; k < 6; k++) { B.box(M.frameDark, cx0 + 0.65 + k * 0.1, cx0 + 0.7 + k * 0.1, 0.86, 0.86 + 0.08 + (k % 2) * 0.03, zf + 0.84, zf + 0.9); }
        B.cyl(hessian, cx0 + 0.7, zf + 0.52, 0.15, 0.86, 0.98, 12); for (let k = 0; k < 6; k++) ball(onionT, cx0 + 0.7 + (k % 3 - 1) * 0.07, 1.0 + (k >> 2) * 0.05, zf + 0.52 + ((k >> 1) % 2 - 0.5) * 0.08, 0.05);
        B.cyl(hessian, cx0 + 1.05, zf + 0.52, 0.1, 0.86, 0.95, 12); for (let k = 0; k < 5; k++) B.obox(chilliT, new THREE.Matrix4().makeRotationZ(0.5 * (k - 2)).setPosition(cx0 + 1.05 + (k - 2) * 0.02, 0.97, zf + 0.52), 0.045, 0.012, 0.012);
        B.cyl(oilMat, cx0 + 1.28, zf + 0.7, 0.04, 0.86, 1.05, 10); B.cyl(lidRed, cx0 + 1.28, zf + 0.7, 0.02, 1.05, 1.1, 8, true);
      }
      if (v === 2) {
        // packet shop: a stepped pyramid of biscuit packets, tin of toffees, rows of namkeen
        for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) packOn(cx0 + 0.45 + k * 0.14 + r * 0.07, zf + 0.62, 0.86 + r * 0.17, k + r * 5);
        jar(cx0 + 0.95, zf + 0.78, 0.86, 1); jar(cx0 + 1.15, zf + 0.78, 0.86, 2); tinOn(cx0 + 0.3, zf + 0.6, 0.86, 1); tinOn(cx0 + 0.3, zf + 0.82, 0.86, 0);
      }
      // open carton of packets by the sale point (the keeper takes from here)
      const bx0 = Math.max(cx0 + 1.22, cx1 - 0.43), bx1 = cx1 - 0.04;
      B.box(cardboard, bx0, bx1, 0.86, 1.04, zf + 0.42, zf + 0.72);
      for (let k = 0; bx0 + 0.05 + k * 0.06 < bx1 - 0.04; k++) B.quad(packFront[(k + i) % PACK_DESIGNS.length], [[bx0 + 0.04 + k * 0.06, 1.0, zf + 0.5], [bx0 + 0.1 + k * 0.06, 1.0, zf + 0.5], [bx0 + 0.1 + k * 0.06, 1.17, zf + 0.5], [bx0 + 0.04 + k * 0.06, 1.17, zf + 0.5]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);
    } else {
      // ================= COLD DRINK STALL =================
      const fz0 = zf + 0.4, fz1 = zf + 0.85, fx0 = cx1 - 0.75, fx1 = cx1 - 0.15;
      B.box(coolerT, fx0, fx1, 0.86, 1.14, fz0, fz1); B.box(whitePaint, fx0 - 0.015, fx1 + 0.015, 1.14, 1.17, fz0 - 0.015, fz1 + 0.015); B.box(steelWorn, fx0 + 0.04, fx1 - 0.04, 1.17, 1.19, fz0 + 0.04, fz1 - 0.04);
      for (const gz of [fz0 + 0.12, fz1 - 0.12]) B.box(M.frameDark, (fx0 + fx1) / 2 - 0.08, (fx0 + fx1) / 2 + 0.08, 1.19, 1.215, gz - 0.015, gz + 0.015);
      B.quad(DECALS[(v + (i >> 1)) % 3], [[fx0 + 0.03, 0.9, fz0 - 0.002], [fx1 - 0.03, 0.9, fz0 - 0.002], [fx1 - 0.03, 1.1, fz0 - 0.002], [fx0 + 0.03, 1.1, fz0 - 0.002]], [[1, 0], [0, 0], [0, 1], [1, 1]], [0, 0, -1]);
      // floor crate of bottles left of the counter
      B.box(crateBlue, x0 + 0.12, x0 + 0.48, 0, 0.3, zf + 0.35, zf + 0.75); for (let a = 0; a < 3; a++) for (let b = 0; b < 4; b++) bottle(BOTTLES[(a + b + i) % 4], x0 + 0.2 + a * 0.1, zf + 0.42 + b * 0.09, 0.3);
      if (v === 0) {
        // 20 L water can upside-down on a stand, a stack of cups
        B.box(M.frameDark, cx0 + 0.15, cx0 + 0.5, 0.86, 0.88, zf + 0.5, zf + 0.85); B.cyl(carboy, cx0 + 0.32, zf + 0.68, 0.14, 0.88, 1.2, 14); B.cyl(carboy, cx0 + 0.32, zf + 0.68, 0.06, 1.2, 1.3, 10, true); B.cyl(lidBlue, cx0 + 0.32, zf + 0.68, 0.062, 1.3, 1.34, 10, true);
        for (let k = 0; k < 6; k++) B.cyl(whitePaint, cx0 + 0.7, zf + 0.6, 0.035 - k * 0.0005, 0.86 + k * 0.025, 0.89 + k * 0.025, 8);
      }
      if (v === 1) {
        // fresh-juice counter: juicer with chute and tray, baskets of oranges, a glass of juice
        B.box(steelWorn, cx0 + 0.1, cx0 + 0.55, 0.86, 1.05, zf + 0.5, zf + 0.85); B.cyl(steelWorn, cx0 + 0.33, zf + 0.68, 0.07, 1.05, 1.28, 10); B.cyl(M.frameDark, cx0 + 0.33, zf + 0.68, 0.075, 1.28, 1.3, 10, true); B.box(M.frameDark, cx0 + 0.45, cx0 + 0.65, 0.92, 0.96, zf + 0.46, zf + 0.5);
        B.cyl(hessian, cx0 + 0.82, zf + 0.62, 0.18, 0.86, 0.96, 14); for (let k = 0; k < 7; k++) ball(orangeT, cx0 + 0.82 + (k % 3 - 1) * 0.1, 1.0 + (k >> 2) * 0.07, zf + 0.62 + ((k >> 1) % 2 - 0.5) * 0.1, 0.05);
      }
      if (v === 2) {
        // soda: a basket of limes, a block of ice under sacking, marble-neck soda bottles
        B.cyl(hessian, cx0 + 0.25, zf + 0.62, 0.15, 0.86, 0.96, 12); for (let k = 0; k < 7; k++) ball(lemonT, cx0 + 0.25 + (k % 3 - 1) * 0.07, 0.99 + (k >> 2) * 0.05, zf + 0.62 + ((k >> 1) % 2 - 0.5) * 0.08, 0.04);
        B.box(iceT, cx0 + 0.5, cx0 + 0.85, 0.86, 1.0, zf + 0.5, zf + 0.82); B.box(hessian, cx0 + 0.48, cx0 + 0.87, 0.99, 1.02, zf + 0.48, zf + 0.62);
        for (let k = 0; k < 4; k++) bottle(BOTTLES[(k + 1) % 3], cx0 + 0.95 + k * 0.08, zf + 0.5, 0.86, 1.1);
      }
    }

    // ---- hanging snack packets (many on a snack stall, a few on the others) ----
    B.box(bamboo, cx0, cx1, hF - 0.06, hF - 0.04, zf + 0.26, zf + 0.28);
    const dense = kind === 1 ? 0.14 : kind === 2 ? 0.3 : 0.34;
    for (let k = 0, px = cx0 + 0.12; px < cx1 - 0.08; k++, px += dense) {
      const cordTop = hF - 0.05, rows = (kind === 1 ? 3 : 1) + (k % 2);
      B.box(M.frameDark, px - 0.002, px + 0.002, cordTop - 0.18 * rows - 0.06, cordTop, zf + 0.269, zf + 0.273);
      for (let r = 0; r < rows; r++) {
        const top = cordTop - 0.04 - r * 0.18, tilt = (((k * 7 + r * 3) % 5) - 2) * 0.006, d = (k * 3 + r * 5 + i) % PACK_DESIGNS.length;
        B.quad(packFront[d], [[px - 0.065 + tilt, top - 0.15, zf + 0.262], [px + 0.065 + tilt, top - 0.15, zf + 0.262], [px + 0.065, top, zf + 0.262], [px - 0.065, top, zf + 0.262]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);
        B.box(M.frameDark, px - 0.012, px + 0.012, top, top + 0.025, zf + 0.265, zf + 0.275);
      }
    }

    // ---- back shelves, stocked by what the stall sells; no two stalls arrange them alike ----
    const PLAN = [
      [["jars", "tins", "loaves"], ["tins", "kulhads", "jars"], ["kulhads", "jars", "tins"]],
      [["packs", "jars", "packs"], ["jars", "packs", "packs"], ["packs", "packs", "jars"]],
      [["bottles", "bottles", "packs"], ["bottles", "packs", "bottles"], ["packs", "bottles", "bottles"]],
    ][kind][v];
    [1.2, 1.62, 2.0].forEach((sy, si) => {
      if (sy + 0.3 > hB - 0.1) return;
      B.box(woodDark, x0 + 0.1, x1 - 0.1, sy, sy + 0.03, zb - 0.34, zb - 0.03);
      for (const bx of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3]) B.box(woodDark, bx - 0.015, bx + 0.015, sy - 0.14, sy, zb - 0.32, zb - 0.28);
      const what = PLAN[si], step = what === "bottles" ? 0.1 : what === "packs" ? 0.15 : what === "loaves" ? 0.24 : 0.28;
      let n = 0;
      for (let px = x0 + 0.25; px < x1 - 0.25; px += step * (0.9 + hh(n + si * 9) * 0.35), n++) {
        if (hh(n * 3 + si) < 0.12) continue; // a gap where something has been sold
        const pz = zb - 0.2;
        if (what === "bottles") bottle(BOTTLES[(n * 7 + si + i) % 4], px, pz, sy + 0.03);
        else if (what === "packs") packOn(px, pz, sy + 0.03, n + si);
        else if (what === "jars") jar(px, pz, sy + 0.03, n + si);
        else if (what === "tins") tinOn(px, pz, sy + 0.03, n);
        else if (what === "loaves") loaf(px, pz, sy + 0.03, n);
        else kulhad(px, pz, sy + 0.03, 4 + (n % 3));
      }
    });
    // back-wall dressing: a calendar, a framed picture with a marigold string, a radio on the top shelf; differs per stall
    const wallX = x0 + 0.5 + hh(5) * (x1 - x0 - 1.2);
    if (hh(2) > 0.3) B.quad(calendarMat, [[wallX, hB - 0.8, zb - 0.01], [wallX + 0.28, hB - 0.8, zb - 0.01], [wallX + 0.28, hB - 0.28, zb - 0.01], [wallX, hB - 0.28, zb - 0.01]], [[1, 0], [0, 0], [0, 1], [1, 1]], [0, 0, -1]);
    if (hh(3) > 0.4) { const fx = x1 - 0.75; B.box(woodDark, fx - 0.015, fx + 0.255, hB - 0.84, hB - 0.4, zb - 0.025, zb - 0.01); B.quad(framedMat, [[fx + 0.24, hB - 0.82, zb - 0.027], [fx, hB - 0.82, zb - 0.027], [fx, hB - 0.42, zb - 0.027], [fx + 0.24, hB - 0.42, zb - 0.027]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]); for (let k = 0; k < 10; k++) B.cyl(orangeT, fx - 0.02 + k * 0.03, zb - 0.04, 0.012, hB - 0.86 - Math.sin(k / 9 * 3.14) * 0.03, hB - 0.84, 6, true); }
    if (kind !== 1 && hh(4) > 0.3 && hB > 2.45) { const rx = x0 + 0.5 + hh(6) * (x1 - x0 - 1); B.box(M.frameDark, rx, rx + 0.2, 2.03, 2.14, zb - 0.28, zb - 0.14); B.cyl(steelWorn, rx + 0.16, zb - 0.2, 0.006, 2.14, 2.3, 4); }
    // lighting: a bare bulb on a cord, or a tube light on some
    if (hh(7) > 0.5) { B.box(M.frameDark, cmid - 0.003, cmid + 0.003, hF - 0.45, hF, zf + 0.5, zf + 0.506); B.cyl(bulbMat, cmid, zf + 0.503, 0.04, hF - 0.52, hF - 0.45, 10, true); } else B.box(bulbMat, cmid - 0.3, cmid + 0.3, hF - 0.1, hF - 0.07, zf + 0.5, zf + 0.54);
    // the stall's own name board, chosen for what it sells
    const sg = SIGNS_BY_KIND[kind][(v + (i >> 1)) % 4], sgM = signMat(sg[0], sg[1], sg[2]);
    const boardY = hF + 0.1, boardW = Math.min(x1 - x0 - 0.3, 3.2), bx = (x0 + x1) / 2;
    B.quad(sgM, [[bx - boardW / 2, boardY, zf - 0.58], [bx + boardW / 2, boardY, zf - 0.58], [bx + boardW / 2, boardY + boardW * 0.19, zf - 0.58], [bx - boardW / 2, boardY + boardW * 0.19, zf - 0.58]], [[1, 0], [0, 0], [0, 1], [1, 1]], [0, 0, -1]);
    for (const x of [bx - boardW / 2 + 0.05, bx + boardW / 2 - 0.05]) B.cyl(bamboo, x, zf - 0.55, 0.025, hF - 0.1, boardY + boardW * 0.19, 6);

    // ---- bench and moulded plastic stools (colours differ per stall) ----
    B.box(woodDark, cx1 + 0.4, x1 - 0.4, 0.42, 0.47, zb - 0.95, zb - 0.6);
    for (const x of [cx1 + 0.55, x1 - 0.55]) B.box(woodDark, x - 0.04, x + 0.04, 0, 0.42, zb - 0.92, zb - 0.63);
    const STOOLS = [[stoolRed, stoolBlue], [stoolBlue, stoolWhite], [stoolGreen, stoolRed], [stoolWhite, stoolGreen]][i % 4];
    const nStool = 2 + (hh(8) > 0.5 ? 1 : 0);
    for (let k = 0; k < nStool; k++) {
      const sx = cx1 + 0.5 + hh(10 + k) * (x1 - cx1 - 1), sz = zf + 0.5 + hh(20 + k) * 1.2, m = STOOLS[k % 2];
      B.cyl(m, sx, sz, 0.17, 0.4, 0.44, 12, true); B.cyl(m, sx, sz, 0.15, 0.37, 0.4, 12);
      for (let l = 0; l < 4; l++) { const an = l * Math.PI / 2 + Math.PI / 4; B.cyl(m, sx + Math.sin(an) * 0.11, sz + Math.cos(an) * 0.11, 0.017, 0, 0.38, 6); }
      B.cyl(m, sx, sz, 0.125, 0.16, 0.18, 12);
    }
  }
  {
    let x = 24.5;
    let i = 0;
    while (x < 48) {
      const w = range(3.6, 4.6);
      stall(x, Math.min(x + w, 49.5), i++);
      x += w + range(0.1, 0.4);
    }
    // the second row further north, toward the bend (both sides of the street have stalls there
    // in the Jan 2026 street view)
    x = 60;
    while (x < 124) {
      const w = range(3.6, 4.6);
      stall(x, Math.min(x + w, 127), i++);
      x += w + range(0.1, 0.6);
    }
    // white railing along the kerb in front of them, with openings to step through
    const zr = KERB + 0.35;
    for (let a = 24.5; a < 49; a += 5.2) {
      const b = Math.min(a + 4.1, 49.5);
      B.box(M.railWhite, a, b, 0.86, 0.93, zr - 0.035, zr + 0.035);
      B.box(M.railWhite, a, b, 0.14, 0.2, zr - 0.03, zr + 0.03);
      for (let px = a + 0.05; px <= b; px += 0.26) B.box(M.railWhite, px - 0.03, px + 0.03, 0, 0.92, zr - 0.02, zr + 0.02);
      solid(a, b, 0, 0.93, zr - 0.04, zr + 0.04);
    }
    B.box(flat("#2f9a5c", 0.6), 31.2, 31.9, 0, 0.42, zr - 0.75, zr - 0.25); // green crate at the kerb
    places.push({ name: "Tea stalls", x: local(36, 27)[0], z: local(36, 27)[1] });
  }

  B.flush();

  // ---------- vehicles at the kerb ----------
  const tyre = flat("#151515", 0.9);
  const spokeMat = new THREE.LineBasicMaterial({ color: "#b7babd" });
  function wheel(r = 0.33) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(new THREE.TorusGeometry(r - 0.02, 0.022, 8, 28), tyre);
    t.rotation.y = Math.PI / 2;
    t.castShadow = true;
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, Math.sin(a) * (r - 0.04), Math.cos(a) * (r - 0.04)));
    }
    w.add(t, new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), spokeMat));
    return w;
  }
  const part = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // Ice-cream cart: a box on a tricycle with a yellow canopy. Forward is local -z of the cart.
  {
    const c = new THREE.Group();
    c.position.set(4.6, 0, KERB - 0.9);
    c.rotation.y = Math.PI / 2 + 0.1; // parked along the kerb
    G.add(c);
    const art = picture(256, 128, (g, w, h) => {
      g.fillStyle = "#f4efe2";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `hsl(${i * 45},80%,60%)`;
        g.beginPath();
        g.arc(22 + i * 30, 44, 12, 0, 7);
        g.fill();
        g.fillStyle = "#d8a45a";
        g.beginPath();
        g.moveTo(12 + i * 30, 52);
        g.lineTo(32 + i * 30, 52);
        g.lineTo(22 + i * 30, 86);
        g.fill();
      }
      g.fillStyle = "#1f58a8";
      g.font = "700 22px Arial";
      g.textAlign = "center";
      g.fillText("ICE CREAM", w / 2, 116);
    });
    const artMat = new THREE.MeshStandardMaterial({ map: art, roughness: 0.5 });
    const white = flat("#ece9e0", 0.5);
    part(c, new THREE.BoxGeometry(0.95, 0.75, 1.25), [artMat, artMat, white, white, artMat, artMat], 0, 0.95, -0.75);
    const yellow = flat("#f0c21c", 0.6, { side: THREE.DoubleSide });
    for (const [x, z] of [[-0.45, -1.35], [0.45, -1.35], [-0.45, -0.15], [0.45, -0.15]]) part(c, new THREE.CylinderGeometry(0.015, 0.015, 1.0, 6), flat("#888", 0.4, { metalness: 0.7 }), x, 1.8, z);
    const canopy = part(c, new THREE.CylinderGeometry(0.75, 0.75, 1.15, 14, 1, true, Math.PI / 2 + 0.25, Math.PI - 0.5), yellow, 0, 1.75, -0.75);
    canopy.rotation.x = Math.PI / 2;
    part(c, new THREE.BoxGeometry(1.05, 0.14, 0.02), flat("#2a62b0", 0.6), 0, 2.2, -1.36);
    for (const x of [-0.56, 0.56]) {
      const w = wheel();
      w.position.set(x, 0.33, -0.75);
      c.add(w);
    }
    const rear = wheel();
    rear.position.set(0, 0.33, 0.9);
    c.add(rear);
    const steel = flat("#3c3f44", 0.5, { metalness: 0.6 });
    const bar = (a, b) => {
      const va = new THREE.Vector3(...a);
      const vb = new THREE.Vector3(...b);
      const m = part(c, new THREE.CylinderGeometry(0.016, 0.016, va.distanceTo(vb), 6), steel, 0, 0, 0);
      m.position.copy(va).add(vb).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    };
    bar([0, 0.55, -0.1], [0, 0.33, 0.9]);
    bar([0, 0.55, -0.1], [0, 0.95, 0.35]);
    bar([0, 0.33, 0.9], [0, 0.95, 0.35]);
    part(c, new THREE.BoxGeometry(0.22, 0.05, 0.26), flat("#1a1a1a", 0.7), 0, 0.98, 0.38); // saddle
    bar([-0.3, 1.25, -0.05], [0.3, 1.25, -0.05]); // push bar
    const [wx, wz] = local(4.6, KERB - 0.9);
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.1, 1.1, 0.6).setTranslation(wx, 1.1, wz).setRotation(quat));
  }
  // Cycle rickshaw with a blue hood, waiting by the gate.
  {
    const r = new THREE.Group();
    r.position.set(19.5, 0, KERB - 0.85);
    r.rotation.y = -Math.PI / 2 - 0.08;
    G.add(r);
    const steel = flat("#30343a", 0.5, { metalness: 0.6 });
    const blue = flat("#2a63b8", 0.6, { side: THREE.DoubleSide });
    const seatRed = flat("#9c2b25", 0.6);
    const bar = (a, b, rad = 0.016) => {
      const va = new THREE.Vector3(...a);
      const vb = new THREE.Vector3(...b);
      const m = part(r, new THREE.CylinderGeometry(rad, rad, va.distanceTo(vb), 6), steel, 0, 0, 0);
      m.position.copy(va).add(vb).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    };
    const fw = wheel(0.35);
    fw.position.set(0, 0.35, -1.25);
    r.add(fw);
    for (const x of [-0.52, 0.52]) {
      const w = wheel(0.35);
      w.position.set(x, 0.35, 0.55);
      r.add(w);
    }
    bar([0, 0.35, -1.25], [0, 1.05, -0.95]); // fork
    bar([-0.25, 1.08, -0.92], [0.25, 1.08, -0.92]); // handlebar
    bar([0, 0.95, -0.95], [0, 0.6, -0.25]);
    bar([0, 0.6, -0.25], [0, 0.35, 0.55]);
    bar([0, 0.6, -0.25], [0, 0.95, -0.3]);
    part(r, new THREE.BoxGeometry(0.2, 0.05, 0.26), flat("#1a1a1a", 0.7), 0, 0.98, -0.3);
    bar([-0.52, 0.35, 0.55], [0.52, 0.35, 0.55]);
    part(r, new THREE.BoxGeometry(0.95, 0.1, 0.5), seatRed, 0, 0.72, 0.5); // passenger seat
    part(r, new THREE.BoxGeometry(0.95, 0.5, 0.08), seatRed, 0, 1.0, 0.78);
    part(r, new THREE.BoxGeometry(0.95, 0.04, 0.3), steel, 0, 0.45, 0.1); // footboard
    const hood = part(r, new THREE.CylinderGeometry(0.62, 0.62, 1.0, 12, 1, true, -0.1, Math.PI * 0.62), blue, 0, 1.15, 0.45);
    hood.rotation.z = Math.PI / 2;
    for (const x of [-0.5, 0.5]) bar([x, 0.72, 0.75], [x, 1.5, 0.85], 0.012);
    const [wx, wz] = local(19.5, KERB - 0.85);
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.15, 0.9, 0.6).setTranslation(wx, 0.9, wz).setRotation(quat));
  }

  // keep the random tree planting out of this strip
  // railing openings between the white railing pieces in front of the stalls
  const openings = [];
  for (let a = 24.5; a < 49; a += 5.2) openings.push(Math.min(a + 4.1, 49.5) + 0.55);
  return {
    footprint: [[-51, KERB - 0.5], [51, KERB - 0.5], [51, WALL + 1], [-51, WALL + 1]].map(([x, z]) => local(x, z)),
    spots: {
      stalls,
      openings: openings.filter((x) => x < 49.5),
      shed: { x0: -6, x1: 3.2, counterFront: KERB + 0.9, counterBack: KERB + 1.7, counterTop: 0.84, kettle: [-4.8, 1.0, KERB + 1.3] },
      cart: [4.6, KERB - 0.9],
      rickshaw: [19.5, KERB - 0.85],
      gate: GATE,
      wall: WALL,
      kerb: KERB,
    },
  };
}
