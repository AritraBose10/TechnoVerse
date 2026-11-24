#!/usr/bin/env python3
"""Applies the driving hooks to public/main.js in place (see docs/DRIVE_SPEC.md).

    python3 tools/drive/patch_main.py public/main.js

main.js is edited by other chats too, so this never ships a whole file: it finds each place by a text anchor, asserts
the anchor exists exactly once, and inserts the hook. Running it twice does nothing the second time (each hook carries
a marker). Run it again on a fresh copy of main.js whenever main.js has been replaced.
"""
import sys

# (name, marker that proves the hook is in, anchor text, replacement: the anchor with the hook added)
HOOKS = [
    (
        "import",
        'import { createDriving } from "/drive.js";',
        'import RAPIER from "/vendor/rapier.es.js";\n',
        'import RAPIER from "/vendor/rapier.es.js";\nimport { createDriving } from "/drive.js";\n',
    ),
    (
        "create",
        "const drive = createDriving(",
        "function frame() {\n  requestAnimationFrame(frame);",
        "// driveable cars (drive.js): parked cars, the vehicle physics, the dashboard and the cameras\n"
        "const drive = createDriving({ THREE, RAPIER, scene, world, camera, traffic, worldInfo, keys, STEP, BODY_CENTRE, getHero: () => hero, getMe: () => me, playerBody: body, placeBody, logLine, getAudio: () => fxCtx || voice.ctx || null, getView: () => ({ yaw: camYaw, pitch: camPitch, dragging: Boolean(drag) }), isBusy: () => Boolean(seq || crash || riding) });\n"
        "function frame() {\n  requestAnimationFrame(frame);",
    ),
    (
        "frame",
        "else if (drive.active && hero) drive.frame(dt);",
        "  else if (riding && hero) rideFrame(dt);\n  else walkFrame(dt, now);",
        "  else if (drive.active && hero) drive.frame(dt); // while driving, drive.js steps the physics world\n  else if (riding && hero) rideFrame(dt);\n  else walkFrame(dt, now);",
    ),
    (
        "camera",
        "if (drive.active) drive.camera(dt);",
        "  me.tag.visible = camNow > 2.6; // my own name tag gets in the way up close\n  draw();\n",
        # The current main.js keeps its camera setup inside afterMove(), immediately before draw().
        # Put the car camera there so it replaces the walking camera in the same rendered frame.
        "  me.tag.visible = camNow > 2.6; // my own name tag gets in the way up close\n  if (drive.active) drive.camera(dt); // the car's camera replaces the walking one\n  draw();\n",
    ),
    (
        "keydown",
        "if (drive.keydown(e))",
        "  keys.add(e.code);\n",
        "  keys.add(e.code);\n  if (drive.keydown(e)) { e.preventDefault(); return; } // E near a car, and every driving key while in one\n",
    ),
    (
        "hint",
        "if (drive.active || drive.near())",
        "function updateRideHint() {\n",
        'function updateRideHint() {\n  if (drive.active || drive.near()) { const h = drive.hint(); $("#rideHint").textContent = h; $("#rideHint").hidden = !h; $("#ride").hidden = true; return; }\n',
    ),
    (
        "street-extra",
        "drive.active ? drive.streetExtra(",
        "  const extra = [{ x: lx, z: lz, r: riding ? 0.7 : 0.35, vx, vz, riding: Boolean(riding) }];\n",
        "  const extra = [drive.active ? drive.streetExtra(lx, lz, vx, vz) : { x: lx, z: lz, r: riding ? 0.7 : 0.35, vx, vz, riding: Boolean(riding) }];\n",
    ),
    (
        "street-width",
        "w: e.w ?? (e.r > 0.5 ? 0.9 : 0.7)",
        "onRoad.push({ x: e.x, z: e.z, vx: e.vx, w: e.r > 0.5 ? 0.9 : 0.7 });",
        "onRoad.push({ x: e.x, z: e.z, vx: e.vx, w: e.w ?? (e.r > 0.5 ? 0.9 : 0.7) });",
    ),
    (
        "debug",
        "drive: () => drive.debug(),",
        "window.__tiu = {\n",
        "window.__tiu = {\n  drive: () => drive.debug(),\n",
    ),
]


def main(path):
    src = open(path, encoding="utf-8").read()
    todo = []
    for name, marker, anchor, new in HOOKS:
        if marker in src:
            print(f"  {name}: already applied")
            continue
        n = src.count(anchor)
        assert n == 1, f"hook '{name}': anchor must exist exactly once in {path}, found {n}: {anchor!r}"
        todo.append((name, anchor, new))
    for name, anchor, new in todo:
        src = src.replace(anchor, new, 1)
        print(f"  {name}: applied")
    if todo:
        open(path, "w", encoding="utf-8").write(src)
    print(f"{path}: {len(todo)} hook(s) applied, {len(HOOKS) - len(todo)} already in place")


if __name__ == "__main__":
    assert len(sys.argv) == 2, "usage: python3 tools/drive/patch_main.py public/main.js"
    main(sys.argv[1])
