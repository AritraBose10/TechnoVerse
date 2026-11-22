---
id: T-006
owner: codex
status: ready
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

## Result

## Review
