# TechnoVerse: where everything lives (this folder: Metaverse-all)

- Game: `server.js`, `public/*.js`. Run: `npm install`, then `node server.js` (PORT env var).
- Traffic vehicles: `public/vehicles.js` + `public/models/vehicles/*.glb` (real models only, see CREDITS.md).
- Vehicle converter used for extra models: `tools/vehicles/` (`fbx2car.mjs`, `batch.sh`). Its output format (lod0/lod1, vertex-colour trim) differs from what `vehicles.js` loads (paint/detail/glass, nose +x), so a model made with it needs an adapter before use.
- Character creator test page `/creator/`: `public/creator/`; exporter and tests in `tools/creator/`.
- FBX sources stay in `Desktop\vehicles`, `Desktop\DummyHair.fbx` (not in the repo).
