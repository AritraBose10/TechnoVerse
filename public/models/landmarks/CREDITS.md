# T-007 Landmark Asset Credits

## Procedural geometry only — no third-party assets
All geometry in this landmark set is generated procedurally by
`tools/landmarks/build-station.mjs` using vanilla Node.js.

No external 3D models, texture images, or proprietary assets were used.

## Materials
All PBR materials are defined by numeric factors (baseColorFactor, metallicFactor, roughnessFactor)
only — no texture image files are embedded or referenced in any GLB.

## Data sources (open-licence)
| Source | Licence |
|--------|---------|
| OpenStreetMap (way 535333512, footprint polygon, tags) | © OpenStreetMap contributors, ODbL 1.0 |
| Wikipedia text (station description — reference only, not copied) | CC BY-SA 4.0 |
| Mapillary imagery (reference only, no pixels copied into assets) | CC BY-SA 4.0 |

## Tools used
- Node.js v20 (MIT) — GLB generation
- Three.js r163 (MIT) — runtime rendering in `landmarks.html` test viewer
