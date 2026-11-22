# Driveable cars — design spec (TechnoVerse)

Working copy: `/home/claude/runall` (Node server: `cd /home/claude/runall && PORT=8200 setsid nohup node server.js > srv.log 2>&1 &`, page http://localhost:8200/?q=low).
Stack: Three.js r160 (`/vendor/three.module.js`, import map name `three`), Rapier 0.12 (`/vendor/rapier.es.js`, has `world.createVehicleController`), vanilla ES modules, no build step.
Player decisions: parked cars to get into; BOTH gearboxes (manual with clutch, automatic) chosen by the player; THREE cameras (chase, bonnet, cockpit). Must feel realistic: start the engine, clutch, gears, indicators, lights, handbrake.

## Files and owners
- `public/drive.js` — core (Sonnet): parked cars, enter/exit, physics, drivetrain, gearboxes, controls, lights/indicators on the car, hero pose, cameras, world stepping.
- `public/carhud.js` — dashboard HUD (Haiku).
- `public/carsound.js` — engine and car sounds (Haiku).
- `tools/drive/patch_main.py` — applies the small hooks to `public/main.js` by text anchors (Sonnet). main.js is ALSO being edited by another chat, so never ship a whole main.js: the patch must be re-runnable on a fresh copy, assert each anchor exists exactly once, and be idempotent (skip if already applied).

## Controls (keyboard; V, T, 1–3, Enter, E are already used by main.js; never use Ctrl, it closes tabs)
| Key | Action |
|---|---|
| E | near a parked car's driver door: get in. In the car, stopped (< 3 km/h): get out (engine off, handbrake on, gear N/P) |
| I (hold ~0.6–1.2 s) | crank the starter; the engine catches. Tap I while running: engine off |
| W / S | throttle / brake (automatic: S at a standstill engages reverse after 0.4 s hold; W at standstill in R goes to D the same way) |
| A / D | steer (rate-limited, speed-sensitive: full lock 35° at walking speed, ~8° at 80 km/h; self-centres) |
| Space | handbrake (toggle when stopped, hold while moving) |
| R / F | manual: gear up / down (N between R and 1: order R,N,1,2,3,4,5). Auto: R/F step P,R,N,D |
| Left Shift (hold) | clutch (manual, only when auto-clutch is off) |
| K | toggle auto-clutch (manual box; default ON for keyboard players) |
| M | switch gearbox manual ↔ automatic (only when stopped) |
| Z / X | left / right indicator (toggle; auto-cancel when the wheel returns past centre after a turn of > 60°) |
| B | hazards |
| L | headlights: off → low → high → off |
| H | horn |
| C | camera: chase → bonnet → cockpit |
| G | (optional) look back |

## Parked cars
- 3 cars on the near road's parking lane (street frame `lat 9.55`, direction +x): x = −39, −31 and 24.5 (`ROADS.near.park` / `PARK_SLOTS` in traffic.js). Street → world: `worldInfo.local(x, lat)` returns `[wx, wz]`; heading = `worldInfo.phi` (nose +x of the car's local frame; traffic sets `mesh.rotation.set(0, phi + yaw, pitch)` with yaw 0 for dir +1).
- Build with `makeRealCar(kind, color, rnd)` from `/vehicles.js` (call after `vehiclesReady()` resolves). Use kinds hatch, sedan, suv. Clear the stand-in occupants: `u.occupants.refill(() => 1)` then `u.occupants.setDriver(false)`.
- Car frame: nose +x, y up, right-hand side = +z. Driver sits on the RIGHT (India). `u.size {L,W,H}`, `u.wheelR`, `u.axles [front x, rear x]`, `u.alloy.map.rotation = angle` spins all wheels, `u.tail.emissiveIntensity` brake/tail lamp, `u.indL / u.indR` emissive indicators, `u.door.set(0..1)` driver door (opens on the +z side, hinge at front), `u.door.handle(vec3)` world point of the handle, `u.setLod?.(bool)` (call `setLod(false)` so the player's car always shows full detail).
- Each parked car is a dynamic Rapier rigid body with handbrake on, so the player can bump it; it must not move from being walked into (high mass, sleeping, handbrake).

## Physics (Rapier DynamicRayCastVehicleController)
- Chassis: dynamic body, cuboid collider (L/2, ~H*0.35, W/2) centred at y ≈ wheelR + 0.25, mass ~1000–1350 kg (hatch/sedan/SUV), centre of mass lowered (additional mass props or a low collider offset). Collision groups: do NOT collide with people colliders (people use groups `0x00020002`); give the chassis memberships 0x0004 and filter 0xFFFD (everything except group 2).
- 4 wheels at (±axle x, wheelR + suspension rest, ±(W/2 − 0.18)); direction (0,−1,0), axle (0,0,1) in chassis space (check the sign so forward torque drives +x). Suspension rest ~0.15 m, stiffness ~30–40, compression/relaxation damping ~2.3/4.4 (Rapier units), friction slip ~1.5–2.2, side friction stiffness ~1.
- Front-wheel drive (Indian hatch/sedans), front steering.
- World stepping: while driving, main.js does NOT call stepPhysics. drive.frame must run a fixed-step accumulator with `STEP = 1/60`: each step: compute inputs → controller.updateVehicle(STEP) → world.step(). Max 6 steps per frame. The player capsule (`body.collider`) is disabled (`setEnabled(false)`) while in the car and re-enabled at exit with `placeBody(x, y, z)` beside the driver door (on the kerb side if the road side is blocked).

## Drivetrain (make it feel real)
- Engine: idle 850 rpm, redline 6200, limiter 6500 (fuel cut), stall below 450 rpm when the clutch is engaged. Torque curve (Nm): 1000→85, 2000→105, 3000→115, 4000→118, 5000→112, 6000→98, 6500→85 (scale ×1.3 for SUVs). Engine braking off-throttle.
- Manual: ratios 1st 3.55, 2nd 1.90, 3rd 1.28, 4th 0.97, 5th 0.78, R 3.25, final drive 4.1. Clutch 0..1 engagement; when partially engaged, transmitted torque ∝ engagement and engine rpm is pulled toward wheel rpm. Pull away in 1st needs throttle + gradual clutch; dumping the clutch at low rpm stalls; selecting a gear at speed with no clutch is refused (grind sound/log). Auto-clutch: engages smoothly 0→1 over ~0.6 s as rpm rises above ~1300 when setting off, opens automatically when rpm would fall below ~800 and during shifts (~0.25 s).
- Automatic: P (wheels locked), R, N, D. Upshift at ~2400 rpm light throttle → ~5800 rpm full throttle; downshift on kickdown / slowing; torque converter feel (creep at idle in D/R ~5 km/h, slip at low speed).
- Engine force per driven wheel = torque × gear × final × efficiency 0.88 / wheelR / 2. Brakes: up to ~0.9 g, front-biased; ABS-lite (reduce brake when a wheel's forward impulse saturates is optional). Handbrake: rear wheels only.
- Speed from `controller.currentVehicleSpeed()` (m/s). Wheel spin for visuals: integrate speed / wheelR.
- Engine states: off, cranking, running, stalled (= off, needs restart). Needs running engine to drive; with the engine off the car only rolls.

## Lights and indicators (on the real car mesh)
- Brake lamps: `u.tail.emissiveIntensity` 2.6 when braking, else 0.3 (+0.9 at night or with headlights on).
- Indicators blink at 1.5 Hz (u.indL/u.indR emissiveIntensity 2.8 / 0) with a tick sound; hazards blink both.
- Headlights: one THREE.SpotLight (low: 30 m, high: 70 m, narrower) parented to the car at the nose, plus emissive on two small lamp meshes you add at the nose (white). Only the player's car gets a real light.
- Reverse: the HUD shows R; optional white reverse lamp.

## Hero (the player's own character) in the car
- `hero.update(dt, { speed: 0, grounded: true, turnRate: 0, facing: carYaw, lookAt: null, talk: 0, ride: {...} })` puts the body in a riding pose: `ride.saddle` = seat point (car local: x = wb*0.08, y = H*0.27, z = +W*0.22) in world space; `ride.gripL/gripR` = steering-wheel rim points (wheel centre ≈ (x + 0.42, y + 0.42, z), radius 0.18, the two points ±0.16 sideways, rotated with the steering-wheel angle = 2.5 × road-wheel angle); `ride.pedalL/pedalR` = footwell points (x + 0.78, 0.25, z ± 0.1); `groundL/groundR` the same as the pedals; `right/up/back` = car's +z, +y, −x world vectors; `crank: 0.6, effort: 0, footDown: 0, backing: 0, posture: 0.05` (upright). Look at how `rideFrame` in main.js builds `_w` and calls `hero.update` and copy that shape. `me.group` follows the car (position = car position, rotation.y = car yaw) so networking and the name tag keep working; the hero model is a child of `me.group`.
- Add a simple steering wheel mesh (torus + spokes) at the wheel centre for the player's car only, rotating with the steering angle; visible in all cameras.
- Enter: walk-up not required in v1: on E, open the door (`u.door.set` animated 0→1 over 0.5 s), place the hero in the seat, close the door. Exit: reverse. Use the existing door API so it looks right from outside.

## Cameras (drive.camera(dt) runs AFTER main.js has placed its own camera, and overrides it)
- Chase: behind and above (5.5 m back, 1.9 m up), springy follow of the car's yaw, looks slightly ahead, pull in so it does not go through walls (castRay against fixed colliders).
- Bonnet: on the bonnet centre (x = L/2 − 0.9, y = H + 0.05), looking forward.
- Cockpit: driver's eye (seat + (0.05, 0.68, 0)) looking forward, with the mouse-drag look (`camYaw/camPitch` offsets) allowed ±100°; the hero's head should be hidden in cockpit view (set the head bone scale tiny or hide the hero while in cockpit).
- FOV 60 chase / 70 cockpit, small speed shake above 60 km/h.

## Street integration
- `drive.streetExtra(lx, lz, vx, vz)` returns `{ x: lx, z: lz, r: 1.0, w: 1.8, vx, vz, riding: true }` (street frame) so traffic brakes for the car and pedestrians hit by it are knocked (people.js uses `riding && speed > 1.5 && d < 0.85`).
- main.js `updateStreet`: use it as `extra[0]` while driving, and use `e.w` for the road width when present.

## main.js hooks (patch by anchors; keep them minimal)
1. `import { createDriving } from "/drive.js";` after `import RAPIER from "/vendor/rapier.es.js";`.
2. Right before `function frame() {`: `const drive = createDriving({ THREE, RAPIER, scene, world, camera, traffic, worldInfo, keys, STEP, BODY_CENTRE, getHero: () => hero, getMe: () => me, playerBody: body, placeBody, logLine, getAudio: () => fxCtx || voice.ctx || null, getView: () => ({ yaw: camYaw, pitch: camPitch, dragging: Boolean(drag) }), isBusy: () => Boolean(seq || crash || riding) });`
3. In `frame()`: `else if (drive.active && hero) drive.frame(dt);` before `else if (riding && hero) rideFrame(dt);` and `if (drive.active) drive.camera(dt);` right after `afterMove(dt, now, pos);`.
4. keydown: right after `keys.add(e.code);`: `if (drive.keydown(e)) { e.preventDefault(); return; }` (handles E near/in a car and all driving keys; returns false otherwise so E still toggles bikes).
5. `updateRideHint()`: at the top: `if (drive.active || drive.near()) { const h = drive.hint(); $("#rideHint").textContent = h; $("#rideHint").hidden = !h; $("#ride").hidden = true; return; }`.
6. `updateStreet`: the extra[0] / road width change above.
7. Expose for tests: in the `window.__tiu = {` object add `drive: () => drive.debug()` (debug returns speed km/h, rpm, gear, engine state, clutch, mode, car world position, heading, active).

## HUD (carhud.js, Haiku)
`export function createCarHud()` → `{ show(on), update(s) }`. Self-injects its CSS and DOM (bottom-right dashboard, dark glass card like the existing HUD cards: rgba(20,24,32,0.82), rounded 14 px, white text, system font). Contents: speedometer (km/h, big number + arc gauge 0–180), tachometer (arc gauge 0–8 ×1000 rpm, red zone from 6200), gear letter (R N 1–5 or P R N D with current highlighted), gearbox mode tag (MT/AT, "auto-clutch" tag), engine state ("Engine off — hold I to start", "Cranking…", "Stalled — hold I"), indicator arrows (blink with state), hazard icon, headlight icon (low/high), handbrake (P)! icon, clutch bar (manual), camera name, and a small collapsible key help (? toggles). `s` = `{ kmh, rpm, redline, gear, mode: "manual"|"auto", autoClutch, engine: "off"|"cranking"|"running"|"stalled", blinkOn, indL, indR, hazard, lights: 0|1|2, handbrake, clutch, cam: "chase"|"bonnet"|"cockpit", hint }`. Canvas gauges, cheap (redraw ≤ 30 fps). No external assets.

## Sound (carsound.js, Haiku)
`export function createCarSound(getCtx)` → `{ set({ rpm, throttle, running }), crank(on), stall(), horn(on), tick(), door(open), gearGrind(), stop() }`. WebAudio only, lazy (create nodes on first use from `getCtx()`; if null do nothing). Engine: 4-cylinder character: two sawtooth/square oscillators at firing frequency f = rpm/60 × 2 and its half, through a lowpass whose cutoff and gain rise with throttle; a little filtered noise for intake. Starter: 12–15 Hz chugging noise bursts while cranking. Indicator: short click (tick/tock alternating). Horn: two detuned square waves ~420/500 Hz. Door: low thump. All with a master gain ≤ 0.35; ramp parameters (setTargetAtTime) to avoid clicks.

## Done means
- In a headless run (SwiftShader, `?q=low`): join, teleport next to a parked car, press E → in the car; hold I → engine running; W with auto-clutch → car moves in 1st, R to shift up, speed rises; brakes stop it; Z blinks the left indicator (indL emissive toggling); C cycles cameras; E at a stop → out. No console errors. Screenshots of each camera.
- Walking, bikes, traffic and people behave as before when not driving.
