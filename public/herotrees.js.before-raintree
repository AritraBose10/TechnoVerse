// Hero trees: real modelled trees, used only close to the player.
//
// The campus is full of cheap generated trees (trees.js: instanced, culled per tree). Within HERO_NEAR metres of the
// camera, the nearest few of them are swapped for a modelled tree from /models/trees/ (a small pool of clones, at most
// MAX at once, so the cost is fixed and known); beyond HERO_FAR they go back to the cheap tree. The two radii differ
// (hysteresis) so a tree on the border does not flicker. The modelled tree is scaled to the generated tree's height and
// turned like it, so the swap changes the detail, not the layout.
//
// /models/trees/manifest.json says which models stand in for which species, e.g.
//   { "rain": ["island_tree_01.glb"], "neem": ["island_tree_02.glb"], "gulmohar": ["jacaranda_tree.glb"] }
// With no manifest (or no files) nothing changes: this whole module is a no-op.
// Prepare models with tools/trees/prep.mjs (decimates to about 15-25K triangles, 1K textures, one .glb each).
import { GLTFLoader } from "/vendor/jsm/loaders/GLTFLoader.js";

const HERO_NEAR = 30;
const HERO_FAR = 38;
const MAX = 8;

export function createHeroTrees({ THREE, scene, renderer, quality = "high" }) {
  const max = quality === "low" ? 0 : MAX; // phones and the governor's low tier keep the cheap trees only
  const species = {}; // name -> [{ scene, height }]
  const pool = []; // { obj, set, index, kind } objects in use or free
  let ready = false;
  let clock = 0;

  async function load() {
    let manifest;
    try {
      const r = await fetch("/models/trees/manifest.json", { cache: "no-cache" });
      if (!r.ok) return;
      manifest = await r.json();
    } catch {
      return;
    }
    const loader = new GLTFLoader();
    for (const [name, files] of Object.entries(manifest)) {
      species[name] = [];
      for (const f of files) {
        try {
          const g = await loader.loadAsync("/models/trees/" + f);
          g.scene.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = true;
            o.receiveShadow = true;
            const m = o.material;
            if (m?.map) m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            if (m?.transparent && m.alphaTest === 0) { m.alphaTest = 0.4; m.transparent = false; m.depthWrite = true; } // cut-out leaves, not blended
            if (m) m.side = THREE.DoubleSide;
            o.userData.noAO = true;
          });
          const box = new THREE.Box3().setFromObject(g.scene);
          species[name].push({ scene: g.scene, height: Math.max(0.1, box.max.y - box.min.y), minY: box.min.y });
        } catch (e) {
          console.warn("hero tree failed:", f, e?.message);
        }
      }
    }
    ready = Object.values(species).some((l) => l.length);
    scene.userData.heroReady = ready;
  }
  if (max > 0) load();

  const kindOf = (setName) => setName.replace(/\d+$/, ""); // "rain0" -> "rain"

  function release(h) {
    h.set.hero[h.index] = 0;
    scene.remove(h.obj);
    h.set = null;
  }

  function update(dt, px, pz) {
    if (!ready || max === 0) return;
    clock += dt;
    if (clock < 0.25) return;
    clock = 0;
    const near2 = HERO_NEAR * HERO_NEAR, far2 = HERO_FAR * HERO_FAR;
    // keep the ones still inside the far radius
    for (let i = pool.length - 1; i >= 0; i--) {
      const h = pool[i];
      if (!h.set) { pool.splice(i, 1); continue; }
      const dx = h.set.x[h.index] - px, dz = h.set.z[h.index] - pz;
      if (dx * dx + dz * dz > far2) { release(h); pool.splice(i, 1); }
    }
    // candidates: trees inside the near radius that are not yet heroes, nearest first
    const cand = [];
    for (const s of scene.userData.treeSets || []) {
      const list = species[kindOf(s.name)];
      if (!list?.length) continue;
      for (let i = 0; i < s.n; i++) {
        if (s.hero[i]) continue;
        const dx = s.x[i] - px, dz = s.z[i] - pz, d2 = dx * dx + dz * dz;
        if (d2 < near2) cand.push({ s, i, d2 });
      }
    }
    cand.sort((a, b) => a.d2 - b.d2);
    for (const c of cand) {
      if (pool.length >= max) break;
      const list = species[kindOf(c.s.name)];
      const t = c.s.list[c.i];
      const model = list[(c.i * 7 + (t.x * 13 | 0)) % list.length | 0] || list[0];
      const obj = model.scene.clone(true);
      const k = (c.s.height * t.scale) / model.height; // match the generated tree's height
      obj.scale.setScalar(k);
      obj.position.set(t.x, t.y - model.minY * k, t.z);
      obj.rotation.y = t.yaw;
      scene.add(obj);
      c.s.hero[c.i] = 1;
      pool.push({ obj, set: c.s, index: c.i });
      scene.userData.heroTrees = pool.length;
    }
  }

  return { update, get active() { return pool.length; }, get ready() { return ready; } };
}
