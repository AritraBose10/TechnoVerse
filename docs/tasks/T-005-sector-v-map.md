---
id: T-005
owner: codex
status: ready
depends: []
---
# Expand the map to the whole of Sector V

## Goal
Grow the generated map from the current 600 m box around Techno India University to the area
Captain approved, bounded by:
- **North-west:** Sector V Metro station (Purple/Orange line, Salt Lake Sector V).
- **South-west:** College More (the junction south of the university).
- **West:** the Eastern Metropolitan Bypass.
- **East:** New Town Road = OSM `way/325486011` (Action Area I) and the ways connected to it that carry the same name,
  between the north and south edges. NOT `way/51765315` (Chandakanthal Beria), `way/1518725399` or `way/1409753159`
  (Action Area III). Decided by Captain on 2026-11-22.

Every road, building and landmark inside it must come from real data, connect the way it really
does, and keep the game loading and running within the performance budget below.

## Context
- `tools/build-campus.py` turns an OpenStreetMap extract (`tools/osm-extract.json`, from the
  Overpass API) plus Overture building footprints (`tools/overture-buildings.json`,
  `tools/overture-places.json`) into `public/campus.json`. Today it keeps things within
  `RADIUS = 600` m (a square, `max(|x|, |z|)`) of the university pin 22.5760302, 88.4284409, and the
  Overpass query uses `around:500`.
- `public/campus.json` now: 783 buildings, 160 roads, 3 pitches, 15 grass areas, 1 water body,
  34 labels, 3 rail lines; 155 KB.
- The game reads `campus.json` in `public/world.js`. `WORLD_HALF = 615` there sizes the ground slabs,
  the invisible boundary walls, and other things. You may NOT edit `world.js` in this task (see
  Questions).
- The large source extracts are gitignored (`.gitignore`: `tools/osm-extract.json`,
  `tools/overture-*.json`). Do not commit them; write how to re-fetch them instead.
- Local frame: x east, z south, metres from the university pin (see how build-campus.py projects
  lat/lon). The street model (traffic, people) is in a separate "street frame" and stays as it is.

## Files you may touch
- `tools/build-campus.py`
- the source extracts it reads (`tools/osm-extract.json`, `tools/overture-buildings.json`,
  `tools/overture-places.json`), regenerated, NOT committed (gitignored)
- `public/campus.json` (regenerated output)
- new: `tools/sector-v-boundary.json` (the boundary polygon, with how each edge was derived)
- new: `tools/validate-campus.py` (the checks below) and `tools/validate-out/` (gitignored output)
- `README.md` (a short "Map data" section: how to re-fetch and rebuild)

## Steps
1. **Derive the boundary from OSM, not by hand.** Query Overpass for the named features: the
   Sector V metro station (railway=station / public_transport=station, name contains "Sector V"
   or "Sector-V"), the College More junction (place or junction named "College More"; if it is
   not mapped, the intersection that local maps label College More and say how you found it),
   the way(s) named "Eastern Metropolitan Bypass" (or `ref`), and for the east edge `way/325486011` plus its
   same-named connected chain (decided; do not use the other "New Town Road" ways).
   Build a closed polygon that follows the road centrelines between those points, add a 30 m
   margin, and save it to `tools/sector-v-boundary.json` with the OSM ids used for each edge.
2. **Fetch.** Change the Overpass query from `around:500` to the polygon's bounding box (or
   `poly:`), and keep the exact query string in the script and the README. Record the fetch date
   in campus.json (`meta.osmDate`).
3. **Filter by the polygon,** not the 600 m square: keep a feature if its centre (or, for roads,
   any vertex) is inside. Clip roads at the boundary instead of dropping them.
4. **Buildings.** OSM first. Use Overture only for footprints that have no OSM building
   overlapping them by more than 30% of their area; mark those `src: "overture"`. Never synthesise
   buildings, roads or landmarks.
5. **Heights.** Keep the existing height rules (`height`, `building:levels`, Overture height); do
   not invent heights beyond the script's current defaults.
6. **Keep the output format.** Same keys and per-item fields as today, so `world.js` needs no
   change to read it. Add only a top-level `meta` object (`bounds`, `osmDate`, `counts`, `source`).
7. **Validate** with `tools/validate-campus.py` (see Done when), and write its report to
   `tools/validate-out/report.md`.

## Done when
- `npm run check` passes.
- `python3 tools/validate-campus.py` exits 0 and its report shows:
  - **Connectivity:** the drivable road graph (motorway…residential, service roads excluded) inside
    the boundary is one connected component, or every extra component is listed with its OSM ids
    and is also disconnected in OSM itself (dead ends, gated estates).
  - **No invented geometry:** every building, road and label in campus.json carries its source id
    (`osm:way/…`, `osm:node/…` or `overture:…`), and the validator re-matches a random 5% sample
    against the raw extracts (identical vertex count, positions within 0.5 m).
  - **Landmarks present, by real name:** Techno India University, Sector V metro station, College
    More, Eastern Metropolitan Bypass, New Town Road, plus every `name` that was in the old
    campus.json's labels.
  - **Inside the boundary:** no item centre outside the polygon plus the margin.
- **Performance budget** (Captain chose to keep the Bypass as the west edge, so the map takes in most of Salt
  Lake; the budget is sized for that. Measure with `npm run smoke` and `__tiu.renderInfo()` from the gate view, and
  record the numbers before and after in Result):
  - `public/campus.json` ≤ 8 MB (≤ 2 MB gzipped). If it would be bigger, split it into tiles
    (`public/campus/<tx>_<tz>.json`, 500 m tiles, plus an index) and say so in Result. Claude wires up tile loading.
  - Buildings ≤ 15,000; roads ≤ 5,000 segments.
  - Game load time (smoke test, `?q=low`) at most 2 × today's.
  - From the gate view: draw calls ≤ 1.3 × today's and triangles ≤ 1.5 × today's. If the budget can't be met without
    changing `world.js` (likely at this size: distance culling and building LOD), don't stop: finish the data work,
    record the measured numbers, and write under Questions exactly what `world.js` needs.
- The old area looks the same: a screenshot from the gate view before and after, side by side in
  `tools/validate-out/`, with no building or road within 600 m of the university missing or moved.

## Questions
- **Answered 2026-11-22 (Captain):** east edge is `way/325486011` (Action Area I) and its same-named connected chain.
  West edge stays the Eastern Metropolitan Bypass; the budget above is enlarged for it.
- `world.js` sizes the world with `WORLD_HALF = 615`; the new map is larger, so the ground, the
  boundary walls and possibly the chunking and culling need changing there. That is Claude's file.
  Write the new extent (x/z min/max in the local frame) here and Claude will update `world.js`.
  Until then the game may show the new area without ground or walls beyond ±615 m; that is
  expected and fine for this task.

## Result

## Review
