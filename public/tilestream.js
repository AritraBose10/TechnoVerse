// Tile streaming glue (Phase 1b-ii), OFF unless the page is opened with ?stream=1.
// streamer.js decides which baked tiles (public/tiles/, from `npm run bake`) should be in memory around the player; this file
// adds the part a game needs on top: tiles that arrive are NOT built in the frame they arrive. They wait in a queue and the
// game builds them with a time budget per frame (budgetMs), so a tile landing on integrated graphics cannot cause a hitch.
// A tile dropped before it was built is simply removed from the queue.
//
// Plug builders in with onTile(tile) / onTileFree(tile): tile = { id, origin, box, ext, features: { buildings, roads, ... } }
// with coordinates relative to tile.origin. Nothing renders from tiles yet: the world is still built whole by buildWorld, and
// this is the hook for distant low-detail geometry and for the map growing past what buildWorld can hold.
import { createStreamer } from "/streamer.js";

export function createTileStream({ radius = 300, budgetMs = 2, onTile = () => {}, onTileFree = () => {}, base = "/tiles/" } = {}) {
  const queue = []; // { add: bool, tile }
  const live = new Map(); // id -> tile that onTile has been called for
  let started = false, buildMs = 0, built = 0, freed = 0;
  const streamer = createStreamer({
    base, radius,
    onLoad: (tile) => queue.push({ add: true, tile }),
    onUnload: (tile) => {
      const i = queue.findIndex((q) => q.add && q.tile.id === tile.id);
      if (i >= 0) queue.splice(i, 1); // never built: nothing to free
      else queue.push({ add: false, tile });
    },
  });

  function pump(now) {
    const t0 = performance.now();
    for (let did = 0; queue.length && (did === 0 || performance.now() - t0 < budgetMs); did++) { // at least one per call, so a slow tile cannot starve the queue
      const q = queue.shift();
      try {
        if (q.add) { onTile(q.tile); live.set(q.tile.id, q.tile); built++; }
        else if (live.delete(q.tile.id)) { onTileFree(q.tile); freed++; }
      } catch (e) { console.error("tilestream", e); }
    }
    buildMs += performance.now() - t0;
  }

  return {
    // fetch the manifest; safe to call update() before it finishes (it does nothing until then)
    async start() { if (!started) { started = true; await streamer.init(); } },
    update(x, z, vx, vz, now = performance.now()) { streamer.update(x, z, vx, vz, now); pump(now); },
    stats: () => ({ ...streamer.stats(), live: live.size, waiting: queue.length, built, freed, buildMs: Math.round(buildMs * 10) / 10 }),
    live: () => live,
    idle: () => streamer.idle(),
    dispose() { streamer.dispose(); queue.length = 0; live.clear(); },
  };
}
