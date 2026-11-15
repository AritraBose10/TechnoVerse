---
id: T-002
owner: codex
status: ready
depends: [T-001]
---
# Performance pass: the city around the campus

## Goal
Bring a typical street view from about 1,400–1,600 draw calls and 3 million triangles down to
under 500 draw calls and under 1.2 million triangles, with no visible change within 80 m of the
player. Target hardware: Ryzen 7 5700G integrated graphics at 1080p, 40+ fps.

## Context
`public/world.js` builds 783 buildings from `public/campus.json`, plus trees (`trees.js`), lamps
(`street.js`), the metro viaduct and road ribbons. `public/geom.js` (`Batch`) already merges
geometry per material. Check numbers with `__tiu.renderInfo()` in the console and
`__tiu.cam(x, y, z, lookX, lookY, lookZ)` for a fixed view. The university building (`tiu.js`) and
the opposite stalls (`opposite.js`) are close to the player and should stay detailed.

## Files you may touch
- `public/world.js`, `public/trees.js`, `public/geom.js`
- new: `public/lod.js`

## Steps
1. Measure: three fixed views (gate, the far end near Meen Bhavan, the metro end). Record calls and
   triangles in the Result section.
2. Merge the far buildings into chunks of about 100 × 100 m per material (one mesh per material
   per chunk), so frustum culling still works per chunk.
3. Distance levels for trees: full model near, a cheaper crossed-quad version beyond about 120 m.
4. Shadows: only near objects cast shadows (`castShadow = false` beyond ~150 m chunks).
5. Re-measure the same three views.

## Done when
- `npm run smoke` passes.
- The three views meet the targets, numbers recorded before and after.
- Screenshots of the three views before and after look the same within 80 m.

## Questions

## Result

## Review
