import fs from "node:fs";
import assert from "node:assert/strict";
const campus = JSON.parse(fs.readFileSync("public/campus.json", "utf8"));
const survey = JSON.parse(fs.readFileSync(new URL("./survey.json", import.meta.url), "utf8"));
const distance = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const reports = [];
for (const spec of survey.buildings) {
  const bytes = fs.readFileSync(`public/models/landmarks/${spec.id}.glb`);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
  const n = bytes.readUInt32LE(12), g = JSON.parse(bytes.subarray(20, 20 + n).toString());
  const start = 28 + n;
  function floats(index) {
    const a = g.accessors[index], v = g.bufferViews[a.bufferView], size = { VEC2: 2, VEC3: 3 }[a.type];
    assert.equal(a.componentType, 5126);
    return Array.from({ length: a.count * size }, (_, i) => bytes.readFloatLE(start + v.byteOffset + (a.byteOffset || 0) + i * 4));
  }
  const b = campus.buildings.find((b) => String(b.id) === String(spec.id));
  const c = b.pts.reduce((s, p) => [s[0] + p[0] / b.pts.length, s[1] + p[1] / b.pts.length], [0, 0]);
  const ground = [];
  let tris = 0, badWinding = 0;
  for (const m of g.meshes) for (const prim of m.primitives) {
    const p = floats(prim.attributes.POSITION), norm = floats(prim.attributes.NORMAL);
    assert(p.every(Number.isFinite) && norm.every(Number.isFinite));
    tris += p.length / 9;
    for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 1]) < 1e-5) ground.push([p[i] + c[0], p[i + 2] + c[1]]);
    for (let i = 0; i < p.length; i += 9) {
      const u = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]];
      const v = [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]];
      const dot = (u[1] * v[2] - u[2] * v[1]) * norm[i] + (u[2] * v[0] - u[0] * v[2]) * norm[i + 1] + (u[0] * v[1] - u[1] * v[0]) * norm[i + 2];
      if (dot < -1e-6) badWinding++;
    }
  }
  assert(ground.length, `${spec.id}: no ground outline`);
  const vertexError = Math.max(...b.pts.map((p) => Math.min(...ground.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))));
  const footprintError = Math.max(...ground.map((p) => Math.min(...b.pts.map((a, i) => distance(p, a, b.pts[(i + 1) % b.pts.length])))));
  assert(vertexError < 0.01 && footprintError <= 0.5, `${spec.id}: footprint deviation ${footprintError}`);
  assert.equal(badWinding, 0, `${spec.id}: inward-facing triangles`);
  assert(tris <= 30000 && bytes.length <= 2 * 1024 * 1024 && g.materials.length <= 4);
  assert(!g.images?.length, "Street View pixels must not be embedded");
  reports.push({ id: spec.id, triangles: tris, bytes: bytes.length, materials: g.materials.length, maxFootprintDeviationMetres: +footprintError.toFixed(4), sourceVertexErrorMetres: +vertexError.toFixed(6), badWinding, visualStatus: spec.status });
}
fs.mkdirSync("tools/landmarks/out", { recursive: true });
fs.writeFileSync("tools/landmarks/out/validation.json", JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
