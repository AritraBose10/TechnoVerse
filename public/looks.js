// What people on Street Number 2 wear and carry, by who they are. Each call returns a different,
// plausible person: options for makeCharacter() (see character.js).

const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];
const pickW = (rnd, pairs) => {
  let t = rnd() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((t -= w) <= 0) return v;
  return pairs[0][0];
};

// Skin: a multiplier on the model's own skin texture, from fair to deep brown.
const skin = (rnd) => 0.62 + rnd() * 0.4;
const SHIRT_PALE = ["#f2f3f5", "#dfe9f5", "#cfdff0", "#eae4d8", "#f3e9ef", "#e3efe3", "#d9d4ea"];
const SHIRT_STRIPE = ["#3d5f9a", "#7a8696", "#4b7f6a", "#8a4b5c", "#2e3f63"];
const TROUSERS = ["#1d212b", "#2b2f36", "#3a3a3e", "#4a4236", "#26303f", "#5b5346"];
const TEE = ["#1f1f22", "#7d1f2a", "#244a7a", "#3c6e47", "#e8e6e1", "#c46a1f", "#5a3d7a", "#2f7f86", "#a9a9a9", "#b8243a"];
const JEANS = ["#2a3a5c", "#334a72", "#1e2a42", "#3f5577", "#2c2f38"];
const KURTA = ["#f1ece0", "#e6d5b0", "#c9dbe6", "#efe6c8", "#d8c7a3", "#bfcfbf"];
const CHECKS = [["#2f4f8a", "#b9c7dc"], ["#8a2f2f", "#d8c0b0"], ["#2f6a4a", "#c8dcc8"], ["#4a3a6a", "#d0c8e0"], ["#6a5a2f", "#e0d8b8"]];
const SHOES_FORMAL = ["#1a1514", "#2b1d16", "#3a2a1e"];
const SHOES_CASUAL = ["#e8e8e6", "#2a2a2c", "#5a4a3a", "#3a4a6a", "#b0b0b0"];
const SANDALS = ["#3a2a1e", "#5a4632", "#2a2420"];

function hairFor(rnd, age) {
  if (age === "old") return pickW(rnd, [["grey", 4], ["pepper", 3], ["none", 2]]);
  if (age === "mid") return pickW(rnd, [["black", 6], ["pepper", 2], ["brown", 1]]);
  return pickW(rnd, [["black", 8], ["brown", 2]]);
}
function beardFor(rnd, age) {
  const r = rnd();
  if (age === "old") return r < 0.35 ? "#9a9894" : null;
  return r < 0.22 ? "#1a1612" : null;
}
const body = (rnd, age) => ({
  height: 0.92 + rnd() * 0.1 - (age === "old" ? 0.02 : 0),
  build: age === "mid" || age === "old" ? 1 + rnd() * 0.16 : 0.95 + rnd() * 0.12,
});

/** IT and office staff heading to Sector V: pale shirts, dark trousers, polished shoes, an ID card. */
export function officeLook(rnd) {
  const age = rnd() < 0.7 ? "young" : "mid";
  const striped = rnd() < 0.35;
  const gear = ["lanyard"];
  if (rnd() < 0.55) gear.push(rnd() < 0.6 ? "backpack" : "sling");
  if (rnd() < 0.3) gear.push("glasses");
  if (rnd() < 0.15) gear.push("folder");
  return {
    look: {
      top: striped ? { pattern: "stripes", color: pick(rnd, SHIRT_PALE), color2: pick(rnd, SHIRT_STRIPE) } : { pattern: "solid", color: pick(rnd, SHIRT_PALE) },
      bottom: { pattern: "solid", color: pick(rnd, TROUSERS) },
      shoes: pick(rnd, SHOES_FORMAL),
      skin: skin(rnd),
      hair: hairFor(rnd, age),
      beard: beardFor(rnd, age),
    },
    gear,
    ...body(rnd, age),
    pace: 1.35 + rnd() * 0.3,
  };
}

/** College students: T-shirts or checked shirts, jeans, trainers, backpacks. */
export function studentLook(rnd) {
  const tee = rnd() < 0.6;
  const gear = [];
  if (rnd() < 0.75) gear.push({ kind: "backpack", color: pick(rnd, ["#1f2a3c", "#3a3a3a", "#6a1f22", "#24503a", "#2a2a5a", "#c0782a"]) });
  if (rnd() < 0.2) gear.push("glasses");
  if (rnd() < 0.1) gear.push({ kind: "cap", color: pick(rnd, ["#1a1a1a", "#a52a22", "#2a4a8a"]) });
  const c = pick(rnd, CHECKS);
  return {
    look: {
      top: tee ? { pattern: rnd() < 0.5 ? "tee" : "solid", color: pick(rnd, TEE), color2: pick(rnd, TEE), untucked: true } : { pattern: "checks", color: c[0], color2: c[1], untucked: true, scale: 1.2 },
      bottom: rnd() < 0.8 ? { pattern: "jeans", color: pick(rnd, JEANS) } : { pattern: "cargo", color: pick(rnd, ["#4a4a3a", "#2a2a2c", "#5a5040"]) },
      shoes: pick(rnd, SHOES_CASUAL),
      skin: skin(rnd),
      hair: hairFor(rnd, "young"),
      beard: rnd() < 0.25 ? "#1a1612" : null,
    },
    gear,
    ...body(rnd, "young"),
    pace: 1.15 + rnd() * 0.25,
  };
}

/** Local people: kurtas, half-sleeve shirts, lungis, sandals, a cloth bag for the market. */
export function localLook(rnd) {
  const age = pickW(rnd, [["young", 2], ["mid", 4], ["old", 3]]);
  const style = rnd();
  const c = pick(rnd, CHECKS);
  const top = style < 0.4 ? { pattern: "kurta", color: pick(rnd, KURTA), color2: "#8a7a5a" } : { pattern: rnd() < 0.5 ? "solid" : "checks", color: rnd() < 0.5 ? pick(rnd, KURTA) : c[0], color2: c[1], untucked: true };
  const bottom = rnd() < 0.3 ? { pattern: "checks", color: c[0], color2: c[1], scale: 0.8 } : { pattern: "solid", color: style < 0.4 ? pick(rnd, ["#efe9dc", "#e4dccb"]) : pick(rnd, TROUSERS) };
  const gear = [];
  if (rnd() < 0.3) gear.push({ kind: "carrybag", color: pick(rnd, ["#d9c28a", "#c84a3a", "#3a7a5a", "#e8e0d0"]) });
  if (age !== "young" && rnd() < 0.45) gear.push("glasses");
  return {
    look: { top, bottom, shoes: pick(rnd, SANDALS), skin: skin(rnd), hair: hairFor(rnd, age), beard: beardFor(rnd, age) },
    gear,
    ...body(rnd, age),
    pace: age === "old" ? 0.8 + rnd() * 0.2 : 1.05 + rnd() * 0.2,
  };
}

/** Tea-stall and snack-stall keepers: vest or half shirt, lungi or old trousers, a towel on the shoulder. */
export function shopkeeperLook(rnd) {
  const age = pickW(rnd, [["young", 1], ["mid", 3], ["old", 2]]);
  const c = pick(rnd, CHECKS);
  return {
    look: {
      top: rnd() < 0.4 ? { pattern: "solid", color: pick(rnd, ["#efece4", "#e2ddd0", "#d8d2c2"]), untucked: true } : { pattern: "checks", color: c[0], color2: c[1], untucked: true },
      bottom: rnd() < 0.55 ? { pattern: "checks", color: pick(rnd, CHECKS)[0], color2: "#d8d0c0", scale: 0.8 } : { pattern: "solid", color: pick(rnd, TROUSERS) },
      shoes: pick(rnd, SANDALS),
      skin: 0.6 + rnd() * 0.25,
      hair: hairFor(rnd, age),
      beard: beardFor(rnd, age),
    },
    gear: [{ kind: "towel", color: pick(rnd, ["#d24a3a", "#e8e0c8", "#3a6aa8", "#d8a83a"]) }],
    ...body(rnd, age),
    pace: 0.9,
  };
}

/** Security guards: light blue shirt, navy trousers, a cap. */
export function guardLook(rnd) {
  return {
    look: { top: { pattern: "solid", color: "#9db8d6" }, bottom: { pattern: "solid", color: "#1c2433" }, shoes: "#111", skin: skin(rnd), hair: hairFor(rnd, "mid"), beard: null },
    gear: [{ kind: "cap", color: "#1c2433" }],
    ...body(rnd, "mid"),
    pace: 0.9,
  };
}

/** Drivers of autos and motorbikes. */
export function riderLook(rnd, { helmet = false } = {}) {
  const c = pick(rnd, CHECKS);
  const gear = helmet ? [{ kind: "helmet", color: pick(rnd, ["#1b1d22", "#c41e24", "#e8e8e8", "#1e3a8a", "#e0b020"]) }] : [];
  return {
    look: {
      top: rnd() < 0.5 ? { pattern: "checks", color: c[0], color2: c[1], untucked: true } : { pattern: "solid", color: pick(rnd, [...SHIRT_PALE, ...TEE]), untucked: true },
      bottom: { pattern: rnd() < 0.5 ? "jeans" : "solid", color: rnd() < 0.5 ? pick(rnd, JEANS) : pick(rnd, TROUSERS) },
      shoes: pick(rnd, [...SANDALS, ...SHOES_CASUAL]),
      skin: skin(rnd),
      hair: hairFor(rnd, "mid"),
      beard: beardFor(rnd, "mid"),
    },
    gear,
    ...body(rnd, "mid"),
  };
}
