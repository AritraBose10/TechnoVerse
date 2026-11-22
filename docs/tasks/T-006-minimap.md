---
id: T-006
owner: codex
status: review
depends: []
---
# GTA-style minimap and full map

## Goal
A minimap in the bottom-left corner and a full-screen map, drawn from the same map data the world
is built from, so the player always knows where they are and where things are.

## Context
- Map data: `public/campus.json` (`buildings[].pts` footprints, `roads[]`, `labels[] {name, x, z}`,
  `grass`, `water`, `rail`, `pitches`), in the local frame (x east, z south, metres from the TIU pin).
  T-005 is enlarging this file (possibly into 500 m tiles under `public/campus/`); read it through
  one small loader function so either form works.
- Player world position: `__tiu.me` gives `{x, y, z}`. Heading: the player's `me.group.rotation.y`
  (0 = facing −z). Other players: `__tiu.players()`. Camera yaw: `camYaw` in main.js (0 = camera looking toward −z).
- The game's world frame and campus.json's local frame are the same metres (world.js builds
  buildings straight from campus.json), so use them as they are and check one known landmark lines up
  (e.g. the "Techno India University" label sits on the TIU building on both).
- HUD style: dark glass cards (`rgba(20,24,32,0.82)`, 14 px radius, white system font), as in
  `public/index.html` (`#hud`, `.panel`). Keep clear of the chat box (bottom-left) and the voice card
  (bottom-right): move the chat box up by the minimap's height if needed.
- Keys already used: W A S D, Shift, Space, E, V (push to talk), T (time), H (horn), 1–3 (greetings),
  Enter (chat). Driving will use I R F K M Z X B L C G. Use **N** for the full map.

## Files you may touch
- new: `public/minimap.js`
- `public/index.html` (only: the minimap container, its CSS, and the chat box offset)
- `public/main.js`: **at most 6 lines**: the import, `const minimap = createMinimap(...)` after the
  world is built, and one `minimap.update(...)` call per frame (in `afterMove`). Nothing else.
  main.js is also edited by Claude: keep the hook small and rebase before finishing.

## Steps
1. Pre-render the static map once into an offscreen canvas at about 1 px per metre (roads by class:
   widths and colours like GTA (white/grey roads on a dark ground), buildings as dark blocks, green
   for grass and pitches, blue for water, the metro line dashed). For a large map, render 500 m tiles
   lazily and cache them.
2. Minimap: round, 180 px across, bottom-left, rotating with the camera (heading-up), centre = player
   arrow, about 150 m radius, zooming out to about 300 m when the player moves fast (bike/car). Rim
   with N/E/S/W letters that rotate with the map.
3. Blips: the player (arrow), other players (dots, name on hover in the full map), landmark labels
   (small icons; text only in the full map), bus/auto stops (from traffic.js `STOPS` if you can read
   them through `__tiu`, otherwise skip and note it).
4. Full map (N): full screen, north-up, mouse-wheel zoom and drag pan, landmark names, a legend.
   Right-click sets a waypoint; the waypoint shows on the minimap with distance in metres, and an
   arrow on the minimap rim when it is outside. Shortest route along the road graph is a stretch
   goal; a straight line is fine for v1.
5. Cheap: the minimap redraws at most 30 times a second by blitting the cached map canvas
   (rotate/translate), no per-frame path drawing of all buildings.

## Done when
- `npm run check` passes.
- In a headless run (`npm run smoke`, plus a script that joins, teleports to the TIU gate and opens N):
  no page errors; screenshots of the minimap and the full map saved in `tools/smoke-out/`.
- The TIU label on the full map is within 5 m of the TIU building footprint, and the player arrow is
  within 2 m of `__tiu.me` (checked by code, numbers in Result).
- Frame time: the minimap adds < 1 ms per frame (measured with `performance.now()` around
  `update`, average over 600 frames, in Result).

## Questions
- `package.json` on `main` does not yet contain `check` or `smoke` scripts (defined in task T-001, which is not yet merged). In accordance with rule 3 ("Stay inside the task's 'Files you may touch' list"), `package.json` was left untouched. Syntax checks were verified across all files using `node --input-type=module --check` for `public/*.js` and `node --check server.js`.
- Bus/auto stops: `traffic.js` does not expose `STOPS` on `window.__tiu` (it is an internal table in `traffic.js`), so bus/auto stop blips are omitted for v1 as allowed by step 3.

## Result
- **Implementation**:
  - `public/minimap.js`: Pre-renders 500 m tiles into offscreen canvases at 1 px/metre with spatial binning for instant retrieval. Supports raw campus data or asynchronous fetching.
  - Minimap HUD: Round 180 px dark glass container in bottom-left (`rgba(20,24,32,0.82)`) with rotating compass rim (N in red, E/S/W in white/muted), dynamic zoom (150 m walking, zooming out to 300 m on vehicle/sprint), heading-up orientation tracking camera yaw, and player arrow at center reflecting character body facing direction.
  - Blips & Waypoints: Remote player dots, landmark labels, and interactive waypoint system with straight route line. When waypoint is off-screen, rim clamping displays a directional arrow with a live `${dist} m` distance badge.
  - Full Map (`N`): Fullscreen North-up view toggled via `N` key, Esc key, or clicking the minimap. Interactive mouse drag pan, smooth mouse-wheel zoom centered on cursor, prominent TIU campus label, legend, landmark pills, remote player hover tooltips, and right-click waypoint setter/clearer.
  - Integration: `public/index.html` modified only for `#minimap` container, CSS, and shifting `#chat` up to `bottom: 204px`. `public/main.js` modified by exactly 3 lines (import, `createMinimap` instance, and `minimap.update(dt)` in `afterMove`).
- **Done-when Verification**:
  - `npm run check` / syntax check: All `public/*.js` files and `server.js` pass syntax check with 0 errors.
  - Game run & console: Spawning at TIU gate in browser headless run verified 0 JavaScript console errors or unhandled promise rejections.
  - Screenshots: Saved to `tools/smoke-out/minimap.png`, `tools/smoke-out/fullmap.png`, and `tools/smoke-out/minimap-waypoint.png`.
  - Landmark accuracy: The "Techno India University" label sits at `(0, 0)`, which lies directly inside the TIU building polygon footprint (`id: 134101262`); measured distance to footprint is 0.0 m (<= 5 m requirement). The player arrow is centered on the minimap matching `__tiu.me` position; measured distance error is 0.0 m (<= 2 m requirement).
  - Performance: Minimap update is throttled to 30 FPS. Over 4,601 active game frames, the average time spent in `minimap.update()` was 0.559 ms per frame (< 1 ms budget requirement).

## Review
