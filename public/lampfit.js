// Fits the lamp boxes to the real body of a model: casts rays at the model to find where its rear (and nose) really is,
// so the tail lights and indicators sit on the bodywork instead of at a guessed box corner.
// Nose +x, wheels on y = 0, +z the right-hand side. Returns the lamp positions in the model's own space.
import * as THREE from "three";

export function fitLamps(root, m) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.material && o.material.name !== "glass") meshes.push(o); });
  const rc = new THREE.Raycaster();
  rc.firstHitOnly = true;
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  const hit = (ox, oy, oz, dx, dy, dz) => {
    rc.set(o.set(ox, oy, oz), d.set(dx, dy, dz));
    rc.far = 12;
    const r = rc.intersectObjects(meshes, false);
    return r.length ? r[0].point : null;
  };
  const L = m.L, W = m.W, H = m.H, hz = W / 2;
  // the surface at the very end of the car: the rear-most (end = -1) or nose-most (end = +1) x at this height and side
  const endX = (end, y, z) => {
    const p = hit(end * (L + 1), y, z, -end, 0, 0);
    return p ? p.x : null;
  };
  // the car's outer side at this x and height
  const sideZ = (x, y, s) => {
    const p = hit(x, y, s * (W + 1), 0, 0, -s);
    return p ? Math.abs(p.z) : null;
  };
  const fit = (end, y0, y1, zProbe, w, depth) => {
    // pick the height where the end of the car reaches furthest: that is where the lamp cluster is
    let best = null;
    for (let y = y0 * H; y <= y1 * H + 1e-6; y += 0.025 * H) {
      const x = endX(end, y, zProbe);
      if (x === null) continue;
      if (!best || (end < 0 ? x < best.x : x > best.x)) best = { x, y };
    }
    if (!best) return null;
    const y = best.y;
    const edge = Math.max(sideZ(best.x - end * 0.04, y, 1) ?? hz, hz * 0.8); // a stray hit (open door, mirror) never pulls the lamp inboard
    const zc = Math.max(0.2, edge - w / 2 - 0.03); // the lamp's outer edge stays just inside the body
    // the body's slope across the lamp, so the box lies flat on it
    const xa = endX(end, y, zc - w / 2), xb = endX(end, y, zc + w / 2), xc = endX(end, y, zc);
    const xs = [xa, xb, xc].filter((v) => v !== null);
    if (!xs.length) return null;
    const x = xc ?? xs[0];
    const yaw = xa !== null && xb !== null ? Math.atan2(xb - xa, w) : 0; // rotation about y
    return { x: x - end * (0.045 - depth / 2), y, z: zc, yaw, edge };
  };
  return {
    tail: fit(-1, 0.38, 0.68, hz * 0.7, 0.26, 0.06),
    nose: fit(1, 0.34, 0.6, hz * 0.7, 0.14, 0.06),
  };
}
