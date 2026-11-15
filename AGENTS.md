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
