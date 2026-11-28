---
id: T-008
owner: codex
status: review
depends: [T-007]
---
# Street layer: storefronts, signage, signals and street furniture, verified against Street View

## Goal
Everything a person sees at street level around the TIU roads that is not a building wall or a
vehicle: shop fronts and name boards, hanging and hoarding signs, traffic signals, zebra crossings
and road paint, road signs, bus stops, kiosks, ATMs, lamps, poles and wires, dividers and railings.
Each item is placed from data, shaped after what Street View actually shows, and carries its
evidence. Nothing is drawn that cannot be traced to a capture, a map tag or a stated estimate.

## Context
- T-007 (in review) replaced building boxes with GLB models and added the pattern to reuse:
  `public/landmarks.js` loads models, `world.js` suppresses a generated building only after its
  replacement loaded, `tools/landmarks/survey.json` records the evidence per building, and
  `tools/landmarks/{validate-surveyed,integration,preview}.mjs` are the checks. Follow the same shape.
- The streaming rules in AGENTS.md apply in full. Rule 1 matters most here: no hand-placed world
  objects in code. Every item below lives in `data/world/street-furniture.json`, anchored to an OSM
  id (a `campus.json` label `sid`, building `sid`/`id`, road `sid`) plus a small offset, so the
  position re-derives when the map is re-baked. Cached world x, z may sit next to the anchor.
- Anchors that already exist in `campus.json` (labels carry `sid`): Burger King `osm:node/12209860058`
  (236.69, -40.27), Nizams Express `osm:node/12209860059` (244.18, -36.54), Domino's
  `osm:node/2454098356` (277.92, -52.94); Tea Junction is building `ov325` (no name in the data, 57 m²);
  Ambuja Neotia EcoCentre is building `ov359`. 210 labels in total: banks, ATMs, petrol pumps, hotels,
  restaurants are all candidate storefronts.
- Hand-placed things today that must move to data (keeping their behaviour): `SIGNALS` and `STOPS` in
  `public/traffic.js` (one signal is marked `seen: false`, an assumption), the lamp and street-light
  spot lists used by `street.js` (`heritageLamps`, `streetLights`). `public/opposite.js` is a declared
  authored set: leave it alone, it already holds the far side of Street Number 2.
- Street View is the primary reference, Mapillary and OSM tags secondary, as in T-007. Imagery is
  reference only: no pixels, no traced logos in textures.

## Accuracy rules (same spirit as T-007)
- Every item has `status`: `observed` (needs pano id, capture date, heading, what was seen),
  `estimated` (say what from), `osm-only` (name or type from the map, appearance generic) or
  `unverified`. `unverified` items are not rendered.
- Signage text: the name exactly as seen, or the OSM name when `osm-only`. Plain lettering from one
  generic font, drawn into one shared sign atlas. **No logos, no reproduced trademark artwork.** A flat
  colour band matching what was seen is fine. (Captain may relax the logo rule; until he writes it
  here, it stands.) For Burger King, Nizams Express and Domino's that means correct name, correct
  frontage proportions, awning/glass/door layout and colour band, but no brand mark.
- A sign is mounted on the face of the footprint that looks at the nearest road, within 0.3 m of the
  wall, at the height seen. If the POI node falls outside any footprint, snap to the nearest building
  face within 15 m, otherwise skip and record why.
- A signal is placed at a mapped junction node (or the observed pole), facing the approach it controls.
  Do not invent junctions. If the signal at x ≈ 124 on the TIU street (`seen: false`) cannot be seen in
  any capture, remove it or keep it flagged `estimated`; say which in Result.
- Signals off the TIU street are visual only (a fixed phase read from data). Only the TIU street's
  traffic obeys signals, as now.

## Phases (submit for review after each; Captain sets the task back to `ready` for the next)
1. **Named storefronts.** Burger King, Nizams Express, Domino's (the cluster near x 237–278, z -53…-36),
   Tea Junction (`ov325`) and the Ambuja Neotia EcoCentre signage on `ov359`. Includes the data schema,
   the sign atlas, the loader and the checks. These five must render correctly before anything else.
2. **Signals and junctions on the TIU street and the main roads within 300 m of the TIU origin.**
   Traffic signals (heads, poles, arms, pedestrian lamps), zebra crossings, stop lines, lane arrows,
   centre and edge lines, yellow kerbs, speed breakers. Move `SIGNALS` and `STOPS` to data.
3. **Street furniture within 300 m.** Bus stops and shelters, kiosks and stalls, ATMs, bank and hotel
   name boards, petrol pump canopies and price boards, road and direction signs, hoardings, bollards,
   dividers, railings, bins, hydrants, flagpoles, CCTV poles, utility poles, wires and transformers,
   manholes. Move the lamp spots to data.
4. **Everything else along the roads out to the same boundary as T-005**, in batches of about 300 m of
   road, with a short per-batch note in Result. Skip what no capture shows.
Order inside a phase: observed items first, then `osm-only`.

## Files you may touch
- new: `data/world/street-furniture.json` (items), `data/world/street-survey.json` (evidence ledger:
  one record per capture used, with pano id, date, heading, items seen)
- new: `public/streetlife.js` (loader: builds items from the data with the existing `Batch` in
  `public/geom.js` and `pbr.js` materials; sign atlas; exports `buildStreetLayer({ scene, world, campus, ... })`)
- new: `public/models/street/` (small GLBs only if a prop truly needs one; otherwise procedural),
  `public/models/street/REFERENCES.md` (reference URLs and dates), `public/models/street/CREDITS.md`
- new: `tools/street/` (generator, `validate.mjs`, `integration.mjs`, `preview.mjs`, README)
- `public/world.js`: **hook only**. Call `buildStreetLayer` after the buildings, pass it the landmark
  map, register its meshes with `staticMeshes` so they merge into chunks, create colliders through
  `deferBox` / `deferCylinder`. At most ~25 changed lines outside the new call.
- `public/main.js`: **at most 6 lines** (import, call, `?street=0` switch). Rebase before finishing.
- `public/traffic.js`: only to read `SIGNALS` and `STOPS` from the data file (same structure and same
  default values) and to hide a signal's mesh when the data says so. No change to the simulation.
- `public/street.js`: only to read lamp spots from the data file.
- `tools/bake.mjs` and `public/authored-sets.json`: only if the bake lint needs `streetlife.js` declared
  or the new data file listed; say why under Result.
- Not allowed: `opposite.js`, `tiu.js`, `character.js`, `people.js`, `vehicles.js`, `AGENTS.md`,
  `docs/PLAN.md`. If something else must change, stop and write why under Questions.

## Budget
- Sign atlas: one texture, at most 2048 px, WebP. At most 12 materials across the whole layer.
- Gate view and a view of the Burger King cluster: draw calls +5% at most, triangles +5% at most
  against the branch base; everything static goes through the chunk merge, repeated parts
  (poles, heads, bollards, lamps) are instanced and registered with `addInstanceCull`.
- World build time +0.3 s at most (`window.__boot.buildWorldMs`); no brute-force loops over
  roads or buildings (use `segIndex` / `polyIndex`); no file over 10 MB.

## Steps
1. Start from `main` once T-007 is merged. If it is not merged yet, branch from
   `codex/T-007-nearby-buildings` and say so in Result; rebase when it lands. Branch name:
   `codex/T-008-street-layer`.
2. Per phase: inspect Street View for each item, record the capture in `street-survey.json`, write the
   items to `street-furniture.json`, build, validate, render a comparison sheet under
   `tools/street/out/` (gitignored; links to references, never copied images).
3. Add `?street=0` (layer off) and `?street=evidence` (items tinted by status: observed green,
   estimated amber, osm-only grey) for review.
4. Update `graphify update .`. Fill in Result per phase with counts: items by kind and status, what was
   skipped and why, budget numbers before and after.

## Done when (per phase)
- `node tools/street/validate.mjs`: every item has a status; every `observed` item has pano id, date and
  heading; every anchor resolves in `campus.json`; sign mount error ≤ 0.3 m; signals sit on a mapped
  junction or an observed pole; no item outside the phase's area; no `unverified` item rendered.
- `node tools/street/integration.mjs`: layer on vs `?street=0` shows the budget numbers above, zero
  page errors over 20 s of street simulation, colliders present near the player and absent far away
  (`__boot.statics`), traffic still obeys the TIU street's signals (same stops as before the move to data).
- With `?street=0` the mesh fingerprint (`?fp=1`) equals the branch base.
- `npm run check` passes; `npm run bake` reports no new streaming-constraint warning.
- Phase 1 only: screenshots of Burger King, Nizams Express, Domino's, Tea Junction and the EcoCentre
  frontage in Result, each next to a link to the Street View capture it was built from.

## Questions
(Codex writes here if it must leave the file list. Captain's open decisions: whether brand colours
and exact wordmarks may follow the real signs beyond a plain name and colour band; how far from the
TIU origin phase 4 should run.)

- 2026-11-28 — Captain rejected façade overlays on generic footprints and requested a continuous,
  Street View-matched reconstruction of every visible building and street-level detail on both sides
  of the roads. That requires changing the underlying landmark/generated-building assets and their
  build specifications (`public/models/landmarks/`, `tools/landmarks/`, and potentially the building
  data), which are outside T-008's allowed files. Please create or expand a `ready` Codex task with a
  bounded road segment, the building/model files allowed, and the required Street View capture
  ledger. The current uncommitted Phase 1 overlay implementation is not considered acceptable.
- 2026-11-28 — Captain explicitly granted access to proceed. For this reconstruction, the allowed
  files are expanded to `public/models/landmarks/`, `tools/landmarks/`, `public/landmarks.js`, and
  new building-survey data under `data/world/`. Work proceeds in Street View-verified road batches;
  the rejected generic façade overlays must not be submitted as the final result.

## Result

2026-11-28 Street View reconstruction batch (branched from the still-unmerged T-007 branch):

- Replaced the generic Millennium City mass with a 2,653-triangle, footprint-exact GLB based on
  Jan 2026 pano `EnaVFkFdUhP39JmdokX_9Q`: faceted twin curtain-glass wings, twelve pale floor bands,
  striped podium, dark roof overhangs and recessed entrance canopy. The mapped building now replaces
  its generated shell through `public/landmarks.js`.
- Rebuilt Salt Lake Sector V Metro Station from pano `d4jOdnTrmvyAt_dOVGMdvw`. The old unsupported
  barrel-vault model is gone; the 1,704-triangle replacement has the observed long flat roof,
  grey panel grid, peach window band, dark repeated windows, open ground parking bays, concrete piers,
  end cores and blue roof trim. `station-survey.json` records the station and approach-road evidence.
- Replaced the isolated Burger King/Nizam's/Domino's generated shells with full-depth low shop units,
  correctly oriented together along the Millennium frontage. Added Tea Junction, EcoCentre,
  Millennium City and Sector V Metro plain-text name boards in one 2048x512 WebP atlas; no copied
  photography or logos.
- Added two surveyed road-edge sets: the Street No. 13 south-side corrugated stall row and double-arm
  median lamps, plus the Street No. 11 metro-approach stall row and black railing. Every position
  resolves from a mapped road, building or POI anchor in `data/world/street-furniture.json`.
- Added `?street=0`, `?street=evidence`, a shared `Batch` loader, validation, browser integration and
  comparison-sheet tooling. Eleven items render: 5 storefront/building fronts, 2 landmark signs and
  4 road-edge sets; all are `observed` across 9 evidence records.
- Performance comparison (`?q=low`, 20 s simulation): draw calls 261 -> 270 (+3.4%), triangles
  258,189 -> 269,257 (+4.3%), world build 4,865 -> 5,057 ms (+192 ms). Zero page errors. This stays
  inside the task's +5% / +300 ms budgets.
- Checks passed: `node tools/landmarks/validate-surveyed.mjs`, `node tools/street/validate.mjs`,
  `node tools/street/integration.mjs`, `node tools/landmarks/preview.mjs`, `npm run check`,
  `npm run bake` (no streaming warnings), and `graphify update .`.
- Review renders and reference links are in ignored `tools/street/out/index.html`; landmark studies
  are in ignored `tools/landmarks/out/frontage-studies.png`.
- Intentionally not claimed as surveyed: rear elevations, roof equipment, temporary stall names,
  exact heights, brand logos, moving people/vehicles, and the unobserved assumed north-bend signal.
  Those remain omitted or in their pre-existing systems rather than being invented.

## Review
