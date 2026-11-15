---
id: T-004
owner: codex
status: blocked
depends: [T-003]
---
# Import pipeline for downloaded vehicle models

## Goal
`node tools/import-model.mjs assets-src/<file>.glb --kind car|motorcycle|bicycle --length 3.7`
turns a downloaded Sketchfab model into a game-ready `public/models/vehicles/<name>.glb`: scaled
to its real length, nose along +x, wheels on y = 0, textures resized to at most 1024 px WebP,
geometry simplified to a face budget (car 40k, two-wheeler 25k), with a JSON sidecar giving wheel
centres and radius, and for two-wheelers the saddle, grips and footrests (found by name or given
on the command line).

## Context
Claude downloads the models (T-003) into `assets-src/` (gitignored) and lists them with authors
and licences in `public/models/vehicles/CREDITS.md`. Use `@gltf-transform/core` and
`@gltf-transform/functions` (dev dependencies). The game side (`street.js`, `motorcycle.js`) will
load these; Claude wires that up.

## Files you may touch
- new: `tools/import-model.mjs`, `public/models/vehicles/*`
- `package.json` (devDependencies)

## Done when
- Each model in `assets-src/` converts; output glb under 3 MB each; sidecar JSON present.
- A screenshot page `public/vehicles.html` shows them all side by side, on the ground, to scale.

## Questions

## Result

## Review
