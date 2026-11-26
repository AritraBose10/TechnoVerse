---
id: T-001
owner: claude
status: done
depends: []
---
# Smoke-test harness

## Goal
Two commands any agent can run before handing work back:
- `npm run check`: syntax-checks `server.js` and every `public/*.js` as ES modules.
- `npm run smoke`: starts the server on a free port, opens the game headless, joins, waits for the
  character, and fails on any page error or console error. Also opens `/rides.html` and
  `/bodies.html` and fails on errors there.

## Context
Plain ES modules served by `server.js`; no bundler. The game page sets `window.__tiu` when ready;
after joining (type a name in `#name`, press Enter) `__tiu.me` and `__tiu.hero()` become truthy.
Test pages set `window.__done` when rendered. Loading is slow on software rendering (2–4 minutes),
so allow long timeouts. Add `?q=low` to the game URL.

## Files you may touch
- `package.json` (scripts and `devDependencies` only; Playwright as a dev dependency is fine)
- new: `tools/check.mjs`, `tools/smoke.mjs`
- `README.md` (a short "Checks" section)

## Steps
1. `tools/check.mjs`: for each file run `node --check` (use `--input-type=module` via stdin for
   files under `public/`, since they use `import` and top-level `await`). Print failures, exit 1.
2. `tools/smoke.mjs`: spawn `node server.js` with `PORT=0` or a random port, read the port from its
   output ("running on http://localhost:NNNN"), drive Chromium with Playwright, collect `pageerror`
   and `console.error`, save a screenshot to `tools/smoke-out/` (gitignored), kill the server.
3. Wire both into `package.json`.

## Done when
- `npm run check` passes on `main` and fails if you add a syntax error to any `public/*.js`.
- `npm run smoke` passes on `main` and prints the load time and `__tiu.renderInfo()`.

## Questions

## Result
Done by Claude 2026-11-26 (Codex had not started it). `npm run check` syntax-checks server.js, public/*.js
(as modules) and tools/*.mjs; verified it fails on a planted error. `npm run smoke` boots the server on
port 3990, joins, snaps spawn at 12:00/19:30/23:00, opens /rides.html and /bodies.html, runs
`__tiu.simulate(20)`, measures the scene with `__tiu.cost()` against a budget (750 calls, 1.5M tris) and
writes tools/smoke-out/latest/report.json. First runs: 378-581 calls, 0.7-1.2M tris. Real failures found:
404 on models/vehicles/lod/gsrtc.glb and altoworks.glb (no LOD file for the bus and the Alto Works).
Software WebGL shader-validation noise is set aside when the GPU string is SwiftShader/llvmpipe.
Browser: `npx playwright install chromium` per machine, or SMOKE_CHROME=<path to chrome>.

## Review
