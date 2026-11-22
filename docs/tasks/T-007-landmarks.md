---
id: T-007
owner: codex
status: ready
depends: [T-005]
---
# Faithful models of Sector V landmarks

## Goal
Replace the plain extruded boxes of the most recognisable buildings near TIU with hand-made models
that look like the real buildings: shape, storeys, façade pattern, colours, signage placement. One
building at a time, each reviewed before the next.

## Approved list (Captain, 2026-11-22), in this order
1. Sector V Metro station (Purple Line, the elevated station; the viaduct already exists in world.js)
2. Wipro (the campus building labelled "Wipro" in campus.json)
3. PricewaterhouseCoopers (PwC) office
4. Sector-V Police Station
5. Aliah University
6. NITTTR (Residential Campus: the main block only)
7. Indian Institute of Hotel Management (IIHM)
8. Bharat Petroleum petrol pump
9. HP petrol pump
Techno India University is NOT in this task (it already has its own model in `public/tiu.js`).
Anything not on this list needs Captain's approval first.

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

## Result

## Review
