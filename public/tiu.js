// The Techno India University complex on Street Number 2 (EM-4, Sector V), modelled part by part
// from street-level photographs (January 2026) and satellite views.
//
// What stands there, north to south along the street:
//   The tower   nine storeys of white plaster with a strip of blue-green curtain glass, a gridded
//               glass bay, and a bowed glass corner that carries the group's name on its cornice.
//               It sits on a two-storey podium clad in grey aluminium panels. Red sheet roof.
//   The main    a lower white block. Two-storey entrance portico under a bowed, stepped canopy on
//   block       leaning columns; colonnade to its south; ribbon windows above; a taller rear wing
//               with a glass face and pyramid roofs (blue sheet, and a white one); green terrace.
//   Around it   side and rear walls with their windows, sunshades, air-conditioner units, rain
//               pipes and weather stains; stair tower and curved steps at the south end; boundary
//               of brick-red pillars and blue grilles, gates, granite name wall, sign pylon.
//
// Coordinates here are the building's own: x runs along the street face (north end is +x),
// y is up, z points out of the entrance toward the road. Units are metres.
// Dimensions are estimates from the photographs, not survey measurements.
import * as THREE from "three";
import { Batch } from "/geom.js";
import { makeMaterials, picture, streakMaterial, seeded, setAnisotropy } from "/pbr.js";

const F = 3.7; // storey height
const XS = -45; // south end
const XJ = 22; // where the main block meets the tower
const XN = 44.2; // north end
const ZB = -30; // rear wall
const ZM = -14; // main block: front bar ends, rear wing begins
const Y_POD = 2 * F; // top of the tower's podium
const Y_FRONT = 4 * F; // roof of the main block's front bar
const Y_REAR = 6 * F; // roof of its rear wing
const Y_TOWER = 9 * F;
const PX = 12; // centre of the entrance portico along the face
const PORCH = { half: 10, depth: 9, height: 7.6, floor: 0.45 };
const FENCE_Z = 6.3;
const BOW = { cx: XN - 10, cz: -10, r: 10 }; // the glass corner: a quarter drum

export function buildTIU({ RAPIER, world, scene, renderer, mid, phi, places }) {
  setAnisotropy(renderer.capabilities.getMaxAnisotropy());
  const rnd = seeded(4242);
  const range = (a, b) => a + rnd() * (b - a);
  const M = makeMaterials();
  const streaks = streakMaterial();
  const G = new THREE.Group();
  G.position.set(mid[0], 0, mid[1]);
  G.rotation.y = phi;
  scene.add(G);
  const B = new Batch(G);
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const local = (x, z) => [mid[0] + x * cosP + z * sinP, mid[1] - x * sinP + z * cosP];
  const quat = { x: 0, y: Math.sin(phi / 2), z: 0, w: Math.cos(phi / 2) };
  // Something the player cannot walk through, by its extents.
  function solid(x0, x1, y0, y1, z0, z1) {
    const [wx, wz] = local((x0 + x1) / 2, (z0 + z1) / 2);
    world.createCollider(RAPIER.ColliderDesc.cuboid(Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2).setTranslation(wx, (y0 + y1) / 2, wz).setRotation(quat));
  }
  const offset = (mat, k = 2) => Object.assign(mat.clone(), { polygonOffset: true, polygonOffsetFactor: -k, polygonOffsetUnits: -k });

  // ---------- walls seen face-on ----------
  // A face has its own ruler: s along the wall (left to right as you look at it), y up, o out of it.
  function face(ox, oz, dir) {
    const map = {
      front: (s, o) => [ox + s, oz + o],
      north: (s, o) => [ox + o, oz - s],
      back: (s, o) => [ox - s, oz - o],
      south: (s, o) => [ox - o, oz + s],
    }[dir];
    const normal = { front: [0, 0, 1], north: [1, 0, 0], back: [0, 0, -1], south: [-1, 0, 0] }[dir];
    return {
      at: map,
      normal,
      box(mat, s0, s1, y0, y1, o0, o1, skip) {
        const a = map(s0, o0);
        const b = map(s1, o1);
        B.box(mat, a[0], b[0], y0, y1, a[1], b[1], skip);
      },
      quad(mat, s0, s1, y0, y1, o, uv) {
        const a = map(s0, o);
        const b = map(s1, o);
        B.quad(mat, [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], uv || [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], normal);
      },
      cyl(mat, s, o, r, y0, y1, sides = 8) {
        const p = map(s, o);
        B.cyl(mat, p[0], p[1], r, y0, y1, sides);
      },
    };
  }

  // ---------- parts fixed to walls ----------
  const fanFace = picture(128, 128, (g, w, h) => {
    g.fillStyle = "#deddd6";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1c1d1f";
    g.beginPath();
    g.arc(w * 0.42, h / 2, w * 0.36, 0, 7);
    g.fill();
    g.strokeStyle = "#8d8f90";
    g.lineWidth = 2;
    for (let r = 6; r < w * 0.36; r += 7) {
      g.beginPath();
      g.arc(w * 0.42, h / 2, r, 0, 7);
      g.stroke();
    }
    for (let a = 0; a < 6; a++) {
      g.beginPath();
      g.moveTo(w * 0.42, h / 2);
      g.lineTo(w * 0.42 + Math.cos(a * 1.047) * w * 0.36, h / 2 + Math.sin(a * 1.047) * w * 0.36);
      g.stroke();
    }
    g.fillStyle = "#b9b8b0";
    for (let y = 14; y < h - 10; y += 8) g.fillRect(w * 0.84, y, w * 0.12, 3);
  });
  const fanMat = new THREE.MeshStandardMaterial({ map: fanFace, roughness: 0.6 });
  // An air-conditioner's outdoor unit on brackets, with its pipe run back into the wall.
  function acUnit(f, s, y, wallO = 0) {
    f.box(M.acBody, s, s + 0.82, y, y + 0.56, wallO + 0.1, wallO + 0.42);
    f.quad(fanMat, s, s + 0.82, y, y + 0.56, wallO + 0.425, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    f.box(M.pipeDark, s + 0.05, s + 0.09, y - 0.06, y, wallO, wallO + 0.4);
    f.box(M.pipeDark, s + 0.73, s + 0.77, y - 0.06, y, wallO, wallO + 0.4);
    f.box(M.pipeDark, s + 0.86, s + 0.9, y + 0.2, y + 0.9 + rnd() * 1.2, wallO + 0.01, wallO + 0.05); // insulated pipe up the wall
    if (wallO === 0) stain(f, s - 0.05, s + 0.9, y, 1.1 + rnd()); // drip stain under the drain
  }
  function rainPipe(f, s, y0, y1, o = 0.09) {
    f.cyl(M.pvc, s, o, 0.055, y0, y1, 7);
    for (let y = y0 + 1.5; y < y1; y += 3) f.box(M.pipeDark, s - 0.08, s + 0.08, y, y + 0.04, 0, o + 0.07);
  }
  // Streaks under a ledge or sill.
  function stain(f, s0, s1, yTop, drop, o = 0.012) {
    const u = rnd();
    f.quad(streaks, s0, s1, yTop - drop, yTop, o, [[u, 0], [u + (s1 - s0) / 7, 0], [u + (s1 - s0) / 7, 1], [u, 1]]);
  }

  // A plastered wall with rows of windows: real openings with reveals, glass set back in
  // aluminium frames, a projecting sill, and a concrete sunshade over each.
  function windowWall(f, o) {
    const { s0, s1, y0, levels, fh = F, w = 1.5, h = 1.5, sill = 1.05, pitch = 3.3, margin = 1.4, wall = M.plaster, glass = M.glassDark, frame = M.aluminium, shade = true, ac = 0.3, thick = 0.3, skip } = o;
    const n = Math.max(0, Math.floor((s1 - s0 - 2 * margin - w) / pitch) + 1);
    const start = (s0 + s1) / 2 - ((n - 1) * pitch) / 2 - w / 2;
    for (let l = 0; l < levels; l++) {
      const yl = y0 + l * fh;
      const cols = [];
      for (let i = 0; i < n; i++) if (!skip || !skip(i, l, n)) cols.push(start + i * pitch);
      f.box(wall, s0, s1, yl, yl + sill, -thick, 0, "-y+y");
      f.box(wall, s0, s1, yl + sill + h, yl + fh, -thick, 0, "-y+y");
      let prev = s0;
      for (const c of [...cols, s1 + 1]) {
        const end = Math.min(c, s1);
        if (end > prev) f.box(wall, prev, end, yl + sill, yl + sill + h, -thick, 0);
        prev = c + w;
      }
      for (const c of cols) {
        const yb = yl + sill;
        f.quad(glass, c, c + w, yb, yb + h, -0.17);
        f.box(frame, c, c + w, yb, yb + 0.05, -0.2, -0.12);
        f.box(frame, c, c + w, yb + h - 0.05, yb + h, -0.2, -0.12);
        f.box(frame, c, c + 0.05, yb, yb + h, -0.2, -0.12);
        f.box(frame, c + w - 0.05, c + w, yb, yb + h, -0.2, -0.12);
        f.box(frame, c + w / 2 - 0.025, c + w / 2 + 0.025, yb, yb + h, -0.2, -0.13);
        f.box(wall, c - 0.06, c + w + 0.06, yb - 0.08, yb, -0.05, 0.08); // sill
        stain(f, c - 0.05, c + w + 0.05, yb - 0.08, 0.9 + rnd() * 0.9);
        if (shade) f.box(wall, c - 0.2, c + w + 0.2, yb + h + 0.1, yb + h + 0.19, 0, 0.5);
        if (rnd() < ac) acUnit(f, c + w + 0.15, yb - 0.1);
      }
    }
    stain(f, s0, s1, y0 + levels * fh, 1.2 + rnd() * 0.8);
  }

  // Curtain wall: glass in an aluminium grid.
  function curtain(f, { s0, s1, y0, y1, pw = 1.2, ph = 1.23, o = -0.05, glass = M.glass, mull = M.aluminium, cap = 0.09 }) {
    f.quad(glass, s0, s1, y0, y1, o);
    const nx = Math.max(1, Math.round((s1 - s0) / pw));
    for (let i = 0; i <= nx; i++) {
      const s = s0 + ((s1 - s0) * i) / nx;
      f.box(mull, s - 0.03, s + 0.03, y0, y1, o, o + cap);
    }
    const ny = Math.max(1, Math.round((y1 - y0) / ph));
    for (let j = 0; j <= ny; j++) {
      const y = y0 + ((y1 - y0) * j) / ny;
      f.box(mull, s0, s1, y - 0.025, y + 0.025, o, o + cap * 0.75);
    }
  }
  // A flat roof with its parapet wall and coping, and stains running down the inside.
  function parapetRoof(x0, x1, z0, z1, y, { mat = M.roofSlab, h = 1.1, sides = "nsew" } = {}) {
    B.box(mat, x0, x1, y - 0.25, y, z0, z1, "-y");
    const t = 0.22;
    const wall = (a0, a1, b0, b1) => {
      B.box(M.plaster, a0, a1, y, y + h, b0, b1, "-y");
      B.box(M.plasterGrey, a0 - 0.05, a1 + 0.05, y + h, y + h + 0.08, b0 - 0.05, b1 + 0.05);
    };
    if (sides.includes("e")) wall(x0, x1, z1 - t, z1);
    if (sides.includes("w")) wall(x0, x1, z0, z0 + t);
    if (sides.includes("n")) wall(x1 - t, x1, z0, z1);
    if (sides.includes("s")) wall(x0, x0 + t, z0, z1);
  }
  function waterTank(x, z, y, r = 0.85, h = 1.5) {
    B.box(M.concrete, x - r - 0.1, x + r + 0.1, y, y + 0.35, z - r - 0.1, z + r + 0.1);
    B.cyl(M.tank, x, z, r, y + 0.35, y + 0.35 + h, 16, true);
    for (let k = 1; k < 4; k++) B.cyl(M.tank, x, z, r + 0.025, y + 0.35 + (h * k) / 4 - 0.03, y + 0.35 + (h * k) / 4 + 0.03, 16);
    B.cyl(M.tank, x, z, 0.28, y + 0.35 + h, y + 0.45 + h, 10, true);
  }
  const signs = [];
  function board(tex, w, h, x, y, z, yaw = 0, { emissive = 0, rough = 0.6 } = {}) {
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: rough, transparent: false });
    if (emissive) Object.assign(mat, { emissive: new THREE.Color("#ffffff"), emissiveMap: tex, emissiveIntensity: emissive });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.receiveShadow = true;
    G.add(m);
    signs.push(m);
    return m;
  }
  const logoTex = new THREE.TextureLoader().load("/logo.png");
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const logoMat = new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.5 });
  function logoDisc(r, x, y, z, yaw = 0) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), logoMat);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    G.add(m);
    return m;
  }
  const lettering = (text, w, h, { color = "#c79a1e", bg = "#e9e6dd", font = "700", shadow = "#3a2c08" } = {}) =>
    picture(Math.round((256 * w) / h), 256, (g, cw, ch) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, cw, ch);
      let size = ch * 0.56;
      g.font = `${font} ${size}px Arial, Helvetica, sans-serif`;
      const width = g.measureText(text).width;
      if (width > cw * 0.92) size *= (cw * 0.92) / width;
      g.font = `${font} ${size}px Arial, Helvetica, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      if (shadow) {
        g.fillStyle = shadow;
        g.fillText(text, cw / 2 + size * 0.04, ch / 2 + size * 0.07);
      }
      g.fillStyle = color;
      g.fillText(text, cw / 2, ch / 2 + size * 0.03);
    });

  const front = face(0, 0, "front");
  const north = face(XN, 0, "north"); // s runs from the street corner toward the back
  const back = face(XN, ZB, "back"); // s runs from the north corner toward the south
  const south = face(XS, ZB, "south"); // s runs from the back corner toward the street

  // =====================================================================================
  // THE TOWER (x 22 .. 44.2)
  // =====================================================================================
  {
    const x0 = XJ;
    const yTop = Y_TOWER;
    // ---- podium: ground floor bays under a band of grey aluminium panels ----
    const bayW = 4.44;
    for (let i = 0; i < 5; i++) {
      const bx = x0 + i * bayW;
      B.box(M.plasterGrey, bx, bx + 0.55, 0, 3.9, -0.4, 0.5); // piers faced in grey
      const a = bx + 0.55;
      const b = bx + bayW;
      if (i < 3) {
        B.box(M.plaster, a, b, 0, 3.9, -1.5, -1.2);
        // admission hoardings hung in the bays
        const hues = [262, 350, 8][i];
        const poster = picture(512, 384, (g, w, h) => {
          const grad = g.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, `hsl(${hues},60%,34%)`);
          grad.addColorStop(1, `hsl(${hues + 24},65%,22%)`);
          g.fillStyle = grad;
          g.fillRect(0, 0, w, h);
          g.fillStyle = "rgba(255,255,255,0.12)";
          for (let k = 0; k < 6; k++) g.fillRect(30 + k * 78, 150, 64, 150);
          g.fillStyle = "#fff";
          g.font = "700 40px Arial";
          g.fillText("TECHNO INDIA UNIVERSITY", 24, 62);
          g.font = "600 30px Arial";
          g.fillStyle = "#ffd24a";
          g.fillText(["ADMISSIONS OPEN", "B.TECH  ·  BBA  ·  BCA", "SCHOOL OF THE FUTURE"][i], 24, 112);
          g.fillStyle = "rgba(255,255,255,.85)";
          g.font = "22px Arial";
          g.fillText("EM-4, Sector V, Salt Lake, Kolkata", 24, 350);
        });
        board(poster, 3.3, 2.5, (a + b) / 2, 2.05, -1.18, 0, { rough: 0.5 });
      } else {
        front.quad(M.glassShop, a, b, 0.5, 3.9, -1.2);
        B.box(M.plasterGrey, a, b, 0, 0.5, -1.25, -1.15);
        for (let k = 0; k <= 3; k++) B.box(M.frameDark, a + ((b - a) * k) / 3 - 0.03, a + ((b - a) * k) / 3 + 0.03, 0.5, 3.9, -1.2, -1.12);
        B.box(M.frameDark, a, b, 2.9, 2.96, -1.2, -1.12);
      }
      B.box(M.stoneFloor, a, b, 0, 0.05, -1.2, 0.3, "-y"); // stone threshold in each bay
    }
    B.box(M.plasterGrey, XN - 0.55, XN, 0, 3.9, -0.4, 0.5);
    B.box(M.plaster, x0, XN, 3.6, 3.9, -1.5, 0.5, "+y"); // soffit over the bays
    // the panel band, standing proud of the wall, wrapping the north corner
    B.box(M.acp, x0, XN + 0.5, 3.9, Y_POD, -0.3, 0.5, "-y");
    B.box(M.acp, XN, XN + 0.5, 3.9, Y_POD, -13, -0.3, "-y");
    B.box(M.plasterGrey, x0, XN + 0.55, Y_POD, Y_POD + 0.1, -13, 0.55);
    B.box(M.plasterGrey, XN - 0.3, XN, 0, 3.9, -1.5, -0.4);
    solid(x0, XN, 0, Y_POD, -1.5, -1.2); // shopfront line
    for (let i = 0; i <= 5; i++) solid(x0 + i * bayW - (i === 5 ? 0.55 : 0), x0 + i * bayW + (i === 5 ? 0 : 0.55), 0, 3.9, -1.2, 0.5);

    // the square sign at the south end of the podium
    {
      const t = picture(512, 512, (g, w, h) => {
        g.fillStyle = "#f4f3ee";
        g.fillRect(0, 0, w, h);
        // the group's red block mark
        g.fillStyle = "#b3141a";
        g.fillRect(176, 60, 160, 150);
        g.fillStyle = "#f4f3ee";
        for (const [x, y] of [[196, 120], [256, 120], [316, 120], [226, 165], [286, 165]]) {
          g.beginPath();
          g.arc(x, y, 17, 0, 7);
          g.fill();
        }
        g.fillRect(176, 84, 160, 10);
        g.fillStyle = "#16181b";
        g.font = "800 84px Arial";
        g.textAlign = "center";
        g.fillText("TECHNO", w / 2, 330);
        g.font = "700 56px Arial";
        g.fillText("INDIA GROUP", w / 2, 410);
      });
      B.box(M.frameWhite, x0 + 0.3, x0 + 3.5, 4.1, 7.2, 0.5, 0.62);
      board(t, 3.1, 3.0, x0 + 1.9, 5.65, 0.63, 0, { emissive: 0.12 });
    }

    // ---- floor above the podium: dark windows in deep white surrounds ----
    B.box(M.plaster, x0, 24, Y_POD, 3 * F, -0.3, 0);
    {
      const y0 = Y_POD;
      const y1 = 3 * F;
      const wins = [27.9, 30.5, 33.1];
      B.box(M.plaster, 27.5, 36, y0, y0 + 0.9, -0.3, 0);
      B.box(M.plaster, 27.5, 36, y1 - 0.75, y1, -0.3, 0);
      let p = 27.5;
      for (const wx of [...wins, 99]) {
        B.box(M.plaster, p, Math.min(wx, 36), y0 + 0.9, y1 - 0.75, -0.3, 0);
        p = wx + 2.0;
      }
      for (const wx of wins) {
        front.quad(M.glassShop, wx, wx + 2.0, y0 + 0.9, y1 - 0.75, -0.2);
        B.box(M.frameDark, wx + 0.97, wx + 1.03, y0 + 0.9, y1 - 0.75, -0.22, -0.14);
        B.box(M.frameDark, wx, wx + 2, y0 + 2.2, y0 + 2.26, -0.22, -0.14);
        // surround: a concrete frame standing 35 cm proud
        B.box(M.plaster, wx - 0.22, wx, y0 + 0.75, y1 - 0.6, 0, 0.35);
        B.box(M.plaster, wx + 2, wx + 2.22, y0 + 0.75, y1 - 0.6, 0, 0.35);
        B.box(M.plaster, wx - 0.22, wx + 2.22, y1 - 0.75, y1 - 0.6, 0, 0.35);
        B.box(M.plaster, wx - 0.22, wx + 2.22, y0 + 0.75, y0 + 0.9, 0, 0.35);
        stain(front, wx - 0.2, wx + 2.2, y0 + 0.75, 0.7);
      }
      // air-conditioner units lined up on the podium ledge, as in the photographs
      for (const [s, y] of [[30.1, Y_POD + 0.12], [31.2, Y_POD + 0.12], [32.3, Y_POD + 0.12], [31.0, 3 * F + 0.3], [32.0, 3 * F + 0.3]]) acUnit(front, s, y);
    }

    // ---- the shaft: strip of curtain glass, gridded bay, plain bay with small windows ----
    B.box(M.plaster, x0, 24, 3 * F, yTop, -0.3, 0); // corner pier
    curtain(front, { s0: 24, s1: 27.6, y0: Y_POD, y1: yTop - 0.4 });
    B.box(M.plaster, 24, 27.6, yTop - 0.4, yTop, -0.3, 0);
    B.box(M.plaster, 27.6, 28.1, 3 * F, yTop, -0.3, 0.12); // fin between strip and grid
    // gridded bay: glass rows between white spandrel panels, as a chequer of glass and solid
    for (let l = 3; l < 9; l++) {
      const y = l * F;
      curtain(front, { s0: 28.1, s1: 32.0, y0: y + 1.2, y1: y + F, pw: 1.3, ph: 1.25 });
      B.box(M.frameWhite, 28.1, 32.0, y, y + 1.2, -0.3, 0.02);
      if (l % 2) B.box(M.frameWhite, 29.4, 30.7, y + 1.2, y + F, -0.3, 0.0); // solid panel in alternate rows
      stain(front, 28.1, 32, y + 1.2, 0.45, 0.03);
    }
    // plain bay: one small square window to each floor
    windowWall(front, { s0: 32.0, s1: BOW.cx, y0: 3 * F, levels: 6, w: 0.85, h: 0.85, sill: 1.5, margin: 0.4, pitch: 9, shade: false, ac: 0 });

    // ---- the bowed glass corner ----
    {
      const { cx, cz, r } = BOW;
      const a0 = 0;
      const a1 = Math.PI / 2;
      // lower drum over the podium: wider, white bands above and below a ring of glass
      const rd = r + 1.1;
      B.arc(M.plaster, cx, cz, rd, a0, a1, Y_POD, Y_POD + 0.75);
      B.arc(M.glass, cx, cz, rd - 0.12, a0, a1, Y_POD + 0.75, 3 * F - 0.55);
      B.arc(M.plaster, cx, cz, rd, a0, a1, 3 * F - 0.55, 3 * F + 0.35);
      B.ring(M.plasterGrey, cx, cz, r - 0.2, rd, a0, a1, 3 * F + 0.35, true);
      B.ring(M.plaster, cx, cz, rd - 0.12, rd, a0, a1, Y_POD + 0.75, true);
      B.ring(M.plaster, cx, cz, rd - 0.12, rd, a0, a1, 3 * F - 0.55, false);
      // flat returns where the drum meets the two walls
      B.box(M.plaster, cx - 0.3, cx, Y_POD, 3 * F + 0.35, 0, rd - r);
      B.box(M.plaster, XN, XN + rd - r, Y_POD, 3 * F + 0.35, cz - 0.3, cz);
      B.ring(M.plaster, cx, cz, r - 0.6, rd, a0, a1, Y_POD + 0.001, false);
      // the tall glass quarter-drum
      B.arc(M.glass, cx, cz, r, a0, a1, 3 * F + 0.35, yTop);
      const nV = 13;
      for (let i = 0; i <= nV; i++) {
        const a = a0 + ((a1 - a0) * i) / nV;
        const m = new THREE.Matrix4().makeRotationY(a).setPosition(cx + (r + 0.04) * Math.sin(a), (3 * F + 0.35 + yTop) / 2, cz + (r + 0.04) * Math.cos(a));
        B.obox(M.aluminium, m, 0.06, yTop - 3 * F - 0.35, 0.1);
        if (i < nV) {
          const am = a + (a1 - a0) / nV / 2;
          const md = new THREE.Matrix4().makeRotationY(am).setPosition(cx + (rd - 0.08) * Math.sin(am), (Y_POD + 0.75 + 3 * F - 0.55) / 2, cz + (rd - 0.08) * Math.cos(am));
          B.obox(M.aluminium, md, 0.06, 3 * F - 0.55 - Y_POD - 0.75, 0.1);
        }
      }
      for (let y = 3 * F + 0.35 + 1.23; y < yTop - 0.3; y += 1.23) B.arc(M.aluminium, cx, cz, r + 0.07, a0, a1, y - 0.025, y + 0.025);
      for (let l = 4; l < 9; l++) B.arc(M.frameWhite, cx, cz, r + 0.08, a0, a1, l * F - 0.16, l * F + 0.16); // slab edges show as white lines
      // cornice with the group's name, and the logo standing above it
      const rc = r + 0.35;
      B.arc(M.plaster, cx, cz, rc, a0, a1, yTop, yTop + 2.3);
      B.arc(M.plaster, cx, cz, rc + 0.18, a0, a1, yTop + 2.3, yTop + 2.55);
      B.ring(M.plasterGrey, cx, cz, 0, rc + 0.18, a0, a1, yTop + 2.55, true);
      B.ring(M.plaster, cx, cz, r, rc + 0.18, a0, a1, yTop, false);
      B.box(M.plaster, cx - 0.25, cx, yTop, yTop + 2.55, cz, cz + rc + 0.18);
      B.box(M.plaster, cx, cx + rc + 0.18, yTop, yTop + 2.55, cz - 0.25, cz);
      const arcLen = (rc + 0.02) * (a1 - a0) * 0.7;
      const nameTex = lettering("TECHNO INDIA GROUP", arcLen, 1.5, { color: "#8f1418", shadow: null });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(rc + 0.02, rc + 0.02, 1.5, 40, 1, true, a0 + (a1 - a0) * 0.15, (a1 - a0) * 0.7), new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.8 }));
      band.position.set(cx, yTop + 1.2, cz);
      G.add(band);
      const am = Math.PI / 4;
      B.cyl(M.frameDark, cx + (rc - 0.3) * Math.sin(am), cz + (rc - 0.3) * Math.cos(am), 0.06, yTop + 2.55, yTop + 3.4, 6);
      logoDisc(1.25, cx + (rc - 0.26) * Math.sin(am), yTop + 4.3, cz + (rc - 0.26) * Math.cos(am), am);
      logoDisc(1.25, cx + (rc - 0.3) * Math.sin(am), yTop + 4.3, cz + (rc - 0.3) * Math.cos(am), am + Math.PI);
      B.arc(streaks, cx, cz, rd + 0.012, a0, a1, Y_POD, Y_POD + 0.75, { segs: 14, uScale: 1 / 7, vFit: true });
      B.arc(streaks, cx, cz, rc + 0.012, a0, a1, yTop + 0.9, yTop + 2.3, { segs: 14, uScale: 1 / 7, vFit: true });
    }
    // collision for the corner (two boxes approximate the quarter drum)
    solid(BOW.cx, XN - 2.6, 0, yTop, BOW.cz, -1.3);
    solid(BOW.cx, XN, 0, yTop, BOW.cz, -5.2);
    solid(BOW.cx - 12, BOW.cx, Y_POD, yTop, ZB, 0);

    // ---- north side ----
    // behind the bow: plaster wall, podium band for the first stretch, a stair core glazed full height
    north.box(M.plasterGrey, 0, 10, 0, 3.9, -0.3, 0);
    north.quad(M.glassShop, 2.2, 8.2, 0.9, 3.0, 0.01);
    for (let k = 0; k <= 4; k++) north.box(M.frameDark, 2.2 + k * 1.5 - 0.03, 2.2 + k * 1.5 + 0.03, 0.9, 3.0, 0, 0.06);
    north.box(M.frameDark, 2.2, 8.2, 0.86, 0.9, 0, 0.07);
    north.box(M.frameDark, 2.2, 8.2, 3.0, 3.04, 0, 0.07);
    solid(XN - 0.3, XN, 0, Y_POD, BOW.cz, 0.5);
    north.box(M.plaster, 10, 30, 0, 3.9, -0.3, 0);
    north.box(M.plaster, 13, 30, 3.9, Y_POD, -0.3, 0);
    north.box(M.plasterGrey, 10, 30, 0, 0.6, 0, 0.06); // plinth band
    windowWall(north, { s0: 10, s1: 15.6, y0: Y_POD, levels: 7, pitch: 2.9, margin: 1.2, w: 1.4, h: 1.5 });
    curtain(north, { s0: 15.6, s1: 18.4, y0: 1.1, y1: yTop - 0.5, pw: 0.93, glass: M.glassDark });
    north.box(M.plaster, 15.6, 18.4, 0, 1.1, -0.3, 0);
    north.box(M.plaster, 15.6, 18.4, yTop - 0.5, yTop, -0.3, 0);
    north.box(M.plaster, 15.35, 15.6, 0, yTop, -0.3, 0.25); // fins either side of the stair glass
    north.box(M.plaster, 18.4, 18.65, 0, yTop, -0.3, 0.25);
    windowWall(north, { s0: 18.65, s1: 30, y0: Y_POD, levels: 7, pitch: 3.2, w: 1.5, h: 1.5, ac: 0.45 });
    // service door and a meter box at ground level
    north.box(M.frameDark, 22, 23.1, 0, 2.15, 0, 0.05);
    north.box(M.plaster, 21.7, 23.4, 2.3, 2.42, 0, 0.7);
    north.box(M.acBody, 25, 26.1, 0.9, 2.0, 0, 0.28);
    rainPipe(north, 10.6, 0, yTop);
    rainPipe(north, 29.4, 0, yTop);
    solid(XN - 0.3, XN, 0, yTop, ZB, BOW.cz);

    // ---- rear ----
    back.box(M.plaster, 0, XN - XJ, 0, Y_POD, -0.3, 0);
    back.box(M.plasterGrey, 0, XN - XJ, 0, 0.6, 0, 0.06);
    windowWall(back, { s0: 0, s1: XN - XJ, y0: Y_POD, levels: 7, pitch: 3.1, w: 1.5, h: 1.5, ac: 0.5 });
    for (const s of [3.2, 9.4, 15.6]) {
      back.quad(M.glassDark, s, s + 1.6, 1.0, 2.6, 0.01);
      back.box(M.aluminium, s - 0.04, s + 1.64, 0.96, 1.0, 0, 0.06);
      back.box(M.aluminium, s - 0.04, s + 1.64, 2.6, 2.64, 0, 0.06);
      back.box(M.aluminium, s + 0.78, s + 0.82, 1.0, 2.6, 0, 0.05);
      // window grilles, as on every ground-floor window here
      for (let k = 0; k < 9; k++) back.box(M.frameDark, s + 0.18 * k + 0.08, s + 0.18 * k + 0.1, 1.0, 2.6, 0.06, 0.08);
    }
    back.box(M.frameDark, 19, 20.6, 0, 2.3, 0, 0.05); // rear door
    back.box(M.plaster, 18.7, 20.9, 2.45, 2.57, 0, 0.9);
    rainPipe(back, 0.5, 0, yTop);
    rainPipe(back, 11, 0, yTop);
    rainPipe(back, XN - XJ - 0.5, 0, yTop);
    solid(XJ, XN, 0, yTop, ZB, ZB + 0.3);

    // ---- the south flank above the main block's roofs ----
    {
      const f = face(XJ, ZB, "south");
      windowWall(f, { s0: 0, s1: 16, y0: Y_REAR, levels: 3, pitch: 3.6, w: 1.5, h: 1.5, ac: 0.4 });
      windowWall(f, { s0: 16, s1: 30, y0: Y_FRONT, levels: 5, pitch: 3.6, w: 1.5, h: 1.5, ac: 0.4 });
      rainPipe(f, 15.7, Y_FRONT, yTop);
    }

    // ---- roof: parapet, red sheet roof, tanks, lift room, mast ----
    B.box(M.plaster, x0, BOW.cx, yTop, yTop + 1.2, -0.25, 0);
    B.box(M.plasterGrey, x0 - 0.05, BOW.cx, yTop + 1.2, yTop + 1.28, -0.3, 0.05);
    B.box(M.roofSlab, x0, XN, yTop - 0.25, yTop, ZB, BOW.cz, "-y");
    B.box(M.roofSlab, x0, BOW.cx, yTop - 0.25, yTop, BOW.cz, 0, "-y");
    for (const [a, b, c, d] of [[x0, XN, ZB, ZB + 0.22], [XN - 0.22, XN, ZB, BOW.cz], [x0, x0 + 0.22, ZB, 0]]) {
      B.box(M.plaster, a, b, yTop, yTop + 1.2, c, d, "-y");
      B.box(M.plasterGrey, a - 0.05, b + 0.05, yTop + 1.2, yTop + 1.28, c - 0.05, d + 0.05);
    }
    B.box(M.plaster, x0 + 1.5, XN - 1.5, yTop, yTop + 0.6, ZB + 1.5, BOW.cz - 1.1, "-y"); // upstands under the roof sheets
    B.box(M.plaster, x0 + 1.5, BOW.cx - 1.1, yTop, yTop + 0.6, BOW.cz - 1.1, -1.6, "-y");
    B.hip(M.roofRed, x0 + 1.2, XN - 1.2, ZB + 1.2, BOW.cz - 0.8, yTop + 0.6, 3.6);
    B.hip(M.roofRed, x0 + 1.2, BOW.cx - 0.8, BOW.cz - 0.8, -1.3, yTop + 0.6, 2.6);
    B.box(M.plaster, 25, 30, yTop + 0.6, yTop + 4.6, ZB + 2, ZB + 7); // lift machine room rises through the roof
    B.box(M.plasterGrey, 24.85, 30.15, yTop + 4.6, yTop + 4.75, ZB + 1.85, ZB + 7.15);
    waterTank(27.5, ZB + 4.5, yTop + 4.75, 1.0, 1.7);
    B.cyl(M.aluminium, 29.3, ZB + 2.6, 0.05, yTop + 4.75, yTop + 10.5, 6); // mast
    for (let k = 0; k < 3; k++) B.box(M.frameWhite, 29.1, 29.5, yTop + 8.2 + k * 0.7, yTop + 8.65 + k * 0.7, ZB + 2.45 + (k - 1) * 0.12, ZB + 2.6 + (k - 1) * 0.12);
  }

  // =====================================================================================
  // THE MAIN BLOCK (x -45 .. 22)
  // =====================================================================================
  const px0 = PX - PORCH.half;
  const px1 = PX + PORCH.half;
  {
    // ---- colonnade south of the portico: columns on the building line, shopfront set back ----
    const ARC = 2.4; // depth of the walkway behind the columns
    const yCeil = 7.0;
    B.box(M.stoneFloor, XS, px0, 0, 0.3, -ARC, 0.35, "-y");
    B.box(M.stoneFloor, XS, px0, 0, 0.15, 0.35, 0.7, "-y");
    solid(XS, px0, -0.3, 0.3, -ARC, 0.35);
    solid(XS, px0, -0.3, 0.15, 0.35, 0.7);
    B.box(M.plaster, XS, px0, yCeil, 7.4, -ARC, 0, "+y");
    const cols = [];
    for (let x = XS + 0.4; x < px0 - 2; x += 5.2) cols.push(x);
    for (const x of cols) {
      B.box(M.plaster, x, x + 0.7, 0.3, yCeil, -0.7, 0);
      B.box(M.plasterGrey, x - 0.06, x + 0.76, 0.3, 0.75, -0.76, 0.06); // base
      B.box(M.plaster, x - 0.08, x + 0.78, yCeil - 0.3, yCeil, -0.78, 0.08); // capital
      solid(x, x + 0.7, 0, yCeil, -0.7, 0);
    }
    // shopfront: dark glass in aluminium frames with doors, signboard band above, windows over
    const sf = face(0, -ARC, "front");
    sf.quad(M.glassShop, XS, px0, 0.75, 3.3, 0);
    B.box(M.plasterGrey, XS, px0, 0.3, 0.75, -ARC - 0.2, -ARC + 0.04);
    for (let x = XS; x <= px0; x += 1.3) B.box(M.aluminium, x - 0.03, x + 0.03, 0.75, 3.3, -ARC, -ARC + 0.07);
    B.box(M.aluminium, XS, px0, 2.55, 2.61, -ARC, -ARC + 0.07);
    B.box(M.aluminium, XS, px0, 3.27, 3.33, -ARC, -ARC + 0.07);
    for (const x of [-37.2, -21.6, -6.0]) {
      // double doors with long steel pulls
      B.box(M.frameDark, x, x + 2.6, 0.3, 0.42, -ARC - 0.02, -ARC + 0.09);
      B.box(M.aluminium, x + 1.28, x + 1.32, 0.42, 2.55, -ARC, -ARC + 0.09);
      B.box(M.aluminium, x + 1.05, x + 1.09, 1.0, 1.9, -ARC + 0.09, -ARC + 0.15);
      B.box(M.aluminium, x + 1.51, x + 1.55, 1.0, 1.9, -ARC + 0.09, -ARC + 0.15);
    }
    B.box(M.plaster, XS, px0, 3.3, 3.9, -ARC - 0.3, -ARC);
    windowWall(sf, { s0: XS, s1: px0, y0: 3.9, levels: 1, fh: 3.1, sill: 0.6, w: 2.6, h: 1.7, pitch: 5.2, margin: 1.6, shade: false, ac: 0, glass: M.glass });
    solid(XS, px0, 0, yCeil, -ARC - 0.3, -ARC);
    // hanging lights along the walkway
    for (const x of cols) {
      B.cyl(M.frameDark, x + 2.9, -ARC / 2, 0.015, yCeil - 0.6, yCeil, 5);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: "#fff7df", emissive: "#ffe9b0", emissiveIntensity: 0.6, roughness: 0.4 }));
      lamp.position.set(x + 2.9, yCeil - 0.7, -ARC / 2);
      G.add(lamp);
    }

    // ---- the entablature: one stepped white band along the whole front, bowing out over the entrance ----
    const yE = 7.0;
    const band = (x0, x1) => {
      B.box(M.plaster, x0, x1, yE, yE + 0.5, 0, 0.45);
      B.box(M.plaster, x0, x1, yE + 0.5, yE + 0.95, 0, 0.7);
      B.box(M.plaster, x0, x1, yE + 0.95, yE + 1.4, 0, 0.95);
      B.box(M.plasterGrey, x0, x1, yE + 1.4, yE + 1.48, -0.1, 1.0);
      stain(face(0, 0.95, "front"), x0, x1, yE + 1.4, 0.45);
    };
    band(XS, px0);
    // canopy: part of a circle 26 m in radius, so it stands 2.3 m further out at the middle
    const R = 26;
    const cz = 3.0 - R;
    const half = Math.asin(PORCH.half / R);
    for (const [dr, y0, y1] of [[0, yE, yE + 0.5], [0.25, yE + 0.5, yE + 0.95], [0.5, yE + 0.95, yE + 1.4]]) {
      B.arc(M.plaster, PX, cz, R + dr, -half, half, y0, y1, { segs: 20 });
      B.ring(M.plaster, PX, cz, R + dr - 0.3, R + dr, -half, half, y0, false, 20);
    }
    B.arc(M.plaster, PX, cz, R - 0.3, -half, half, yE, 7.56, { segs: 20, inside: true }); // back of the fascia, seen from the porch
    B.ring(M.plaster, PX, cz, R - 3.4, R - 0.29, -half, half, 7.55, false, 20); // soffit
    B.ring(M.plasterGrey, PX, cz, R - 3.2, R + 0.55, -half, half, yE + 1.48, true, 20);
    B.arc(M.plasterGrey, PX, cz, R + 0.55, -half, half, yE + 1.4, yE + 1.48, { segs: 20 });
    // its ends return to the wall
    for (const sx of [-1, 1]) {
      const ex = PX + sx * PORCH.half;
      const ez = cz + R * Math.cos(half);
      B.box(M.plaster, ex - 0.25, ex + 0.25, yE, yE + 1.4, 0, ez + 0.5);
    }
    {
      // dirty streaks down the canopy's face
      const u = rnd();
      B.arc(streaks, PX, cz, R + 0.512, -half, half, yE + 0.55, yE + 1.4, { segs: 20, u0: u, uScale: 1 / 7, vFit: true });
    }

    // ---- upper floors of the front bar: ribbon windows between white bands ----
    for (let l = 0; l < 2; l++) {
      const y = 2 * F + 1.08 + l * 3.16; // sits on the entablature
      const yb = l === 0 ? yE + 1.48 : y;
      B.box(M.plaster, XS, XJ, yb, y + 1.0, -0.3, 0);
      B.box(M.plaster, XS, XJ, y + 0.92, y + 1.0, 0, 0.1); // sill line
      curtain(front, { s0: XS, s1: XJ, y0: y + 1.0, y1: y + 2.85, pw: 1.3, ph: 1.85, o: -0.14 });
      for (let x = XS; x < XJ - 1; x += 5.2) B.box(M.plaster, x, x + 0.6, y + 1.0, y + 2.85, -0.3, 0.04); // piers
      B.box(M.plaster, XJ - 0.6, XJ, y + 1.0, y + 2.85, -0.3, 0.04);
      B.box(M.plaster, XS, XJ, y + 2.85, y + 3.16, -0.3, 0.0);
      stain(front, XS, XJ, y + 0.92, 0.8);
      for (let k = 0; k < 5; k++) acUnit(front, XS + 4 + k * 13.5 + rnd() * 2, y + 0.2);
    }
    B.box(M.plaster, XS, XJ, 2 * F + 1.08 + 6.32, Y_FRONT + 1.1, -0.3, 0); // parapet over the top band
    B.box(M.plasterGrey, XS - 0.05, XJ, Y_FRONT + 1.1, Y_FRONT + 1.18, -0.36, 0.06);
    stain(front, XS, XJ, Y_FRONT + 1.1, 1.3);
    solid(XS, px0, yCeil, Y_FRONT, ZM, 0);

    // ---- roof terraces of the front bar ----
    B.box(M.roofSlab, XS, XJ, Y_FRONT - 0.25, Y_FRONT, ZM, -0.3, "-y");
    B.box(offset(M.turf), XS + 0.5, -10, Y_FRONT, Y_FRONT + 0.03, ZM + 0.4, -0.8, "-y"); // the green terrace
    B.box(M.plaster, XS, XS + 0.22, Y_FRONT, Y_FRONT + 1.1, ZM, 0, "-y");
    B.box(M.plasterGrey, XS - 0.05, XS + 0.27, Y_FRONT + 1.1, Y_FRONT + 1.18, ZM, 0.05);
    // steel pergolas over the northern terraces (the gridded roofs in the satellite view)
    for (const [a, b] of [[-7, 4], [7, 20]]) {
      for (const x of [a, b]) for (const z of [ZM + 0.8, -1.2]) B.box(M.frameWhite, x - 0.06, x + 0.06, Y_FRONT, Y_FRONT + 2.7, z - 0.06, z + 0.06);
      B.box(M.frameWhite, a, b, Y_FRONT + 2.7, Y_FRONT + 2.82, ZM + 0.74, ZM + 0.86);
      B.box(M.frameWhite, a, b, Y_FRONT + 2.7, Y_FRONT + 2.82, -1.26, -1.14);
      for (let x = a; x <= b + 0.01; x += 0.9) B.box(M.frameWhite, x - 0.03, x + 0.03, Y_FRONT + 2.82, Y_FRONT + 2.9, ZM + 0.6, -1.0);
    }
    for (let k = 0; k < 7; k++) {
      // planters along the terrace edge
      const x = -42 + k * 4.6;
      B.box(M.plasterCream, x, x + 1.4, Y_FRONT, Y_FRONT + 0.5, -1.5, -0.9);
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: "#3e6f34", roughness: 1 }));
      bush.position.set(x + 0.7, Y_FRONT + 0.85, -1.2);
      bush.scale.set(1.3, 0.8, 0.7);
      bush.castShadow = true;
      G.add(bush);
    }

    // ---- rear wing: two more floors with a glass face to the street, pyramid roofs ----
    const rw = face(0, ZM, "front");
    for (let l = 4; l < 6; l++) {
      const y = l * F;
      B.box(M.plaster, XS, XJ, y, y + 0.95, ZM - 0.3, ZM);
      curtain(rw, { s0: XS, s1: XJ, y0: y + 0.95, y1: y + F - 0.35, pw: 1.3, ph: 1.2, o: -0.1 });
      B.box(M.plaster, XS, XJ, y + F - 0.35, y + F, ZM - 0.3, ZM);
      for (let x = XS; x < XJ - 1; x += 7.8) B.box(M.plaster, x, x + 0.5, y + 0.95, y + F - 0.35, ZM - 0.3, ZM + 0.06);
    }
    stain(rw, XS, XJ, Y_REAR, 1.4);
    solid(XS, XJ, yCeil, Y_REAR, ZB, ZM);
    parapetRoof(XS, XJ, ZB, ZM, Y_REAR, { sides: "sew" });
    B.box(M.plaster, -6, 14, Y_REAR, Y_REAR + 0.5, ZB + 1.5, ZM - 1.5, "-y");
    B.hip(M.roofBlue, -6.3, 14.3, ZB + 1.2, ZM - 1.2, Y_REAR + 0.5, 3.4, 0);
    B.box(M.plaster, -32, -9, Y_REAR, Y_REAR + 0.5, ZB + 1.5, ZM - 1.5, "-y");
    B.hip(M.roofWhite, -32.3, -8.7, ZB + 1.2, ZM - 1.2, Y_REAR + 0.5, 4.2, 0);
    waterTank(-41.5, ZB + 3, Y_REAR);
    waterTank(-38.6, ZB + 3, Y_REAR);
    waterTank(-41.5, ZB + 6.2, Y_REAR, 0.7, 1.3);
    B.box(M.plaster, -41, -36, Y_REAR, Y_REAR + 2.8, ZM - 6, ZM - 1.8); // stair head room
    B.box(M.plasterGrey, -41.15, -35.85, Y_REAR + 2.8, Y_REAR + 2.92, ZM - 6.15, ZM - 1.65);
    B.box(M.frameDark, -38.9, -38.0, Y_REAR, Y_REAR + 2.05, ZM - 1.8, ZM - 1.75);
    // split air-conditioning plant on the roof
    for (let k = 0; k < 4; k++) B.box(M.acBody, 16 + k * 1.3, 17.1 + k * 1.3, Y_REAR + 0.15, Y_REAR + 1.3, ZB + 2, ZB + 2.9);

    // ---- south end ----
    south.box(M.plasterGrey, 0, 30, 0, 0.6, 0, 0.06);
    windowWall(south, { s0: 0, s1: 11.5, y0: 0, levels: 6, pitch: 3.3, w: 1.5, h: 1.5, ac: 0.45 });
    windowWall(south, { s0: 18.5, s1: 30, y0: 0, levels: 4, pitch: 3.3, w: 1.5, h: 1.5, ac: 0.45, skip: (i, l, n) => l < 2 && i === n - 1 });
    south.box(M.plaster, 18.5, 30, Y_FRONT, Y_FRONT + 1.1, -0.22, 0);
    south.box(M.plaster, 16, 18.5, Y_FRONT, Y_REAR, -0.3, 0); // end of the rear wing above the front bar
    south.box(M.plaster, 0, 16, Y_REAR, Y_REAR + 1.1, -0.22, 0);
    // stair tower: a half drum of glass block and plaster standing out of the wall
    {
      const cxs = XS;
      const czs = ZB + 15;
      const r = 3.5;
      const a0 = Math.PI;
      const a1 = Math.PI * 2; // the half facing -x
      const top = Y_REAR + 1.6;
      B.arc(M.plaster, cxs, czs, r, a0, a1, 0, top);
      B.ring(M.plasterGrey, cxs, czs, 0, r + 0.1, a0, a1, top, true);
      B.arc(M.plasterGrey, cxs, czs, r + 0.1, a0, a1, top - 0.12, top);
      B.arc(M.plasterGrey, cxs, czs, r + 0.04, a0, a1, 0, 0.6);
      for (const am of [Math.PI * 1.3, Math.PI * 1.5, Math.PI * 1.7]) B.arc(M.glassDark, cxs, czs, r + 0.02, am - 0.11, am + 0.11, 2.2, top - 1.4, { segs: 2 }); // tall slit windows
      B.arc(streaks, cxs, czs, r + 0.03, a0, a1, top - 2.4, top - 0.12, { segs: 12, uScale: 1 / 7, vFit: true });
      // the wall behind the drum
      south.box(M.plaster, 11.5, 18.5, 0, Y_FRONT, -0.3, 0);
      world.createCollider(RAPIER.ColliderDesc.cylinder(top / 2, r).setTranslation(...((p) => [p[0], top / 2, p[1]])(local(cxs, czs))));
    }
    rainPipe(south, 0.5, 0, Y_REAR);
    rainPipe(south, 29.5, 0, Y_FRONT);
    solid(XS, XS + 0.3, 0, Y_REAR, ZB, 0);
    south.box(M.frameDark, 24.2, 25.4, 0.3, 2.4, 0, 0.05); // side door
    south.box(M.plaster, 23.9, 25.7, 2.55, 2.67, 0, 0.9);
    for (let k = 0; k < 4; k++) world.createCollider(RAPIER.ColliderDesc.cylinder((0.6 - k * 0.15) / 2, 5.6 - k * 0.45).setTranslation(...((p) => [p[0], (0.6 - k * 0.15) / 2, p[1]])(local(XS - 0.5, -4.5))));
    // curved steps down from the side door at the south-west corner (the arcs in the satellite view)
    for (let k = 0; k < 4; k++) {
      B.arc(M.stoneFloor, XS - 0.5, -4.5, 5.6 - k * 0.45, Math.PI, Math.PI * 1.5, 0, 0.6 - k * 0.15, { segs: 14 });
      B.ring(M.stoneFloor, XS - 0.5, -4.5, 0, 5.6 - k * 0.45, Math.PI, Math.PI * 1.5, 0.6 - k * 0.15, true, 14);
    }

    // ---- rear of the main block ----
    const bs = XN - XJ; // where the main block starts along the back face
    back.box(M.plasterGrey, bs, bs + XJ - XS, 0, 0.6, 0, 0.06);
    windowWall(back, { s0: bs, s1: bs + XJ - XS, y0: 0, levels: 6, pitch: 3.25, w: 1.5, h: 1.5, ac: 0.5, skip: (i, l) => l === 0 && (i === 4 || i === 12) });
    for (const i of [4, 12]) {
      // back doors under small concrete canopies
      // placed by the same column rule as the windows
      const n = Math.floor((XJ - XS - 2.8 - 1.5) / 3.25) + 1;
      const start = bs + (XJ - XS) / 2 - ((n - 1) * 3.25) / 2 - 0.75;
      const c = start + i * 3.25;
      back.box(M.frameDark, c + 0.1, c + 1.4, 0, 2.15, 0, 0.05);
      back.box(M.plaster, c - 0.3, c + 1.8, 2.3, 2.42, 0, 1.0);
      back.box(M.concrete, c - 0.2, c + 1.7, 0, 0.15, 0, 1.1);
    }
    for (const s of [bs + 0.5, bs + 16, bs + 33, bs + 50, bs + 66.5]) rainPipe(back, s, 0, Y_REAR);
    solid(XS, XJ, 0, Y_REAR, ZB, ZB + 0.3);
    // generator set in its acoustic box, and a transformer yard, against the back wall
    B.box(M.concrete, -20, -13, 0, 0.25, ZB - 3.6, ZB - 0.5);
    B.box(offset(M.acp, 1), -19.4, -13.6, 0.25, 2.6, ZB - 3.2, ZB - 0.9);
    B.cyl(M.pipeDark, -14.2, ZB - 1.3, 0.09, 2.6, 4.6, 8);
    solid(-20, -13, 0, 2.6, ZB - 3.6, ZB - 0.5);
    B.box(M.concrete, 2, 7, 0, 0.2, ZB - 3.2, ZB - 0.6);
    B.box(M.acBody, 2.8, 4.4, 0.2, 2.0, ZB - 2.6, ZB - 1.2);
    B.box(M.acBody, 4.9, 6.3, 0.2, 1.7, ZB - 2.6, ZB - 1.2);
    for (const [x, z] of [[2, ZB - 3.2], [7, ZB - 3.2], [2, ZB - 0.6], [7, ZB - 0.6]]) B.cyl(M.steelBlue, x, z, 0.04, 0, 2.2, 6);
    for (const y of [0.9, 1.5, 2.1]) {
      B.box(M.steelBlue, 2, 7, y, y + 0.03, ZB - 3.22, ZB - 3.18);
      B.box(M.steelBlue, 1.98, 2.02, y, y + 0.03, ZB - 3.2, ZB - 0.6);
      B.box(M.steelBlue, 6.98, 7.02, y, y + 0.03, ZB - 3.2, ZB - 0.6);
    }
    solid(2, 7, 0, 2.2, ZB - 3.2, ZB - 0.6);
  }

  // =====================================================================================
  // THE ENTRANCE PORTICO
  // =====================================================================================
  {
    const { half, depth, height, floor } = PORCH;
    const W = half * 2;
    // floor and steps
    B.box(M.stoneFloor, px0, px1, 0, floor, -depth, 3.0, "-y");
    B.box(M.stoneFloor, px0, px1, 0, 0.3, 3.0, 3.4, "-y");
    B.box(M.stoneFloor, px0, px1, 0, 0.15, 3.4, 3.8, "-y");
    solid(px0, px1, -0.3, floor, -depth, 3.0);
    solid(px0, px1, -0.3, 0.3, 3.0, 3.4);
    solid(px0, px1, -0.3, 0.15, 3.4, 3.8);
    // walls of white tiles with round dimples
    const dimple = picture(256, 256, (g, w, h) => {
      g.fillStyle = "#ebe8e1";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#c9c5bc";
      g.lineWidth = 3;
      g.strokeRect(0, 0, w, h);
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++) {
          const grad = g.createRadialGradient(x * 128 + 58, y * 128 + 58, 4, x * 128 + 64, y * 128 + 64, 44);
          grad.addColorStop(0, "#bdb9b0");
          grad.addColorStop(0.8, "#e2dfd7");
          grad.addColorStop(1, "#f5f2eb");
          g.fillStyle = grad;
          g.beginPath();
          g.arc(x * 128 + 64, y * 128 + 64, 40, 0, 7);
          g.fill();
        }
    });
    dimple.wrapS = dimple.wrapT = THREE.RepeatWrapping;
    dimple.repeat.set(1 / 1.2, 1 / 1.2);
    const dimpleMat = new THREE.MeshStandardMaterial({ map: dimple, roughness: 0.55 });
    const lowH = 4.2;
    B.box(dimpleMat, px0, px1, floor, floor + lowH, -depth, -depth + 0.4);
    solid(px0, px1, 0, height, -depth - 0.2, -depth + 0.4);
    for (const x of [px0, px1 - 0.4]) {
      B.box(dimpleMat, x, x + 0.4, floor, height, -depth, 0);
      solid(x, x + 0.4, 0, height, -depth, 0);
    }
    // glass doors: four leaves with steel pulls
    const dz = -depth + 0.4;
    front.quad(M.glassShop, PX - 4.75, PX + 4.75, floor, floor + 3.7, dz + 0.06);
    B.box(M.aluminium, PX - 4.8, PX + 4.8, floor + 3.7, floor + 3.82, dz, dz + 0.14);
    for (const x of [-4.78, -2.4, 0, 2.4, 4.78]) B.box(M.aluminium, PX + x - 0.04, PX + x + 0.04, floor, floor + 3.7, dz, dz + 0.14);
    B.box(M.aluminium, PX - 4.8, PX + 4.8, floor + 2.5, floor + 2.56, dz + 0.02, dz + 0.12);
    for (const x of [-1.25, -1.1, 1.1, 1.25]) B.box(M.aluminium, PX + x - 0.02, PX + x + 0.02, floor + 0.9, floor + 1.9, dz + 0.14, dz + 0.2);
    // name band with the logo at its centre
    const bandH = 1.75;
    const nameTex = picture(Math.round((256 * W) / bandH / 2), 128, (g, w, h) => {
      g.fillStyle = "#d8d1bf";
      g.fillRect(0, 0, w, h);
      const size = 46;
      g.font = `700 ${size}px Arial, Helvetica, sans-serif`;
      g.textBaseline = "middle";
      for (const [text, align, x] of [["TECHNO INDIA GROUP", "right", w / 2 - 90], ["TECHNO INDIA UNIVERSITY", "left", w / 2 + 90]]) {
        g.textAlign = align;
        g.fillStyle = "#3a2c08";
        g.fillText(text, x + 2, h / 2 + 5);
        g.fillStyle = "#c79a1e";
        g.fillText(text, x, h / 2 + 2);
      }
    });
    B.box(M.plasterCream, px0, px1, floor + lowH, floor + lowH + bandH, -depth, -depth + 0.5);
    board(nameTex, W - 0.8, bandH, PX, floor + lowH + bandH / 2, -depth + 0.51, 0, { rough: 0.7 });
    logoDisc(0.8, PX, floor + lowH + bandH / 2, -depth + 0.53);
    const topH = height - floor - lowH - bandH;
    B.box(M.plasterCream, px0, px1, height - topH, height, -depth, -depth + 0.4);
    B.box(M.wood, PX - 4, PX + 4, height - topH + 0.15, height - 0.15, -depth + 0.4, -depth + 0.46);
    const screenTex = picture(256, 128, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#27356d");
      grad.addColorStop(1, "#6f7fd0");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff";
      g.font = "700 26px Arial";
      g.fillText("WELCOME TO", 18, 50);
      g.fillText("TECHNO INDIA", 18, 86);
    });
    for (const x of [-7.2, 7.2]) {
      B.box(M.black, PX + x - 1.75, PX + x + 1.75, height - topH + 0.1, height - 0.1, -depth + 0.4, -depth + 0.47);
      board(screenTex, 3.3, topH - 0.4, PX + x, height - topH / 2, -depth + 0.48, 0, { emissive: 0.9 });
    }
    // ceiling of dark red slats, white beams
    const slats = picture(64, 64, (g, w, h) => {
      g.fillStyle = "#2a100c";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#74281c";
      for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 10, h);
    });
    slats.wrapS = slats.wrapT = THREE.RepeatWrapping;
    slats.repeat.set(1 / 0.8, 1);
    B.box(new THREE.MeshStandardMaterial({ map: slats, roughness: 0.6 }), px0, px1, height, height + 0.25, -depth, 0.9);
    for (const x of [-3.4, 3.4]) B.box(M.plaster, PX + x - 0.5, PX + x + 0.5, height - 0.6, height, -depth, 2.2);
    // recessed ceiling lights
    for (let ix = -3; ix <= 3; ix++)
      for (const z of [-6.5, -3.5, -0.5]) {
        const spot = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#fff2cc", emissiveIntensity: 1.6 }));
        spot.rotation.x = Math.PI / 2;
        spot.position.set(PX + ix * 2.7, height - 0.01, z);
        G.add(spot);
      }
    const glow = new THREE.PointLight("#ffe7b8", 14, 22, 1.6);
    glow.position.set(PX, height - 1.2, -4);
    G.add(glow);
    // four leaning columns carrying the canopy: feet near the steps, heads further out
    for (const dx of [-8.4, -3.1, 3.1, 8.4]) {
      const R = 26;
      const edge = 3.0 - R + Math.sqrt(R * R - dx * dx); // canopy edge at this column
      const top = new THREE.Vector3(PX + dx, 7.55, edge - 0.75);
      const foot = new THREE.Vector3(PX + dx * 0.94, floor, edge - 1.75);
      const dir = top.clone().sub(foot);
      const len = dir.length();
      const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      m.setPosition(foot.clone().add(top).multiplyScalar(0.5));
      B.obox(M.plaster, m, 0.62, len, 0.62);
      B.box(M.plasterGrey, foot.x - 0.42, foot.x + 0.42, floor, floor + 0.35, foot.z - 0.42, foot.z + 0.42);
      solid(foot.x - 0.4, foot.x + 0.4, 0, 3, foot.z - 0.4, foot.z + 0.6);
    }
    // reception desk and a wooden table
    const desk = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.1, 32, 1, false, -Math.PI / 2, Math.PI), M.frameWhite);
    desk.position.set(PX + 6.6, floor + 0.55, -5.2);
    desk.castShadow = desk.receiveShadow = true;
    const deskBand = new THREE.Mesh(new THREE.CylinderGeometry(2.33, 2.33, 0.25, 32, 1, true, -Math.PI / 2, Math.PI), M.wood);
    deskBand.position.set(PX + 6.6, floor + 0.45, -5.2);
    G.add(desk, deskBand);
    logoDisc(0.32, PX + 6.6, floor + 0.78, -5.2 + 2.34);
    solid(PX + 4.3, PX + 8.9, 0, floor + 1.1, -5.3, -2.9);
    B.box(M.wood, PX - 9.4, PX - 3.4, floor + 0.82, floor + 0.9, -4.25, -2.95);
    B.box(M.wood, PX - 9.3, PX - 3.5, floor, floor + 0.82, -4.15, -3.05);
    solid(PX - 9.4, PX - 3.4, 0, floor + 0.9, -4.25, -2.95);
    for (const x of [-5.6, 5.6]) {
      B.cyl(M.frameWhite, PX + x, -depth + 1, 0.3, floor, floor + 0.55, 14, true);
      const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), new THREE.MeshStandardMaterial({ color: "#356f31", roughness: 1 }));
      plant.position.set(PX + x, floor + 1.15, -depth + 1);
      plant.scale.y = 1.5;
      plant.castShadow = true;
      G.add(plant);
    }
    // the wall above the canopy between the two blocks' window bands is closed by the upper floors (built above)
    places.push({ name: "Main Entrance", x: local(PX, 0)[0], z: local(PX, 0)[1] });
  }

  // =====================================================================================
  // GROUND, BOUNDARY, GATES, SIGNS
  // =====================================================================================
  const stripEnd = 50;
  {
    const paver = offset(M.paver, 4);
    B.quad(paver, [[-stripEnd, 0.035, FENCE_Z + 0.3], [stripEnd, 0.035, FENCE_Z + 0.3], [stripEnd, 0.035, 0], [-stripEnd, 0.035, 0]], [[-stripEnd, FENCE_Z], [stripEnd, FENCE_Z], [stripEnd, 0], [-stripEnd, 0]], [0, 1, 0]);
    const apron = offset(M.concrete, 4);
    for (const [x0, x1, z0, z1] of [[-stripEnd, stripEnd, ZB - 6, ZB], [-stripEnd, XS, ZB, 0], [XN, stripEnd, ZB, 0]]) B.quad(apron, [[x0, 0.03, z1], [x1, 0.03, z1], [x1, 0.03, z0], [x0, 0.03, z0]], [[x0, z1], [x1, z1], [x1, z0], [x0, z0]], [0, 1, 0]);
    // raised planting beds behind the railing
    for (const [a, b] of [[-44, PX - 12.5], [27.5, 33.5]]) {
      B.box(M.brickTile, a, b, 0, 0.4, 1.2, 5.2);
      B.box(M.granite, a - 0.04, b + 0.04, 0.4, 0.45, 1.16, 1.4);
      B.box(M.granite, a - 0.04, b + 0.04, 0.4, 0.45, 5.0, 5.24);
      solid(a, b, 0, 0.4, 1.2, 5.2);
    }
    // open drain cover along the foot of the rear wall
    B.box(M.concrete, XS, XN, 0.03, 0.07, ZB - 0.75, ZB - 0.3);

    // boundary: brick-red pillars with granite caps, blue grilles on a low wall
    const gates = [[PX - 5.5, PX + 5.5], [34.5, 39.5]];
    const pillars = [];
    for (let x = -stripEnd; x <= stripEnd + 0.01; x += 5) pillars.push(x);
    const inGate = (x) => gates.some(([a, b]) => x > a - 0.5 && x < b + 0.5);
    const pillar = (x, h = 2.5) => {
      B.box(M.brickTile, x - 0.32, x + 0.32, 0, h, FENCE_Z - 0.32, FENCE_Z + 0.32);
      B.box(M.granite, x - 0.4, x + 0.4, h, h + 0.12, FENCE_Z - 0.4, FENCE_Z + 0.4);
      solid(x - 0.32, x + 0.32, 0, h, FENCE_Z - 0.32, FENCE_Z + 0.32);
    };
    for (const x of pillars) if (!inGate(x)) pillar(x);
    for (const [a, b] of gates) {
      pillar(a, 3.0);
      pillar(b, 3.0);
    }
    const stops = [...pillars.filter((x) => !inGate(x)), ...gates.flat()].sort((p, q) => p - q);
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i] + 0.32;
      const b = stops[i + 1] - 0.32;
      if (gates.some(([g0, g1]) => stops[i] === g0 && stops[i + 1] === g1)) continue;
      if (b - a < 0.3) continue;
      B.box(M.brickTile, a, b, 0, 0.55, FENCE_Z - 0.12, FENCE_Z + 0.12);
      B.box(M.granite, a, b, 0.55, 0.61, FENCE_Z - 0.15, FENCE_Z + 0.15);
      for (const y of [0.75, 2.1]) B.box(M.steelBlue, a, b, y, y + 0.045, FENCE_Z - 0.02, FENCE_Z + 0.02);
      for (let x = a + 0.06; x < b; x += 0.115) B.box(M.steelBlue, x - 0.008, x + 0.008, 0.61, 2.25, FENCE_Z - 0.008, FENCE_Z + 0.008);
      solid(a, b, 0, 2.25, FENCE_Z - 0.12, FENCE_Z + 0.12);
    }
    // main gate: two sheet-and-grille leaves standing open inward; side gate shut
    const leaf = (hx, hz, yaw, w) => {
      const m = (lx, y, lz) => new THREE.Matrix4().makeRotationY(yaw).setPosition(hx + (Math.cos(yaw) * lx + Math.sin(yaw) * lz), y, hz + (-Math.sin(yaw) * lx + Math.cos(yaw) * lz));
      B.obox(M.steelBlue, m(w / 2, 0.75, 0), w, 1.2, 0.035);
      for (const y of [1.4, 2.5]) B.obox(M.steelBlue, m(w / 2, y, 0), w, 0.06, 0.05);
      for (const lx of [0.03, w - 0.03]) B.obox(M.steelBlue, m(lx, 1.3, 0), 0.06, 2.5, 0.06);
      for (let lx = 0.15; lx < w; lx += 0.13) B.obox(M.steelBlue, m(lx, 1.95, 0), 0.016, 1.1, 0.016);
    };
    leaf(PX - 5.2, FENCE_Z - 0.1, Math.PI / 2 + 0.12, 5.0);
    leaf(PX + 5.2, FENCE_Z - 0.1, Math.PI / 2 - 0.12, 5.0);
    leaf(34.82, FENCE_Z, 0, 2.3);
    leaf(37.2, FENCE_Z, 0, 2.3);
    solid(34.5, 39.5, 0, 2.5, FENCE_Z - 0.1, FENCE_Z + 0.1);

    // granite name wall beside the main gate, gold letters
    {
      const x0 = PX + 5.9;
      const x1 = PX + 9.7;
      B.box(M.granite, x0, x1, 0, 2.3, FENCE_Z - 0.2, FENCE_Z + 0.2);
      solid(x0, x1, 0, 2.3, FENCE_Z - 0.2, FENCE_Z + 0.2);
      const t = picture(1024, 512, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = "#d9b24a";
        g.textAlign = "center";
        g.font = "700 96px Georgia, serif";
        g.fillText("TECHNO INDIA", w / 2 + 70, 230);
        g.fillText("GROUP", w / 2 + 70, 340);
        g.font = "500 40px Georgia, serif";
        g.fillText("EM-4, Sector V, Salt Lake", w / 2 + 70, 420);
      });
      for (const [z, yaw] of [[FENCE_Z + 0.205, 0], [FENCE_Z - 0.205, Math.PI]]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.35, metalness: 0.6 }));
        m.position.set((x0 + x1) / 2, 1.2, z);
        m.rotation.y = yaw;
        G.add(m);
        logoDisc(0.42, (x0 + x1) / 2 + (yaw ? 1.25 : -1.25), 1.3, z + (yaw ? -0.004 : 0.004), yaw);
      }
    }
    // sign pylon inside the gate: white box on two posts
    {
      const x = PX - 8.6;
      const z = 4.6;
      for (const dx of [-1.0, 1.0]) B.cyl(M.frameWhite, x + dx, z, 0.07, 0, 2.4, 8);
      B.box(M.frameWhite, x - 1.5, x + 1.5, 2.4, 4.9, z - 0.14, z + 0.14);
      const t = picture(512, 430, (g, w, h) => {
        g.fillStyle = "#fbfaf6";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#16181b";
        g.textAlign = "center";
        g.font = "700 46px Georgia, serif";
        g.fillText("TECHNO INDIA GROUP", w / 2, 300);
        g.font = "26px Arial";
        g.fillStyle = "#555";
        g.fillText("www.technoindiagroup.com", w / 2, 350);
      });
      for (const [dz, yaw] of [[0.145, 0], [-0.145, Math.PI]]) {
        board(t, 2.9, 2.4, x, 3.65, z + dz, yaw, { emissive: 0.1 });
        logoDisc(0.52, x, 4.15, z + dz * 1.03, yaw);
      }
      solid(x - 1.1, x + 1.1, 0, 2.4, z - 0.1, z + 0.1);
    }
    // admission banners on frames along the fence, facing the street
    const banner = (i) =>
      picture(384, 560, (g, w, h) => {
        const hue = [22, 12, 210][i % 3];
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `hsl(${hue},85%,52%)`);
        grad.addColorStop(1, `hsl(${hue - 14},80%,26%)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.fillStyle = "rgba(255,255,255,.14)";
        g.beginPath();
        g.arc(w / 2, 300, 120, 0, 7);
        g.fill();
        g.fillStyle = "#fff";
        g.textAlign = "center";
        g.font = "700 34px Arial";
        g.fillText("TECHNO INDIA", w / 2, 60);
        g.fillText("UNIVERSITY", w / 2, 100);
        g.font = "800 44px Arial";
        g.fillStyle = "#ffe066";
        g.fillText(["ADMISSION", "CAMPUS", "PLACEMENTS"][i % 3], w / 2, 470);
        g.fillText(["2026", "OPEN DAY", "2026"][i % 3], w / 2, 520);
      });
    [-3.4, -9.0, 26.5].forEach((dx, i) => {
      const x = dx < 20 ? PX + dx - 3 : dx;
      board(banner(i), 1.7, 2.5, x, 1.9, FENCE_Z + 0.2, 0, { rough: 0.45 });
      B.box(M.frameDark, x - 0.9, x + 0.9, 0.6, 3.2, FENCE_Z + 0.14, FENCE_Z + 0.19);
    });
    // security cabin by the gate
    {
      const x0 = PX + 6.2;
      B.box(M.frameWhite, x0, x0 + 1.8, 0.04, 2.5, 3.9, 5.5);
      B.box(M.steelBlue, x0 - 0.1, x0 + 1.9, 2.5, 2.6, 3.8, 5.6);
      face(0, 5.5, "front").quad(M.glassShop, x0 + 0.25, x0 + 1.55, 1.0, 2.0, 0.01);
      face(x0, 0, "south").quad(M.glassShop, 4.2, 5.2, 1.0, 2.0, 0.01);
      solid(x0, x0 + 1.8, 0, 2.5, 3.9, 5.5);
    }
  }

  const meshes = B.flush();
  // glass materials get the surroundings reflected in them once the world is built
  const reflective = [M.glass, M.glassDark, M.glassShop, M.acp, M.aluminium];
  return {
    group: G,
    meshes,
    reflective,
    materials: M,
    height: Y_TOWER,
    stripEnd,
    fenceZ: FENCE_Z,
    porchX: PX,
    beds: [[-44, PX - 12.5], [27.5, 33.5]], // planting beds behind the railing (local x from, to)
    footprint: [[XS - 3.6, 0], [XN, 0], [XN, ZB], [XS - 3.6, ZB]].map(([x, z]) => local(x, z)),
  };
}
