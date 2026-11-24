# T-007 Landmark Asset Credits

## Procedural geometry only — no third-party 3D models or textures
All geometry in this landmark set is generated procedurally by
`tools/landmarks/build-station.mjs` and `tools/landmarks/build-all-landmarks.mjs` using vanilla Node.js and Three.js math.

No external 3D models, texture images, or proprietary assets were used.

## Materials
All PBR materials are defined strictly by numeric factors (`baseColorFactor`, `metallicFactor`, `roughnessFactor`)
and alpha blend settings. No external image files or photo projection textures are used.
Company logos and trademarks are omitted per AGENTS.md. Signage plates are plain geometric bands.

## Data sources (open-licence)
| Source | Licence |
|--------|---------|
| OpenStreetMap (ways 535333512, 193308962, 134101085, 382403604, 238285653, nodes 2461327601, 1742495415) | © OpenStreetMap contributors, ODbL 1.0 |
| Overture Maps Foundation (ov332, ov582, ov240, ov359, ov325, sv4) | CDLA Permissive v2.0 |
| Wikipedia text (Sector V station and campus information — reference only) | CC BY-SA 4.0 |
| Mapillary street-level imagery (reference only, no pixels copied) | CC BY-SA 4.0 |

## Tools used
- Node.js v24 (MIT) — GLB generation and binary glTF 2.0 packing
- Three.js r163 (MIT) — polygon triangulation math and runtime rendering
