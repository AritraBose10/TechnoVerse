# TechnoVerse: how the agents work together

This repo is built by two AI agents for Captain (Aritra Bose):

- **Claude (lead).** Plans the work, owns the architecture, writes the core systems (rendering,
  physics, characters, traffic, people, daylight), reviews and merges everything. Claude works in a
  cloud workspace and syncs to this folder.
- **Codex (contributor).** Takes the tasks in `docs/tasks/` that are marked `owner: codex`. These
  are mostly the long, mechanical ones: converting and wiring assets, test harnesses, performance
  passes, bulk data fixes, refactors with a clear spec.

Captain starts each agent; the agents never talk directly. **This folder is the only channel.**

## Rules for Codex

1. **Only work on a task file in `docs/tasks/` with `owner: codex` and `status: ready`.** If none
   is ready, stop and say so. Do not invent work.
2. **Branch per task:** `git switch -c codex/T-XXX-short-name` from `main`. Never commit to `main`,
   never force-push, never rewrite history.
3. **Stay inside the task's "Files you may touch" list.** If you must change anything else, stop and
   write why under "Questions" in the task file instead.
4. Before finishing: `npm run check` must pass (syntax check of every file), and the task's own
   "Done when" checks must pass.
5. **Finish by editing the task file:** set `status: review`, fill in "Result" (what changed, how you
   checked it, anything left over). Commit on the branch. Do not merge.
6. Keep the code style already in the file: plain ES modules, no build step, no new npm
   dependencies for the browser (three.js and Rapier are vendored in `public/vendor/`). Comments
   explain *why*, in plain English, with real-world measurements where they matter.
7. Do not touch `docs/PLAN.md`, `AGENTS.md`, or a task owned by `claude`.
8. Never commit secrets, downloaded model archives, or anything over 10 MB.

## Rules for Claude

- Writes each Codex task with a goal, context, exact files, steps, and "Done when" checks a
  machine can verify.
- Reviews `status: review` branches, merges to `main` or sends the task back with notes
  (`status: ready` again, notes under "Review").
- Keeps `docs/PLAN.md` current.

## Task file format (`docs/tasks/T-XXX-name.md`)

```
---
id: T-XXX
owner: codex | claude
status: ready | doing | review | done | blocked
depends: [T-YYY]
---
# Title
## Goal
## Context
## Files you may touch
## Steps
## Done when
## Questions
## Result
## Review
```

## Running

`npm install` once, then `npm start` and open http://localhost:3000 (the next free port if that
one is busy). Test pages: `/rides.html` (every bicycle and motorcycle), `/bodies.html` (crowd
bodies). In the browser console `__tiu` has debug hooks (`__tiu.time("19:30")`, `__tiu.cam(...)`,
`__tiu.renderInfo()`, `__tiu.simulate(seconds)`).

## Skill stack (always on, Claude and Codex)

Three skills live in `.claude/skills/` and apply to every session in this repo, without being asked:

1. **ponytail** (`.claude/skills/ponytail/SKILL.md`), **full** level by default. Smallest complete
   change: reuse what the repo already has, then the platform, then installed deps; no new npm
   dependency for a few lines; finish callers and checks. End each coding reply with one line on what
   was skipped or not checked. Captain can say `/ponytail lite|ultra` or "stop ponytail". Use
   `ponytail-review` before merging a Codex branch and `ponytail-debt` to list `shortcut:` comments.
2. **graphify** (`.claude/skills/graphify/SKILL.md`, rules in the graphify section below). The graph
   is the map: query it before grepping or reading source. Rebuild with `graphify update .`
   (AST only, free) after code changes. Install the CLI once per machine: `uv tool install graphifyy`
   (Python 3.11+; `--python 3.12` if the system Python is older).
3. **omniroute** (`.claude/skills/omniroute/SKILL.md`). Every LLM call TechnoVerse makes (NPC
   dialogue, moderation, STT/TTS, embeddings) goes through Captain's OmniRoute gateway via
   `server.js`, key in `.env`, never in the browser. Dormant until such a feature exists.

Order of use on a task: graphify to find the code, ponytail to decide the change, omniroute only if
the change calls a model.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## World streaming constraints (always on, Claude and Codex)
Design: `claude/technoverse-streaming.md` in the TechnoVerse Project. The grid is derived from data, never hand-written, so the map can grow without code changes. Any change that breaks one of these rules must STOP and print a warning in the reply (`⚠ STREAMING CONSTRAINT: <which> — <file:line> — <fix>`) before continuing:
1. **No hand-placed world objects in code.** Static objects (buildings, props, trees, signs, colliders) get their position from data the bake reads (`data/world/*.json` or OSM), never from literals like `position.set(12, 0, -40)` in `world.js`/`street.js`/etc. Fix: move the entry to a data file and re-bake. Moving things (players, vehicles, NPCs) are exempt. A hand-authored set (e.g. the `opposite.js` street frame) is allowed if it is declared in data as ONE unit with an anchor and a radius, so the streamer can load/unload it; literals inside a set's own local frame are fine. A hand-authored set (like `public/opposite.js`) is allowed when `public/authored-sets.json` declares it as ONE unit with a file, an anchor and a radius; `tools/bake.mjs` then skips its lint and prints it.
2. **Precision far from origin.** No world content beyond 10,000 m from (0,0) (float32 is ~1 mm there; the map already reaches ~5.7 km, which is fine). Tile files already use tile-local coordinates, so the shift is cheap. Fix: add the floating-origin shift before going further (re-centre the world on the player; positions in the bake stay in metres relative to a fixed geodetic anchor).
3. **Plain grid only while density is even.** If any cell holds more than 8x the median cell's bytes or objects, the grid is wrong for that area. Fix: switch to the quadtree split (same manifest format).
4. **No brute-force world queries.** "Is anything near this point?" across roads, footprints or props goes through `segIndex`/`polyIndex` in `public/world.js` (or the tile index), never a loop over every road/building. That loop cost 30 s of a 40 s startup.
5. **Static colliders go through `deferBox` / `deferCylinder`** (in `public/world.js`), not straight to `world.createCollider`, so they exist only near the player (96 m cells, 260 m radius). This covers building walls, kerbs, railings, lamp posts and tree trunks. Ground slabs, the border walls, dynamic props and what `tiu.js` / `opposite.js` create stay immediate. Anything that needs colliders far from the player must call `staticColliders.update(x, z, vx, vz)` first. `?statics=all` keeps every collider, for comparing against the old behaviour. Verify changes here with `?fp=1` (same mesh fingerprint = same world) and the `__boot` console line (`statics` shows active/total).
`npm run bake` enforces 1-3 as build warnings (and a heuristic lint for 1). Tile streaming (`public/tilestream.js`) is off unless the page is opened with `?stream=1`; nothing renders from tiles yet. Graphify setup for a new machine: `tools/setup-graphify.sh` (Mac/Linux) or `tools/setup-graphify.ps1` (Windows).
