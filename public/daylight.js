// Real time of day. The clock is Indian Standard Time, wherever the visitor is; the sun and moon
// stand where they really are over Salt Lake at that moment (their positions are worked out from
// the date with the usual low-precision astronomical formulas, good to a fraction of a degree).
//
// From the sun's height everything else follows: the colour and strength of sunlight, the sky and
// the light it casts, the haze, how the camera exposes; and after sunset the street lamps, lit
// windows, headlamps and tail lamps, with the moon (at its real phase) as the only light from above.
// The hour also sets how much traffic there is.
//
// ?time=19:30 in the address fixes the clock (for looking at a particular hour); __tiu.time("06:10").
import * as THREE from "three";

const RAD = Math.PI / 180;
const DAY = 86400000;
const LAT = 22.5760302; // Techno India University, Salt Lake
const LON = 88.4284409;
const TILT = RAD * 23.4397; // of the earth's axis

const days = (ms) => ms / DAY - 0.5 + 2440588 - 2451545; // days since the year 2000
const rightAsc = (l, b) => Math.atan2(Math.sin(l) * Math.cos(TILT) - Math.tan(b) * Math.sin(TILT), Math.cos(l));
const declin = (l, b) => Math.asin(Math.sin(b) * Math.cos(TILT) + Math.cos(b) * Math.sin(TILT) * Math.sin(l));
const sidereal = (d) => RAD * (280.16 + 360.9856235 * d) + RAD * LON;
function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: declin(L, 0), ra: rightAsc(L, 0) };
}
function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAsc(l, b), dec: declin(l, b), dist: 385001 - 20905 * Math.cos(M) };
}
// where a body is in the sky: bearing clockwise from north, height above the horizon (radians)
function place(c, d) {
  const H = sidereal(d) - c.ra;
  const phi = RAD * LAT;
  return {
    bearing: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)) + Math.PI,
    alt: Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H)),
  };
}
/** Sun and moon over the campus at a moment (ms since 1970). */
export function sunMoon(ms) {
  const d = days(ms);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sep = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(149598000 * Math.sin(sep), m.dist - 149598000 * Math.cos(sep));
  return { sun: place(s, d), moon: { ...place(m, d), lit: (1 + Math.cos(inc)) / 2 } };
}
// the map's frame: +x east, -z north
const toVector = (p, out) => out.set(Math.sin(p.bearing) * Math.cos(p.alt), Math.sin(p.alt), -Math.cos(p.bearing) * Math.cos(p.alt));

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// traffic through the day (1 = an ordinary daytime flow): [hour, flow]
// Sector V is an office district: the street fills from about 9 to 10:30 in the morning and from
// 5:30 to 7:30 in the evening, and is light the rest of the day.
const FLOW = [[0, 0.08], [5, 0.06], [7, 0.25], [8.5, 0.9], [9.25, 1.5], [10.5, 1.45], [11.5, 0.6], [13, 0.55], [14, 0.6], [16.5, 0.65], [17.5, 1.3], [18.5, 1.55], [19.5, 1.35], [20.5, 0.7], [22, 0.3], [24, 0.08]];
function flowAt(hour) {
  for (let i = 0; i < FLOW.length - 1; i++) {
    const [h0, f0] = FLOW[i];
    const [h1, f1] = FLOW[i + 1];
    if (hour <= h1) return f0 + ((f1 - f0) * (hour - h0)) / (h1 - h0);
  }
  return 0.15;
}

/**
 * sun: the DirectionalLight; hemi: the HemisphereLight; sunOffset: Vector3 the game adds to the
 * player's position to place the sun light; worldInfo: from buildWorld (sky, lamps, nightUniform).
 */
export function buildDaylight({ scene, renderer, sun, hemi, sunOffset, worldInfo, traffic, high, clockEl }) {
  const fixed = new URLSearchParams(location.search).get("time");
  let override = null; // minutes after midnight IST, or null for the real clock
  const parse = (t) => {
    const m = /^(\d{1,2}):?(\d{2})?$/.exec(String(t || "").trim());
    return m ? (Math.min(23, +m[1]) * 60 + Math.min(59, +(m[2] || 0))) : null;
  };
  override = parse(fixed);
  // the moment being shown, as if the clock on the wall were Indian time
  function moment() {
    const now = Date.now();
    if (override === null) return now;
    const ist = new Date(now + 5.5 * 3600000);
    const midnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600000;
    return midnight + override * 60000;
  }

  // ---- light on the ground under the lamps ----
  const { lamps, sky, nightUniform } = worldInfo;
  const poolTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.5)");
    grad.addColorStop(0.7, "rgba(255,255,255,0.13)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const pools = [];
  for (const warm of [true, false]) {
    const spots = lamps.spots.filter((s) => s.warm === warm);
    if (!spots.length) continue;
    const mat = new THREE.MeshBasicMaterial({ map: poolTex, color: warm ? "#ffb866" : "#dfe8ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat, spots.length);
    const o = new THREE.Object3D();
    spots.forEach((s, i) => {
      o.position.set(s.x, warm ? 0.2 : 0.05, s.z);
      o.scale.set(s.r, 1, s.r);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.renderOrder = 2;
    im.visible = false;
    im.frustumCulled = false;
    scene.add(im);
    pools.push({ im, mat, peak: warm ? 0.5 : 0.42 });
  }
  // a few real lights that keep to the lamps nearest you, so people and vehicles near you are lit
  const near = [];
  if (high) {
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight("#e6ecff", 0, 34, 1.4);
      scene.add(l);
      near.push(l);
    }
  }
  // stars and the moon
  const stars = (() => {
    const n = 500;
    const pos = new Float32Array(n * 3);
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const y = 0.12 + rnd() * 0.88;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 1300, y * 1300, Math.sin(a) * r * 1300], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: "#dfe6ff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    p.frustumCulled = false;
    scene.add(p);
    return p;
  })();
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(16, 24), new THREE.MeshBasicMaterial({ color: "#f3f0e2", transparent: true, opacity: 0, fog: false, depthWrite: false }));
  moonDisc.frustumCulled = false;
  scene.add(moonDisc);

  const dayHaze = new THREE.Color("#b9c6cf");
  const duskHaze = new THREE.Color("#c9a488");
  const nightHaze = new THREE.Color("#141a27");
  const noon = new THREE.Color("#fff1dc");
  const low = new THREE.Color("#ff9d5c");
  const moonLight = new THREE.Color("#a9c1ff");
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const tmp = new THREE.Color();
  let lastAlt = 99;
  let lastRelight = -1e9;
  let timer = 0;
  const state = { night: 0, hour: 12, sunAlt: 0, label: "" };

  function apply(eye, force) {
    const ms = moment();
    const { sun: s, moon: m } = sunMoon(ms);
    const altDeg = s.alt / RAD;
    toVector(s, sunDir);
    toVector(m, moonDir);
    const day = smooth(-5, 6, altDeg); // 0 once the sun is well down
    const night = 1 - smooth(-7, 1.5, altDeg); // lamps come on as it sets
    const glow = Math.max(0, 1 - Math.abs(altDeg - 1) / 9); // sunrise and sunset colour
    // the light from above: the sun by day, the moon at night (they swap while both are near nothing)
    const sunPower = 3.6 * smooth(-1.5, 14, altDeg) * (0.55 + 0.45 * smooth(5, 40, altDeg));
    const moonUp = smooth(2, 12, m.alt / RAD);
    const moonPower = (0.1 + 0.28 * m.lit) * moonUp * smooth(-4, -9, altDeg);
    if (sunPower >= moonPower) {
      sunOffset.copy(sunDir).multiplyScalar(108);
      if (sunOffset.y < 12) sunOffset.y = 12;
      sun.intensity = sunPower;
      sun.color.copy(low).lerp(noon, smooth(3, 26, altDeg));
    } else {
      sunOffset.copy(moonDir).multiplyScalar(108);
      if (sunOffset.y < 20) sunOffset.y = 20;
      sun.intensity = moonPower;
      sun.color.copy(moonLight);
    }
    hemi.intensity = 0.35 * day + 0.5 * (1 - day);
    hemi.color.set("#cfd9e2").lerp(tmp.set("#3d4a6e"), 1 - day);
    hemi.groundColor.set("#9a927c").lerp(tmp.set("#4a3826"), 1 - day);
    sky.haze.copy(dayHaze).lerp(duskHaze, glow * 0.75).lerp(nightHaze, 1 - day);
    renderer.toneMappingExposure = 0.34 + 0.3 * (1 - day);
    sky.set(sunDir, 1 - day);
    stars.material.opacity = 0.7 * (1 - smooth(-12, -5, altDeg));
    moonDisc.material.opacity = (0.25 + 0.75 * (1 - day)) * smooth(0, 4, m.alt / RAD);
    // the light the sky casts is worked out again when the sun has moved enough to matter
    if (force || Math.abs(altDeg - lastAlt) > (altDeg < 12 ? 0.8 : 3) || ms - lastRelight > 20 * 60000) {
      lastAlt = altDeg;
      lastRelight = ms;
      sky.relight();
    }
    // lamps, windows, vehicles
    nightUniform.value = night;
    for (const [mat, dayGlow, nightGlow] of lamps.materials) mat.emissiveIntensity = dayGlow + (nightGlow - dayGlow) * night;
    for (const p of pools) {
      p.im.visible = night > 0.02;
      p.mat.opacity = p.peak * night;
    }
    const ist = new Date(ms + 5.5 * 3600000);
    const hour = ist.getUTCHours() + ist.getUTCMinutes() / 60;
    if (traffic) traffic.setTime(night, flowAt(hour));
    Object.assign(state, { night, hour, sunAlt: altDeg, moonAlt: m.alt / RAD, moonLit: m.lit });
    if (clockEl) {
      const h = ist.getUTCHours();
      state.label = `${((h + 11) % 12) + 1}:${String(ist.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
      clockEl.textContent = state.label;
    }
  }

  return {
    state,
    /** eye: THREE.Vector3 where the player is. Call every frame; the sky is re-read twice a second. */
    update(dt, eye) {
      timer -= dt;
      if (timer <= 0) {
        timer = 0.5;
        apply(eye, false);
      }
      stars.position.copy(eye);
      moonDisc.position.copy(eye).addScaledVector(moonDir, 1250);
      moonDisc.lookAt(eye);
      if (near.length) {
        // the three lamps nearest the player carry real light at night
        const n = state.night;
        if (n > 0.02) {
          const best = [];
          for (const s of lamps.spots) {
            const d = (s.x - eye.x) ** 2 + (s.z - eye.z) ** 2;
            if (best.length < near.length) best.push([d, s]);
            else {
              let worst = 0;
              for (let i = 1; i < best.length; i++) if (best[i][0] > best[worst][0]) worst = i;
              if (d < best[worst][0]) best[worst] = [d, s];
            }
          }
          near.forEach((l, i) => {
            const b = best[i];
            if (!b) return (l.intensity = 0);
            l.position.set(b[1].x, b[1].y - 0.4, b[1].z);
            l.color.set(b[1].warm ? "#ffc27a" : "#e6ecff");
            l.intensity = n * (b[1].warm ? 26 : 95);
          });
        } else for (const l of near) l.intensity = 0;
      }
    },
    /** "HH:MM" Indian time to fix the clock, or nothing to follow the real one. */
    setTime(t) {
      override = t === undefined || t === null ? null : parse(t);
      lastAlt = 99;
      timer = 0;
    },
  };
}
