import assert from "node:assert/strict";
import fs from "node:fs";

const campus = JSON.parse(fs.readFileSync("public/campus.json", "utf8"));
const data = JSON.parse(fs.readFileSync("data/world/street-furniture.json", "utf8"));
const survey = JSON.parse(fs.readFileSync("data/world/street-survey.json", "utf8"));
const allowed = new Set(["observed", "estimated", "osm-only", "unverified"]);
const captures = new Map(survey.captures.map((capture) => [capture.id, capture]));
const buildings = new Map();
for (const b of campus.buildings) {
  buildings.set(String(b.id), b);
  if (b.sid) buildings.set(String(b.sid), b);
}
const labels = new Map(campus.labels.map((label) => [label.sid, label]));
const roads = new Map(campus.roads.map((road) => [road.sid, road]));

assert.equal(data.phase, 1, "validator is for phase 1");
assert.equal(data.items.length, 11, "survey batch has seven named fronts/signs and four road-edge sets");
assert(data.atlas.width <= 2048 && data.atlas.height <= 2048, "atlas exceeds 2048 px");
const atlas = fs.readFileSync("public/models/street/sign-atlas.webp");
assert.equal(atlas.subarray(0, 4).toString(), "RIFF", "atlas is not RIFF/WebP");
assert.equal(atlas.subarray(8, 12).toString(), "WEBP", "atlas is not WebP");

for (const item of data.items) {
  assert(allowed.has(item.status), `${item.id}: invalid status`);
  assert.notEqual(item.status, "unverified", `${item.id}: unverified phase-1 item would be rendered`);
  if (item.anchor.type === "label") {
    const label = labels.get(item.anchor.sid);
    assert(label, `${item.id}: label anchor missing`);
    assert(Math.hypot(label.x - item.anchor.cached[0], label.z - item.anchor.cached[1]) < 0.02, `${item.id}: stale cached label position`);
  }
  else if (item.anchor.type === "road") assert(roads.has(item.anchor.sid), `${item.id}: road anchor missing`);
  else assert(buildings.has(String(item.anchor.id)), `${item.id}: building anchor missing`);

  if (item.mount.road) {
    const road = roads.get(item.mount.road);
    assert(road, `${item.id}: mount road missing`);
    assert(road.pts[item.mount.segment] && road.pts[item.mount.segment + 1], `${item.id}: mount road segment missing`);
    assert(item.mount.offset <= 20, `${item.id}: road-side offset is implausible`);
  } else {
    const building = buildings.get(String(item.mount.building));
    assert(building, `${item.id}: mount building missing`);
    if (item.mount.frame) {
    const f = item.mount.frame;
    assert([f.ux, f.uz, f.nx, f.nz].every(Number.isFinite), `${item.id}: invalid observed frame`);
    assert(Math.abs(Math.hypot(f.ux, f.uz) - 1) < 0.01, `${item.id}: observed frame tangent is not unit length`);
    assert(Math.abs(f.ux * f.nx + f.uz * f.nz) < 0.01, `${item.id}: observed frame is not orthogonal`);
    } else {
      const a = building.pts[item.mount.edge];
      const b = building.pts[(item.mount.edge + 1) % building.pts.length];
      assert(a && b, `${item.id}: mount edge missing`);
      assert(Math.hypot(b[0] - a[0], b[1] - a[1]) >= item.facade.width / 0.92, `${item.id}: frontage exceeds mapped face`);
    }
    assert(item.mount.offset <= 0.3, `${item.id}: sign mount error ${item.mount.offset} m exceeds 0.3 m`);
  }

  if (item.status === "observed") {
    const capture = captures.get(item.evidence);
    assert(capture, `${item.id}: evidence record missing`);
    assert(capture.panoId && capture.captureDate && Number.isFinite(capture.heading), `${item.id}: observed evidence incomplete`);
    assert(capture.items.includes(item.id), `${item.id}: capture does not list item`);
  }
}

const mirror = fs.readFileSync("public/models/street/street-furniture.json", "utf8");
assert.deepEqual(JSON.parse(mirror), data, "runtime data mirror is stale; run build-assets.mjs");
console.log(`street validate: ${data.items.length} items, ${survey.captures.length} captures, atlas ${(atlas.length / 1024).toFixed(1)} KiB`);
