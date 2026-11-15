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
  const bamboo = flat("#b59a5a", 0.7);
  const bambooGreen = flat("#2f8a3c", 0.55);
  const whitePaint = flat("#e9e7df", 0.6);
  const woodDark = flat("#5a4028", 0.85);
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
  const stoolRed = flat("#b8231f", 0.5);
  const stoolBlue = flat("#2456a8", 0.5);
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
  const stalls = []; // where the people of the stalls stand and sit (see people.js)
  function stall(x0, x1, i) {
    const zf = KERB + 0.9; // front posts
    const zb = WALL - 0.4;
    const mat = i % 3 === 1 ? tarpGrey : tarpCream;
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
      const drop = 0.55 + Math.sin(a * 1.7 + i) * 0.1;
      B.quad(mat, [[p0[0], p0[1] - drop, zf - 0.75], [p1[0], p1[1] - drop, zf - 0.75], p1, p0], [[p0[0], 0], [p1[0], 0], [p1[0], 1], [p0[0], 1]], [0, 0.4, -1]);
    }
    for (const [za, ya] of [[zf, hF], [zb, hB]]) B.box(bamboo, x0, x1, ya + 0.02, ya + 0.09, za - 0.035, za + 0.035); // ridge poles
    // back and side cloths
    B.quad(cloth, [[x0, 0, zb], [x1, 0, zb], [x1, hB, zb], [x0, hB, zb]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);
    if (i % 2 === 0) B.quad(cloth, [[x1, 0, zf + 0.6], [x1, 0, zb], [x1, hB - 0.2, zb], [x1, hF - 0.2, zf + 0.6]], [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 0, 0]);
    // counter with jars, a cooler box and a kettle on the stove
    const cx0 = x0 + 0.5;
    const cx1 = x0 + (x1 - x0) * 0.58;
    stalls.push({ open: x0 > 55, x0, x1, cx0, cx1, zf, zb, counterFront: zf + 0.25, counterBack: zf + 0.95, counterTop: 0.86, kettle: [cx0 + 0.3, 1.06, zf + 0.78], bench: { x0: cx1 + 0.4, x1: x1 - 0.4, z: zb - 0.775, y: 0.47 } });
    B.box(M.wood, cx0, cx1, 0.8, 0.86, zf + 0.25, zf + 0.95);
    B.box(woodDark, cx0 + 0.05, cx1 - 0.05, 0, 0.8, zf + 0.3, zf + 0.34);
    for (const x of [cx0 + 0.06, cx1 - 0.06]) B.box(woodDark, x - 0.04, x + 0.04, 0, 0.8, zf + 0.3, zf + 0.9);
    solid(cx0, cx1, 0, 0.86, zf + 0.25, zf + 0.95);
    // the payment QR code on its little stand, facing the customer
    B.box(qrMat, (cx0 + cx1) / 2 - 0.07, (cx0 + cx1) / 2 + 0.07, 0.86, 1.06, zf + 0.37, zf + 0.39);
    let jx = cx0 + 0.2;
    while (jx < cx1 - 0.9) {
      const m = jarMat[(rnd() * jarMat.length) | 0];
      B.cyl(m, jx, zf + 0.48, 0.085, 0.86, 1.1, 10, true);
      B.cyl(stoolRed, jx, zf + 0.48, 0.09, 1.1, 1.13, 10, true);
      jx += 0.24;
    }
    B.box(stoolRed, cx1 - 0.75, cx1 - 0.15, 0.86, 1.2, zf + 0.4, zf + 0.85); // cooler box
    B.box(whitePaint, cx1 - 0.77, cx1 - 0.13, 1.2, 1.25, zf + 0.38, zf + 0.87);
    B.cyl(flat("#9a9c9e", 0.35, { metalness: 0.8 }), cx0 + 0.3, zf + 0.78, 0.12, 0.86, 1.06, 10, true); // kettle
    // strings of snack packets hanging from the front pole
    for (let k = 0; k < 4; k++) {
      const px = cx0 + 0.25 + k * 0.42;
      B.quad(packetMat, [[px - 0.07, hF - 1.05, zf + 0.02], [px + 0.07, hF - 1.05, zf + 0.02], [px + 0.07, hF - 0.05, zf + 0.02], [px - 0.07, hF - 0.05, zf + 0.02]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);
    }
    // bench and plastic stools for customers
    B.box(woodDark, cx1 + 0.4, x1 - 0.4, 0.42, 0.47, zb - 0.95, zb - 0.6);
    for (const x of [cx1 + 0.55, x1 - 0.55]) B.box(woodDark, x - 0.04, x + 0.04, 0, 0.42, zb - 0.92, zb - 0.63);
    for (let k = 0; k < 3; k++) {
      const sx = cx1 + 0.5 + rnd() * (x1 - cx1 - 1);
      const sz = zf + 0.5 + rnd() * 1.2;
      B.cyl(k % 2 ? stoolBlue : stoolRed, sx, sz, 0.17, 0, 0.44, 8, true);
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
      B.box(whitePaint, a, b, 0.86, 0.93, zr - 0.035, zr + 0.035);
      B.box(whitePaint, a, b, 0.14, 0.2, zr - 0.03, zr + 0.03);
      for (let px = a + 0.05; px <= b; px += 0.26) B.box(whitePaint, px - 0.03, px + 0.03, 0, 0.92, zr - 0.02, zr + 0.02);
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
