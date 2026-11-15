# People of TIU (prototype)

A walkable 3D version of the streets around Techno India University (EM-4, Sector V, Salt Lake) in the browser. People near you can chat by text and talk by voice.

## Run it

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000 in two browser tabs (or two devices), enter a name in each and walk toward each other.

## Controls

| Action | Keyboard and mouse | Phone |
|---|---|---|
| Walk | W A S D or arrow keys | On-screen stick |
| Run | Hold Shift | Push the stick fully |
| Jump | Space | Jump button |
| Look around | Drag with the mouse | Drag with a finger |
| Zoom | Mouse wheel | |
| Chat | Enter, type, Enter | Tap the chat box |
| Talk | Hold V (after "Join voice") | Hold the talk button |
| Get on / off a bicycle | E, next to a bike (off only below walking pace) | Ride / Get off button |
| Ride | W pedal, S brake, A D steer, Shift sprint | Stick: up pedals, down brakes, sideways steers |
| Back up on the bike | Hold S when stopped | Hold the stick down when stopped |

## What is in it

- **The neighbourhood.** Building outlines, roads, pitches and green areas come from OpenStreetMap, with the many buildings OpenStreetMap lacks here filled in from Overture Maps (Google Open Buildings and Microsoft footprints). Positions were checked against satellite imagery; a few outlines missing from both, and outdated ones (the classroom sheds and Phase 3 building, the pool), are corrected in `tools/survey.json`. Buildings carry their names from map labels, OpenStreetMap and Overture places, shown on a board on the wall facing the road (and on the roof for towers). Heights of nearby buildings are estimates from street-level imagery; elsewhere they are guessed from footprint size, so the shapes are placeholders for now.
- **The university complex.** Modelled part by part in `public/tiu.js` from street-level photographs (January 2026) and satellite views: the nine-storey tower with its strip of curtain glass, gridded bay, bowed glass corner and name cornice on a podium of grey aluminium panels; the main block with the two-storey entrance portico under a bowed canopy on leaning columns, the colonnade, ribbon windows, rear wing and pyramid roofs; and all four sides with real window openings, sunshades, air-conditioner units, rain pipes and weather stains. Boundary of brick pillars and blue grilles, gates, granite name wall, sign pylon. You can walk the forecourt, into the portico, along the colonnade and right round the building. Dimensions are estimates from photographs; hoarding and banner artwork is placeholder.
- **Across the street.** The side facing the main gate (`public/opposite.js`), from the same photographs: the median with painted kerb stones and green bamboo railing, the speed breaker at the crossing, the institute gate with its curved blue name board and guard hut, the brick boundary wall, the row of tea stalls under patched tarpaulins behind a white railing, a tin-roofed shed, an ice-cream cart and a cycle rickshaw. Stall contents and sign wording are representative, not copied from the real ones.
- **Rendering.** Surfaces are full material sets made in code (`public/pbr.js`: colour, relief and roughness). A physically based sky lights the scene and is reflected in glass, together with a one-off capture of the real surroundings. High quality adds ambient occlusion (soft shading where surfaces meet) and sharper sun shadows; phones start on low, slow devices step down by themselves, and `?q=high` or `?q=low` in the address forces either.
- **The street.** Parked cars with real proportions (hatchbacks, sedans, compact SUVs and a yellow Kolkata taxi, `public/street.js`) with clear-coated paint, glass, lamps, alloy wheels and number plates; three-lantern lamp posts along the university railing; tall twin-head street lights along the carriageways.
- **The main character.** A detailed rigged human with motion-captured idle, walk and run. The stride is matched to ground speed, the feet are placed on steps with leg IK (knees bend as hinges), the head and eyes turn toward people nearby, and the face smiles and moves its mouth when you talk. It wears a navy and white diagonal top with a red chest badge. Other players are shown as simple figures.
- **Trees.** Street trees grown in code from branching skeletons with leaf-cluster cards: wide rain trees, neem, a few flowering gulmohar, tall columnar ashoka, leaning coconut palms with feather fronds, and flowering hedges in the beds. Leaves sway in the breeze and cast dappled shadows. Placement is still random within open ground (no tree data for this area).
- **Hair.** A short natural cut grown from the scalp of the head model (real hairline, temples, sideburns, nape), fuller on top, textured with strands, instead of the model's cap.
- **Jumping.** Real gravity (9.81 m/s²). A standing jump clears about 45 cm, a running one about 55 cm. The body dips and swings the arms back, drives up onto the toes, keeps its momentum in the air (feet together from standing, a held stride off a run, knees drawing up near the top), and on landing the knees and hips give in proportion to the impact before it stands back up. One jump per press.
- **Bicycles.** Three city bikes stand on the forecourt beside the entrance. Riding uses real numbers: about 150 W of pedalling cruises at 26 km/h on the flat (420 W sprinting, about 38 km/h), held back by rolling resistance, air drag and the slope under the wheels (gravity along the road: a 5% climb drops cruising speed to about 11 km/h). Brakes stop you from 26 km/h in under 6 m. Steering follows the bicycle's geometry (turn radius = wheelbase / tan of the steering angle), the available steering shrinks with speed, and the bike leans into turns by the balance angle atan(v²/gR), with a rider's lag. Coasting, the cranks stop (freewheel). Below walking pace the rider puts a foot down. Holding S at a stop backs the bike up the way people do: straddling it, both feet on the ground, stepping backwards at about 0.7 m/s and looking over the shoulder; steering then swings the bike the reversing way, and the cranks turn backwards with the wheel. The rider sits on the saddle with hands on the grips and feet following the pedals. Other people see you on a bike leaning through turns.
- **Physics.** Rapier handles gravity, jumping, solid walls, steps, and loose objects you can push (footballs, crates).
- **Chat and voice.** Text reaches people within 15 m. Voice is push-to-talk, heard within about 20 m, and placed in 3D so it fades with distance.

## How it works

- `server.js` serves the site and runs one WebSocket at `/ws` for positions (10 a second), nearby chat, and voice call setup.
- `public/main.js` is the game loop: controls, physics stepping, networking, chat and voice.
- `public/world.js` builds the scene and its collision shapes from the map data. All textures are drawn in code.
- `public/character.js` loads the main character, converts the animations to its skeleton, and runs foot placement, head look and face.
- Voice is a direct browser-to-browser audio link (WebRTC) to each nearby player, opened under 20 m and closed past 26 m.
- Three.js 0.160 with its GLTF loader, sky and post-processing add-ons, and Rapier 0.12 are bundled in `public/vendor/`.

## Limits of the prototype

- No accounts. Anyone can enter with any name, and nothing is saved.
- The character's top keeps the base model's long-sleeved cut; only its colours and badge are changed. The model has two face controls (smile, mouth open) and no blink.
- Loose objects are simulated on each player's own device, so two players do not see a football in the same place.
- Voice links are direct and capped at 8 per person. On strict networks (some campus Wi-Fi and mobile data) they need a TURN relay; see "Voice relay" below.
- Microphones need HTTPS on anything other than `localhost`.
- The server keeps everything in memory in one process and sends every position to everyone.
- Mute hides a person's voice and chat for you only. There is no report button or admin tool yet.

## Credits and licences

- Map data © OpenStreetMap contributors, under the Open Database Licence. Keep the on-screen credit.
- `public/models/avatar.glb` is the Ready Player Me sample avatar and `public/models/anims.glb` holds Mixamo animations, both taken from the three.js examples. They are stand-ins: check their terms, or replace them with your own character and animations, before a public launch.
- Get the university's approval before using its name and logo publicly.

## Hosting

The server needs long-lived WebSocket connections, so host it on a service that runs a Node process (Render, Railway, Fly.io or a VPS). Vercel's serverless functions cannot hold WebSockets.

## Map data

`public/campus.json` is generated: `python3 tools/build-campus.py`. Inputs in `tools/`: `osm-extract.json` (Overpass; the command is at the top of the script), `overture-buildings.json` and `overture-places.json` (`tools/fetch-overture.py`, needs `pip install duckdb`), and `survey.json` (hand corrections, each with a note on its source). Credit: map data © OpenStreetMap contributors (ODbL); Overture Maps (ODbL, includes Google Open Buildings CC BY 4.0).

## Voice relay (TURN)

Without a relay, voice only works when two devices can reach each other directly. Set one of these on the host and the server hands the relay to browsers at `/ice` (credentials are refreshed automatically):

| Provider | Environment variables |
|---|---|
| Cloudflare (free tier) | `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` |
| Metered.ca (free tier) | `METERED_DOMAIN` (e.g. `yourapp.metered.live`), `METERED_API_KEY` |
| Any TURN server | `TURN_URLS` (comma-separated), `TURN_USERNAME`, `TURN_CREDENTIAL` |

On start the server logs either "Voice relay (TURN) configured." or "No TURN server set".

## Caching and disconnects

- Static files are served gzipped with ETags. Models and `vendor/` are cached by the browser for a week, so rename a file (or bump its name) when you replace it. Everything else is revalidated on each load and costs a 304 when unchanged.
- The server pings every client every 15 s and drops any that do not answer, so a phone that loses signal disappears for others within 30 s.

## Next steps

1. Sign-in with a verified college email, and saved profiles.
2. A hosted voice server (LiveKit) in place of direct links, for crowds and strict networks.
3. Report and block, plus an admin page.
4. A custom character with a real short-sleeved polo, more face controls and a choice of looks.
5. Zones, so each player only receives positions from nearby areas.


## Street life (people and traffic)

- Every player, including other people online, is the full animated character (same body and TIU polo), with walking, running, jumping and bike riding shown from the network.
- `public/traffic.js`: cars, yellow taxis, auto rickshaws, buses and motorbikes (with riders) drive both one-way carriageways on the left. They keep a safe gap (Intelligent Driver Model), slow for the speed breaker, change lanes round parked cars with indicators, park and pull out, stop at the kerb (autos, buses), and brake for anyone on the road.
- `public/people.js`: office staff, students, local people, stall keepers, guards, an ice-cream man and a rickshaw puller. Keepers greet, make tea at the kettle and hand it over; customers sip and chat; students stand in groups at the gate; people cross at the median gap when traffic is clear; walkers step round each other, posts and you.
- `public/looks.js`: outfits by role (shirts, stripes, checks, kurtas, lungis, jeans, backpacks, ID cards, helmets).
- Add `?life=off` to the address to turn street life off. `__tiu.simulate(seconds)` runs the street without drawing, for testing.


## Larger map, signals, realistic crowd (15 Nov)

- Map now runs about 600 m each way from the university: from Salt Lake Sector V metro station (north) to Meen Bhavan (south). 783 buildings, 160 roads, the metro viaduct. Rebuild with `python3 tools/build-campus.py` (RADIUS).
- Street Number 2 median runs the full length; traffic signal at the south junction by Meen Bhavan (seen in street view) and at the north bend (assumed); vehicles obey them. Other dual carriageways (Street No. 13) get a blue-and-white kerb and railing automatically.
- Second row of stalls toward the north bend; long parked-car row south of the university.
- Crowd bodies: Microsoft Rocketbox avatars (MIT), men and women, converted by `tools/rocketbox/convert.py` (skin and hair re-toned), in `public/models/people/`. Blinking and jaw movement. `/bodies.html` shows them side by side.
- Road surfaces lowered to ground level so feet and wheels rest on them.


## Two-wheelers, greetings, real time (15 Nov, second pass)

- **Bicycles** (`public/bicycle.js`): five designs built from their own measurements: the black Indian roadster (28 inch wheels, full mudguards, chain case, sprung saddle, carrier, centre stand, dynamo lamp), a ladies' step-through with a basket, the city hybrid, a mountain bike (fat tyres, suspension fork, discs) and a light street bike with deep coloured rims. Each rides a little differently (weight, rolling resistance, gearing, how upright you sit).
- **Motorcycles** (`public/motorcycle.js`): a 100 cc commuter (Splendor kind), the older spoked kind with a round lamp and carrier, a 350 cc long-stroke classic (Bullet / Classic 350 kind, no maker's badge) and a 110 cc gearless scooter (Activa kind). No sports bikes. `E` to get on, `W` throttle, `Shift` full throttle, `S` brake, `H` horn. The engine is power-limited at speed and thrust-limited in first gear, with engine braking and 0.7 g brakes; top speeds come out at about 87, 85, 117 and 83 km/h. You wear a helmet on anything with an engine, and so do riders and pillions in traffic.
- `/rides.html` shows every design side by side (`?set=bicycle|motorcycle`, `?one=bullet&view=q`, `?rider=1`).
- Traffic now has all four motorcycles and pedalling cyclists who keep to the kerb; faster vehicles pull out round them.
- **Greetings between players**: `1` nomoshkar, `2` wave, `3` handshake (or the buttons on the right). A handshake needs someone within arm's reach; their character takes your hand.
- **Real time** (`public/daylight.js`): the clock is Indian Standard Time. The sun and moon are where they really are over Salt Lake (worked out from the date), and drive the sunlight, sky, haze and exposure; after sunset the street lamps, lit windows, headlamps and tail lamps come on, with the moon at its real phase. Traffic follows the hour (rush hours busy, small hours nearly empty). `?time=19:30` fixes the clock; `__tiu.time("06:10")` in the console.
- Roads, paths and the metro line are cut at the edge of the map square.


## Getting on and off, transit, crowd variety (15 Nov, third pass)

- Getting on a motorcycle plays out in full: take the helmet off the handlebar, lift it over the head, pull it on and fasten the strap; hands on the grips, lift the bike off its side stand, swing the right leg over, kick the stand up, turn the key, press the starter (the 350 is kick-started). Getting off reverses it and the helmet goes back on the bar. Bicycles: hands on the bars, stand up, leg over. `__tiu.advance(seconds)` runs a sequence ahead for testing.
- `public/helmet.js`: an open-face ISI helmet with a smoked flip visor and chin strap; `/helmet.html` shows it.
- No cars are parked on the street; the flow is heavy 9:00–10:30 and 17:30–19:30 and light otherwise.
- Bus and auto stops: people wait, board when their vehicle stops (up the bus step, ducking into the auto), passengers get off and auto passengers pay the driver. The vehicle waits for them.
- No two crowd people dress alike (`varyBody` in `character.js`: shirt and trouser colours per person, skin untouched); `/bodies.html?from=0&n=7&vary=1` shows one body dressed seven ways.
- People are pushed out of anything they would overlap (posts, parked bikes, players, each other); stall flaps are tied up above head height.
