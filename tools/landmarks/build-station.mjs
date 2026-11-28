// Procedural generator and GLB exporter for Salt Lake Sector V Metro Station (OSM ID: 535333512)
// Pure vanilla Node.js — no npm dependencies, no Three.js.
// Geometry is built as raw Float32Array (positions + normals) and packed into glTF 2.0 Binary.

import fs from "fs";
import path from "path";

const OUT_PATH = path.resolve("public/models/landmarks/535333512.glb");

// Plan dimensions come from the OSM footprint. Elevation and colours come from the
// Jan 2026 Street View frontage recorded in station-survey.json.
// Footprint pts: [[-3.17,-508.44],[115.08,-581.79],[122.53,-569.96],[4.26,-496.63]]
// Length along long axis: ~139.15 m, width: ~13.95 m, estimated height: 14.6 m.
const L = 139.15;
const W = 13.95;
const H_TOTAL = 14.6;

console.log(`Generating Sector V Metro Station (L=${L}m, W=${W}m, H=${H_TOTAL}m)...`);

// -----------------------------------------------------------------------
// GEOMETRY PRIMITIVES — produce Float32Array pos/nor arrays directly.
// All positions are in local space; y=0 is ground level.
// -----------------------------------------------------------------------

// Returns the 6 face-normal-grouped vertices of a box, pre-translated.
// Each box face is 2 triangles = 6 vertices; 6 faces = 36 vertices total.
// w=local-x size, h=local-y, d=local-z.
function boxPosNor(w, h, d, tx = 0, ty = 0, tz = 0, rx = 0) {
  // half-sizes
  const hw = w / 2, hh = h / 2, hd = d / 2;

  // 8 corners (before rotation around X)
  const corners = [
    [-hw, -hh, -hd], [ hw, -hh, -hd], [ hw,  hh, -hd], [-hw,  hh, -hd], // back face
    [-hw, -hh,  hd], [ hw, -hh,  hd], [ hw,  hh,  hd], [-hw,  hh,  hd], // front face
  ];

  // Apply X rotation (used for angled roof segments)
  if (rx !== 0) {
    const c = Math.cos(rx), s = Math.sin(rx);
    for (const v of corners) {
      const y = v[1] * c - v[2] * s;
      const z = v[1] * s + v[2] * c;
      v[1] = y; v[2] = z;
    }
  }

  // 6 faces: each has [i0,i1,i2, i3,i4,i5] corner indices and a normal dir
  // Face order: -Z, +Z, -X, +X, -Y, +Y
  const faceQuads = [
    { verts: [3, 2, 1, 1, 0, 3], n: [0, 0, -1] }, // -Z
    { verts: [4, 5, 6, 6, 7, 4], n: [0, 0,  1] }, // +Z
    { verts: [0, 1, 5, 5, 4, 0], n: [0, -1, 0] }, // -Y (bottom)
    { verts: [3, 7, 6, 6, 2, 3], n: [0,  1, 0] }, // +Y (top)
    { verts: [0, 4, 7, 7, 3, 0], n: [-1, 0, 0] }, // -X
    { verts: [1, 2, 6, 6, 5, 1], n: [ 1, 0, 0] }, // +X
  ];

  // If we have X rotation, transform the face normals too
  const transformNormal = rx !== 0
    ? ([nx, ny, nz]) => {
        const c = Math.cos(rx), s = Math.sin(rx);
        return [nx, ny * c - nz * s, ny * s + nz * c];
      }
    : n => n;

  const positions = [];
  const normals = [];

  for (const face of faceQuads) {
    const n = transformNormal(face.n);
    for (const ci of face.verts) {
      const v = corners[ci];
      positions.push(v[0] + tx, v[1] + ty, v[2] + tz);
      normals.push(n[0], n[1], n[2]);
    }
  }

  return { pos: new Float32Array(positions), nor: new Float32Array(normals) };
}

// Approximate cylinder using prism with `segs` sides.
function cylPosNor(r, h, segs, tx = 0, ty = 0, tz = 0) {
  // Build segs rectangular side-panels + top + bottom caps
  const positions = [];
  const normals = [];
  const hh = h / 2;

  for (let s = 0; s < segs; s++) {
    const a0 = (s / segs) * Math.PI * 2;
    const a1 = ((s + 1) / segs) * Math.PI * 2;
    const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r;
    const x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
    const nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);

    // Side quad (2 triangles)
    const side = [
      [x0, -hh, z0], [x1, -hh, z1], [x1,  hh, z1],
      [x1,  hh, z1], [x0,  hh, z0], [x0, -hh, z0],
    ];
    for (const v of side) {
      positions.push(v[0] + tx, v[1] + ty, v[2] + tz);
      normals.push(nx, 0, nz);
    }

    // Top cap triangle
    positions.push(tx, hh + ty, tz, x0 + tx, hh + ty, z0 + tz, x1 + tx, hh + ty, z1 + tz);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);

    // Bottom cap triangle
    positions.push(tx, -hh + ty, tz, x1 + tx, -hh + ty, z1 + tz, x0 + tx, -hh + ty, z0 + tz);
    normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
  }

  return { pos: new Float32Array(positions), nor: new Float32Array(normals) };
}

// Concatenate an array of {pos, nor} objects into one merged {pos, nor}.
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

// Shorthand helpers
function box(w, h, d, tx, ty, tz, rx) { return boxPosNor(w, h, d, tx, ty, tz, rx); }
function cyl(r, h, segs, tx, ty, tz) { return cylPosNor(r, h, segs, tx, ty, tz); }

// Material groups accumulate geometry pieces
const concrete = []; // pale structural concrete and end towers
const facade = [];   // observed peach composite-panel band
const roof = [];     // light-grey aluminium panel grid and blue roof trim
const glass = [];    // dark station windows and openings

// -----------------------------------------------------------------------
// JAN 2026 SURVEYED EXTERIOR
// -----------------------------------------------------------------------
// Street View shows a long, flat-roofed station block rather than the barrel-vault
// form used by the first procedural model. Ground level is largely open parking;
// the street elevation above it is a grey panel grid with a peach window band.
if (true) {
  const sideZ = W / 2 - 0.16;
  const columnZ = W / 2 - 1.35;

  // Open ground floor: paired square piers carry a deep deck. The low roadside
  // wall seen between parked cars is deliberately discontinuous at entrances.
  for (let x = -L / 2 + 5; x < L / 2 - 3; x += 9.2) {
    concrete.push(box(0.72, 4.65, 0.82, x, 2.325, -columnZ));
    concrete.push(box(0.72, 4.65, 0.82, x, 2.325, columnZ));
  }
  concrete.push(box(L - 1.0, 0.55, W - 0.35, 0, 4.55, 0));
  for (const z of [-sideZ, sideZ]) {
    roof.push(box(L - 20, 1.05, 0.26, 5, 1.0, z));
    concrete.push(box(L - 1.5, 0.5, 0.42, 0, 4.25, z));
  }

  // Three-storey rectangular station box. Light grey panel fields sit above and
  // below the continuous peach band; dark windows repeat at the observed rhythm.
  for (const z of [-sideZ, sideZ]) {
    roof.push(box(L - 1.2, 2.0, 0.34, 0, 5.65, z));
    facade.push(box(L - 1.2, 4.25, 0.38, 0, 8.75, z));
    roof.push(box(L - 1.2, 2.45, 0.34, 0, 12.1, z));
    for (let x = -L / 2 + 8; x < L / 2 - 4; x += 6.3) {
      glass.push(box(2.25, 2.25, 0.16, x, 8.85, z + Math.sign(z) * 0.24));
      roof.push(box(0.1, 8.0, 0.1, x - 3.1, 9.0, z + Math.sign(z) * 0.28));
    }
    for (const y of [6.65, 10.85, 13.32]) roof.push(box(L - 1.1, 0.1, 0.12, 0, y, z + Math.sign(z) * 0.29));
  }

  // Tall signed end core and the smaller far-end core match the two pale vertical
  // masses visible along Chavlpatty Road. The sign itself is supplied by the shared
  // street atlas, so this model does not embed a copied logo or image.
  concrete.push(box(9.2, 14.35, W - 0.45, -54.5, 7.175, 0));
  concrete.push(box(6.8, 13.7, W - 0.45, 55.0, 6.85, 0));
  for (const side of [-1, 1]) {
    glass.push(box(0.18, 2.8, 2.1, -49.82, 8.9, side * 3.7));
    glass.push(box(0.18, 2.8, 2.1, 58.48, 8.9, side * 3.7));
  }

  // Flat roof and the thin blue edge visible above the panelled frontage.
  roof.push(box(L + 0.8, 0.34, W + 0.25, 0, 13.56, 0));
  glass.push(box(L + 1.0, 0.22, 0.34, 0, 13.82, -W / 2 - 0.05));
  glass.push(box(L + 1.0, 0.22, 0.34, 0, 13.82, W / 2 + 0.05));

  // Open entrance/parking voids remain dark behind the roadside columns.
  glass.push(box(39, 3.1, 0.14, -18, 2.55, -sideZ - 0.05));
  glass.push(box(31, 3.1, 0.14, 24, 2.55, -sideZ - 0.05));
} else {

// -----------------------------------------------------------------------
// 1. GROUND LEVEL (y: 0 .. 5.5 m) — Portal piers and foundations
// -----------------------------------------------------------------------
// Elevated metro: pairs of concrete piers every 18 m carry the viaduct.
const pierSpacing = 18;
const numPortals = Math.floor(L / pierSpacing); // 7 portals
const startX = -((numPortals - 1) * pierSpacing) / 2;

for (let i = 0; i < numPortals; i++) {
  const px = startX + i * pierSpacing;
  // Left pier (North side, toward median)
  concrete.push(box(1.6, 5.5, 1.4, px, 2.75, -W / 2 + 1.2));
  // Right pier (South side, roadside)
  concrete.push(box(1.6, 5.5, 1.4, px, 2.75,  W / 2 - 1.2));
  // Footing blocks at grade
  concrete.push(box(2.2, 0.6, 1.8, px, 0.3, -W / 2 + 1.2));
  concrete.push(box(2.2, 0.6, 1.8, px, 0.3,  W / 2 - 1.2));
  // Transverse portal cross-beam supporting concourse slab
  concrete.push(box(1.8, 1.1, W - 1.0, px, 5.0, 0));
}

// Ground-level entry pavilions at East and West ends
for (const side of [-1, 1]) {
  const ex = side * (L / 2 - 10);
  // Entrance foyer walls — ochre composite cladding
  facade.push(box(14, 4.6, W - 1.5, ex, 2.3, 0));
  // Canopy slab above entrance
  concrete.push(box(14.4, 0.4, W - 1.1, ex, 4.6, 0));
  // Plinth / kerb ramp
  concrete.push(box(14.4, 0.3, W - 1.1, ex, 0.15, 0));
  // Glass entry doors (slim panels either side of centre)
  glass.push(box(0.2, 3.2, 4.0, ex - side * 6.9, 2.0, 0));
  glass.push(box(0.2, 3.2, 4.0, ex + side * 6.9, 2.0, 0));
}

// -----------------------------------------------------------------------
// 2. CONCOURSE LEVEL (y: 5.5 .. 9.5 m)
// -----------------------------------------------------------------------
// Concourse floor deck and ceiling — cast-in-situ concrete slabs
concrete.push(box(L - 1.0, 0.5, W - 0.4, 0, 5.75, 0));
concrete.push(box(L - 1.0, 0.6, W - 0.4, 0, 9.20, 0));

// Exterior spandrel walls — ochre panels between ribbon windows
facade.push(box(L - 1.2, 1.2, 0.4, 0, 6.6,  -W / 2 + 0.2)); // North lower
facade.push(box(L - 1.2, 1.2, 0.4, 0, 6.6,   W / 2 - 0.2)); // South lower
facade.push(box(L - 1.2, 1.0, 0.4, 0, 8.9,  -W / 2 + 0.2)); // North upper
facade.push(box(L - 1.2, 1.0, 0.4, 0, 8.9,   W / 2 - 0.2)); // South upper

// Ribbon glazing strip (y 7.2–8.4) — continuous daylight band
glass.push(box(L - 2.0, 1.2, 0.1, 0, 7.8, -W / 2 + 0.2));
glass.push(box(L - 2.0, 1.2, 0.1, 0, 7.8,  W / 2 - 0.2));

// Vertical mullions every 4 m to subdivide the ribbon
for (let x = -L / 2 + 6; x < L / 2 - 5; x += 4) {
  facade.push(box(0.25, 1.2, 0.45, x, 7.8, -W / 2 + 0.2));
  facade.push(box(0.25, 1.2, 0.45, x, 7.8,  W / 2 - 0.2));
}

// Concourse end-walls (ventilation louvres and service access)
for (const side of [-1, 1]) {
  facade.push(box(0.4, 3.4, W - 0.8, side * (L / 2 - 0.6), 7.45, 0));
}

// -----------------------------------------------------------------------
// 3. PLATFORM & TRACK LEVEL (y: 9.5 .. 14.5 m)
// -----------------------------------------------------------------------
// Trackbed / ballast slab over the concourse ceiling
concrete.push(box(L, 0.4, 5.0, 0, 9.6, 0));

// Running rails — 2 up / 2 down
for (const tz of [-1.5, -0.7, 0.7, 1.5]) {
  roof.push(box(L, 0.18, 0.12, 0, 9.9, tz));
}

// Side passenger platforms (North & South, ~4.2 m wide each)
const platW = (W - 5.4) / 2;
concrete.push(box(L - 6.0, 0.9, platW, 0, 10.35, -W / 2 + platW / 2 + 0.2));
concrete.push(box(L - 6.0, 0.9, platW, 0, 10.35,  W / 2 - platW / 2 - 0.2));

// Platform Screen Doors — glass panels along each track edge
glass.push(box(L - 8.0, 1.6, 0.08, 0, 11.6, -2.4));
glass.push(box(L - 8.0, 1.6, 0.08, 0, 11.6,  2.4));
// PSD header beams
roof.push(box(L - 8.0, 0.2, 0.16, 0, 12.5, -2.4));
roof.push(box(L - 8.0, 0.2, 0.16, 0, 12.5,  2.4));
// PSD door-frame posts every 3.2 m
for (let x = -L / 2 + 8; x <= L / 2 - 8; x += 3.2) {
  roof.push(box(0.12, 1.6, 0.16, x, 11.6, -2.4));
  roof.push(box(0.12, 1.6, 0.16, x, 11.6,  2.4));
}

// Platform outer spandrel walls — lower solid, upper glazed
facade.push(box(L - 2.0, 1.4, 0.35, 0, 11.5, -W / 2 + 0.2));
facade.push(box(L - 2.0, 1.4, 0.35, 0, 11.5,  W / 2 - 0.2));
glass.push(box(L - 4.0, 2.2, 0.1,   0, 13.3, -W / 2 + 0.2));
glass.push(box(L - 4.0, 2.2, 0.1,   0, 13.3,  W / 2 - 0.2));

// Steel portal columns supporting the arched roof (circular section, 12-sided prism)
for (let x = -L / 2 + 4; x <= L / 2 - 4; x += 10) {
  roof.push(cyl(0.25, 4.8, 12, x, 13.2, -W / 2 + 0.35));
  roof.push(cyl(0.25, 4.8, 12, x, 13.2,  W / 2 - 0.35));
  // Cross-tie truss spanning the tracks
  roof.push(box(0.3, 0.5, W - 0.7, x, 15.4, 0));
}

// -----------------------------------------------------------------------
// 4. VAULTED CANOPY ROOF (y: 15.0 .. 18.5 m)
// -----------------------------------------------------------------------
// Curved barrel arch approximated by 14 flat box segments, as typical for
// Indian metro elevated stations (Green Line aluminium barrel vault).
const roofSegs = 14;
const roofOverhangX = 3.5; // extends beyond station end-walls
const roofLen = L + roofOverhangX * 2;
const roofCenterY = 14.6;

for (let s = 0; s < roofSegs; s++) {
  const a0 = Math.PI * (s / roofSegs);
  const a1 = Math.PI * ((s + 1) / roofSegs);
  const z0 = -Math.cos(a0) * (W / 2 + 0.5);
  const z1 = -Math.cos(a1) * (W / 2 + 0.5);
  const y0 = roofCenterY + Math.sin(a0) * 3.8;
  const y1 = roofCenterY + Math.sin(a1) * 3.8;

  const segMidZ = (z0 + z1) / 2;
  const segMidY = (y0 + y1) / 2;
  const dz = z1 - z0;
  const dy = y1 - y0;
  const segWidth = Math.hypot(dz, dy);
  // Rotation around X axis to tilt the flat panel to match the arc tangent
  const segRx = -Math.atan2(dy, dz);

  // Middle 2 segments become a central skylight strip
  const isSkylight = s === 6 || s === 7;
  const target = isSkylight ? glass : roof;

  target.push(box(roofLen, 0.18, segWidth, 0, segMidY, segMidZ, segRx));

  // Standing-seam roof ribs every 4 m (omit on glass skylight)
  if (!isSkylight) {
    for (let rx = -roofLen / 2 + 2; rx <= roofLen / 2 - 2; rx += 4) {
      roof.push(box(0.12, 0.28, segWidth + 0.05, rx, segMidY, segMidZ, segRx));
    }
  }
}

// Curved eave fascias on North and South sides
roof.push(box(roofLen, 0.6, 0.35, 0, 14.8, -W / 2 - 0.4));
roof.push(box(roofLen, 0.6, 0.35, 0, 14.8,  W / 2 + 0.4));

// Aerodynamic portal hoods at both ends
for (const side of [-1, 1]) {
  roof.push(box(0.4, 4.0, W + 1.2, side * (L / 2 + roofOverhangX), 15.8, 0));
}

// -----------------------------------------------------------------------
// 5. STATION SIGNAGE BANDS (ochre fascia boards on North & South sides)
// -----------------------------------------------------------------------
for (const side of [-1, 1]) {
  const sz = side * (W / 2 + 0.05);
  // Central name-board plate (plain geometry — no logos/trademarks)
  facade.push(box(36.0, 1.4, 0.15, 0, 8.8, sz));
  // Accent stripe top and bottom of board
  concrete.push(box(36.2, 0.15, 0.18, 0, 9.45, sz));
  concrete.push(box(36.2, 0.15, 0.18, 0, 8.15, sz));
}
}

// -----------------------------------------------------------------------
// 6. MERGE ALL MATERIAL GROUPS
// -----------------------------------------------------------------------
console.log("Merging geometry groups into PBR material sets...");
const mConcrete = merge(concrete);
const mFacade   = merge(facade);
const mRoof     = merge(roof);
const mGlass    = merge(glass);

const meshes = [
  { name: "535333512_Concrete", geo: mConcrete, matIndex: 0 },
  { name: "535333512_Facade",   geo: mFacade,   matIndex: 1 },
  { name: "535333512_Roof",     geo: mRoof,     matIndex: 2 },
  { name: "535333512_Glass",    geo: mGlass,    matIndex: 3 },
];

let totalTriangles = 0;
for (const m of meshes) {
  const tris = (m.geo.pos.length / 3) / 3;
  totalTriangles += tris;
  console.log(`  ${m.name}: ${tris | 0} triangles`);
}
console.log(`Total: ${totalTriangles | 0} triangles (budget <= 60,000)`);

// -----------------------------------------------------------------------
// 7. GLB ENCODER — glTF 2.0 Binary, no external tools required
// -----------------------------------------------------------------------
function packGLB(meshList) {
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

  // PBR Materials — 3 opaque + 1 transparent glass
  const materials = [
    {
      name: "Concrete_Structure",
      pbrMetallicRoughness: {
        baseColorFactor: [0.70, 0.69, 0.64, 1.0],
        metallicFactor: 0.05, roughnessFactor: 0.82
      }
    },
    {
      name: "Peach_Panel_Band",
      pbrMetallicRoughness: {
        baseColorFactor: [0.70, 0.45, 0.34, 1.0],
        metallicFactor: 0.12, roughnessFactor: 0.56
      }
    },
    {
      name: "Grey_Cladding",
      pbrMetallicRoughness: {
        baseColorFactor: [0.72, 0.75, 0.76, 1.0],
        metallicFactor: 0.34, roughnessFactor: 0.48
      }
    },
    {
      name: "Station_Windows_And_Blue_Trim",
      pbrMetallicRoughness: {
        baseColorFactor: [0.12, 0.24, 0.29, 0.78],
        metallicFactor: 0.18, roughnessFactor: 0.24
      },
      alphaMode: "BLEND",
      doubleSided: true
    }
  ];

  const gltfMeshes = [];
  const gltfNodes = [];

  for (const { name, geo, matIndex } of meshList) {
    const { pos, nor } = geo;
    const count = pos.length / 3;

    // Procedural box-projection UVs (no texture images — all PBR colour only)
    const uvArr = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      uvArr[i * 2]     = pos[i * 3]     / 5;
      uvArr[i * 2 + 1] = pos[i * 3 + 1] / 5;
    }

    // Bounding box for position accessor
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

    const posBv  = addBuf(pos,   34962); // ARRAY_BUFFER
    const posAcc = accessors.length;
    accessors.push({ bufferView: posBv,  byteOffset: 0, componentType: 5126, count, type: "VEC3", min: minP, max: maxP });

    const norBv  = addBuf(nor,   34962);
    const norAcc = accessors.length;
    accessors.push({ bufferView: norBv,  byteOffset: 0, componentType: 5126, count, type: "VEC3", min: [-1,-1,-1], max: [1,1,1] });

    const uvBv   = addBuf(uvArr, 34962);
    const uvAcc  = accessors.length;
    accessors.push({ bufferView: uvBv,   byteOffset: 0, componentType: 5126, count, type: "VEC2", min: [0,0], max: [1,1] });

    // Index buffer (identity — geometry is already non-indexed / flat)
    const idxArr = new Uint32Array(count);
    for (let i = 0; i < count; i++) idxArr[i] = i;
    const idxBv  = addBuf(idxArr, 34963); // ELEMENT_ARRAY_BUFFER
    const idxAcc = accessors.length;
    accessors.push({ bufferView: idxBv,  byteOffset: 0, componentType: 5125, count, type: "SCALAR", min: [0], max: [count - 1] });

    const meshIdx = gltfMeshes.length;
    gltfMeshes.push({
      name,
      primitives: [{ attributes: { POSITION: posAcc, NORMAL: norAcc, TEXCOORD_0: uvAcc }, indices: idxAcc, material: matIndex }]
    });

    gltfNodes.push({ name, mesh: meshIdx });
  }

  // Root node groups all sub-meshes
  const rootIdx = gltfNodes.length;
  gltfNodes.push({ name: "535333512", children: gltfNodes.map((_, i) => i) });

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

  const jsonBuf   = Buffer.from(JSON.stringify(gltfJSON), "utf8");
  const jsonPad   = (4 - (jsonBuf.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const binPad   = (4 - (binBuffer.length % 4)) % 4;
  const binChunk = Buffer.concat([binBuffer, Buffer.alloc(binPad, 0x00)]);

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // magic "glTF"
  header.writeUInt32LE(2,          4); // version 2
  header.writeUInt32LE(totalLength,8);

  const c0 = Buffer.alloc(8);
  c0.writeUInt32LE(jsonChunk.length, 0);
  c0.writeUInt32LE(0x4e4f534a,       4); // "JSON"

  const c1 = Buffer.alloc(8);
  c1.writeUInt32LE(binChunk.length, 0);
  c1.writeUInt32LE(0x004e4942,      4); // "BIN\0"

  return Buffer.concat([header, c0, jsonChunk, c1, binChunk]);
}

// Build and write
const glbBuf = packGLB(meshes);
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, glbBuf);

const kbSize = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
console.log(`GLB written: ${OUT_PATH} (${kbSize} KB, budget <= 2048 KB)`);
