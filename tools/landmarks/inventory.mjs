// Reproducible scope list for the 300 m expansion; this does not imply visual verification.
import fs from "node:fs";
const campus = JSON.parse(fs.readFileSync("public/campus.json", "utf8"));
const survey = JSON.parse(fs.readFileSync(new URL("./survey.json", import.meta.url), "utf8"));
const inspected = new Map(survey.buildings.map((b) => [String(b.id), b.status]));
const buildings = campus.buildings.map((b) => {
  const [x, z] = b.pts.reduce((s, p) => [s[0] + p[0] / b.pts.length, s[1] + p[1] / b.pts.length], [0, 0]);
  return { id: b.id, name: b.name || null, x: +x.toFixed(2), z: +z.toFixed(2), distance: +Math.hypot(x, z).toFixed(2), status: inspected.get(String(b.id)) || "unverified" };
}).filter((b) => b.distance <= survey.radiusMetres).sort((a, b) => a.distance - b.distance);
const report = {
  radiusMetres: survey.radiusMetres,
  total: buildings.length,
  inspected: buildings.filter((b) => b.status !== "unverified").length,
  unverified: buildings.filter((b) => b.status === "unverified").length,
  buildings,
};
fs.mkdirSync("tools/landmarks/out", { recursive: true });
fs.writeFileSync("tools/landmarks/out/inventory.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ radiusMetres: report.radiusMetres, total: report.total, inspected: report.inspected, unverified: report.unverified }));
