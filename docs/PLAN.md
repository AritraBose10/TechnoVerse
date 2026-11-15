# TechnoVerse plan (kept by Claude)

Target: a walkable, real-feeling TIU and Sector V street, from Salt Lake Sector V metro station to
Meen Bhavan, with real time of day, traffic, people who do believable things, and other players
you can meet. Visual bar: photographic, not cartoon.

## Done
- Map ±600 m (783 buildings, 160 roads, metro viaduct), signals, medians, stalls.
- Traffic (IDM, lanes, parking, stops, signals), cars, autos, buses, motorcycles, cyclists.
- Crowd: Rocketbox bodies, 31 hand actions, 28 expressions, staged purchases (UPI and cash).
- Bicycles (5 designs), motorcycles (commuter, older spoked kind, 350 cc classic, scooter),
  rideable with physics; helmets on motorcycles.
- Player greetings: nomoshkar, wave, handshake.
- Real time (IST): sun and moon positions, sky, lamps, lit windows, headlamps, traffic by hour.
- Getting on and off two-wheelers as real sequences (helmet off the bar and on, stand, leg over,
  key, starter or kick-start; the reverse to get off). New open-face helmet, hung on every parked
  motorcycle's handlebar.
- No parked cars; traffic follows office rush hours. Passengers wait at stops, board and alight
  buses and autos, and pay the auto driver.
- Every crowd person's clothes coloured differently; glasses, caps, lanyards; varied heights.
- People can't pass through stall flaps, parked bikes or each other.

## Now (in order)
1. T-001 (codex) Smoke-test harness: `npm run check` and `npm run smoke`.
2. T-002 (codex) Performance pass: draw calls and triangles for the city blocks.
3. T-003 (claude) Sketchfab models: download (Captain's login), then T-004.
4. T-004 (codex) Model import pipeline for downloaded vehicles.
5. T-005 (claude) Player T-shirt: two options (current polo, Captain's design).
6. T-006 (claude) High-quality hero characters for players (needs Captain's choice of source).
7. T-007 (claude) Street-by-street visual accuracy pass against Street View.

## Later
- TIU interiors (from Monday).
- Hosting on Railway/Render; server-side position checks.
