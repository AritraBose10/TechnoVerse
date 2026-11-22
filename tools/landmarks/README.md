# tools/landmarks — GLB Landmark Builder

Procedural Node.js scripts that generate binary GLB models for TechnoVerse landmarks.
Each script corresponds to one real-world building from `docs/tasks/T-007-landmarks.md`.

## Requirements
Node.js ≥ 18 (uses ES modules + `fs.mkdirSync`). No npm dependencies.

## Usage

```powershell
# From repo root:
node tools/landmarks/build-station.mjs
```

Outputs `public/models/landmarks/535333512.glb`.

## Scripts

| Script | Building | OSM ID | GLB |
|--------|----------|--------|-----|
| `build-station.mjs` | Salt Lake Sector V Metro Station | 535333512 | `535333512.glb` |

## Adding a new landmark

1. Create `tools/landmarks/build-<slug>.mjs` following the pattern in `build-station.mjs`.
2. Use only vanilla Node.js — no npm packages. Geometry helpers (`boxPosNor`, `cylPosNor`, `merge`)
   are self-contained in each script.
3. Keep the GLB budget: ≤ 60 k triangles, ≤ 3 PBR materials + 1 glass, ≤ 2 MB file size.
4. `y = 0` must be ground level in the exported GLB.
5. Add an entry to `KNOWN_LANDMARKS` in `public/landmarks.js`.
6. Add references and credits to `public/models/landmarks/REFERENCES.md` and `CREDITS.md`.

## Geometry system

All geometry is authored as flat non-indexed triangle soup (non-indexed so normals are face-correct
out of the box). Two primitive types:

- **`boxPosNor(w, h, d, tx, ty, tz, rx?)`** — axis-aligned box with optional X-axis rotation
  (used for angled roof segments). Returns `{ pos: Float32Array, nor: Float32Array }`.
- **`cylPosNor(r, h, segs, tx, ty, tz)`** — n-sided prism approximating a cylinder.

Groups (arrays of `{pos, nor}`) are merged with `merge(list)` before GLB packing.

## GLB packer

`packGLB(meshList)` encodes the data as a valid glTF 2.0 Binary file:
- One `bufferView` per attribute (POSITION, NORMAL, TEXCOORD_0, indices).
- Procedural box-projection UVs (no texture images — all materials use `baseColorFactor`).
- 4-byte alignment padding between chunks.
- Outputs a single self-contained `.glb` with no external references.
