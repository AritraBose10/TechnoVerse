// Static geometry merge: many small meshes that never move become one mesh per material per
// 100 m chunk. Each draw call costs the CPU and the GPU a fixed amount, so a few hundred merged
// meshes replace a few thousand small ones. Positions are baked in world space when merged.
import * as THREE from "three";
import { mergeGeometries } from "/vendor/jsm/utils/BufferGeometryUtils.js";

// meshes: static meshes that are children of `scene` and never move, rotate or toggle.
// Returns the merged chunk meshes with their world centre, so callers can drop shadows far away.
export function mergeStaticChunks(scene, meshes, { size = 100 } = {}) {
  const groups = new Map();
  const bb = new THREE.Box3();
  for (const m of meshes) {
    const g = m.geometry;
    if (!m.parent || !g || !g.attributes.position || Array.isArray(m.material) || m.material.transparent) continue;
    if (m.isInstancedMesh || m.isSkinnedMesh || m.customDepthMaterial || m.userData.noMerge) continue;
    m.updateWorldMatrix(true, false);
    const baked = g.clone().applyMatrix4(m.matrixWorld);
    baked.computeBoundingBox();
    bb.copy(baked.boundingBox);
    const cx = Math.floor((bb.min.x + bb.max.x) / 2 / size);
    const cz = Math.floor((bb.min.z + bb.max.z) / 2 / size);
    const attrs = Object.keys(baked.attributes).sort().join(",");
    const key = [m.material.uuid, m.castShadow ? 1 : 0, m.receiveShadow ? 1 : 0, baked.index ? "i" : "n", attrs, cx, cz].join("|");
    let list = groups.get(key);
    if (!list) groups.set(key, (list = { geos: [], members: [], cx, cz, first: m }));
    list.geos.push(baked);
    list.members.push(m);
  }
  const chunks = [];
  for (const list of groups.values()) {
    if (list.members.length < 2) continue; // a lone mesh stays as it is
    const merged = mergeGeometries(list.geos, false);
    if (!merged) continue; // attributes did not match: leave these meshes alone
    for (const m of list.members) m.removeFromParent();
    const mesh = new THREE.Mesh(merged, list.first.material);
    mesh.castShadow = list.first.castShadow;
    mesh.receiveShadow = list.first.receiveShadow;
    mesh.name = `chunk ${list.cx},${list.cz}`;
    scene.add(mesh);
    chunks.push({ mesh, x: (list.cx + 0.5) * size, z: (list.cz + 0.5) * size, cast: list.first.castShadow });
  }
  return chunks;
}
