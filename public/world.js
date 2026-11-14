// Builds the neighbourhood around Techno India University (EM-4, Sector V, Salt Lake).
// Building outlines and roads come from OpenStreetMap (public/campus.json). The look of the
// university building, its entrance, the railing and the street lamps follows reference photos.
// Everything random uses a fixed seed, so every player gets exactly the same world.
import * as THREE from "three";

const TIU_ID = 134101262; // the university building in OpenStreetMap
const FLOOR = 3.7; // metres per storey
const ROAD_WIDTH = { secondary: 7, secondary_link: 5.5, residential: 6, service: 4.2 };
const WORLD_HALF = 245;

// ---------- small helpers ----------
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const signedArea = (pts) => pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2;
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
function inPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distToSegment(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
function distToPath(x, z, pts, closed = false) {
  let best = Infinity;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) best = Math.min(best, distToSegment(x, z, pts[i], pts[(i + 1) % pts.length]));
  return best;
}
const yawQuat = (a) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

export function buildWorld({ RAPIER, scene, world, renderer, campus, makeLabel }) {
  const rand = seeded(20261114);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const range = (a, b) => a + rand() * (b - a);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const places = [];
  const props = [];

  // ---------- textures drawn in code ----------
  function texture(w, h, draw, { repeat = true } = {}) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    return t;
  }
  function speckle(g, w, h, count, colors, size = 2) {
    for (let i = 0; i < count; i++) {
      g.fillStyle = colors[(Math.random() * colors.length) | 0];
      g.globalAlpha = 0.15 + Math.random() * 0.35;
      const s = 1 + Math.random() * size;
      g.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
    g.globalAlpha = 1;
  }
  const tex = {
    ground: texture(512, 512, (g, w, h) => {
      g.fillStyle = "#8b8a66";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 9000, ["#6f7d4a", "#7c8a52", "#9a9070", "#a59a7a", "#5f6f42"], 5);
    }),
    grass: texture(512, 512, (g, w, h) => {
      g.fillStyle = "#5f8f3e";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 12000, ["#4c7a30", "#6fa148", "#7fae52", "#557f36", "#8a9a50"], 3);
    }),
    asphalt: texture(512, 512, (g, w, h) => {
      g.fillStyle = "#4a4c50";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 14000, ["#3c3e42", "#5a5c60", "#66686b", "#333538"], 2);
    }),
    // one carriageway, two lanes: u runs across the road, v along it (8 m per tile)
    mainRoad: texture(256, 512, (g, w, h) => {
      g.fillStyle = "#47494d";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 9000, ["#3a3c40", "#57595d", "#626467", "#303235"], 2);
      g.fillStyle = "#d9d6c8";
      g.fillRect(8, 0, 5, h);
      g.fillRect(w - 13, 0, 5, h);
      g.fillRect(w / 2 - 3, 0, 6, h * 0.4);
    }),
    paver: texture(256, 256, (g, w, h) => {
      g.fillStyle = "#a79a8c";
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          g.fillStyle = ["#b3a394", "#a3917f", "#b89c8c", "#9c8f84"][(Math.random() * 4) | 0];
          g.fillRect(x * 32 + (y % 2 ? 16 : 0) + 1, y * 32 + 1, 30, 30);
          g.fillRect(x * 32 + (y % 2 ? 16 : 0) + 1 - 256, y * 32 + 1, 30, 30);
        }
      speckle(g, w, h, 2500, ["#7d7268", "#c4b6a6"], 2);
    }),
    // entrance floor: pale grey stone with dark joints, as in the entrance photo
    tile: texture(256, 256, (g, w, h) => {
      g.fillStyle = "#b9b6b0";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 3000, ["#a9a6a0", "#c8c5bf", "#9f9c97"], 6);
      g.strokeStyle = "#3d3b39";
      g.lineWidth = 6;
      g.strokeRect(0, 0, w, h);
    }),
    // white wall tiles with round dimples, as on the entrance walls
    perforated: texture(128, 128, (g, w, h) => {
      g.fillStyle = "#ece9e2";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#cfcbc2";
      g.lineWidth = 2;
      g.strokeRect(0, 0, w, h);
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++) {
          const grad = g.createRadialGradient(x * 64 + 30, y * 64 + 30, 2, x * 64 + 32, y * 64 + 32, 22);
          grad.addColorStop(0, "#c9c5bc");
          grad.addColorStop(1, "#f4f1ea");
          g.fillStyle = grad;
          g.beginPath();
          g.arc(x * 64 + 32, y * 64 + 32, 20, 0, 7);
          g.fill();
        }
    }),
    slats: texture(64, 64, (g, w, h) => {
      g.fillStyle = "#3a1712";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#7a2f22";
      for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 10, h);
    }),
    brick: texture(256, 256, (g, w, h) => {
      g.fillStyle = "#8a8378";
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < 16; y++)
        for (let x = -1; x < 8; x++) {
          g.fillStyle = ["#a4543a", "#98492f", "#b06246", "#8f4a34"][(Math.random() * 4) | 0];
          g.fillRect(x * 32 + (y % 2 ? 16 : 0) + 1, y * 16 + 1, 30, 14);
        }
    }),
    concrete: texture(256, 256, (g, w, h) => {
      g.fillStyle = "#9c9a94";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 5000, ["#8a8882", "#aeaca6", "#7d7b76"], 5);
    }),
    // blue and white railing: one 3 m panel
    fence: texture(256, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#e9ecee";
      for (let x = 30; x < w; x += 14) g.fillRect(x, 26, 5, h - 30);
      g.fillStyle = "#2f7fc9";
      g.fillRect(0, 22, w, 8);
      g.fillRect(0, h - 22, w, 8);
      g.fillRect(4, 0, 18, h);
      g.fillRect(0, 0, 26, 12);
    }),
  };
  tex.mainRoad.repeat.set(1, 1);

  // Building fronts. Each texture is one bay wide and one storey tall.
  function facade(draw) {
    return texture(256, 256, draw);
  }
  function glassGradient(g, x, y, w, h, top, bottom) {
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
  }
  const facades = {
    // white piers with strips of blue-green glass and pale panels (the university's street face)
    tiuStrip: facade((g, w, h) => {
      g.fillStyle = "#f3f2ec";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        const x = 62 + i * 64;
        glassGradient(g, x, 6, 58, 150, "#4f8fa6", "#7fb4c0");
        g.fillStyle = "#d3e4df";
        g.fillRect(x, 162, 58, 88);
      }
    }),
    // the curved glass corner
    tiuGlass: facade((g, w, h) => {
      g.fillStyle = "#eef0ec";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2; i++) {
        const x = 5 + i * 128;
        glassGradient(g, x, 5, 118, 150, "#4a8aa3", "#7bb0bd");
        g.fillStyle = "#cfe2dd";
        g.fillRect(x, 161, 118, 90);
      }
    }),
    // plain white wall with small windows (the back and side of the university building)
    tiuPlain: facade((g, w, h) => {
      g.fillStyle = "#f1efe8";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#dedbd2";
      g.fillRect(0, h - 6, w, 6);
      g.fillStyle = "#5b7482";
      g.fillRect(96, 70, 64, 96);
      g.fillStyle = "#e6e3da";
      g.fillRect(126, 70, 4, 96);
    }),
    glassTower: facade((g, w, h) => {
      g.fillStyle = "#2f3b44";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2; i++) glassGradient(g, 6 + i * 126, 6, 118, 190, "#567f99", "#84a9bb");
      g.fillStyle = "#3f5563";
      g.fillRect(6, 200, 244, 50);
    }),
    ribbon: facade((g, w, h) => {
      g.fillStyle = "#d8cfbd";
      g.fillRect(0, 0, w, h);
      glassGradient(g, 0, 60, w, 110, "#44606e", "#6f8d99");
      g.fillStyle = "#c9bfab";
      for (let x = 0; x < w; x += 64) g.fillRect(x, 60, 6, 110);
    }),
    punched: facade((g, w, h) => {
      g.fillStyle = "#cfd3d2";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#b9bdbc";
      g.fillRect(0, h - 10, w, 10);
      g.fillStyle = "#4d6470";
      g.fillRect(40, 60, 76, 110);
      g.fillRect(150, 60, 76, 110);
      g.fillStyle = "#e3e5e3";
      g.fillRect(132, 150, 40, 26); // an air conditioner
    }),
    ochre: facade((g, w, h) => {
      g.fillStyle = "#d9b982";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#c4a46e";
      g.fillRect(0, 0, w, 14);
      g.fillStyle = "#56646a";
      g.fillRect(56, 64, 144, 104);
      g.fillStyle = "#e9dcc0";
      g.fillRect(124, 64, 8, 104);
    }),
  };
  const wallMat = (map, glassy) => new THREE.MeshStandardMaterial({ map, roughness: glassy ? 0.35 : 0.85, metalness: glassy ? 0.25 : 0, envMapIntensity: glassy ? 1.1 : 0.5 });
  const mats = {
    tiuStrip: wallMat(facades.tiuStrip, true),
    tiuGlass: wallMat(facades.tiuGlass, true),
    tiuPlain: wallMat(facades.tiuPlain, false),
    glassTower: wallMat(facades.glassTower, true),
    ribbon: wallMat(facades.ribbon, false),
    punched: wallMat(facades.punched, false),
    ochre: wallMat(facades.ochre, false),
    white: new THREE.MeshStandardMaterial({ color: "#f2f0ea", roughness: 0.85 }),
    beige: new THREE.MeshStandardMaterial({ color: "#d9d2c2", roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: "#77736c", roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: "#1c2126", roughness: 0.25, metalness: 0.6 }),
    blue: new THREE.MeshStandardMaterial({ color: "#2f7fc9", roughness: 0.6 }),
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 1 }),
    brick: new THREE.MeshStandardMaterial({ map: tex.brick, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: "#a8743c", roughness: 0.7 }),
    tank: new THREE.MeshStandardMaterial({ color: "#1d1d1f", roughness: 0.6 }),
  };

  // ---------- sky, haze and light from the sky ----------
  const skyColors = { top: new THREE.Color("#6f9fd0"), horizon: new THREE.Color("#dfe7ea") };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: skyColors.top }, horizon: { value: skyColors.horizon } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader:
      "uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main(){ float t = pow(clamp(vDir.y,0.0,1.0),0.55); vec3 c = mix(horizon, top, t); if(vDir.y<0.0) c = mix(horizon, vec3(0.55,0.56,0.5), clamp(-vDir.y*4.0,0.0,1.0)); gl_FragColor = vec4(c,1.0); }",
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(sky.clone());
  scene.environment = pmrem.fromScene(skyScene, 0, 0.1, 2000).texture;
  pmrem.dispose();
  scene.add(sky);
  scene.background = skyColors.horizon;
  scene.fog = new THREE.Fog(skyColors.horizon, 90, 520);

  // ---------- geometry helpers ----------
  const solidBox = (w, h, d, x, y, z, yaw = 0) => world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z).setRotation(yawQuat(yaw)));
  function add(mesh, { cast = true, receive = true } = {}) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    scene.add(mesh);
    return mesh;
  }
  // Flat shape on the ground. `tile` is the size in metres of one texture repeat.
  function flat(pts, y, material, tile = 1) {
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], -p[1]))));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, material);
    m.position.y = y;
    return add(m, { cast: false });
  }
  // A strip that follows a path: roads and footpaths.
  function ribbon(pts, width, y, material, tileLength) {
    const pos = [];
    const uv = [];
    const idx = [];
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / len;
      const nz = (b[0] - a[0]) / len;
      if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      pos.push(pts[i][0] + (nx * width) / 2, y, pts[i][1] + (nz * width) / 2, pts[i][0] - (nx * width) / 2, y, pts[i][1] - (nz * width) / 2);
      uv.push(0, along / tileLength, 1, along / tileLength);
      if (i > 0) idx.push(i * 2 - 2, i * 2, i * 2 - 1, i * 2 - 1, i * 2, i * 2 + 1); // wound to face up
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material);
    return add(m, { cast: false });
  }
  // Collects wall panels, then makes one mesh per material.
  const wallBatches = new Map();
  function wall(a, b, y0, y1, material, bay = 4, storey = FLOOR, nx = 0, nz = 0) {
    let batch = wallBatches.get(material);
    if (!batch) wallBatches.set(material, (batch = { pos: [], uv: [], nor: [] }));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = Math.max(1, Math.round(len / bay));
    const v = Math.max(1, Math.round((y1 - y0) / storey));
    batch.pos.push(a[0], y0, a[1], b[0], y1, b[1], b[0], y0, b[1], a[0], y0, a[1], a[0], y1, a[1], b[0], y1, b[1]);
    batch.uv.push(0, 0, u, v, u, 0, 0, 0, 0, v, u, v);
    for (let i = 0; i < 6; i++) batch.nor.push(nx, 0, nz);
  }
  function flushWalls() {
    for (const [material, b] of wallBatches) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
      add(new THREE.Mesh(geo, material));
    }
  }
  // Outline wound so that (dz, -dx) of each edge points out of the building.
  const outward = (pts) => (signedArea(pts) > 0 ? pts : [...pts].reverse());
  function edgesOf(pts) {
    return pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return { a, b, len, nx: (b[1] - a[1]) / len, nz: -(b[0] - a[0]) / len };
    });
  }
  function edgeCollider(e, height, inset = 0.4) {
    const yaw = Math.atan2(-(e.b[1] - e.a[1]), e.b[0] - e.a[0]);
    solidBox(e.len, height, inset * 2, (e.a[0] + e.b[0]) / 2 - e.nx * inset, height / 2, (e.a[1] + e.b[1]) / 2 - e.nz * inset, yaw);
  }

  // ---------- ground ----------
  tex.ground.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  add(ground, { cast: false });
  // The walkable ground is a grid of slabs: one huge slab makes collision checks imprecise.
  const SLAB = 50;
  for (let gx = -WORLD_HALF - 5; gx < WORLD_HALF + 5; gx += SLAB) for (let gz = -WORLD_HALF - 5; gz < WORLD_HALF + 5; gz += SLAB) solidBox(SLAB, 2, SLAB, gx + SLAB / 2, -1, gz + SLAB / 2);
  for (const [x, z, w, d] of [[0, -WORLD_HALF, 500, 2], [0, WORLD_HALF, 500, 2], [-WORLD_HALF, 0, 2, 500], [WORLD_HALF, 0, 2, 500]]) solidBox(w, 40, d, x, 20, z);

  const layer = (map, offset, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 1, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset, ...extra });
  const grassMat = layer(tex.grass, 1);
  for (const g of campus.grass) flat(g.pts, 0.02, grassMat, 6);
  const pitchLines = new THREE.LineBasicMaterial({ color: "#f4f4f0" });
  for (const p of campus.pitches) {
    flat(p.pts, 0.03, layer(tex.grass, 2, { color: "#b9e0a0" }), 5);
    const c = centroid(p.pts);
    const ring = [...p.pts, p.pts[0]].map(([x, z]) => new THREE.Vector3(c[0] + (x - c[0]) * 0.94, 0.08, c[1] + (z - c[1]) * 0.94));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), pitchLines));
  }
  if (campus.pitches.length) {
    const c = centroid(campus.pitches[campus.pitches.length - 1].pts);
    places.push({ name: "Sports ground", x: c[0], z: c[1] });
  }

  // ---------- roads ----------
  const mainRoads = campus.roads.filter((r) => r.kind === "secondary" || r.kind === "secondary_link");
  const paverMat = layer(tex.paver, 3);
  const mainRoadMat = layer(tex.mainRoad, 6);
  const laneMat = layer(tex.asphalt, 5);
  for (const r of mainRoads) if (r.pts.length > 1) ribbon(r.pts, ROAD_WIDTH[r.kind] + 4.4, 0.03, paverMat, 3);
  for (const r of campus.roads) {
    if (r.pts.length < 2) continue;
    const width = ROAD_WIDTH[r.kind] || 3.5;
    if (r.kind === "secondary") ribbon(r.pts, width, 0.06, mainRoadMat, 8);
    else ribbon(r.pts, width, 0.045, laneMat, 6);
  }
  const roadClear = (x, z, margin) => campus.roads.every((r) => r.pts.length < 2 || distToPath(x, z, r.pts) > (ROAD_WIDTH[r.kind] || 3.5) / 2 + margin);

  // ---------- the university building ----------
  const tiu = campus.buildings.find((b) => b.id === TIU_ID);
  const tiuPts = outward(tiu.pts);
  const tiuEdges = edgesOf(tiuPts);
  const tiuHeight = 10 * FLOOR;
  const front = tiuEdges.filter((e) => e.nx > 0.5).sort((a, b) => b.len - a.len)[0]; // the long face on the main road
  const mid = [(front.a[0] + front.b[0]) / 2, (front.a[1] + front.b[1]) / 2];
  const phi = Math.atan2(front.nx, front.nz); // turn that points local +z out of the entrance
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  // "Local" positions are measured from the middle of the street face: x along the face, z out toward the road.
  const local = (x, z) => [mid[0] + x * cosP + z * sinP, mid[1] - x * sinP + z * cosP];
  const toLocal = (wx, wz) => [(wx - mid[0]) * cosP - (wz - mid[1]) * sinP, (wx - mid[0]) * sinP + (wz - mid[1]) * cosP];
  const PORCH = { half: 14, depth: 9, height: 7.6, floor: 0.45 };

  for (const e of tiuEdges) {
    const style = e === front || e.nz < -0.5 || e.len < 8 ? mats.tiuStrip : mats.tiuPlain;
    const bay = style === mats.tiuStrip ? 4.2 : 4;
    if (e === front) {
      // leave an opening for the covered entrance
      const dir = [(e.b[0] - e.a[0]) / e.len, (e.b[1] - e.a[1]) / e.len];
      const at = (s) => [e.a[0] + dir[0] * s, e.a[1] + dir[1] * s];
      const s0 = e.len / 2 - PORCH.half;
      const s1 = e.len / 2 + PORCH.half;
      wall(at(0), at(s0), 0, tiuHeight, style, bay, FLOOR, e.nx, e.nz);
      wall(at(s1), at(e.len), 0, tiuHeight, style, bay, FLOOR, e.nx, e.nz);
      wall(at(s0), at(s1), 2 * FLOOR, tiuHeight, style, bay, FLOOR, e.nx, e.nz);
      for (const [p, q] of [[at(0), at(s0)], [at(s1), at(e.len)]]) edgeCollider({ ...e, a: p, b: q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) }, tiuHeight);
    } else {
      wall(e.a, e.b, 0, tiuHeight, style, bay, FLOOR, e.nx, e.nz);
      edgeCollider(e, tiuHeight);
    }
    wall(e.a, e.b, tiuHeight, tiuHeight + 1.4, mats.white, 4, 1.4, e.nx, e.nz); // parapet
  }
  flat(tiuPts, tiuHeight + 0.2, mats.roof, 4);

  // Curved glass corner at the north end of the street face, with white bands and roof planting.
  {
    const corner = front.a[1] < front.b[1] ? front.a : front.b;
    const c = centroid(tiuPts);
    const dl = Math.hypot(c[0] - corner[0], c[1] - corner[1]);
    const centre = [corner[0] + ((c[0] - corner[0]) / dl) * 7.5, corner[1] + ((c[1] - corner[1]) / dl) * 7.5];
    const radius = 11;
    facades.tiuGlass.repeat.set(1, 1);
    const drumTex = facades.tiuGlass.clone();
    drumTex.repeat.set(Math.round((2 * Math.PI * radius) / 3.2), 8);
    drumTex.needsUpdate = true;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 8 * FLOOR, 48, 1, true), new THREE.MeshStandardMaterial({ map: drumTex, roughness: 0.3, metalness: 0.3, envMapIntensity: 1.2 }));
    drum.position.set(centre[0], FLOOR + 4 * FLOOR, centre[1]);
    add(drum);
    for (const [y, h] of [[FLOOR / 2, FLOOR], [9 * FLOOR + 1.2, 2.4]]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.15, radius + 0.15, h, 48), mats.white);
      band.position.set(centre[0], y, centre[1]);
      add(band);
    }
    world.createCollider(RAPIER.ColliderDesc.cylinder(tiuHeight / 2, radius + 0.15).setTranslation(centre[0], tiuHeight / 2, centre[1]));
    const shrubMat = new THREE.MeshStandardMaterial({ color: "#4f7f38", roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(range(0.9, 1.6), 1), shrubMat);
      shrub.position.set(centre[0] + Math.sin(a) * (radius - 1.4), 10 * FLOOR + 0.8, centre[1] + Math.cos(a) * (radius - 1.4));
      add(shrub);
    }
    // taller white service tower at the back, as in the photos
    const back = tiuEdges.filter((e) => e.nx < -0.5).sort((a, b) => b.len - a.len)[0];
    const bx = (back.a[0] + back.b[0]) / 2 - back.nx * 7;
    const bz = (back.a[1] + back.b[1]) / 2 - back.nz * 7;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 12), mats.white);
    tower.position.set(bx, tiuHeight + 3.5, bz);
    tower.rotation.y = phi;
    add(tower);
  }
  const tiuLabel = makeLabel("Techno India University", { height: 3 });
  tiuLabel.position.set(mid[0] - front.nx * 12, tiuHeight + 12, mid[1] - front.nz * 12);
  scene.add(tiuLabel);

  // ---------- the main entrance (covered porch cut into the street face) ----------
  const porch = new THREE.Group();
  porch.position.set(mid[0], 0, mid[1]);
  porch.rotation.y = phi;
  scene.add(porch);
  // Box placed in local coordinates. `solid` also makes it block the player.
  function pbox(w, h, d, x, y, z, material, { solid = false, cast = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    porch.add(m);
    if (solid) {
      const [wx, wz] = local(x, z);
      solidBox(w, h, d, wx, y, wz, phi);
    }
    return m;
  }
  {
    const { half, depth, height, floor } = PORCH;
    const W = half * 2;
    const tileTex = tex.tile.clone();
    tileTex.repeat.set(W / 1.4, (depth + 3) / 1.4);
    tileTex.needsUpdate = true;
    const tileMat = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.35, metalness: 0.05 });
    const stone = new THREE.MeshStandardMaterial({ color: "#aaa7a1", roughness: 0.6 });
    pbox(W, floor, depth + 3, 0, floor / 2, -depth / 2 + 1.5, [stone, stone, tileMat, stone, stone, stone], { solid: true, cast: false });
    pbox(W, 0.3, 0.4, 0, 0.15, 3.2, stone, { solid: true, cast: false });
    pbox(W, 0.15, 0.4, 0, 0.075, 3.6, stone, { solid: true, cast: false });

    const perf = (w, h) => {
      const t = tex.perforated.clone();
      t.repeat.set(w / 1.2, h / 1.2);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
    };
    // back wall: dimpled tiles, then the name band, then screens
    const lowH = 4.2;
    pbox(W, lowH, 0.4, 0, floor + lowH / 2, -depth + 0.2, perf(W, lowH), { solid: true });
    pbox(9.5, 3.7, 0.2, 0, floor + 1.85, -depth + 0.5, mats.dark); // glass doors
    for (const x of [-2.4, 0, 2.4]) pbox(0.08, 3.7, 0.24, x, floor + 1.85, -depth + 0.52, mats.white, { cast: false });
    const sign = texture(2048, 128, (g, w, h) => {
      g.fillStyle = "#d8d1bf";
      g.fillRect(0, 0, w, h);
      g.font = "700 62px Arial, Helvetica, sans-serif";
      g.textBaseline = "middle";
      g.fillStyle = "#3a2c08";
      g.textAlign = "right";
      g.fillText("TECHNO INDIA GROUP", w / 2 - 110 + 3, h / 2 + 5);
      g.textAlign = "left";
      g.fillText("TECHNO INDIA UNIVERSITY", w / 2 + 110 + 3, h / 2 + 5);
      g.fillStyle = "#c79a1e";
      g.textAlign = "right";
      g.fillText("TECHNO INDIA GROUP", w / 2 - 110, h / 2 + 2);
      g.textAlign = "left";
      g.fillText("TECHNO INDIA UNIVERSITY", w / 2 + 110, h / 2 + 2);
    }, { repeat: false });
    const signMat = new THREE.MeshStandardMaterial({ map: sign, roughness: 0.7 });
    const bandH = 1.75;
    pbox(W, bandH, 0.5, 0, floor + lowH + bandH / 2, -depth + 0.25, [mats.beige, mats.beige, mats.beige, mats.beige, signMat, mats.beige]);
    // the university's logo, from public/logo.png, in the middle of the name band and on the desk
    const logoTex = new THREE.TextureLoader().load("/logo.png");
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = maxAniso;
    const logoMat = new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.55 });
    const signLogo = new THREE.Mesh(new THREE.CircleGeometry(0.8, 48), logoMat);
    signLogo.position.set(0, floor + lowH + bandH / 2, -depth + 0.52);
    porch.add(signLogo);
    const topH = height - floor - lowH - bandH;
    pbox(W, topH, 0.4, 0, height - topH / 2, -depth + 0.2, mats.beige);
    pbox(8, topH - 0.3, 0.1, 0, height - topH / 2, -depth + 0.45, new THREE.MeshStandardMaterial({ color: "#5c4a3c", roughness: 0.6 }));
    const screenMat = new THREE.MeshStandardMaterial({ color: "#cfd6ff", emissive: "#8f9cff", emissiveIntensity: 0.5, roughness: 0.3 });
    for (const x of [-9.6, 9.6]) pbox(3.4, topH - 0.25, 0.12, x, height - topH / 2, -depth + 0.46, screenMat, { cast: false });
    // side walls, ceiling of dark red slats, white beams and columns
    for (const x of [-half + 0.2, half - 0.2]) pbox(0.4, height - floor, depth, x, floor + (height - floor) / 2, -depth / 2, perf(depth, height), { solid: true });
    const slat = tex.slats.clone();
    slat.repeat.set(W / 0.8, 1);
    slat.needsUpdate = true;
    pbox(W, 0.25, depth, 0, height + 0.02, -depth / 2, new THREE.MeshStandardMaterial({ map: slat, roughness: 0.7 }));
    for (const x of [-4.8, 4.8]) pbox(1, 0.5, depth, x, height - 0.35, -depth / 2, mats.white);
    for (const x of [-9.3, 9.3]) pbox(0.7, height - floor, 0.7, x, floor + (height - floor) / 2, -0.6, mats.white, { solid: true });
    // reception desk on the right, wooden table on the left
    const desk = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.1, 32, 1, false, -Math.PI / 2, Math.PI), mats.white);
    desk.position.set(9.2, floor + 0.55, -5.2);
    desk.castShadow = true;
    porch.add(desk);
    const deskBand = new THREE.Mesh(new THREE.CylinderGeometry(2.33, 2.33, 0.25, 32, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: "#6b3f2a", roughness: 0.6 }));
    deskBand.position.set(9.2, floor + 0.45, -5.2);
    porch.add(deskBand);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), logoMat);
    logo.position.set(9.2, floor + 0.78, -5.2 + 2.34);
    porch.add(logo);
    {
      const [wx, wz] = local(9.2, -4.1);
      solidBox(4.6, 1.1, 2.4, wx, floor + 0.55, wz, phi);
    }
    pbox(6, 0.08, 1.3, -9, floor + 0.86, -3.6, mats.wood, { cast: true });
    pbox(5.8, 0.82, 1.1, -9, floor + 0.41, -3.6, new THREE.MeshStandardMaterial({ color: "#8d5f2e", roughness: 0.8 }), { solid: true });
    const potMat = new THREE.MeshStandardMaterial({ color: "#f0eee8", roughness: 0.6 });
    const leafMat = new THREE.MeshStandardMaterial({ color: "#3f8a3a", roughness: 1 });
    for (const x of [-5.6, 5.6]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.55, 14), potMat);
      pot.position.set(x, floor + 0.28, -depth + 1);
      const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), leafMat);
      plant.position.set(x, floor + 1.05, -depth + 1);
      plant.scale.y = 1.4;
      pot.castShadow = plant.castShadow = true;
      porch.add(pot, plant);
    }
    places.push({ name: "Main Entrance", x: local(0, 0)[0], z: local(0, 0)[1] });
  }

  // ---------- forecourt, railing, planting beds, gate ----------
  const FENCE_Z = 6.3;
  const stripEnd = 50;
  flat([local(-stripEnd, 0), local(stripEnd, 0), local(stripEnd, FENCE_Z + 0.3), local(-stripEnd, FENCE_Z + 0.3)], 0.035, layer(tex.paver, 4), 3);
  const fenceMat = new THREE.MeshStandardMaterial({ map: tex.fence, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  function fenceRun(x0, x1) {
    const len = x1 - x0;
    const geo = new THREE.PlaneGeometry(len, 1.5);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * Math.round(len / 3));
    const rail = new THREE.Mesh(geo, fenceMat);
    rail.position.set((x0 + x1) / 2, 1.05, FENCE_Z);
    rail.castShadow = true;
    porch.add(rail);
    pbox(len, 0.3, 0.3, (x0 + x1) / 2, 0.15, FENCE_Z, mats.concrete, { cast: false });
    const [wx, wz] = local((x0 + x1) / 2, FENCE_Z);
    solidBox(len, 1.9, 0.25, wx, 0.95, wz, phi);
  }
  fenceRun(-stripEnd, -7.4);
  fenceRun(7.4, stripEnd);
  for (const x of [-7, 7]) {
    pbox(0.8, 2.7, 0.8, x, 1.35, FENCE_Z, mats.white, { solid: true });
    pbox(1, 0.25, 1, x, 2.82, FENCE_Z, mats.blue);
  }
  const beds = [[-46, -15], [15, 31]]; // planting beds either side of the entrance (local x from, to)
  for (const [x0, x1] of beds) pbox(x1 - x0, 0.4, 4, (x0 + x1) / 2, 0.2, 3.2, mats.brick, { solid: true });

  // ---------- other buildings ----------
  const styles = [
    { mat: mats.glassTower, bay: 3.6, floors: [8, 14] },
    { mat: mats.ribbon, bay: 4, floors: [4, 8] },
    { mat: mats.punched, bay: 4, floors: [4, 9] },
    { mat: mats.ochre, bay: 4, floors: [3, 6] },
  ];
  const known = { 362948118: [5, 2], 134101285: [6, 1], 362948196: [5, 3] }; // floors and style for the neighbours we know
  const footprints = [tiuPts];
  for (const b of campus.buildings) {
    if (b.id === TIU_ID) continue;
    const pts = outward(b.pts);
    footprints.push(pts);
    const style = known[b.id] ? styles[known[b.id][1]] : /office|pwc|ibm|tcs/i.test(b.name) ? styles[0] : pick(styles);
    const floors = known[b.id] ? known[b.id][0] : Math.round(range(style.floors[0], style.floors[1]));
    const h = floors * FLOOR;
    for (const e of edgesOf(pts)) {
      if (e.len < 0.5) continue;
      wall(e.a, e.b, 0, h, style.mat, style.bay, FLOOR, e.nx, e.nz);
      wall(e.a, e.b, h, h + 1, mats.beige, 4, 1, e.nx, e.nz);
      edgeCollider(e, h);
    }
    flat(pts, h + 0.1, mats.roof, 4);
    const c = centroid(pts);
    for (let i = 0; i < 2; i++) {
      // black rooftop water tanks
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 12), mats.tank);
      tank.position.set(c[0] + range(-4, 4), h + 1.9, c[1] + range(-4, 4));
      add(tank);
    }
    if (b.name) {
      const label = makeLabel(b.name, { height: 2.4 });
      label.position.set(c[0], h + 6, c[1]);
      scene.add(label);
    }
  }
  for (const l of campus.labels) if (!/^techno india university$/i.test(l.name)) places.push({ name: l.name, x: l.x, z: l.z });

  // Far-off blocks so the horizon is not empty. Purely scenery.
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = range(290, 520);
    const w = range(24, 60);
    const d = range(24, 60);
    const h = Math.round(range(4, 16)) * FLOOR;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const style = pick(styles);
    const corners = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]];
    for (const e of edgesOf(outward(corners))) wall(e.a, e.b, 0, h, style.mat, style.bay, FLOOR, e.nx, e.nz);
    flat(corners, h, mats.roof, 4);
  }

  // ---------- building under construction next door ----------
  const nearEntrance = (x, z, margin = 0) => {
    const [lx, lz] = toLocal(x, z);
    return Math.abs(lx) < stripEnd + 2 + margin && lz > -12 && lz < FENCE_Z + 3 + margin;
  };
  const freeSpot = (x, z, r) => roadClear(x, z, r) && footprints.every((f) => !inPoly(x, z, f) && distToPath(x, z, f, true) > r) && !nearEntrance(x, z, r);
  {
    const options = [];
    for (const site of campus.construction) {
      const c = centroid(site.pts);
      for (let i = 0; i < 400; i++) {
        const x = c[0] + range(-80, 80);
        const z = c[1] + range(-70, 70);
        if (inPoly(x, z, site.pts) && freeSpot(x, z, 17)) options.push([x, z]);
      }
    }
    options.sort((a, b) => Math.hypot(a[0] - mid[0], a[1] - mid[1]) - Math.hypot(b[0] - mid[0], b[1] - mid[1]));
    const spot = options[0];
    if (spot) {
      const site = new THREE.Group();
      site.position.set(spot[0], 0, spot[1]);
      site.rotation.y = phi;
      scene.add(site);
      const part = (w, h, d, x, y, z, material) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        m.position.set(x, y, z);
        m.castShadow = m.receiveShadow = true;
        site.add(m);
      };
      const W = 24;
      const D = 16;
      const levels = 5;
      for (let l = 1; l <= levels; l++) part(W, 0.3, D, 0, l * 3.6, 0, mats.concrete);
      for (let ix = 0; ix <= 4; ix++)
        for (let iz = 0; iz <= 2; iz++) {
          const x = -W / 2 + 0.4 + (ix * (W - 0.8)) / 4;
          const z = -D / 2 + 0.4 + (iz * (D - 0.8)) / 2;
          part(0.6, levels * 3.6, 0.6, x, (levels * 3.6) / 2, z, mats.concrete);
          for (let k = 0; k < 4; k++) part(0.05, 1.6, 0.05, x + (k % 2 ? 0.2 : -0.2), levels * 3.6 + 0.9, z + (k < 2 ? 0.2 : -0.2), mats.tank); // bare steel bars
        }
      const brickTex = tex.brick.clone();
      brickTex.repeat.set(3, 2);
      brickTex.needsUpdate = true;
      const infill = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 1 });
      for (let l = 0; l < 3; l++)
        for (let ix = 0; ix < 4; ix++) {
          if ((ix + l) % 3 === 2) continue;
          part((W - 0.8) / 4 - 0.6, 3.3, 0.25, -W / 2 + 0.4 + ((ix + 0.5) * (W - 0.8)) / 4, l * 3.6 + 1.8, D / 2 - 0.4, infill);
          part((W - 0.8) / 4 - 0.6, 3.3, 0.25, -W / 2 + 0.4 + ((ix + 0.5) * (W - 0.8)) / 4, l * 3.6 + 1.8, -D / 2 + 0.4, infill);
        }
      solidBox(W, levels * 3.6, D, spot[0], (levels * 3.6) / 2, spot[1], phi);
      footprints.push([[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]].map(([x, z]) => [spot[0] + x * cosP + z * sinP, spot[1] - x * sinP + z * cosP]));
      places.push({ name: "Construction site", x: spot[0], z: spot[1] });
    }
  }

  // ---------- trees, palms and shrubs ----------
  const trunks = [];
  const crowns = [];
  const fronds = [];
  const greens = ["#3f7d33", "#4c8a3a", "#5a9641", "#356e2e", "#6a9a45"];
  function broadleaf(x, z, y = 0, flowering = false, collide = true) {
    const h = range(3.2, 5.2);
    trunks.push({ x, y, z, h, r: range(0.22, 0.34) });
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = i === 0 ? 0 : range(1, 2.2);
      crowns.push({ x: x + Math.sin(a) * r, y: y + h + range(0.4, 2.2), z: z + Math.cos(a) * r, s: range(1.7, 2.8), color: pick(greens) });
    }
    if (flowering) for (let i = 0; i < 5; i++) crowns.push({ x: x + range(-2.2, 2.2), y: y + h + range(2, 3.2), z: z + range(-2.2, 2.2), s: range(0.8, 1.3), color: pick(["#e8791f", "#f08c1f", "#e0561c", "#f2b21f"]) });
    if (collide) world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, 0.35).setTranslation(x, y + h / 2, z));
  }
  function palm(x, z, y = 0, collide = true) {
    const h = range(6.5, 9.5);
    trunks.push({ x, y, z, h, r: 0.2, palm: true });
    const n = 11;
    for (let i = 0; i < n; i++) fronds.push({ x, y: y + h, z, yaw: (i / n) * Math.PI * 2 + rand(), tilt: range(-0.5, 0.25), s: range(0.85, 1.15) });
    if (collide) world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, 0.3).setTranslation(x, y + h / 2, z));
  }
  function shrub(x, z, y, flowers) {
    crowns.push({ x, y: y + 0.6, z, s: range(0.7, 1.1), color: pick(greens) });
    if (flowers) for (let i = 0; i < 3; i++) crowns.push({ x: x + range(-0.6, 0.6), y: y + range(0.9, 1.4), z: z + range(-0.6, 0.6), s: 0.22, color: "#f6f4ee" });
  }
  const planted = [];
  const tryTree = (x, z, gap) => {
    if (Math.hypot(x, z) > WORLD_HALF - 6 || !freeSpot(x, z, 1.6)) return;
    if (campus.pitches.some((p) => inPoly(x, z, p.pts))) return;
    if (planted.some((p) => Math.hypot(p[0] - x, p[1] - z) < gap)) return;
    planted.push([x, z]);
    const kind = rand();
    if (kind < 0.2) palm(x, z);
    else broadleaf(x, z, 0, kind > 0.72);
  };
  // along the main road
  for (const r of mainRoads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 6; s < len; s += 15) {
        const side = ROAD_WIDTH[r.kind] / 2 + 3.4;
        for (const sign of [-1, 1]) {
          const x = a[0] + ((b[0] - a[0]) * s) / len + ((-(b[1] - a[1]) / len) * side + range(-0.6, 0.6)) * sign;
          const z = a[1] + ((b[1] - a[1]) * s) / len + (((b[0] - a[0]) / len) * side + range(-0.6, 0.6)) * sign;
          if (mainRoads.every((o) => o.pts.length < 2 || distToPath(x, z, o.pts) > 5.8)) tryTree(x, z, 9);
        }
      }
    }
  }
  // scattered around the neighbourhood
  for (let i = 0; i < 520; i++) tryTree(range(-WORLD_HALF, WORLD_HALF), range(-WORLD_HALF, WORLD_HALF), 7);
  // lush planting in the beds behind the railing, as in the street photos
  for (const [x0, x1] of beds) {
    for (let x = x0 + 1.2; x < x1 - 0.8; x += 1.5) {
      for (const z of [2.1, 3.3, 4.5]) {
        const [wx, wz] = local(x + range(-0.3, 0.3), z + range(-0.3, 0.3));
        shrub(wx, wz, 0.4, rand() < 0.6);
      }
    }
    for (let x = x0 + 3; x < x1 - 2; x += 7.5) {
      const [wx, wz] = local(x, 3);
      if (rand() < 0.5) palm(wx, wz, 0.4, false);
      else broadleaf(wx, wz, 0.4, rand() < 0.5, false);
    }
  }
  {
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const p = crownGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (Math.sin(p.getX(i) * 5.1) + Math.sin(p.getY(i) * 6.3 + 1) + Math.sin(p.getZ(i) * 4.7 + 2)) * 0.07;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.82, p.getZ(i) * k);
    }
    crownGeo.computeVertexNormals();
    const crownMesh = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), crowns.length);
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 8);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), trunks.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    crowns.forEach((c, i) => {
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(0, rand() * 6, 0);
      dummy.scale.setScalar(c.s);
      dummy.updateMatrix();
      crownMesh.setMatrixAt(i, dummy.matrix);
      crownMesh.setColorAt(i, color.set(c.color).multiplyScalar(range(0.85, 1.1)));
    });
    trunks.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(t.r, t.h, t.r);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
      trunkMesh.setColorAt(i, color.set(t.palm ? "#8a7a62" : "#6f5136"));
    });
    // palm frond: a long leaf that droops toward its tip
    const frondGeo = new THREE.PlaneGeometry(0.9, 3.6, 1, 6);
    frondGeo.translate(0, 1.8, 0);
    const fp = frondGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const t = fp.getY(i) / 3.6;
      fp.setXYZ(i, fp.getX(i) * (1 - t * 0.85), t * 3.4 * Math.cos(t * 1.25), t * 3.4 * Math.sin(t * 1.25));
    }
    frondGeo.rotateX(Math.PI / 2 - 0.9);
    frondGeo.computeVertexNormals();
    const frondMesh = new THREE.InstancedMesh(frondGeo, new THREE.MeshStandardMaterial({ color: "#4f8a35", roughness: 1, side: THREE.DoubleSide }), fronds.length);
    fronds.forEach((f, i) => {
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(f.tilt, f.yaw, 0, "YXZ");
      dummy.scale.setScalar(f.s);
      dummy.updateMatrix();
      frondMesh.setMatrixAt(i, dummy.matrix);
    });
    for (const m of [crownMesh, trunkMesh, frondMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  // ---------- street lamps with three globes ----------
  {
    const spots = [];
    for (const x of [-45, -27, -10.5, 10.5, 27, 45]) spots.push(local(x, FENCE_Z + 0.9));
    for (const r of mainRoads) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i];
        const b = r.pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = 14; s < len; s += 30) {
          const side = ROAD_WIDTH[r.kind] / 2 + 1.2;
          const x = a[0] + ((b[0] - a[0]) * s) / len + (-(b[1] - a[1]) / len) * side;
          const z = a[1] + ((b[1] - a[1]) * s) / len + ((b[0] - a[0]) / len) * side;
          if (!nearEntrance(x, z, 4) && footprints.every((f) => !inPoly(x, z, f)) && Math.hypot(x, z) < WORLD_HALF) spots.push([x, z]);
        }
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 6, 8);
    poleGeo.translate(0, 3, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: "#e9e9e6", roughness: 0.5, metalness: 0.3 }), spots.length);
    const globes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff6dc", emissiveIntensity: 0.35, roughness: 0.3 }), spots.length * 3);
    const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(0.34, 0.22, 12), new THREE.MeshStandardMaterial({ color: "#4a4d52", roughness: 0.6 }), spots.length * 3);
    const dummy = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + i;
        const gy = k === 0 ? 6.3 : 5.5;
        const gr = k === 0 ? 0 : 0.75;
        dummy.position.set(x + Math.sin(a) * gr, gy, z + Math.cos(a) * gr);
        dummy.updateMatrix();
        globes.setMatrixAt(i * 3 + k, dummy.matrix);
        dummy.position.y = gy + 0.32;
        dummy.updateMatrix();
        caps.setMatrixAt(i * 3 + k, dummy.matrix);
      }
      world.createCollider(RAPIER.ColliderDesc.cylinder(3, 0.12).setTranslation(x, 3, z));
    });
    poles.castShadow = true;
    scene.add(poles, globes, caps);
  }

  // ---------- parked cars, a yellow taxi and a no-parking sign ----------
  function car(lx, lz, bodyColor, taxi = false) {
    const g = new THREE.Group();
    const [x, z] = local(lx, lz);
    g.position.set(x, 0, z);
    g.rotation.y = phi;
    const paint = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.4, envMapIntensity: 1 });
    const glass = new THREE.MeshStandardMaterial({ color: "#1e2a33", roughness: 0.15, metalness: 0.7 });
    const tyre = new THREE.MeshStandardMaterial({ color: "#161616", roughness: 0.9 });
    const part = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    part(new THREE.BoxGeometry(4.2, 0.62, 1.7), paint, 0, 0.62, 0);
    part(new THREE.BoxGeometry(2.2, 0.58, 1.56), paint, -0.15, 1.2, 0);
    part(new THREE.BoxGeometry(2.24, 0.4, 1.6), glass, -0.15, 1.17, 0);
    part(new THREE.BoxGeometry(2.0, 0.08, 1.5), paint, -0.15, 1.5, 0);
    for (const wx of [-1.3, 1.3])
      for (const wz of [-0.82, 0.82]) {
        const wheel = part(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16), tyre, wx, 0.33, wz);
        wheel.rotation.x = Math.PI / 2;
      }
    if (taxi) part(new THREE.BoxGeometry(0.5, 0.16, 0.24), new THREE.MeshStandardMaterial({ color: "#111" }), -0.15, 1.62, 0);
    scene.add(g);
    solidBox(4.2, 1.5, 1.7, x, 0.75, z, phi);
  }
  const kerb = FENCE_Z + 3.2;
  car(19, kerb, "#f2c31b", true);
  car(25.5, kerb, "#e9e9ea");
  car(-17, kerb, "#a02a26");
  car(-36, kerb, "#2f4d7a");
  {
    const [x, z] = local(-22, FENCE_Z + 0.8);
    const signTex = texture(128, 128, (g) => {
      g.fillStyle = "#2f6fc0";
      g.beginPath();
      g.arc(64, 64, 60, 0, 7);
      g.fill();
      g.strokeStyle = "#d8242c";
      g.lineWidth = 14;
      g.beginPath();
      g.arc(64, 64, 52, 0, 7);
      g.moveTo(26, 26);
      g.lineTo(102, 102);
      g.stroke();
    }, { repeat: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshStandardMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide, roughness: 0.5 }));
    disc.position.set(x, 2.9, z);
    disc.rotation.y = phi;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8), mats.blue);
    pole.position.set(x, 1.6, z);
    pole.castShadow = true;
    scene.add(disc, pole);
  }

  // ---------- loose objects moved by physics ----------
  function prop(mesh, colliderDesc, x, y, z) {
    const rigid = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.3).setAngularDamping(0.6));
    world.createCollider(colliderDesc, rigid);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    props.push({ mesh, body: rigid, home: { x, y, z } });
  }
  const ballSpots = [local(-10.5, 4.8)];
  if (campus.pitches.length) {
    const c = centroid(campus.pitches[campus.pitches.length - 1].pts);
    ballSpots.push([c[0], c[1]], [c[0] + 4, c[1] - 3], [c[0] - 5, c[1] + 4]);
  }
  for (const [x, z] of ballSpots) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshStandardMaterial({ color: "#f4f4f4", flatShading: true, roughness: 0.5 }));
    prop(ball, RAPIER.ColliderDesc.ball(0.35).setRestitution(0.7).setFriction(0.6).setDensity(0.4), x, 0.4, z);
  }
  const crateMat = new THREE.MeshStandardMaterial({ color: "#b98646", roughness: 1 });
  for (const [lx, y, lz] of [[-11.5, 0.4, 5.3], [-12.4, 0.4, 5.3], [-11.95, 1.2, 5.3]]) {
    const [x, z] = local(lx, lz);
    prop(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), crateMat), RAPIER.ColliderDesc.cuboid(0.4, 0.4, 0.4).setFriction(0.8).setDensity(0.5), x, y, z);
  }

  flushWalls();

  return {
    places,
    props,
    // where the fly-over camera looks, and which way a new arrival faces (toward the entrance)
    focus: { x: mid[0], z: mid[1], height: tiuHeight },
    entranceYaw: phi,
    local,
  };
}
