# Street layer tools

- `node tools/street/build-assets.mjs` regenerates the runtime JSON mirror and the 2048 × 512 WebP
  sign atlas from the canonical files in `data/world/`.
- `node tools/street/validate.mjs` validates anchors, evidence and sign mounts.
- `node tools/street/integration.mjs` checks the browser layer on/off, errors, simulation and render
  budget near the storefront cluster.
- `node tools/street/preview.mjs` writes local screenshots and an HTML comparison sheet to
  `tools/street/out/` (gitignored).
