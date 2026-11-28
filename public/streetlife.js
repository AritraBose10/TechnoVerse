// Data-driven street-level fronts. World coordinates come only from campus.json anchors.
import * as THREE from "three";
import { Batch } from "/geom.js";
import { surface } from "/pbr.js";

const area = (pts) => pts.reduce((sum, p, i) => sum + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2;

function materials(atlas, evidence) {
  if (evidence) {
    const colours = { observed: "#43a868", estimated: "#d89b35", "osm-only": "#8b9198" };
    const body = {}, sign = {};
    for (const [status, colour] of Object.entries(colours)) {
      body[status] = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.72, metalness: 0.05 });
      sign[status] = new THREE.MeshStandardMaterial({ map: atlas, color: colour, roughness: 0.55, metalness: 0.05 });
    }
    return { body, sign, evidence: true };
  }
  const painted = (base, roughness, metalness, seed) => surface({
    size: 64, tile: 2, seed, bump: 0.5, roughness, metalness,
    paint(c, h, r, size) {
      c.fillStyle = base; c.fillRect(0, 0, size, size);
      h.fillStyle = "#808080"; h.fillRect(0, 0, size, size);
      r.fillStyle = `rgb(${Math.round(roughness * 255)},${Math.round(roughness * 255)},${Math.round(roughness * 255)})`; r.fillRect(0, 0, size, size);
    },
  });
  return {
    panel: painted("#c9c3b7", 0.78, 0.03, 801),
    frame: painted("#24282a", 0.48, 0.38, 802),
    glass: painted("#365660", 0.22, 0.62, 803),
    sign: new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.52, metalness: 0.04 }),
    evidence: false,
  };
}

function frameFor(item, buildings, roads) {
  if (item.mount.road) {
    const road = roads.get(item.mount.road);
    const a = road?.pts[item.mount.segment];
    const b = road?.pts[item.mount.segment + 1];
    if (!a || !b) return null;
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.5) return null;
    const ux = dx / len, uz = dz / len;
    const side = item.mount.side === "left" ? -1 : 1;
    const nx = -uz * side, nz = ux * side;
    const t = Math.max(0, Math.min(1, item.mount.t));
    return { x: a[0] + dx * t + nx * item.mount.offset, z: a[1] + dz * t + nz * item.mount.offset, ux, uz, nx, nz, len: Infinity };
  }
  if (item.mount.frame) {
    const p = item.anchor.cached;
    const d = item.mount.frame;
    if (!Array.isArray(p) || p.length !== 2) return null;
    const n = Math.hypot(d.ux, d.uz);
    if (n < 0.99 || n > 1.01) return null;
    return {
      x: p[0] + d.nx * item.mount.offset,
      z: p[1] + d.nz * item.mount.offset,
      ux: d.ux, uz: d.uz, nx: d.nx, nz: d.nz, len: Infinity,
    };
  }
  const building = buildings.get(String(item.mount.building));
  if (!building) return null;
  const a = building.pts[item.mount.edge];
  const b = building.pts[(item.mount.edge + 1) % building.pts.length];
  if (!a || !b) return null;
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.5) return null;
  const ux = dx / len, uz = dz / len, ccw = area(building.pts) > 0;
  const nx = (ccw ? dz : -dz) / len, nz = (ccw ? -dx : dx) / len;
  const t = Math.max(0, Math.min(1, item.mount.t));
  return { x: a[0] + dx * t + nx * item.mount.offset, z: a[1] + dz * t + nz * item.mount.offset, ux, uz, nx, nz, len };
}

function quad(batch, material, f, left, right, y0, y1, outward, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  const p = (along, y, out) => [f.x + f.ux * along + f.nx * out, y, f.z + f.uz * along + f.nz * out];
  batch.quad(material, [p(left, y0, outward), p(right, y0, outward), p(right, y1, outward), p(left, y1, outward)], uv, [f.nx, 0, f.nz]);
}

function box(batch, material, f, along, y, outward, w, h, d) {
  const matrix = new THREE.Matrix4().set(
    f.ux, 0, f.nx, f.x + f.ux * along + f.nx * outward,
    0, 1, 0, y,
    f.uz, 0, f.nz, f.z + f.uz * along + f.nz * outward,
    0, 0, 0, 1,
  );
  batch.obox(material, matrix, w, h, d);
}

/** Build verified street fronts and return meshes for the world's static chunk merger. */
export function buildStreetLayer({ scene, campus, data, registerMesh }) {
  if (!data?.items?.length) return { meshes: [], rendered: 0, skipped: [] };
  const buildings = new Map();
  for (const b of campus.buildings) {
    buildings.set(String(b.id), b);
    if (b.sid) buildings.set(String(b.sid), b);
  }
  const roads = new Map(campus.roads.map((road) => [road.sid, road]));
  const atlas = new THREE.TextureLoader().load(data.atlas.path);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  const evidence = new URLSearchParams(location.search).get("street") === "evidence";
  const mats = materials(atlas, evidence);
  const batch = new Batch(scene);
  const skipped = [];
  let rendered = 0;

  for (const item of data.items) {
    if (item.status === "unverified") continue;
    const f = frameFor(item, buildings, roads);
    if (!f) { skipped.push({ id: item.id, reason: "mount building or edge missing" }); continue; }
    const spec = item.facade;
    const width = Math.min(spec.width, f.len * 0.92);
    const signMat = mats.evidence ? mats.sign[item.status] : mats.sign;
    const bodyMat = mats.evidence ? mats.body[item.status] : mats.panel;
    const frameMat = mats.evidence ? mats.body[item.status] : mats.frame;
    const glassMat = mats.evidence ? mats.body[item.status] : mats.glass;
    let signUV = null;
    if (item.atlasRect) {
      const [px, py, pw, ph] = item.atlasRect;
      signUV = [px / data.atlas.width, (px + pw) / data.atlas.width, 1 - (py + ph) / data.atlas.height, 1 - py / data.atlas.height];
    }

    if (item.kind === "storefront") {
      if (spec.depth) box(batch, bodyMat, f, 0, spec.height / 2, -spec.depth / 2, width, spec.height, spec.depth);
      quad(batch, bodyMat, f, -width / 2, width / 2, 0.12, spec.height, 0.015);
      const inner = width - 0.28, glassTop = spec.signBottom - 0.12;
      quad(batch, glassMat, f, -inner / 2, inner / 2, 0.25, glassTop, 0.035);
      const door = -inner / 2 + inner * spec.doorAt;
      box(batch, frameMat, f, door, (glassTop + 0.25) / 2, 0.055, 0.08, glassTop - 0.25, 0.08);
      for (const side of [-1, 1]) box(batch, frameMat, f, side * inner / 2, (glassTop + 0.25) / 2, 0.055, 0.1, glassTop - 0.25, 0.08);
      box(batch, frameMat, f, 0, 0.22, 0.055, inner, 0.16, 0.08);
      if (spec.awningDepth) box(batch, frameMat, f, 0, spec.signBottom - 0.05, spec.awningDepth / 2 + 0.05, width, 0.12, spec.awningDepth);
    } else if (item.kind === "stall-row") {
      const bay = spec.length / spec.bays;
      for (let i = 0; i < spec.bays; i++) {
        const x = -spec.length / 2 + bay * (i + 0.5);
        box(batch, frameMat, f, x, spec.height - 0.08, spec.depth / 2, bay - 0.08, 0.16, spec.depth);
        box(batch, bodyMat, f, x, 0.66, 0.18, bay - 0.18, 0.92, 0.42);
        quad(batch, glassMat, f, x - bay * 0.42, x + bay * 0.42, 1.18, spec.height - 0.28, 0.08);
        for (const edge of [-0.46, 0.46]) box(batch, frameMat, f, x + bay * edge, spec.height / 2, 0.12, 0.09, spec.height, 0.1);
      }
    } else if (item.kind === "railing-row") {
      for (let x = -spec.length / 2; x <= spec.length / 2; x += spec.spacing) box(batch, frameMat, f, x, spec.height / 2, 0, 0.09, spec.height, 0.09);
      for (const y of [0.42, spec.height - 0.12]) box(batch, frameMat, f, 0, y, 0, spec.length, 0.08, 0.08);
    } else if (item.kind === "lamp-row") {
      for (let x = -spec.length / 2; x <= spec.length / 2; x += spec.spacing) {
        box(batch, frameMat, f, x, spec.height / 2, 0, 0.14, spec.height, 0.14);
        box(batch, frameMat, f, x, spec.height - 0.18, 0, spec.armWidth, 0.1, 0.1);
        for (const side of [-1, 1]) box(batch, bodyMat, f, x + side * spec.armWidth / 2, spec.height - 0.3, 0, 0.55, 0.13, 0.24);
      }
    }
    if (signUV) {
      const [u0, u1, v0, v1] = signUV;
      quad(batch, signMat, f, -width / 2, width / 2, spec.signBottom, spec.signTop, 0.075, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
    rendered++;
  }

  const meshes = batch.flush();
  for (const mesh of meshes) {
    mesh.name = "street layer";
    registerMesh(mesh, { cast: false, receive: true });
  }
  scene.userData.streetLayer = { rendered, skipped, evidence };
  return { meshes, rendered, skipped };
}
