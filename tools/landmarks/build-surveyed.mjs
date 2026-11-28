// Street View informs the visible frontage; unknown elevations stay plain.
// All world anchors and outlines still come from campus.json.
import fs from "node:fs";
import assert from "node:assert/strict";
import * as THREE from "../../public/vendor/three.module.js";
import { boxPosNor, cylPosNor, polyCapPosNor, polyWallPosNor, merge, packGLB } from "./build-all-landmarks.mjs";

const campus = JSON.parse(fs.readFileSync("public/campus.json", "utf8"));
const survey = JSON.parse(fs.readFileSync(new URL("./survey.json", import.meta.url), "utf8"));
const signedArea = (pts) => pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2;
const centre = (pts) => pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
const material = (name, color, metalness = 0, roughness = 0.85) => ({ name, pbrMetallicRoughness: {
  baseColorFactor: [...new THREE.Color(color).toArray(), 1], metallicFactor: metalness, roughnessFactor: roughness,
} });

// Legacy polygon helpers have inconsistent winding. Keep normals and face culling in agreement.
function orientTriangles(g) {
  for (let i = 0; i < g.pos.length; i += 9) {
    const a = new THREE.Vector3(...g.pos.slice(i, i + 3));
    const b = new THREE.Vector3(...g.pos.slice(i + 3, i + 6));
    const c = new THREE.Vector3(...g.pos.slice(i + 6, i + 9));
    if (b.sub(a).cross(c.sub(a)).dot(new THREE.Vector3(...g.nor.slice(i, i + 3))) < 0) {
      for (const arr of [g.pos, g.nor]) for (let k = 0; k < 3; k++) {
        const t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t;
      }
    }
  }
  return g;
}

const report = [];
for (const spec of survey.buildings) {
  const building = campus.buildings.find((b) => String(b.id) === String(spec.id));
  assert(building, `Missing footprint ${spec.id}`);
  const [cx, cz] = centre(building.pts);
  let pts = building.pts.map(([x, z]) => [x - cx, z - cz]);
  if (signedArea(pts) < 0) pts = pts.reverse();
  const edges = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    return { a, b, len, ux: dx / len, uz: dz / len, nx: dz / len, nz: -dx / len };
  }).filter((e) => e.len > 0.5);
  // Panorama GPS can fall inside an OSM outline (Monotel is about 2 m inside).
  // Its observed viewing heading still identifies the street-facing elevation.
  const yaw = spec.heading * Math.PI / 180;
  const facing = edges.filter((e) => e.nx * -Math.sin(yaw) + e.nz * Math.cos(yaw) > 0.5);
  assert(facing.length, `${spec.id}: no elevation faces the observed panorama`);
  const front = facing.reduce((a, b) => a.len > b.len ? a : b);
  const H = spec.height;
  const palette = spec.design === "ecocentre" ? ["#9b6256", "#d1c8b7", "#6f9099", "#465456"]
    : spec.design === "millennium" ? ["#a9adb0", "#d8dde0", "#456775", "#343d43"]
    : spec.design === "monotel" ? ["#cbb393", "#e0ccad", "#8faba5", "#343939"]
    : spec.design === "wipro" ? ["#ddd8c8", "#a94d3f", "#709696", "#4c5959"]
    : ["#e5e4dd", "#d2d0c7", "#537c79", "#465252"];
  const mats = [material("stone", palette[0]), material("accent", palette[1]), material("opaque glazing", palette[2], 0.25, 0.3), material("frames", palette[3], 0.2, 0.55)];
  const G = [[], [], [], []];
  const shellH = spec.design === "iihm" ? 10.2 : H;
  const shellMat = spec.design === "millennium" ? 2 : 0;
  G[shellMat].push(polyWallPosNor(pts, 0, shellH), polyCapPosNor(pts, shellH));
  // Panels sit a few centimetres outside the shell; they do not enlarge its ground footprint.
  function panel(e, start, width, bottom, height, mat, depth = 0.06, offset = 0.055) {
    if (width <= 0 || height <= 0) return;
    const x = e.a[0] + e.ux * (start + width / 2) + e.nx * offset;
    const z = e.a[1] + e.uz * (start + width / 2) + e.nz * offset;
    G[mat].push(boxPosNor(width, height, depth, x, bottom + height / 2, z, 0, Math.atan2(-e.uz, e.ux)));
  }
  const frontEdges = facing.filter((e) => e.nx * front.nx + e.nz * front.nz > 0.9 && e.len > 3);
  if (spec.design === "millennium") {
    // The mapped outline already contains the two wings and their faceted curved corners.
    // Keep that plan, then reproduce the observed curtain-wall rhythm and striped podium.
    const visibleEdges = edges.filter((e) => e.nx * -Math.sin(yaw) + e.nz * Math.cos(yaw) > 0.08 && e.len > 2.5);
    for (const e of visibleEdges) {
      panel(e, e.len * 0.025, e.len * 0.95, 7.2, H - 8.4, 2, 0.08, 0.09);
      for (let y = 8.4; y < H - 0.8; y += 3.8) panel(e, e.len * 0.01, e.len * 0.98, y, 0.34, 1, 0.13, 0.14);
      const bays = Math.max(2, Math.round(e.len / 4.4));
      for (let i = 0; i <= bays; i++) panel(e, e.len * i / bays, 0.13, 7.2, H - 8.1, 3, 0.09, 0.15);
      for (let y = 0.35; y < 7.0; y += 0.72) panel(e, e.len * 0.01, e.len * 0.98, y, 0.22, y % 1.44 < 0.4 ? 3 : 1, 0.11, 0.13);
      panel(e, 0, e.len, H - 0.55, 0.7, 3, 1.25, 0.5);
    }
    // The deepest street-facing edge is the central entrance: dark recess, broad canopy and piers.
    const e = front;
    panel(e, e.len * 0.25, e.len * 0.5, 0.25, 6.5, 3, 0.5, 0.2);
    panel(e, e.len * 0.34, e.len * 0.32, 0.3, 5.25, 2, 0.12, 0.55);
    panel(e, e.len * 0.17, e.len * 0.66, 5.6, 0.58, 1, 3.2, 1.65);
    for (const t of [0.24, 0.76]) panel(e, e.len * t, 0.48, 0.05, 6.05, 1, 0.7, 0.5);
  } else if (spec.design === "wipro") {
    // The footprint already carries the stepped/rounded plan; repeat only the visible façade rhythm.
    const visibleEdges = edges.filter((e) => e.nx * -Math.sin(yaw) + e.nz * Math.cos(yaw) > 0.1);
    for (const e of visibleEdges) {
      panel(e, e.len * 0.04, e.len * 0.92, 1.1, H - 2.2, 2);
      for (let y = 3.5; y < H; y += 3.8) panel(e, e.len * 0.03, e.len * 0.94, y, 0.42, 0, 0.09, 0.11);
      const bays = Math.max(2, Math.round(e.len / 7));
      for (let i = 0; i <= bays; i++) panel(e, e.len * (0.05 + 0.9 * i / bays), 0.18, 1.1, H - 2.2, 0, 0.08, 0.12);
      if (e.len > 9) {
        panel(e, e.len * 0.08, e.len * 0.16, 1.1, H - 2.2, 1, 0.1, 0.14);
        panel(e, e.len * 0.76, e.len * 0.16, 1.1, H - 2.2, 1, 0.1, 0.14);
        for (let y = 2.4; y < H - 2; y += 3.8) {
          panel(e, e.len * 0.09, e.len * 0.14, y, 2.3, 3, 0.06, 0.16);
          panel(e, e.len * 0.77, e.len * 0.14, y, 2.3, 3, 0.06, 0.16);
        }
      }
    }
  } else if (spec.design === "ecocentre") {
    const projected = pts.map(([x, z]) => x * front.ux + z * front.uz);
    const lo = Math.min(...projected), width = Math.max(...projected) - lo;
    // The observed frontage is mostly warm brick, divided by narrow full-height blue-grey bays.
    const band = (from, to, y, h, mat, offset = 0.055) => {
      for (const e of frontEdges) {
        const u = e.a[0] * front.ux + e.a[1] * front.uz, scale = e.ux * front.ux + e.uz * front.uz;
        const a = Math.max(0, (lo + from * width - u) / scale), b = Math.min(e.len, (lo + to * width - u) / scale);
        if (b > a) panel(e, a, b - a, y, h, mat, 0.06, offset);
      }
    };
    for (let i = 0; i < 8; i++) {
      const x = 0.045 + i * 0.122;
      band(x, x + 0.055, H * 0.22, H * 0.75, 2);
      band(x + 0.026, x + 0.028, H * 0.22, H * 0.75, 3, 0.1);
      for (let y = H * 0.22; y < H * 0.97; y += H * 0.057) band(x, x + 0.055, y, 0.07, 3, 0.1);
    }
    for (const x of [0.02, 0.32, 0.65, 0.96]) band(x, Math.min(1, x + 0.025), 0, H, 1, 0.13);
    band(0.34, 0.66, 0.4, H * 0.17, 0, 0.2);
    band(0.42, 0.58, H * 0.03, H * 0.08, 2, 0.22);
    for (let x = 0.43; x < 0.58; x += 0.025) band(x, x + 0.002, H * 0.03, H * 0.08, 3, 0.24);
    band(0.02, 0.98, H * 0.195, H * 0.025, 1, 0.16);
  } else if (spec.design === "monotel") {
    const e = front;
    panel(e, e.len * 0.475, e.len * 0.05, 10.5, H - 11.8, 2);
    for (let y = 10.5; y < H - 1; y += 1.8) panel(e, e.len * 0.47, e.len * 0.06, y, 0.09, 3, 0.06, 0.1);
    for (let y = 0.8; y < H; y += 0.9) panel(e, 0, e.len, y, 0.015, 1, 0.025, 0.09);
    panel(e, e.len * 0.16, e.len * 0.68, 0.2, 9.2, 3);
    panel(e, e.len * 0.22, e.len * 0.56, 0.2, 7.8, 2, 0.08, 0.11);
    panel(e, e.len * 0.08, e.len * 0.84, 8.5, 0.65, 1, 0.75, 0.1);
    for (const t of [0.07, 0.87]) panel(e, e.len * t, e.len * 0.06, 0, 11.5, 3, 0.45, 0.1);
    for (const t of [0.31, 0.5, 0.69]) panel(e, e.len * t, 0.1, 0.2, 10, 0, 0.1, 0.16);
  } else if (spec.design === "iihm") {
    const e = front;
    panel(e, e.len * 0.03, e.len * 0.2, 0.4, shellH - 0.8, 2);
    panel(e, e.len * 0.77, e.len * 0.2, 0.4, shellH - 0.8, 2);
    panel(e, e.len * 0.32, e.len * 0.36, 0.4, shellH * 0.67, 2);
    panel(e, e.len * 0.24, e.len * 0.52, shellH * 0.68, shellH * 0.16, 3, 0.16, 0.12);
    panel(e, e.len * 0.22, e.len * 0.56, shellH * 0.57, 0.48, 0, 1.2, 0.18);
    for (const t of [0.02, 0.24, 0.76, 0.98]) panel(e, e.len * t, 0.5, 0, shellH, 0, 0.2, 0.13);
    for (const t of [0.31, 0.69]) {
      const x = e.a[0] + e.ux * e.len * t + e.nx * 0.02, z = e.a[1] + e.uz * e.len * t + e.nz * 0.02;
      G[0].push(cylPosNor(0.36, shellH * 0.67, 16, x, shellH * 0.335, z));
    }
    for (let y = 2; y < shellH; y += 2) {
      panel(e, e.len * 0.03, e.len * 0.2, y, 0.06, 3, 0.04, 0.1);
      panel(e, e.len * 0.77, e.len * 0.2, y, 0.06, 3, 0.04, 0.1);
    }
    const upperW = e.len * 0.34, upperD = Math.min(7, e.len * 0.22), upperH = H - shellH;
    const ux = (e.a[0] + e.b[0]) / 2 - e.nx * (upperD / 2 + 1.3), uz = (e.a[1] + e.b[1]) / 2 - e.nz * (upperD / 2 + 1.3);
    G[0].push(boxPosNor(upperW, upperH, upperD, ux, shellH + upperH / 2, uz, 0, Math.atan2(-e.uz, e.ux)));
    const upperEdge = { ...e, a: [ux - e.ux * upperW / 2 + e.nx * upperD / 2, uz - e.uz * upperW / 2 + e.nz * upperD / 2], len: upperW };
    panel(upperEdge, upperW * 0.37, upperW * 0.26, shellH + 0.6, upperH - 1.2, 2, 0.08, 0.08);
  } else if (spec.design === "pwc") {
    for (const e of frontEdges) {
      panel(e, e.len * 0.15, e.len * 0.7, 1.8, H * 0.37, 2);
      for (let x = e.len * 0.15; x < e.len * 0.85; x += 2.1) panel(e, x, 0.1, 1.8, H * 0.37, 0, 0.05, 0.11);
      for (let y = 3.4; y < H * 0.45; y += 1.8) panel(e, e.len * 0.15, e.len * 0.7, y, 0.09, 0, 0.05, 0.11);
      panel(e, e.len * 0.25, e.len * 0.5, H * 0.6, H * 0.16, 1);
      for (let y = H * 0.6; y < H * 0.76; y += 0.25) panel(e, e.len * 0.25, e.len * 0.5, y, 0.08, 0, 0.08, 0.11);
      panel(e, e.len * 0.36, e.len * 0.28, H * 0.88, H * 0.06, 3);
    }
  }
  const meshes = G.map((geos, i) => ({ name: `${spec.id}_${mats[i].name}`, geo: orientTriangles(merge(geos)), matIndex: i }));
  const bytes = packGLB(meshes, mats, spec.id);
  // Store provenance in the asset itself so the loader/viewer can expose its limits.
  const oldJsonSize = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + oldJsonSize).toString());
  json.nodes[json.scenes[0].nodes[0]].extras = { sourceId: building.sid, surveyStatus: spec.status, heightSource: spec.heightSource };
  const text = Buffer.from(JSON.stringify(json)), padded = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const header = Buffer.from(bytes.subarray(0, 20)); header.writeUInt32LE(bytes.length - oldJsonSize + padded.length, 8); header.writeUInt32LE(padded.length, 12);
  const output = Buffer.concat([header, padded, bytes.subarray(20 + oldJsonSize)]);
  const triangles = meshes.reduce((n, m) => n + m.geo.pos.length / 9, 0);
  assert(triangles <= 30000 && output.length <= 2 * 1024 * 1024, `${spec.id}: exceeds asset budget`);
  fs.writeFileSync(`public/models/landmarks/${spec.id}.glb`, output);
  report.push({ id: spec.id, triangles, bytes: output.length, frontEdge: building.pts.findIndex((p) => Math.hypot(p[0] - cx - front.a[0], p[1] - cz - front.a[1]) < 0.01), height: H, status: spec.status });
}
console.log(JSON.stringify(report, null, 2));
