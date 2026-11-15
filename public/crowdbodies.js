// The crowd's bodies: photographic Rocketbox avatars (see tools/rocketbox), loaded one after
// another in the background. Until enough have arrived, people fall back to the player's body
// dressed by looks.js.
import { loadCrowdBody } from "/character.js";

const loaded = []; // { kit, role, sex, name }
let ready = null;

/** Starts loading; resolves once `enough` bodies are in (the rest keep coming). */
export function loadCrowdBodies(renderer, enough = 10, max = 99) {
  if (ready) return ready;
  ready = new Promise((resolve) => {
    (async () => {
      let list = [];
      try {
        list = await (await fetch("/models/people/index.json")).json();
      } catch {
        resolve(loaded);
        return;
      }
      // a mix of roles and of men and women first, so the street is varied from the start
      const order = [];
      const groups = {};
      for (const b of list) (groups[b.role + b.sex] ||= []).push(b);
      const keys = Object.keys(groups);
      for (let i = 0; order.length < list.length; i++) for (const k of keys) if (groups[k][i]) order.push(groups[k][i]);
      for (const b of order.slice(0, max)) {
        try {
          const kit = await loadCrowdBody(renderer, "/models/people/" + b.file);
          loaded.push({ kit, ...b });
        } catch (err) {
          console.warn("Could not load", b.file, err);
        }
        if (loaded.length === enough) resolve(loaded);
      }
      resolve(loaded);
    })();
  });
  return ready;
}

/** A body for someone of this role ("office", "student", "local", "keeper", "guard") and sex. */
export function pickBody(role, sex, rnd = Math.random) {
  const pickFrom = (list) => (list.length ? list[Math.floor(rnd() * list.length) % list.length] : null);
  const same = loaded.filter((b) => b.role === role && (!sex || b.sex === sex));
  if (same.length) return pickFrom(same);
  // keepers and guards look like local men when their own bodies are not in yet
  const like = role === "keeper" || role === "guard" || role === "rider" ? "local" : role;
  const near = loaded.filter((b) => b.role === like && (!sex || b.sex === sex));
  if (near.length) return pickFrom(near);
  return pickFrom(loaded.filter((b) => !sex || b.sex === sex));
}

export const crowdBodies = loaded;
