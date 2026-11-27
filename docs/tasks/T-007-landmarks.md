---
id: T-007
owner: codex
status: review
depends: [T-005]
---
# Faithful models of Sector V landmarks

## Goal
Replace the plain extruded boxes of the most recognisable buildings near TIU with hand-made models
that look like the real buildings: shape, storeys, façade pattern, colours, signage placement. One
building at a time, each reviewed before the next.

## Expanded scope (Captain, 2026-11-27)

Captain requested all nearby buildings, accepted continuing with the stated 300 m radius,
and explicitly approved world.js and main.js integration edits. Survey every footprint whose
vertex-mean centre is within 300 m of the TIU origin. Preserve the existing authored TIU model.
Street View is the primary visual reference. Record unobservable or uncertain buildings as
unverified; do not manufacture façade details or call those buildings accurate. Work through
the batch without requesting approval for each building; submit the batch for review at the end.

## Original landmark list (Captain, 2026-11-22)
1. Sector V Metro station (Purple Line, the elevated station; the viaduct already exists in world.js)
2. Wipro (the campus building labelled "Wipro" in campus.json)
3. PricewaterhouseCoopers (PwC) office
4. Sector-V Police Station
5. Aliah University
6. NITTTR (Residential Campus: the main block only)
7. Indian Institute of Hotel Management (IIHM)
8. Bharat Petroleum petrol pump
9. HP petrol pump
10. Ambuja Neotia Ecocentre
11. Tea Junction
Techno India University is NOT in this task (it already has its own model in `public/tiu.js`).
The 300 m expansion above supersedes the original landmark-only scope.

## References (Captain's decision: public street-level imagery)
- Allowed for **reference only** (proportions, storey count, window rhythm, materials, colours,
  sign positions): Mapillary (CC BY-SA 4.0), Google Street View, OpenStreetMap tags (`height`,
  `building:levels`, `roof:shape`, colours), the buildings' own public websites.
- **Never copy imagery into textures** (no photo projection, no traced logos). Textures are
  procedural or CC0 (e.g. ambientCG, Poly Haven). Company names on signs: plain lettering in a
  generic font, no reproduced logos or trademarks.
- For each building, list the reference URLs you used (with dates) in
  `public/models/landmarks/REFERENCES.md`.

## Accuracy rules
- Footprint: the model's ground outline must match the building's OSM footprint in campus.json
  (by OSM id) within 0.5 m; use that id as the model's name.
- Height and storeys from OSM tags if present, otherwise counted from imagery (say which).
- Nothing invented that isn't visible in the references; if a side isn't visible anywhere, keep it
  plain and say so.

## Files you may touch
- new: `public/models/landmarks/<osm-id>.glb`, `public/models/landmarks/REFERENCES.md`,
  `public/models/landmarks/CREDITS.md` (texture sources and licences)
- new: `tools/landmarks/` (Blender Python or Node scripts used to build them, plus a README)
- new: `public/landmarks.js`: `export async function loadLandmarks({ scene, campus })` that loads each
  glb, places it at its footprint, and returns the list of OSM building ids it replaced. Do NOT
  edit `world.js` or `main.js`: Claude adds the hook that skips the replaced boxes (write the exact
  hook you need under Questions).

## Budget per landmark
- ≤ 30k triangles (≤ 60k for the metro station), ≤ 3 materials plus one glass, textures ≤ 1024 px
  (WebP or KTX2), glb ≤ 2 MB. Nose/front orientation doesn't matter, but y = 0 must be the ground.

## Steps (per building)
1. Find the footprint in campus.json, collect references, write REFERENCES.md entries.
2. Model, texture, export to glb within budget.
3. Render a comparison sheet: your model from 3 views next to the reference views you used
   (links, not copied images), saved under `tools/landmarks/out/` (gitignored).
4. Set this task's status to `review` after EACH building (list which one in Result). Claude
   reviews; on approval Captain sets it back to `ready` for the next.

## Done when (per building)
- glb within budget; footprint check passes (script prints the max deviation in metres).
- `loadLandmarks` places it correctly in a test page `public/landmarks.html` (screenshots in Result).
- REFERENCES.md and CREDITS.md updated.

## Questions

### 2026-11-27 — nearby-building expansion: integration scope needed

Captain requested accurate nearby buildings using Google Street View, then said "continue"
after the proposed reopening. Working extent: the stated 300 m radius around the TIU data
origin (180 footprint centres, including existing campus buildings). TIU's existing authored
model remains excluded from replacement. This is preparation only; no model or runtime edits
have been made.

The existing file boundary prevents the requested expansion from rendering correctly:
- `public/world.js:881-883` skips a hard-coded set of the original 11 landmark IDs before
  generating buildings. Any additional GLB loaded by `public/landmarks.js` would overlap its
  generated building. The generated meshes are subsequently merged into chunks at line 1389,
  so deleting an individual building afterward is not a safe integration method.
- `public/main.js:135` builds the world before the asynchronous landmark load at line 144.
  Simply expanding the unconditional skip list would leave holes when a GLB fails to load.
- The current skip also bypasses the footprint and wall-collider creation below it. Integration
  must retain the appropriate footprint and deferred static-collider coverage for replacements.

Requested scope addition: `public/world.js` and `public/main.js`, for landmark integration only.
Concrete approach: prepare successful model replacements through `public/landmarks.js`;
pass their IDs into the world builder; suppress only their generated visuals while retaining
footprints and deferred colliders; keep the ordinary generated building on a load failure.
Continue deriving all world positions from `campus.json`. Verify missing-file fallback,
replacement identity/placement, static colliders, smoke tests and before/after performance.
**Resolved 2026-11-27:** Captain answered "yes" to adding world.js and main.js; the file
list above now includes these integration changes.

The existing 11 model files do not establish visual accuracy: the references file mostly lists
OSM links and descriptions, not inspected Street View views. Each new or corrected model needs
its own visible evidence. Unobserved sides must remain plain and be identified as unverified.


### Hook needed in main.js and world.js (Claude to add)

After the world has finished building, add these lines in `main.js`
(inside the existing async IIFE, after `world.build()`):

```js
import { loadLandmarks } from "/landmarks.js";
const replacedLandmarkIds = await loadLandmarks({ scene, campus });
```

And in `world.js`, inside the building-drawing loop, add a skip guard:

```js
// Skip buildings replaced by high-fidelity GLB landmarks
if (window.__replacedLandmarkIds && window.__replacedLandmarkIds.includes(Number(b.id))) continue;
```

(Or pass `replacedLandmarkIds` through `world.build()` options — whatever Claude prefers.)

## Result

### 2026-11-27 — expansion preflight (not implementation)
- Branch: `codex/T-007-nearby-buildings`, from `main` at 2551f68.
- Confirmed 180 footprint centres within 300 m and 11 existing landmark GLBs.
- January 2026 Google Street View coverage was observed at TIU's Street Number 2 frontage
  (panorama `4PtrWRVgSwAB-eQ29Y_avg`). A full building-by-building survey remains outstanding.
- Stopped at the file-scope boundary above, as AGENTS.md rule 3 requires. No models or runtime
  files changed. This task is not complete; previous station results below are historical.


### Building 1: Salt Lake Sector V Metro Station (OSM ID 535333512)

**Files produced:**
- `public/models/landmarks/535333512.glb` — procedural GLB, pure vanilla Node.js
- `public/landmarks.js` — `loadLandmarks({ scene, campus })` loader
- `public/landmarks.html` — standalone Three.js viewer for this building
- `public/models/landmarks/REFERENCES.md` — reference sources with dates
- `public/models/landmarks/CREDITS.md` — licence attributions
- `tools/landmarks/build-station.mjs` — generator script
- `tools/landmarks/README.md` — instructions for adding future landmarks

**Budget checks (all ✓):**
| Check | Result | Limit |
|-------|--------|-------|
| Triangles | 9,552 | ≤ 60,000 |
| Materials | 4 (Concrete, Ochre Facade, Roof, Glass) | ≤ 3 + 1 glass |
| Texture images | 0 (all procedural PBR) | ≤ 1024 px |
| GLB file size | 1,012 KB | ≤ 2,048 KB |
| Footprint max deviation | 0.053 m | ≤ 0.5 m |

**Architecture modelled (5 sections):**
1. Ground level — 7 portal pier pairs + East/West entry pavilions
2. Concourse level — slab decks, ochre spandrel walls, ribbon glazing
3. Platform & track level — trackbed, two side platforms, Platform Screen Doors
4. Vaulted canopy roof — 14-segment barrel arch (aluminium), central skylight strip
5. Signage bands — blank ochre fascia plates (no logos/trademarks)

**OSM footprint alignment:**
- Polygon pts: `[[-3.17,-508.44],[115.08,-581.79],[122.53,-569.96],[4.26,-496.63]]`
- Centroid: `(59.675, 0, -539.205)` world metres
- Footprint yaw: `0.5552 rad` (long axis NE→SW)
- Max vertex deviation from reconstructed parallelogram: **0.053 m** ✓

**Syntax check:** `node --input-type=module --check` passed on both
`public/landmarks.js` and `tools/landmarks/build-station.mjs`.

### 2026-11-28 — five Street View frontage replacements

Rebuilt and replaced these assets from inspected January 2026 Google Street View panoramas:
- Wipro Tower 5 (`193308962`): curved green-glass corner, pale floor bands and red recessed bays.
- Ambuja Neotia EcoCentre (`ov359`): terracotta frontage, narrow blue-grey vertical glazing,
  pale dividers and low central entrance panel.
- IIHM Global Campus (`sv4`): two-storey white frontage, twin glazed bays, recessed entrance,
  canopy/columns and a narrower upper block.
- PwC office (`134101085`): provisional white frontage with lower green glazing and upper screen;
  the view is partly obscured by trees.
- Hotel Monotel (`193478726`): tan blank tower face, narrow centre glazing and tall recessed lobby.

All hidden elevations remain plain. Heights are explicitly recorded as estimates in
`tools/landmarks/survey.json`; no Street View pixels or logos are embedded. The reproducible
300 m inventory contains 180 footprint centres: four are in this inspected set and 176 remain
`unverified`. Wipro is an original task landmark outside that radius. The remaining legacy GLBs
are not claimed as visually verified.

Runtime integration now waits for successful GLB loads, suppresses only those generated building
meshes, retains mapped footprints and deferred wall colliders, and falls back to the generated
building when a model request fails. The public landmark viewer was repaired by removing its
reference to an unvendored OrbitControls file.

Checks:
- `node tools/landmarks/validate-surveyed.mjs`: 5/5 assets pass footprint (max 0.3776 m), winding,
  30k-triangle, four-material and 2 MB limits.
- `node tools/landmarks/preview.mjs`: five exact placements, public viewer completion, deliberate
  missing-model case and zero page errors; comparison sheet generated in ignored output.
- `node tools/landmarks/integration.mjs`: one replacement per mapped ID, no generated overlap,
  active deferred wall collisions, 20 seconds of street simulation, and IIHM 404 fallback.
  Hardware WebGL render was 373 calls / 644,483 triangles versus 371 / 649,391 at the branch base,
  within the existing 750-call / 1.5M-triangle budget.
- `npm run check`: 46/46 files OK. Direct syntax checks passed for all landmark scripts and changed
  runtime modules. `graphify update .` rebuilt 1,411 nodes / 2,249 edges.

The repository's original `npm run smoke` was attempted with installed Chrome but its exhaustive
`__tiu.cost()` child-by-child pass did not finish after roughly an hour; no smoke report was
produced. The scoped hardware-WebGL integration above covers this change without modifying that
shared harness.

## Review
