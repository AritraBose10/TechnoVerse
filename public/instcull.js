// Per-instance culling for InstancedMesh sets that run the whole length of the street (lamps and the like).
// An InstancedMesh has one bounding sphere, so every instance was drawn every frame wherever the camera faced.
// Register a mesh once (positions of its instances), call runInstanceCull(camera, px, pz, shadows) once a frame.
// Kept: instances in the view out to maxDist, plus (only while the sun casts shadows) everything within
// nearDist of the player, since those can throw shadows into the view.
import * as THREE from "three";

const sets = [];
const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();

export function addInstanceCull(im, xs, zs, { radius = 6, cy = 3, maxDist = 220, nearDist = 40 } = {}) {
  const n = Math.min(xs.length, im.count);
  im.frustumCulled = false;
  sets.push({ im, n, xs, zs, radius, cy, max2: maxDist * maxDist, near2: nearDist * nearDist, mat: im.instanceMatrix.array.slice(), slot: new Uint32Array(n), shown: n });
}

export function runInstanceCull(camera, px, pz, shadows = true) {
  if (!sets.length) return;
  camera.updateMatrixWorld();
  pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  fr.setFromProjectionMatrix(pm);
  for (const s of sets) {
    let k = 0, changed = false;
    for (let i = 0; i < s.n; i++) {
      const dx = s.xs[i] - px, dz = s.zs[i] - pz, d2 = dx * dx + dz * dz;
      let vis = shadows && d2 < s.near2;
      if (!vis && d2 < s.max2) {
        sph.center.set(s.xs[i], s.cy, s.zs[i]);
        sph.radius = s.radius;
        vis = fr.intersectsSphere(sph);
      }
      if (vis) {
        if (s.slot[k] !== i) { s.slot[k] = i; changed = true; }
        k++;
      }
    }
    if (k !== s.shown) changed = true;
    if (!changed) continue;
    s.shown = k;
    const arr = s.im.instanceMatrix.array;
    for (let j = 0; j < k; j++) arr.set(s.mat.subarray(s.slot[j] * 16, s.slot[j] * 16 + 16), j * 16);
    s.im.count = k;
    s.im.instanceMatrix.needsUpdate = true;
  }
}
