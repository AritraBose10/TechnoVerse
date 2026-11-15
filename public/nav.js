// Navigation mesh and crowd for the street (recast-navigation-js, vendored in /vendor/recast).
//
// Everything here works in the STREET FRAME (x along Street Number 2, z out from the university,
// y = world height). The navmesh is built straight from the Rapier fixed colliders, converted
// into the street frame, so a long thin strip is voxelised rather than a rotated world box.
//
//   const nav = await buildNav({ RAPIER, world, local, toLocal, scene });
//   const i = nav.addAgent(x, z); nav.setTarget(i, x2, z2); nav.update(dt); nav.agentState(i)
//
// Caveats: solid things taller than OBSTACLE_TOP are treated as pure blockers (their tops are not
// walkable), so raised floors above 0.45 m are not on the mesh. Carriageways are blocked except at
// the crossing.
import * as THREE from "three";
import { init, NavMeshQuery, Crowd, generateTileCache, getNavMeshPositionsAndIndices } from "/vendor/recast/recast.js";

export const NAV = {
  bounds: { x0: -135, x1: 155, z0: -12, z1: 33 }, // street frame
  agent: { height: 1.8, radius: 0.27, climb: 0.2, slope: 35 },
  cs: 0.135, // 2 cells = the 0.27 m agent radius, so erosion is exact
  ch: 0.1,
  obstacleTop: 0.45, // fixed solids reaching higher than this are blockers, lower ones can be stepped onto
  roads: [
    [8.4, 15.4],
    [19.4, 25.6],
  ],
  crossing: [6.6, 11.4],
};

const UP_EPS = 0.05;

export async function buildNav({ RAPIER, world, local, toLocal, scene, debug = false }) {
  await init();
  const t0 = performance.now();
  const B = NAV.bounds;
  const pos = [];
  const idx = [];
  const stats = { box: 0, cylinder: 0, ball: 0, trimesh: 0, skipped: {}, tris: 0, culled: 0 };

  // ---- geometry helpers ----
  const toStreet = (p) => {
    const [x, z] = toLocal(p[0], p[2]);
    return [x, p[1], z];
  };
  // add one convex solid from street-frame points + triangles (index triples). Outward winding is
  // fixed up using the solid's centre; if `block`, upward faces are flipped so they are not walkable.
  function addConvex(pts, tris, block) {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    const c = [0, 0, 0];
    for (const p of pts) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
      c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length;
    }
    if (maxX < B.x0 - 1 || minX > B.x1 + 1 || maxZ < B.z0 - 1 || minZ > B.z1 + 1) { stats.culled++; return; }
    if (block) {
      // A solid is only its surface to Recast. Ground under a tall solid stays "walkable" unless a
      // ceiling lower than the agent is rasterised over it, and Recast clips away anything above its
      // bounds, so cap every blocker one metre above its base (the top face is flipped: not walkable).
      const lo = Math.min(...pts.map((p) => p[1]));
      if (lo > 1.9) { stats.culled++; return; } // overhead: nobody bumps into it
      const cap = Math.max(lo, 0) + 1.0;
      for (const p of pts) p[1] = Math.max(-1.5, Math.min(cap, p[1]));
      c[1] = (Math.max(lo, -1.5) + cap) / 2;
    }
    const base = pos.length / 3;
    for (const p of pts) pos.push(p[0], p[1], p[2]);
    for (const [a, b, d] of tris) {
      const A = pts[a], Bp = pts[b], C = pts[d];
      const ux = Bp[0] - A[0], uy = Bp[1] - A[1], uz = Bp[2] - A[2];
      const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const out = n[0] * (A[0] - c[0]) + n[1] * (A[1] - c[1]) + n[2] * (A[2] - c[2]);
      let flip = out < 0;
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      const ny = (flip ? -n[1] : n[1]) / len;
      if (block && ny > UP_EPS) flip = !flip; // face up -> point it down: solid but not walkable
      idx.push(base + a, base + (flip ? d : b), base + (flip ? b : d));
      stats.tris++;
    }
  }
  const BOX_TRIS = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]];
  const boxCorners = (hx, hy, hz) => [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]];
  const SEG = 12;
  const rot = (q, v) => {
    const { x, y, z, w } = q;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  };
  const place = (q, t, v) => {
    const r = rot(q, v);
    return toStreet([r[0] + t.x, r[1] + t.y, r[2] + t.z]);
  };

  // ---- collect the fixed colliders ----
  const ST = RAPIER.ShapeType;
  world.colliders.forEach((c) => {
    if (c.isSensor()) return;
    const body = c.parent();
    if (body && !body.isFixed()) return;
    const q = c.rotation();
    const t = c.translation();
    const type = c.shapeType();
    let pts, tris;
    if (type === ST.Cuboid) {
      const h = c.halfExtents();
      pts = boxCorners(h.x, h.y, h.z).map((v) => place(q, t, v));
      tris = BOX_TRIS;
      stats.box++;
    } else if (type === ST.Cylinder) {
      const r = c.radius();
      const hh = c.halfHeight();
      pts = [];
      tris = [];
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        pts.push(place(q, t, [Math.cos(a) * r, -hh, Math.sin(a) * r]));
      }
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        pts.push(place(q, t, [Math.cos(a) * r, hh, Math.sin(a) * r]));
      }
      for (let k = 0; k < SEG; k++) {
        const n = (k + 1) % SEG;
        tris.push([k, n, SEG + n], [k, SEG + n, SEG + k]);
        if (k > 0 && k < SEG - 1) tris.push([0, k + 1, k], [SEG, SEG + k, SEG + k + 1]);
      }
      stats.cylinder++;
    } else if (type === ST.Ball) {
      const r = c.radius();
      pts = [];
      tris = [];
      const ico = [[-1, 1.618, 0], [1, 1.618, 0], [-1, -1.618, 0], [1, -1.618, 0], [0, -1, 1.618], [0, 1, 1.618], [0, -1, -1.618], [0, 1, -1.618], [1.618, 0, -1], [1.618, 0, 1], [-1.618, 0, -1], [-1.618, 0, 1]];
      for (const v of ico) {
        const l = Math.hypot(...v);
        pts.push(place(q, t, [(v[0] / l) * r, (v[1] / l) * r, (v[2] / l) * r]));
      }
      tris = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
      stats.ball++;
    } else if (type === ST.TriMesh) {
      const v = c.vertices();
      const ix = c.indices();
      if (!v || !ix) return;
      const wp = [];
      for (let k = 0; k < v.length; k += 3) wp.push(place(q, t, [v[k], v[k + 1], v[k + 2]]));
      // not convex: orient by the stored winding, block anything above the step height
      const top = Math.max(...wp.map((p) => p[1]));
      const base = pos.length / 3;
      for (const p of wp) pos.push(p[0], p[1], p[2]);
      for (let k = 0; k < ix.length; k += 3) idx.push(base + ix[k], base + ix[k + 1], base + ix[k + 2]);
      stats.trimesh++;
      stats.tris += ix.length / 3;
      if (top > NAV.obstacleTop) console.warn("nav: trimesh collider taller than step height is walkable on its upward faces");
      return;
    } else {
      const k = Object.keys(ST).find((n) => ST[n] === type) || String(type);
      stats.skipped[k] = (stats.skipped[k] || 0) + 1;
      return;
    }
    const top = Math.max(...pts.map((p) => p[1]));
    addConvex(pts, tris, top > NAV.obstacleTop);
  });
  const nSkipped = Object.values(stats.skipped).reduce((a, b) => a + b, 0);
  if (nSkipped) console.warn("nav: skipped colliders of unsupported shape", stats.skipped);

  // ---- road blockers: carriageways are not walkable except at the crossing ----
  // The blockers are pulled in by the erosion distance on every side, so that the eroded walkable
  // area ends exactly at the kerb / the crossing edge instead of a radius short of it.
  const rCells = Math.ceil(NAV.agent.radius / NAV.cs - 1e-6);
  const shrink = rCells * NAV.cs;
  for (const [rz0, rz1] of NAV.roads) {
    const z0 = rz0 + shrink, z1 = rz1 - shrink;
    for (const [x0, x1] of [[B.x0 - 5, NAV.crossing[0] - shrink], [NAV.crossing[1] + shrink, B.x1 + 5]]) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const pts = boxCorners((x1 - x0) / 2, 1, (z1 - z0) / 2).map((v) => [v[0] + cx, v[1] + 0.2, v[2] + cz]);
      addConvex(pts, BOX_TRIS, true);
    }
  }

  if (debug) globalThis.__navGeo = { pos, idx };

  // ---- build the tiled navmesh with a tile cache (so obstacles can be carved at runtime) ----
  const { cs, ch, agent } = NAV;
  const bounds = [[B.x0, -1.96, B.z0], [B.x1, 6, B.z1]]; // -1.96 so that y=0 ground lands on a voxel top (y 0.04)
  // Recast occasionally fails a tile at a given tile size / simplification (seen at 64 / 0.5), so
  // fall back through a few settings rather than leaving the street without a mesh.
  let result = null;
  for (const [tileSize, simp] of [[48, 0.5], [40, 0.5], [32, 0.6], [64, 0.8]]) {
    result = generateTileCache(pos, idx, {
      cs,
      ch,
      tileSize,
      walkableSlopeAngle: agent.slope,
      walkableHeight: Math.ceil(agent.height / ch),
      walkableClimb: Math.floor(agent.climb / ch),
      walkableRadius: rCells,
      maxSimplificationError: simp, // cells; kept low, or the contour cuts corners into walls
      detailSampleDist: 3,
      detailSampleMaxError: 0.1,
      bounds,
      expectedLayersPerTile: 8,
      maxObstacles: 256,
    });
    if (result.success) break;
    console.warn("nav: tile cache build failed (" + result.error + "), retrying with other settings");
  }
  if (!result.success) throw new Error("nav: navmesh build failed: " + result.error);
  const { navMesh, tileCache } = result;
  const query = new NavMeshQuery(navMesh);
  const crowd = new Crowd(navMesh, { maxAgents: 300, maxAgentRadius: 0.6 });
  const buildMs = performance.now() - t0;

  // ---- debug drawing (street-frame geometry placed into the world) ----
  const [dp, di] = getNavMeshPositionsAndIndices(navMesh);
  const polyCount = (() => {
    let n = 0;
    const max = navMesh.getMaxTiles();
    for (let i = 0; i < max; i++) n += navMesh.getTile(i)?.header()?.polyCount() ?? 0;
    return n;
  })();
  const debugMesh = new THREE.Group();
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
    g.setIndex(di);
    const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.55, depthTest: false, side: THREE.DoubleSide }));
    fill.renderOrder = 20;
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color: 0x003d1c, depthTest: false }));
    wire.renderOrder = 21;
    debugMesh.add(fill, wire);
    // street frame -> world
    const o = local(0, 0);
    const ax = local(1, 0);
    const az = local(0, 1);
    debugMesh.matrixAutoUpdate = false;
    debugMesh.matrix.makeBasis(new THREE.Vector3(ax[0] - o[0], 0, ax[1] - o[1]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(az[0] - o[0], 0, az[1] - o[1])).setPosition(o[0], 0.08, o[1]);
    debugMesh.matrixWorldNeedsUpdate = true;
    debugMesh.visible = !!debug;
  }

  // ---- API ----
  const EXT = { x: 1.5, y: 3, z: 1.5 };
  const v3 = (x, y, z) => ({ x, y, z });
  function closest(x, z, y = 0, extent = EXT) {
    const r = query.findClosestPoint(v3(x, y, z), { halfExtents: extent });
    if (!r.success || !r.polyRef) return null;
    return { x: r.point.x, z: r.point.z, y: r.point.y };
  }
  function path(x0, z0, x1, z1) {
    const r = query.computePath(v3(x0, 0, z0), v3(x1, 0, z1), { halfExtents: EXT });
    if (!r.success || !r.path || !r.path.length) return null;
    return r.path.map((p) => ({ x: p.x, z: p.z, y: p.y }));
  }
  // The street's main walkable region is the one holding the footpath at the crossing. The mesh also
  // has pockets that nothing can walk to (inside the university compound, the median strips beside
  // the railing); connected() tells them apart so spawns and targets can avoid them.
  const REF = closest(10, 7.5);
  function connected(x, z) {
    const c = closest(x, z);
    if (!c || !REF) return false;
    const r = query.computePath(v3(REF.x, REF.y, REF.z), v3(c.x, c.y, c.z), { halfExtents: EXT });
    if (!r.success || !r.path || !r.path.length) return false;
    const e = r.path[r.path.length - 1];
    return Math.hypot(e.x - c.x, e.z - c.z) < 0.5;
  }
  const agents = new Map(); // our index -> CrowdAgent
  function addAgent(x, z, { radius = 0.27, maxSpeed = 1.4 } = {}) {
    const p = closest(x, z) || { x, y: 0, z };
    const a = crowd.addAgent(v3(p.x, p.y, p.z), {
      radius,
      height: agent.height,
      maxSpeed,
      maxAcceleration: 6,
      collisionQueryRange: radius * 12,
      pathOptimizationRange: radius * 30,
      separationWeight: 1.5,
      updateFlags: 1 | 2 | 4 | 8 | 16,
      obstacleAvoidanceType: 3,
    });
    agents.set(a.agentIndex, a);
    return a.agentIndex;
  }
  function removeAgent(i) {
    if (!agents.has(i)) return;
    crowd.removeAgent(i);
    agents.delete(i);
  }
  function setTarget(i, x, z) {
    const a = agents.get(i);
    if (!a) return false;
    const p = closest(x, z);
    if (!p) return false;
    return a.requestMoveTarget(v3(p.x, p.y, p.z));
  }
  function teleport(i, x, z) {
    const a = agents.get(i);
    if (!a) return;
    const p = closest(x, z) || { x, y: 0, z };
    a.teleport(v3(p.x, p.y, p.z));
  }
  function stop(i) {
    agents.get(i)?.resetMoveTarget();
  }
  function agentState(i) {
    const a = agents.get(i);
    if (!a) return null;
    const p = a.position();
    const v = a.velocity();
    return { x: p.x, z: p.z, y: p.y, vx: v.x, vz: v.z };
  }
  function update(dt) {
    if (dt <= 0) return;
    tileCache.update(navMesh);
    crowd.update(Math.min(dt, 0.1));
  }
  const obstacles = new Map();
  let obstacleId = 1;
  function addObstacle(x, z, radius, height = 2) {
    const r = tileCache.addCylinderObstacle(v3(x, -0.5, z), radius, height + 0.5);
    if (!r.success) return null;
    const id = obstacleId++;
    obstacles.set(id, r.obstacle);
    tileCache.update(navMesh);
    return id;
  }
  function removeObstacle(id) {
    const o = obstacles.get(id);
    if (!o) return;
    tileCache.removeObstacle(o);
    obstacles.delete(id);
    tileCache.update(navMesh);
  }

  return {
    navMesh, crowd, query, tileCache,
    closest, connected, path, addAgent, removeAgent, setTarget, teleport, stop, agentState, update,
    addObstacle, removeObstacle, debugMesh,
    stats: { ...stats, polyCount, buildMs, inputTriangles: idx.length / 3 },
  };
}
