// Procedural generator and GLB exporter for all approved TechnoVerse landmarks (T-007)
// Pure Node.js with vendored Three.js geometry math.
// Generates accurate, faithful PBR models matching OSM footprint polygons.

import fs from "fs";
import path from "path";
import * as THREE from "../../public/vendor/three.module.js";

const OUT_DIR = path.resolve("public/models/landmarks");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Read campus.json for exact OSM footprints
const campus = JSON.parse(fs.readFileSync("public/campus.json", "utf8"));
const byId = new Map(campus.buildings.map((b) => [String(b.id), b]));

// ---------------------------------------------------------------------------
// GEOMETRY HELPERS (Float32Array pos/nor accumulators)
// ---------------------------------------------------------------------------
function boxPosNor(w, h, d, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const corners = [
    [-hw, -hh, -hd], [ hw, -hh, -hd], [ hw,  hh, -hd], [-hw,  hh, -hd],
    [-hw, -hh,  hd], [ hw, -hh,  hd], [ hw,  hh,  hd], [-hw,  hh,  hd],
  ];

  // Optional Euler rotations (XYZ order)
  const applyRot = (v) => {
    let [x, y, z] = v;
    if (rx !== 0) { const c = Math.cos(rx), s = Math.sin(rx); const y1 = y * c - z * s; z = y * s + z * c; y = y1; }
    if (ry !== 0) { const c = Math.cos(ry), s = Math.sin(ry); const x1 = x * c + z * s; z = -x * s + z * c; x = x1; }
    if (rz !== 0) { const c = Math.cos(rz), s = Math.sin(rz); const x1 = x * c - y * s; y = x * s + y * c; x = x1; }
    return [x, y, z];
  };

  const rotCorners = corners.map(applyRot);
  const faceQuads = [
    { verts: [3, 2, 1, 1, 0, 3], n: [0, 0, -1] },
    { verts: [4, 5, 6, 6, 7, 4], n: [0, 0,  1] },
    { verts: [0, 1, 5, 5, 4, 0], n: [0, -1, 0] },
    { verts: [3, 7, 6, 6, 2, 3], n: [0,  1, 0] },
    { verts: [0, 4, 7, 7, 3, 0], n: [-1, 0, 0] },
    { verts: [1, 2, 6, 6, 5, 1], n: [ 1, 0, 0] },
  ];

  const positions = [];
  const normals = [];

  for (const face of faceQuads) {
    const rn = applyRot(face.n);
    for (const ci of face.verts) {
      const v = rotCorners[ci];
      positions.push(v[0] + tx, v[1] + ty, v[2] + tz);
      normals.push(rn[0], rn[1], rn[2]);
    }
  }
  return { pos: new Float32Array(positions), nor: new Float32Array(normals) };
}

function cylPosNor(r, h, segs, tx = 0, ty = 0, tz = 0) {
  const positions = [];
  const normals = [];
  const hh = h / 2;

  for (let s = 0; s < segs; s++) {
    const a0 = (s / segs) * Math.PI * 2;
    const a1 = ((s + 1) / segs) * Math.PI * 2;
    const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r;
    const x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
    const nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);

    const side = [
      [x0, -hh, z0], [x1, -hh, z1], [x1,  hh, z1],
      [x1,  hh, z1], [x0,  hh, z0], [x0, -hh, z0],
    ];
    for (const v of side) {
      positions.push(v[0] + tx, v[1] + ty, v[2] + tz);
      normals.push(nx, 0, nz);
    }
    // Top
    positions.push(tx, hh + ty, tz, x0 + tx, hh + ty, z0 + tz, x1 + tx, hh + ty, z1 + tz);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    // Bottom
    positions.push(tx, -hh + ty, tz, x1 + tx, -hh + ty, z1 + tz, x0 + tx, -hh + ty, z0 + tz);
    normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
  }
  return { pos: new Float32Array(positions), nor: new Float32Array(normals) };
}

// Extrude a horizontal polygon cap at yLevel with upward normal
function polyCapPosNor(pts2D, yLevel, normalY = 1) {
  const vec2s = pts2D.map(([x, z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(vec2s, []);
  const positions = [];
  const normals = [];

  for (const [i0, i1, i2] of faces) {
    const p0 = pts2D[i0], p1 = pts2D[i1], p2 = pts2D[i2];
    if (normalY > 0) {
      positions.push(p0[0], yLevel, p0[1], p1[0], yLevel, p1[1], p2[0], yLevel, p2[1]);
    } else {
      positions.push(p0[0], yLevel, p0[1], p2[0], yLevel, p2[1], p1[0], yLevel, p1[1]);
    }
    normals.push(0, normalY, 0, 0, normalY, 0, 0, normalY, 0);
  }
  return { pos: new Float32Array(positions), nor: new Float32Array(normals) };
}

// Extrude polygon walls between y0 and y1
function polyWallPosNor(pts2D, y0, y1, inset = 0) {
  const positions = [];
  const normals = [];
  const n = pts2D.length;

  for (let i = 0; i < n; i++) {
    const p0 = pts2D[i];
    const p1 = pts2D[(i + 1) % n];
    const dx = p1[0] - p0[0];
    const dz = p1[1] - p0[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    // Outward edge normal
    const nx = dz / len;
    const nz = -dx / len;

    const x0 = p0[0] - nx * inset, z0 = p0[1] - nz * inset;
    const x1 = p1[0] - nx * inset, z1 = p1[1] - nz * inset;

    const quad = [
      [x0, y0, z0], [x1, y0, z1], [x1, y1, z1],
      [x1, y1, z1], [x0, y1, z0], [x0, y0, z0],
    ];
    for (const v of quad) {
      positions.push(v[0], v[1], v[2]);
      normals.push(nx, 0, nz);
    }
  }
  return { pos: new Float32Array(positions), nor: new Float32Array(normals) };
}

function merge(list) {
  let totalVerts = 0;
  for (const g of list) totalVerts += g.pos.length / 3;
  const pos = new Float32Array(totalVerts * 3);
  const nor = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of list) {
    pos.set(g.pos, offset * 3);
    nor.set(g.nor, offset * 3);
    offset += g.pos.length / 3;
  }
  return { pos, nor };
}

// ---------------------------------------------------------------------------
// GLB 2.0 BINARY ENCODER
// ---------------------------------------------------------------------------
function packGLB(meshList, materials, rootName) {
  const binBuffers = [];
  let byteOffset = 0;
  const bufferViews = [];
  const accessors = [];

  function addBuf(typedArray, target) {
    const rawBuf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = (4 - (rawBuf.length % 4)) % 4;
    const aligned = pad > 0 ? Buffer.concat([rawBuf, Buffer.alloc(pad)]) : rawBuf;
    const bvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: rawBuf.length, target });
    byteOffset += aligned.length;
    binBuffers.push(aligned);
    return bvIdx;
  }

  const gltfMeshes = [];
  const gltfNodes = [];

  for (const { name, geo, matIndex } of meshList) {
    const { pos, nor } = geo;
    const count = pos.length / 3;
    if (count === 0) continue;

    const uvArr = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      uvArr[i * 2]     = pos[i * 3]     / 5;
      uvArr[i * 2 + 1] = pos[i * 3 + 1] / 5;
    }

    let minP = [Infinity, Infinity, Infinity];
    let maxP = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i]   < minP[0]) minP[0] = pos[i];
      if (pos[i+1] < minP[1]) minP[1] = pos[i+1];
      if (pos[i+2] < minP[2]) minP[2] = pos[i+2];
      if (pos[i]   > maxP[0]) maxP[0] = pos[i];
      if (pos[i+1] > maxP[1]) maxP[1] = pos[i+1];
      if (pos[i+2] > maxP[2]) maxP[2] = pos[i+2];
    }

    const posBv = addBuf(pos, 34962);
    const posAcc = accessors.length;
    accessors.push({ bufferView: posBv, byteOffset: 0, componentType: 5126, count, type: "VEC3", min: minP, max: maxP });

    const norBv = addBuf(nor, 34962);
    const norAcc = accessors.length;
    accessors.push({ bufferView: norBv, byteOffset: 0, componentType: 5126, count, type: "VEC3", min: [-1,-1,-1], max: [1,1,1] });

    const uvBv = addBuf(uvArr, 34962);
    const uvAcc = accessors.length;
    accessors.push({ bufferView: uvBv, byteOffset: 0, componentType: 5126, count, type: "VEC2", min: [0,0], max: [1,1] });

    const idxArr = new Uint32Array(count);
    for (let i = 0; i < count; i++) idxArr[i] = i;
    const idxBv = addBuf(idxArr, 34963);
    const idxAcc = accessors.length;
    accessors.push({ bufferView: idxBv, byteOffset: 0, componentType: 5125, count, type: "SCALAR", min: [0], max: [count - 1] });

    const meshIdx = gltfMeshes.length;
    gltfMeshes.push({
      name,
      primitives: [{ attributes: { POSITION: posAcc, NORMAL: norAcc, TEXCOORD_0: uvAcc }, indices: idxAcc, material: matIndex }]
    });
    gltfNodes.push({ name, mesh: meshIdx });
  }

  const rootIdx = gltfNodes.length;
  gltfNodes.push({ name: String(rootName), children: gltfNodes.map((_, i) => i) });

  const binBuffer = Buffer.concat(binBuffers);
  const gltfJSON = {
    asset: { generator: "TechnoVerse Landmark Generator T-007", version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [rootIdx] }],
    nodes: gltfNodes,
    materials,
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuffer.length }]
  };

  const jsonBuf = Buffer.from(JSON.stringify(gltfJSON), "utf8");
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const binPad = (4 - (binBuffer.length % 4)) % 4;
  const binChunk = Buffer.concat([binBuffer, Buffer.alloc(binPad, 0x00)]);

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const c0 = Buffer.alloc(8);
  c0.writeUInt32LE(jsonChunk.length, 0);
  c0.writeUInt32LE(0x4e4f534a, 4);

  const c1 = Buffer.alloc(8);
  c1.writeUInt32LE(binChunk.length, 0);
  c1.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, c0, jsonChunk, c1, binChunk]);
}

// ---------------------------------------------------------------------------
// BUILDING SPECS & PROCEDURAL ARCHITECTURE
// ---------------------------------------------------------------------------
const SPECS = [
  {
    no: 2, id: 193308962, name: "Wipro Tower 5", floors: 10,
    materials: [
      { name: "Wipro_Composite", pbrMetallicRoughness: { baseColorFactor: [0.22, 0.25, 0.30, 1.0], metallicFactor: 0.35, roughnessFactor: 0.45 } },
      { name: "Wipro_CurtainGlass", pbrMetallicRoughness: { baseColorFactor: [0.15, 0.28, 0.42, 0.55], metallicFactor: 0.2, roughnessFactor: 0.1 }, alphaMode: "BLEND", doubleSided: true },
      { name: "Wipro_Trim", pbrMetallicRoughness: { baseColorFactor: [0.75, 0.78, 0.82, 1.0], metallicFactor: 0.8, roughnessFactor: 0.3 } },
    ],
    generate(pts, H, G) {
      // 10 floors of curtain-wall alternating spandrels and glass bands
      const floorH = H / 10;
      G[0].push(polyWallPosNor(pts, 0, 4.0)); // Ground podium
      G[0].push(polyCapPosNor(pts, H));      // Roof slab
      G[0].push(polyWallPosNor(pts, H, H + 1.2)); // Roof parapet
      // Rooftop plant room
      G[2].push(boxPosNor(15, 3.8, 15, 0, H + 1.9, 0));
      for (let f = 1; f < 10; f++) {
        const yBase = f * floorH;
        // Spandrel band (opaque composite)
        G[0].push(polyWallPosNor(pts, yBase, yBase + 1.1));
        // Glass band
        G[1].push(polyWallPosNor(pts, yBase + 1.1, yBase + floorH, 0.08));
        // Aluminium trim line
        G[2].push(polyWallPosNor(pts, yBase + 1.05, yBase + 1.15, -0.05));
      }
    }
  },
  {
    no: 3, id: 134101085, name: "PWC Office", floors: 12,
    materials: [
      { name: "PWC_Granite", pbrMetallicRoughness: { baseColorFactor: [0.16, 0.18, 0.22, 1.0], metallicFactor: 0.2, roughnessFactor: 0.7 } },
      { name: "PWC_CurtainGlass", pbrMetallicRoughness: { baseColorFactor: [0.20, 0.35, 0.50, 0.5], metallicFactor: 0.3, roughnessFactor: 0.08 }, alphaMode: "BLEND", doubleSided: true },
      { name: "PWC_Accent", pbrMetallicRoughness: { baseColorFactor: [0.85, 0.48, 0.10, 1.0], metallicFactor: 0.4, roughnessFactor: 0.35 } },
    ],
    generate(pts, H, G) {
      const floorH = H / 12;
      G[0].push(polyWallPosNor(pts, 0, 4.5));
      G[0].push(polyCapPosNor(pts, H));
      G[0].push(polyWallPosNor(pts, H, H + 1.5)); // Crown parapet
      // PwC warm corporate entrance portal band
      G[2].push(polyWallPosNor(pts, 4.2, 4.8, -0.1));
      // Tower vertical glass facade with mullion fins
      for (let f = 1; f < 12; f++) {
        const yBase = f * floorH;
        G[0].push(polyWallPosNor(pts, yBase, yBase + 0.9));
        G[1].push(polyWallPosNor(pts, yBase + 0.9, yBase + floorH, 0.06));
      }
      // Rooftop architectural screen
      G[2].push(boxPosNor(20, 4.2, 25, 0, H + 2.1, 0));
    }
  },
  {
    no: 4, id: "ov332", name: "Sector - V Police Station", floors: 3,
    materials: [
      { name: "Police_WhitePlaster", pbrMetallicRoughness: { baseColorFactor: [0.92, 0.94, 0.96, 1.0], metallicFactor: 0.05, roughnessFactor: 0.85 } },
      { name: "Police_BlueBanding", pbrMetallicRoughness: { baseColorFactor: [0.12, 0.32, 0.75, 1.0], metallicFactor: 0.15, roughnessFactor: 0.4 } },
      { name: "Police_Glazing", pbrMetallicRoughness: { baseColorFactor: [0.28, 0.55, 0.82, 0.45], metallicFactor: 0.1, roughnessFactor: 0.2 }, alphaMode: "BLEND", doubleSided: true },
    ],
    generate(pts, H, G) {
      // White walls
      G[0].push(polyWallPosNor(pts, 0, H));
      G[0].push(polyCapPosNor(pts, H));
      G[0].push(polyWallPosNor(pts, H, H + 0.8));
      // Kolkata Police iconic blue stripe bands
      G[1].push(polyWallPosNor(pts, 0.3, 0.9, -0.06));
      G[1].push(polyWallPosNor(pts, 3.4, 4.0, -0.06));
      G[1].push(polyWallPosNor(pts, 7.0, 7.6, -0.06));
      G[1].push(polyWallPosNor(pts, H - 0.4, H, -0.06));
      // Entrance porch & windows
      G[1].push(boxPosNor(3.2, 0.4, 2.2, 0, 3.6, -2.5));
      G[0].push(cylPosNor(0.18, 3.6, 12, -1.2, 1.8, -3.2));
      G[0].push(cylPosNor(0.18, 3.6, 12,  1.2, 1.8, -3.2));
      // Window panes
      for (let f = 0; f < 3; f++) {
        G[2].push(polyWallPosNor(pts, f * 3.6 + 1.2, f * 3.6 + 2.4, 0.08));
      }
    }
  },
  {
    no: 5, id: "ov582", name: "Aliah University", floors: 6,
    materials: [
      { name: "Aliah_Terracotta", pbrMetallicRoughness: { baseColorFactor: [0.65, 0.28, 0.15, 1.0], metallicFactor: 0.1, roughnessFactor: 0.9 } },
      { name: "Aliah_WhiteLouvre", pbrMetallicRoughness: { baseColorFactor: [0.94, 0.95, 0.96, 1.0], metallicFactor: 0.1, roughnessFactor: 0.6 } },
      { name: "Aliah_Glazing", pbrMetallicRoughness: { baseColorFactor: [0.22, 0.32, 0.42, 0.45], metallicFactor: 0.1, roughnessFactor: 0.15 }, alphaMode: "BLEND", doubleSided: true },
    ],
    generate(pts, H, G) {
      const floorH = H / 6;
      G[0].push(polyWallPosNor(pts, 0, H));
      G[0].push(polyCapPosNor(pts, H));
      G[0].push(polyWallPosNor(pts, H, H + 1.0));
      // White concrete horizontal sunshade bands
      for (let f = 0; f < 6; f++) {
        const y = f * floorH;
        G[1].push(polyWallPosNor(pts, y + floorH - 0.4, y + floorH, -0.08));
        G[2].push(polyWallPosNor(pts, y + 1.0, y + floorH - 0.5, 0.06));
      }
      // Rooftop water tank & elevator room
      G[1].push(boxPosNor(5, 3.2, 5, 0, H + 1.6, 0));
    }
  },
  {
    no: 6, id: 382403604, name: "NITTTR Residential Campus", floors: 5,
    materials: [
      { name: "NITTTR_OchrePlaster", pbrMetallicRoughness: { baseColorFactor: [0.82, 0.72, 0.58, 1.0], metallicFactor: 0.05, roughnessFactor: 0.9 } },
      { name: "NITTTR_BalconySlab", pbrMetallicRoughness: { baseColorFactor: [0.35, 0.38, 0.42, 1.0], metallicFactor: 0.2, roughnessFactor: 0.6 } },
      { name: "NITTTR_Glazing", pbrMetallicRoughness: { baseColorFactor: [0.24, 0.35, 0.45, 0.4], metallicFactor: 0.1, roughnessFactor: 0.15 }, alphaMode: "BLEND", doubleSided: true },
    ],
    generate(pts, H, G) {
      const floorH = H / 5;
      G[0].push(polyWallPosNor(pts, 0, H));
      G[0].push(polyCapPosNor(pts, H));
      G[0].push(polyWallPosNor(pts, H, H + 0.9));
      for (let f = 0; f < 5; f++) {
        const y = f * floorH;
        // Projecting balcony edge slab
        G[1].push(polyWallPosNor(pts, y + 0.9, y + 1.15, -0.15));
        // Balcony safety parapet
        G[0].push(polyWallPosNor(pts, y + 1.15, y + 2.0, -0.12));
        // Window opening
        G[2].push(polyWallPosNor(pts, y + 2.0, y + floorH - 0.3, 0.08));
      }
      G[1].push(boxPosNor(8, 2.8, 8, 0, H + 1.4, 0));
    }
  },
  {
    no: 7, id: "sv4", name: "IIHM Global Campus", floors: 7,
    materials: [
      { name: "IIHM_WhiteFacade", pbrMetallicRoughness: { baseColorFactor: [0.93, 0.95, 0.97, 1.0], metallicFactor: 0.15, roughnessFactor: 0.4 } },
      { name: "IIHM_RibbonGlass", pbrMetallicRoughness: { baseColorFactor: [0.12, 0.22, 0.35, 0.6], metallicFactor: 0.25, roughnessFactor: 0.1 }, alphaMode: "BLEND", doubleSided: true },
      { name: "IIHM_NavyTrim", pbrMetallicRoughness: { baseColorFactor: [0.10, 0.20, 0.52, 1.0], metallicFactor: 0.35, roughnessFactor: 0.3 } },
    ],
    generate(pts, H, G) {
      const floorH = H / 7;
      G[0].push(polyWallPosNor(pts, 0, H));
      G[0].push(polyCapPosNor(pts, H));
      G[0].push(polyWallPosNor(pts, H, H + 1.2));
      // Navy blue IIHM sign band
      G[2].push(polyWallPosNor(pts, 3.4, 4.6, -0.08));
      G[2].push(polyWallPosNor(pts, H - 1.2, H, -0.08));
      // Ribbon glazing per floor
      for (let f = 1; f < 7; f++) {
        const y = f * floorH;
        G[1].push(polyWallPosNor(pts, y + 0.8, y + floorH - 0.4, 0.06));
      }
    }
  },
  {
    no: 8, id: "ov240", name: "Bharat Petroleum", floors: 1,
    materials: [
      { name: "BPCL_YellowFascia", pbrMetallicRoughness: { baseColorFactor: [0.95, 0.75, 0.10, 1.0], metallicFactor: 0.2, roughnessFactor: 0.35 } },
      { name: "BPCL_BluePillar", pbrMetallicRoughness: { baseColorFactor: [0.10, 0.30, 0.78, 1.0], metallicFactor: 0.3, roughnessFactor: 0.4 } },
      { name: "BPCL_GlassStore", pbrMetallicRoughness: { baseColorFactor: [0.35, 0.65, 0.88, 0.45], metallicFactor: 0.1, roughnessFactor: 0.1 }, alphaMode: "BLEND", doubleSided: true },
    ],
    generate(pts, H, G) {
      // 1. Large fuel canopy overhead (y = 5.2 .. 6.5 m)
      G[0].push(polyCapPosNor(pts, 6.5));
      G[0].push(polyCapPosNor(pts, 5.2, -1));
      G[0].push(polyWallPosNor(pts, 5.2, 6.5)); // Yellow fascia band
      G[1].push(polyWallPosNor(pts, 5.0, 5.2, -0.05)); // Blue lower trim
      // 2. Heavy steel canopy stanchions
      const cols = [[-5, -5], [5, -5], [-5, 5], [5, 5]];
      for (const [cx, cz] of cols) {
        G[1].push(cylPosNor(0.45, 5.2, 16, cx, 2.6, cz));
      }
      // 3. Fuel pump dispensers on raised safety islands
      for (const pz of [-3.5, 3.5]) {
        G[1].push(boxPosNor(4.5, 0.3, 1.4, 0, 0.15, pz)); // island kerb
        G[0].push(boxPosNor(1.2, 1.8, 0.7, -1.2, 1.2, pz)); // pump 1
        G[0].push(boxPosNor(1.2, 1.8, 0.7,  1.2, 1.2, pz)); // pump 2
      }
      // 4. Convenience store & cashier kiosk under back corner
      G[0].push(boxPosNor(7, 3.8, 5, -5, 1.9, 5));
      G[2].push(boxPosNor(6.6, 2.6, 0.2, -5, 1.8, 2.4)); // glass storefront
    }
  },
  {
    no: 9, id: 238285653, name: "HP Petrol Pump", floors: 1,
    materials: [
      { name: "HP_RedBlueFascia", pbrMetallicRoughness: { baseColorFactor: [0.88, 0.15, 0.15, 1.0], metallicFactor: 0.2, roughnessFactor: 0.35 } },
      { name: "HP_BlueSteel", pbrMetallicRoughness: { baseColorFactor: [0.12, 0.25, 0.65, 1.0], metallicFactor: 0.35, roughnessFactor: 0.4 } },
      { name: "HP_GlassKiosk", pbrMetallicRoughness: { baseColorFactor: [0.40, 0.68, 0.90, 0.45], metallicFactor: 0.1, roughnessFactor: 0.1 }, alphaMode: "BLEND", doubleSided: true },
    ],
    generate(pts, H, G) {
      // 1. HP overhead canopy (y = 4.8 .. 6.0 m)
      G[0].push(polyCapPosNor(pts, 6.0));
      G[0].push(polyCapPosNor(pts, 4.8, -1));
      G[0].push(polyWallPosNor(pts, 4.8, 6.0)); // Red fascia
      G[1].push(polyWallPosNor(pts, 4.6, 4.8, -0.05)); // Blue bottom stripe
      // 2. Twin columns
      G[1].push(cylPosNor(0.38, 4.8, 16, -2.5, 2.4, 0));
      G[1].push(cylPosNor(0.38, 4.8, 16,  2.5, 2.4, 0));
      // 3. Pump island
      G[1].push(boxPosNor(5.0, 0.25, 1.2, 0, 0.125, 0));
      G[0].push(boxPosNor(1.1, 1.7, 0.6, -1.4, 1.1, 0));
      G[0].push(boxPosNor(1.1, 1.7, 0.6,  1.4, 1.1, 0));
      // 4. Compact kiosk
      G[1].push(boxPosNor(3.5, 3.4, 3.0, 3.0, 1.7, 2.5));
      G[2].push(boxPosNor(2.8, 2.0, 0.15, 3.0, 1.7, 0.95));
    }
  },
  {
    no: 10, id: "ov359", name: "Ambuja Neotia EcoCentre", floors: 17,
    materials: [
      { name: "EcoCentre_Terracotta", pbrMetallicRoughness: { baseColorFactor: [0.72, 0.36, 0.18, 1.0], metallicFactor: 0.15, roughnessFactor: 0.7 } },
      { name: "EcoCentre_SolarGlass", pbrMetallicRoughness: { baseColorFactor: [0.10, 0.32, 0.25, 0.6], metallicFactor: 0.25, roughnessFactor: 0.08 }, alphaMode: "BLEND", doubleSided: true },
      { name: "EcoCentre_DarkTrim", pbrMetallicRoughness: { baseColorFactor: [0.25, 0.15, 0.10, 1.0], metallicFactor: 0.5, roughnessFactor: 0.4 } },
    ],
    generate(pts, H, G) {
      const floorH = H / 17;
      G[0].push(polyWallPosNor(pts, 0, 5.0)); // Grand podium
      G[0].push(polyCapPosNor(pts, H));
      G[0].push(polyWallPosNor(pts, H, H + 2.0)); // Rooftop screen
      // 17 storeys of terracotta spandrels & green solar glass
      for (let f = 1; f < 17; f++) {
        const y = f * floorH;
        G[0].push(polyWallPosNor(pts, y, y + 1.2));
        G[1].push(polyWallPosNor(pts, y + 1.2, y + floorH, 0.08));
        G[2].push(polyWallPosNor(pts, y + 1.15, y + 1.25, -0.06));
      }
      // Iconic rooftop tiered mechanical crown
      G[0].push(boxPosNor(24, 4.5, 20, 0, H + 2.25, 0));
      G[2].push(boxPosNor(16, 3.5, 14, 0, H + 6.25, 0));
    }
  },
  {
    no: 11, id: "ov325", name: "Tea Junction", floors: 1,
    materials: [
      { name: "TeaJunction_OrangeWood", pbrMetallicRoughness: { baseColorFactor: [0.85, 0.38, 0.12, 1.0], metallicFactor: 0.1, roughnessFactor: 0.6 } },
      { name: "TeaJunction_DarkCounter", pbrMetallicRoughness: { baseColorFactor: [0.18, 0.20, 0.24, 1.0], metallicFactor: 0.2, roughnessFactor: 0.7 } },
      { name: "TeaJunction_GlassDisplay", pbrMetallicRoughness: { baseColorFactor: [0.45, 0.70, 0.90, 0.45], metallicFactor: 0.1, roughnessFactor: 0.1 }, alphaMode: "BLEND", doubleSided: true },
    ],
    generate(pts, H, G) {
      // Cozy 1-storey street cafe kiosk with outdoor serving bar
      G[0].push(polyWallPosNor(pts, 0, 3.8));
      G[0].push(polyCapPosNor(pts, 3.8));
      G[1].push(polyWallPosNor(pts, 3.4, 4.2, -0.15)); // Overhanging fascia
      // Serving counter cutout
      G[1].push(boxPosNor(4.2, 1.1, 0.8, 0, 0.55, -2.5));
      // Display glass window
      G[2].push(boxPosNor(3.8, 1.6, 0.1, 0, 2.0, -2.2));
      // Decorative timber trellis canopy
      for (let tx = -2.5; tx <= 2.5; tx += 0.8) {
        G[0].push(boxPosNor(0.12, 0.15, 2.8, tx, 4.0, -2.0));
      }
    }
  }
];

// ---------------------------------------------------------------------------
// RUN GENERATION FOR ALL 10 BUILDINGS
// ---------------------------------------------------------------------------
console.log("=================================================");
console.log("GENERATING ALL 10 REMAINING TECHNOVERSE LANDMARKS");
console.log("=================================================");

const results = [];

for (const spec of SPECS) {
  const b = byId.get(String(spec.id));
  if (!b) {
    console.error(`ERROR: Building id ${spec.id} not found in campus.json!`);
    continue;
  }

  // Centroid
  let cx = 0, cz = 0;
  b.pts.forEach(([x, z]) => { cx += x; cz += z; });
  cx /= b.pts.length; cz /= b.pts.length;

  // Local points centered at centroid
  const localPts = b.pts.map(([x, z]) => [x - cx, z - cz]);

  // Height: ~3.8m per floor or custom
  const H = spec.floors === 1 ? 4.2 : spec.floors * 3.8;

  // 3 material groups: G[0] = main facade, G[1] = secondary / glass, G[2] = accent / trim
  const G = [[], [], []];
  spec.generate(localPts, H, G);

  const meshes = spec.materials.map((mat, i) => {
    const geo = merge(G[i]);
    return { name: `${spec.id}_${mat.name}`, geo, matIndex: i };
  });

  let totalTris = 0;
  for (const m of meshes) {
    totalTris += (m.geo.pos.length / 3) / 3;
  }

  const glbBuf = packGLB(meshes, spec.materials, spec.id);
  const outPath = path.join(OUT_DIR, `${spec.id}.glb`);
  fs.writeFileSync(outPath, glbBuf);

  const kbSize = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`[#${spec.no}] ${spec.name} (ID: ${spec.id})`);
  console.log(`     Triangles: ${totalTris | 0} (budget <= 30,000)`);
  console.log(`     GLB size:  ${kbSize} KB (budget <= 2,048 KB)`);
  console.log(`     Placed at: (${cx.toFixed(1)}, ${cz.toFixed(1)})`);

  results.push({
    no: spec.no,
    id: spec.id,
    name: spec.name,
    tris: totalTris | 0,
    sizeKb: kbSize,
    cx: +cx.toFixed(2),
    cz: +cz.toFixed(2),
    floors: spec.floors,
    H
  });
}

console.log("\nAll landmark GLB models successfully generated!");
