// Clearance: one rule for every walking body in TechnoVerse — nothing you can SEE at body height is
// walked through, whether or not anybody remembered to give it a collider.
//
// Built once, right after the world (main.js), from the rendered static geometry itself: every
// steep triangle (walls, posts, cloths, counters, benches, stools, hanging packets, trunks, railings)
// is sliced at 5 cm heights into a 10 cm grid over the street (street frame). A cell is blocked when
// something occupies it between 0.3 m and 1.85 m above the floor at that spot (the floor comes from the
// physics colliders, so kerbs, steps and the porch are not obstacles, and a flap tied up above head
// height is not one either). From that grid:
//   - rects: the blocked cells as rectangles, added to the navmesh build (nav.js extraBlocks), so the
//     crowd's paths never lead through a stall's side cloth or a bench;
//   - a signed distance field (metres to the nearest blocked cell, negative inside), so any body,
//     walking by navmesh or by script, can be pushed back out (push) as the last step of each frame.
// Moving things (vehicles, their open doors) are handled per frame in people.js.
import * as THREE from "three";

export function buildClearance({ scene, world, RAPIER, local, toLocal, bounds, cs = 0.1, band = [0.3, 1.85], skipMeshes = new Set() }) {
  const t0 = performance.now();
  const X0 = bounds.x0, Z0 = bounds.z0, X1 = bounds.x1, Z1 = bounds.z1;
  const nx = Math.ceil((X1 - X0) / cs), nz = Math.ceil((Z1 - Z0) / cs);
  const Y0 = -0.6, SLAB = 0.15, YMAX = Y0 + SLAB * 32; // 32 height slabs: -0.6 .. 4.2 m
  const mask = new Uint32Array(nx * nz);
  const stats = { meshes: 0, instances: 0, tris: 0, blocked: 0, rays: 0, rects: 0, ms: 0 };
  // world -> street frame
  const st = (wx, wz) => toLocal(wx, wz);

  // ---- 1. slice the visible static geometry ----
  const mark = (sx, sz, y) => {
    const ix = Math.floor((sx - X0) / cs), iz = Math.floor((sz - Z0) / cs);
    if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return;
    const k = Math.floor((y - Y0) / SLAB);
    if (k < 0 || k > 31) return;
    mask[iz * nx + ix] |= 1 << k;
  };
  const seg = (ax, az, bx, bz, y) => {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / (cs * 0.5)));
    for (let i = 0; i <= n; i++) mark(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, y);
  };
  const P = new Float32Array(9);
  function tri() {
    // P: three street-frame points (x, y, z)
    const ymin = Math.min(P[1], P[4], P[7]), ymax = Math.max(P[1], P[4], P[7]);
    if (ymax < Y0 || ymin > YMAX) return;
    const xmin = Math.min(P[0], P[3], P[6]), xmax = Math.max(P[0], P[3], P[6]);
    const zmin = Math.min(P[2], P[5], P[8]), zmax = Math.max(P[2], P[5], P[8]);
    if (xmax < X0 || xmin > X1 || zmax < Z0 || zmin > Z1) return;
    // steep faces only: a floor, a counter top or a roof is not something you walk into (their sides are)
    const ux = P[3] - P[0], uy = P[4] - P[1], uz = P[5] - P[2], vx = P[6] - P[0], vy = P[7] - P[1], vz = P[8] - P[2];
    const nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx;
    const nl = Math.hypot(nxv, nyv, nzv);
    if (nl < 1e-9 || Math.abs(nyv) / nl > 0.75) return;
    stats.tris++;
    const lo = Math.max(Y0, ymin), hi = Math.min(YMAX, ymax);
    let first = Math.ceil((lo - Y0) / 0.05 - 0.5), last = Math.floor((hi - Y0) / 0.05 - 0.5);
    const planes = [];
    for (let k = first; k <= last; k++) planes.push(Y0 + (k + 0.5) * 0.05);
    if (!planes.length) planes.push((lo + hi) / 2); // thinner than 5 cm: its middle
    for (const y of planes) {
      // where the plane cuts the triangle's edges
      let n = 0, ax = 0, az = 0, bx = 0, bz = 0;
      for (let e = 0; e < 3; e++) {
        const i = e * 3, j = ((e + 1) % 3) * 3;
        const y1 = P[i + 1], y2 = P[j + 1];
        if ((y1 <= y && y2 >= y) || (y1 >= y && y2 <= y)) {
          const t = y2 === y1 ? 0.5 : (y - y1) / (y2 - y1);
          const px = P[i] + (P[j] - P[i]) * t, pz = P[i + 2] + (P[j + 2] - P[i + 2]) * t;
          if (n === 0) { ax = px; az = pz; } else { bx = px; bz = pz; }
          n++;
        }
      }
      if (n >= 2) seg(ax, az, bx, bz, y);
      else if (n === 1) mark(ax, az, y);
    }
  }
  const v = new THREE.Vector3(), M = new THREE.Matrix4(), IM = new THREE.Matrix4(), sph = new THREE.Sphere();
  function mesh(o, matrix) {
    const g = o.geometry, pos = g.attributes.position;
    if (!g.boundingSphere) g.computeBoundingSphere();
    sph.copy(g.boundingSphere).applyMatrix4(matrix);
    const [cx, cz] = st(sph.center.x, sph.center.z);
    const r = sph.radius;
    if (cx + r < X0 || cx - r > X1 || cz + r < Z0 || cz - r > Z1 || sph.center.y - r > YMAX || sph.center.y + r < Y0) return false;
    // the vertices in the street frame, once
    const n = pos.count;
    const S = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      const [x, z] = st(v.x, v.z);
      S[i * 3] = x; S[i * 3 + 1] = v.y; S[i * 3 + 2] = z;
    }
    const idx = g.index ? g.index.array : null;
    const nt = idx ? idx.length / 3 : n / 3;
    for (let t = 0; t < nt; t++) {
      for (let c = 0; c < 3; c++) {
        const k = idx ? idx[t * 3 + c] : t * 3 + c;
        P[c * 3] = S[k * 3]; P[c * 3 + 1] = S[k * 3 + 1]; P[c * 3 + 2] = S[k * 3 + 2];
      }
      tri();
    }
    return true;
  }
  const see = (m) => {
    const list = Array.isArray(m) ? m : [m];
    // clear glass (windows, doors people go in by) is left out; everything else you can see counts
    return list.some((x) => x && x.visible !== false && !(x.transparent && (x.opacity ?? 1) < 0.9 && !x.alphaTest && !x.alphaHash));
  };
  scene.updateMatrixWorld(true);
  scene.traverseVisible((o) => {
    if (!o.isMesh || o.isSkinnedMesh || skipMeshes.has(o) || o.userData.noClearance || !o.geometry?.attributes?.position || !see(o.material)) return;
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, IM);
        M.multiplyMatrices(o.matrixWorld, IM);
        if (mesh(o, M)) stats.instances++;
      }
    } else if (mesh(o, o.matrixWorld)) stats.meshes++;
  });

  // ---- 2. the floor at each spot, from the physics (what feet stand on) ----
  world.updateSceneQueries?.();
  const FC = 2; // floor sampled every 2 cells (20 cm)
  const fnx = Math.ceil(nx / FC), fnz = Math.ceil(nz / FC);
  const floor = new Float32Array(fnx * fnz).fill(NaN);
  const ray = new RAPIER.Ray({ x: 0, y: 2.2, z: 0 }, { x: 0, y: -1, z: 0 });
  const fixedOnly = (c) => !c.isSensor() && (!c.parent() || c.parent().isFixed());
  function floorAt(ix, iz) {
    const f = Math.floor(iz / FC) * fnx + Math.floor(ix / FC);
    if (!Number.isNaN(floor[f])) return floor[f];
    const sx = X0 + (Math.floor(ix / FC) * FC + FC / 2) * cs, sz = Z0 + (Math.floor(iz / FC) * FC + FC / 2) * cs;
    const [wx, wz] = local(sx, sz);
    ray.origin = { x: wx, y: 2.2, z: wz };
    const hit = world.castRay(ray, 4, true, undefined, undefined, undefined, undefined, fixedOnly);
    stats.rays++;
    return (floor[f] = hit ? 2.2 - hit.toi : 0);
  }
  // ---- 3. blocked where something fills the body's height band above that floor ----
  const blocked = new Uint8Array(nx * nz);
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const m = mask[iz * nx + ix];
      if (!m) continue;
      const fy = floorAt(ix, iz);
      const k0 = Math.max(0, Math.floor((fy + band[0] - Y0) / SLAB));
      const k1 = Math.min(31, Math.floor((fy + band[1] - Y0) / SLAB));
      if (k1 < k0) continue;
      const want = k1 >= 31 ? (0xffffffff << k0) >>> 0 : ((((1 << (k1 + 1)) >>> 0) - 1) & ~((1 << k0) - 1)) >>> 0;
      if (m & want) {
        blocked[iz * nx + ix] = 1;
        stats.blocked++;
      }
    }

  // ---- 4. signed distance field (two-pass chamfer), metres ----
  const INF = 1e9;
  const dist = (seed) => {
    const d = new Float32Array(nx * nz);
    for (let i = 0; i < d.length; i++) d[i] = blocked[i] === seed ? 0 : INF;
    const a = cs, b = cs * Math.SQRT2;
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        let m = d[i];
        if (ix > 0) m = Math.min(m, d[i - 1] + a);
        if (iz > 0) {
          m = Math.min(m, d[i - nx] + a);
          if (ix > 0) m = Math.min(m, d[i - nx - 1] + b);
          if (ix < nx - 1) m = Math.min(m, d[i - nx + 1] + b);
        }
        d[i] = m;
      }
    for (let iz = nz - 1; iz >= 0; iz--)
      for (let ix = nx - 1; ix >= 0; ix--) {
        const i = iz * nx + ix;
        let m = d[i];
        if (ix < nx - 1) m = Math.min(m, d[i + 1] + a);
        if (iz < nz - 1) {
          m = Math.min(m, d[i + nx] + a);
          if (ix < nx - 1) m = Math.min(m, d[i + nx + 1] + b);
          if (ix > 0) m = Math.min(m, d[i + nx - 1] + b);
        }
        d[i] = m;
      }
    return d;
  };
  const out = dist(1); // free cells: distance to the nearest blocked cell's centre
  const inn = dist(0); // blocked cells: distance to the nearest free cell's centre
  const sdf = new Float32Array(nx * nz);
  for (let i = 0; i < sdf.length; i++) sdf[i] = blocked[i] ? -(Math.min(inn[i], 3) - cs / 2) : Math.min(out[i], 3) - cs / 2;

  // ---- 5. rectangles for the navmesh ----
  const rects = [];
  {
    const open = new Map(); // "x0,x1" -> rect still growing down the rows
    for (let iz = 0; iz <= nz; iz++) {
      const runs = new Set();
      if (iz < nz) {
        let ix = 0;
        while (ix < nx) {
          if (!blocked[iz * nx + ix]) { ix++; continue; }
          const s = ix;
          while (ix < nx && blocked[iz * nx + ix]) ix++;
          runs.add(s + "," + ix);
        }
      }
      for (const [k, r] of open) if (!runs.has(k)) { rects.push(r); open.delete(k); }
      for (const k of runs) {
        if (open.has(k)) open.get(k).z1 = Z0 + (iz + 1) * cs;
        else {
          const [a, b] = k.split(",").map(Number);
          open.set(k, { x0: X0 + a * cs, x1: X0 + b * cs, z0: Z0 + iz * cs, z1: Z0 + (iz + 1) * cs, y: floorAt(a, iz) });
        }
      }
    }
  }
  stats.rects = rects.length;
  stats.ms = Math.round(performance.now() - t0);

  // ---- queries ----
  const at = (x, z) => {
    // bilinear over cell centres
    const fx = (x - X0) / cs - 0.5, fz = (z - Z0) / cs - 0.5;
    if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nz - 1) return 3;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * nx + ix;
    return (sdf[i] * (1 - tx) + sdf[i + 1] * tx) * (1 - tz) + (sdf[i + nx] * (1 - tx) + sdf[i + nx + 1] * tx) * tz;
  };
  return {
    rects,
    stats,
    /** metres from (x, z) to the nearest thing at body height (negative: inside it), street frame */
    distance: at,
    blockedAt: (x, z) => at(x, z) < 0,
    /**
     * Push a body of radius r at p.x, p.z (street frame) out of anything it overlaps; returns the
     * distance moved. Two small steps down the field's slope, so corners come out cleanly.
     */
    push(p, r) {
      let moved = 0;
      for (let k = 0; k < 3; k++) {
        const d = at(p.x, p.z);
        if (d >= r - 0.002) break;
        const h = cs * 0.5;
        let gx = at(p.x + h, p.z) - at(p.x - h, p.z), gz = at(p.x, p.z + h) - at(p.x, p.z - h);
        const gl = Math.hypot(gx, gz);
        if (gl < 1e-6) break; // in the middle of something big: leave it to the navmesh
        const step = Math.min(0.25, r - d);
        p.x += (gx / gl) * step;
        p.z += (gz / gl) * step;
        moved += step;
      }
      return moved;
    },
  };
}
