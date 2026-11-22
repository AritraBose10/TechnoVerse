// T-007: loadLandmarks — loads procedural GLB landmark models and places them at their
// OSM polygon footprints inside the TechnoVerse world scene.
//
// Coordinate system: world +x = east, +z = south, y = 0 is ground level.
// Each GLB is authored in its own local frame (centered at footprint centroid, y=0 at grade);
// this module translates and rotates it into world space to match the OSM polygon.
//
// Returns an array of OSM building IDs that have been replaced by high-fidelity GLB models,
// so world.js can skip drawing its extruded box for those IDs.
// (Claude adds the hook in main.js and the skip guard in world.js — see Questions in T-007.)

import { GLTFLoader } from "/vendor/jsm/loaders/GLTFLoader.js";

// Known landmarks: one entry per GLB produced by tools/landmarks/build-*.mjs
// id: OSM way/node id matching campus.json buildings[].id
// glb: path served from public/
// yaw: rotation around Y (radians) aligning the model's local +X axis with the
//      direction from footprint pts[0] → pts[1]. Positive = counter-clockwise.
//      Computed as: atan2(pts[0].z - pts[1].z, pts[1].x - pts[0].x)
//      Station: pts[0]=[-3.17,-508.44], pts[1]=[115.08,-581.79]
//      dx=118.25  dz=-73.35  → atan2(73.35, 118.25) ≈ 0.5552 rad
const KNOWN_LANDMARKS = [
  {
    id: 535333512,
    glb: "/models/landmarks/535333512.glb",
    // Salt Lake Sector V Metro Station, East-West Metro (Green Line)
    // OSM footprint centre: x=59.675, z=-539.205 (world metres from TIU pin)
    // yaw aligns model long-axis with the NE-SW OSM parallelogram
    yaw: 0.5552
  }
];

/**
 * Load all known GLB landmark models and place them in the Three.js scene.
 *
 * @param {object} opts
 * @param {THREE.Scene} opts.scene  - The main scene to add objects to.
 * @param {object}      opts.campus - Parsed campus.json with a `buildings` array.
 *                                    Each entry has { id, pts:[[x,z],...], floors }.
 * @returns {Promise<number[]>}       Resolves to an array of replaced OSM building IDs.
 */
export async function loadLandmarks({ scene, campus }) {
  const loader = new GLTFLoader();
  const replaced = [];

  // Index campus buildings by id for fast lookup
  const byId = new Map();
  if (campus && Array.isArray(campus.buildings)) {
    for (const b of campus.buildings) {
      if (b.id != null) byId.set(Number(b.id), b);
    }
  }

  // Load each landmark in parallel
  await Promise.all(
    KNOWN_LANDMARKS.map(({ id, glb, yaw }) =>
      new Promise((resolve) => {
        const building = byId.get(id);
        if (!building) {
          console.warn(`[landmarks] OSM id ${id} not found in campus.json — skipping.`);
          return resolve();
        }

        // Compute polygon centroid from pts (all in world metres)
        const pts = building.pts; // [[x,z], ...]
        let cx = 0, cz = 0;
        for (const [x, z] of pts) { cx += x; cz += z; }
        cx /= pts.length;
        cz /= pts.length;

        loader.load(
          glb,
          (gltf) => {
            const model = gltf.scene;
            // Position: centroid in world XZ; y=0 so the model sits at grade
            model.position.set(cx, 0, cz);
            // Rotate to match OSM footprint orientation
            model.rotation.y = yaw;
            scene.add(model);
            replaced.push(id);
            console.log(
              `[landmarks] Placed ${id} at (${cx.toFixed(1)}, 0, ${cz.toFixed(1)}) yaw=${yaw.toFixed(4)} rad`
            );
            resolve();
          },
          undefined,
          (err) => {
            console.error(`[landmarks] Failed to load ${glb}:`, err);
            resolve(); // non-fatal — world.js will draw the fallback box
          }
        );
      })
    )
  );

  return replaced;
}
