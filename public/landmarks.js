// T-007: load procedural GLB landmarks at anchors derived from the mapped footprints.
//
// Coordinate system: world +x = east, +z = south, y = 0 is ground level.
// Each GLB is authored in its local footprint frame (vertex mean at the origin, y=0 at grade).
//
// Returns an array of building IDs that have been replaced by high-fidelity GLB models,
// so world.js can skip drawing its extruded box for those IDs.

import { GLTFLoader } from "/vendor/jsm/loaders/GLTFLoader.js";
import { Box3 } from "three";

// Original landmarks plus surveyed nearby buildings. Anchors always come from campus.json.
const KNOWN_LANDMARKS = [
  {
    no: 1,
    id: 535333512,
    name: "Sector V Metro Station",
    glb: "/models/landmarks/535333512.glb?v=20261128-streetview",
    yaw: 0.5552 // long axis aligned
  },
  {
    no: 2,
    id: 193308962,
    name: "Wipro Tower 5",
    glb: "/models/landmarks/193308962.glb?v=20261128-frontage",
    yaw: 0
  },
  {
    no: 3,
    id: 134101085,
    name: "PWC Office",
    glb: "/models/landmarks/134101085.glb?v=20261127-frontage",
    yaw: 0
  },
  {
    no: 4,
    id: "ov332",
    name: "Sector - V Police Station",
    glb: "/models/landmarks/ov332.glb",
    yaw: 0
  },
  {
    no: 5,
    id: "ov582",
    name: "Aliah University",
    glb: "/models/landmarks/ov582.glb",
    yaw: 0
  },
  {
    no: 6,
    id: 382403604,
    name: "NITTTR Residential Campus",
    glb: "/models/landmarks/382403604.glb",
    yaw: 0
  },
  {
    no: 7,
    id: "sv4",
    name: "IIHM Global Campus",
    glb: "/models/landmarks/sv4.glb?v=20261127-frontage",
    yaw: 0
  },
  {
    no: 8,
    id: "ov240",
    name: "Bharat Petroleum",
    glb: "/models/landmarks/ov240.glb",
    yaw: 0
  },
  {
    no: 9,
    id: 238285653,
    name: "HP Petrol Pump",
    glb: "/models/landmarks/238285653.glb",
    yaw: 0
  },
  {
    no: 10,
    id: "ov359",
    name: "Ambuja Neotia EcoCentre",
    glb: "/models/landmarks/ov359.glb?v=20261127-frontage",
    yaw: 0
  },
  {
    no: 11,
    id: "ov325",
    name: "Tea Junction",
    glb: "/models/landmarks/ov325.glb",
    yaw: 0
  },
  {
    no: 12,
    id: 193478726,
    name: "Hotel Monotel",
    glb: "/models/landmarks/193478726.glb?v=20261127-frontage",
    yaw: 0
  },
  {
    no: 13,
    id: 193475626,
    name: "Millennium City IT Park",
    glb: "/models/landmarks/193475626.glb?v=20261128-streetview",
    yaw: 0
  }
];

/**
 * Load all known GLB landmark models and place them in the Three.js scene.
 *
 * @param {object} opts
 * @param {THREE.Scene} opts.scene  - The main scene to add objects to.
 * @param {object}      opts.campus - Parsed campus.json with a `buildings` array.
 * @param {Map}         opts.models - Receives successful replacements for world integration.
 * @returns {Promise<Array<string|number>>} Resolves to successfully replaced building IDs.
 */
export async function loadLandmarks({ scene, campus, models = new Map() }) {
  const loader = new GLTFLoader();
  const replaced = [];

  // Index campus buildings by string ID for robust lookup
  const byId = new Map();
  if (campus && Array.isArray(campus.buildings)) {
    for (const b of campus.buildings) {
      if (b.id != null) byId.set(String(b.id), b);
    }
  }

  // Load all landmarks in parallel
  await Promise.all(
    KNOWN_LANDMARKS.map(({ id, name, glb, yaw = 0 }) =>
      new Promise((resolve) => {
        const building = byId.get(String(id));
        if (!building) {
          console.warn(`[landmarks] Building ${id} (${name}) not found in campus.json — skipping.`);
          return resolve();
        }

        // Polygon centroid
        const pts = building.pts;
        let cx = 0, cz = 0;
        for (const [x, z] of pts) { cx += x; cz += z; }
        cx /= pts.length;
        cz /= pts.length;

        loader.load(
          glb,
          (gltf) => {
            const model = gltf.scene;
            model.name = `landmark ${id}: ${name}`;
            model.position.set(cx, 0, cz);
            if (yaw !== 0) model.rotation.y = yaw;
            model.updateMatrixWorld(true);
            const bounds = new Box3().setFromObject(model);
            if (bounds.isEmpty() || !Number.isFinite(bounds.max.y)) {
              console.warn(`[landmarks] Empty model ${id}; keeping the generated building.`);
              return resolve();
            }
            model.traverse((o) => {
              if (o.isMesh) o.castShadow = o.receiveShadow = true;
            });
            scene.add(model);
            // The station and petrol canopies must remain open underneath. Their existing
            // models have no verified collision layout, so do not invent perimeter walls.
            const open = ["535333512", "ov240", "238285653"].includes(String(id));
            models.set(String(id), { model, height: bounds.max.y, open });
            replaced.push(id);
            console.log(
              `[landmarks] Placed ${name} (${id}) at (${cx.toFixed(1)}, 0, ${cz.toFixed(1)})`
            );
            resolve();
          },
          undefined,
          (err) => {
            console.error(`[landmarks] Failed to load ${glb}:`, err);
            resolve();
          }
        );
      })
    )
  );

  return replaced;
}
