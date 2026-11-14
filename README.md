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

## What is in it

- **The neighbourhood.** Building outlines, roads, pitches and green areas come from OpenStreetMap, with the many buildings OpenStreetMap lacks here filled in from Overture Maps (Google Open Buildings and Microsoft footprints). Positions were checked against satellite imagery; a few outlines missing from both, and outdated ones (the classroom sheds and Phase 3 building, the pool), are corrected in `tools/survey.json`. Buildings carry their names from map labels, OpenStreetMap and Overture places, shown on a board on the wall facing the road (and on the roof for towers). Heights of nearby buildings are estimates from street-level imagery; elsewhere they are guessed from footprint size, so the shapes are placeholders for now.
- **The university building.** White tower with strips of blue-green glass, the curved glass corner, roof planting, and the covered main entrance with the name band, dimpled wall tiles, slatted ceiling, reception desk and stone floor. These follow reference photos; the exact proportions are approximate.
- **The street.** Blue and white railing, three-globe street lamps, planting beds, trees and palms, parked cars and a yellow taxi, a building under construction.
- **The main character.** A detailed rigged human with motion-captured idle, walk and run. The stride is matched to ground speed, the feet are placed on steps with leg IK (knees bend as hinges), the head and eyes turn toward people nearby, and the face smiles and moves its mouth when you talk. It wears a navy and white diagonal top with a red chest badge. Other players are shown as simple figures.
- **Jumping.** Real gravity (9.81 m/s²). A standing jump clears about 45 cm, a running one about 55 cm. The body dips and swings the arms back, drives up onto the toes, keeps its momentum in the air (feet together from standing, a held stride off a run, knees drawing up near the top), and on landing the knees and hips give in proportion to the impact before it stands back up. One jump per press.
- **Bicycles.** Three city bikes stand on the forecourt beside the entrance. Riding uses real numbers: about 150 W of pedalling cruises at 26 km/h on the flat (420 W sprinting, about 38 km/h), held back by rolling resistance, air drag and the slope under the wheels (gravity along the road: a 5% climb drops cruising speed to about 11 km/h). Brakes stop you from 26 km/h in under 6 m. Steering follows the bicycle's geometry (turn radius = wheelbase / tan of the steering angle), the available steering shrinks with speed, and the bike leans into turns by the balance angle atan(v²/gR), with a rider's lag. Coasting, the cranks stop (freewheel). Below walking pace the rider puts a foot down. The rider sits on the saddle with hands on the grips and feet following the pedals. Other people see you on a bike leaning through turns.
- **Physics.** Rapier handles gravity, jumping, solid walls, steps, and loose objects you can push (footballs, crates).
- **Chat and voice.** Text reaches people within 15 m. Voice is push-to-talk, heard within about 20 m, and placed in 3D so it fades with distance.

## How it works

- `server.js` serves the site and runs one WebSocket at `/ws` for positions (10 a second), nearby chat, and voice call setup.
- `public/main.js` is the game loop: controls, physics stepping, networking, chat and voice.
- `public/world.js` builds the scene and its collision shapes from the map data. All textures are drawn in code.
- `public/character.js` loads the main character, converts the animations to its skeleton, and runs foot placement, head look and face.
- Voice is a direct browser-to-browser audio link (WebRTC) to each nearby player, opened under 20 m and closed past 26 m.
- Three.js 0.158, its GLTF loader and Rapier 0.12 are bundled in `public/vendor/`.

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
