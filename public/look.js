// Look layer: the parts of the picture that make the street read as a photograph instead of a model.
// Kept out of main.js on purpose (small hooks only). Everything is tiered: `high` gets all of it,
// low gets only the cheap parts (deeper sky, no grade pass, fewer cloud octaves).
//
//   const look = createLook({ THREE, scene, camera, renderer, high, worldInfo });
//   look.gradePass            ShaderPass to add after OutputPass (null on low)
//   look.update(dt, sunDir, day)   once a frame
//
// ?look=0 in the address turns the whole layer off, for comparing.
import { ShaderPass } from "/vendor/jsm/postprocessing/ShaderPass.js";
import { upgradeFacade } from "/facades.js";
import { createHeroTrees } from "/herotrees.js";

const SUN_TINT = [1.0, 0.955, 0.87];
const HAZE_BLUE_HEX = "#9cc4ec";
const GRADE = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.16 }, sat: { value: 1.27 }, vig: { value: 0.22 }, warm: { value: 0.035 }, sunUv: { value: [0.5, 0.5] }, glare: { value: 0 }, aspect: { value: 1.78 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float contrast, sat, vig, warm, glare, aspect; uniform vec2 sunUv; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);                         // richer colour
      c = (c - 0.5) * contrast + 0.5;                   // deeper shadows, cleaner highlights
      c += vec3(warm, warm * 0.4, -warm) * smoothstep(0.45, 1.0, l);          // warm sun on the lights
      c += vec3(-warm * 0.5, 0.0, warm * 0.7) * (1.0 - smoothstep(0.0, 0.4, l)); // cool shade
      if (glare > 0.0) { // sun glow: a soft warm bloom around the sun and a veil of haze across the frame when you face it
        vec2 d = (vUv - sunUv) * vec2(aspect, 1.0); float r = length(d);
        float g = exp(-r * 5.5) * 0.55 + exp(-r * 1.6) * 0.16;
        c += vec3(1.0, 0.86, 0.62) * g * glare;
      }
      vec2 q = vUv - 0.5; c *= 1.0 - vig * dot(q, q) * 2.2;                   // lens falloff
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

const CLOUD_VS = "varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }";
const CLOUD_FS = (oct) => `
  uniform vec3 sunDir; uniform float day, time, cover; varying vec3 vDir;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i = 0; i < ${oct}; i++){ s += a * n(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
  float dens(vec2 uv){ float d = fbm(uv + vec2(time * 0.004, 0.0)); return smoothstep(1.0 - cover, 1.0 - cover + 0.17, d); }
  void main(){
    vec3 d = normalize(vDir);
    if (d.y < 0.02) discard;
    vec2 uv = d.xz / (d.y + 0.22) * 1.7;
    float c = dens(uv);
    if (c < 0.01) discard;
    vec2 sUv = normalize(sunDir.xz + 1e-4) * 0.09;      // look toward the sun to find how thick the cloud is on that side
    float toward = dens(uv + sUv);
    float lit = clamp(1.0 - (toward - c) * 2.2 - c * 0.25, 0.0, 1.0);
    vec3 shade = vec3(0.95, 1.12, 1.45) * 0.9;
    vec3 sunny = vec3(3.1, 2.95, 2.7);
    vec3 col = mix(shade, sunny, lit) * (0.35 + 0.65 * day);
    float fade = smoothstep(0.02, 0.22, d.y);          // dissolve into the haze at the horizon
    gl_FragColor = vec4(col, c * fade * 0.92);
  }`;


// World-space "macro" variation for tiled ground materials. The grass and asphalt tiles repeat every few metres, which
// is what makes the ground look like a texture instead of a place. This multiplies the albedo by two octaves of
// low-frequency noise in WORLD space (patchy lush/dry grass, repaired and worn asphalt), so no two spots look alike.
function macro(THREE, mat, { lo, hi, scaleA = 0.022, scaleB = 0.11, amp = 1, desat = 1, gain = 1, blades = 0, road = 0, kerb = 0, soil = 0, key }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.mLo = { value: new THREE.Color(...lo) };
    sh.uniforms.mHi = { value: new THREE.Color(...hi) };
    sh.uniforms.mAmp = { value: amp };
    sh.uniforms.mDes = { value: desat };
    sh.uniforms.mGain = { value: gain };
    sh.uniforms.mBlade = { value: blades };
    sh.uniforms.mRoad = { value: road };
    sh.uniforms.mKerb = { value: kerb };
    sh.uniforms.mSoil = { value: soil };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vMW;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vMW; uniform vec3 mLo, mHi; uniform float mAmp, mDes, mGain, mBlade, mRoad, mKerb, mSoil;
        float mh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mh(i), mh(i+vec2(1,0)), f.x), mix(mh(i+vec2(0,1)), mh(i+vec2(1,1)), f.x), f.y); }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        { float a = mn(vMW.xz * ${scaleA.toFixed(4)}), b = mn(vMW.xz * ${scaleB.toFixed(4)} + 7.3);
          float t = clamp(a * 0.7 + b * 0.3, 0.0, 1.0);
          diffuseColor.rgb *= mix(vec3(1.0), mix(mLo, mHi, t), mAmp);
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, mDes) * mGain;
          if (mRoad > 0.0) { // asphalt: aggregate grain, hairline cracks, repair patches, oil/dust stains; fades with distance
            float rf = 1.0 - smoothstep(14.0, 70.0, length(vViewPosition));
            float g1 = mn(vMW.xz * 9.0), g2 = mn(vMW.xz * 31.0 + 5.2), g3 = mn(vMW.xz * 83.0 + 1.7);
            float grain = (g1 * 0.3 + g2 * 0.4 + g3 * 0.3) - 0.5;
            float cr = abs(mn(vMW.xz * 0.9 + 11.0) - 0.5), cr2 = abs(mn(vMW.xz * 2.6 + 3.0) - 0.5);
            float crack = (1.0 - smoothstep(0.0, 0.018, cr)) * step(0.55, mn(vMW.xz * 0.12 + 4.0)) + (1.0 - smoothstep(0.0, 0.012, cr2)) * step(0.7, mn(vMW.xz * 0.08 + 9.0));
            vec2 pc = floor(vMW.xz / 3.5); float rpatch = step(0.86, mh(pc)) * (0.78 + 0.12 * mh(pc + 3.0));
            float stain = smoothstep(0.62, 0.9, mn(vMW.xz * 0.45 + 21.0)) * 0.22;
            float dust = smoothstep(0.55, 0.85, mn(vMW.xz * 0.2 + 40.0)) * 0.12;
            vec3 rc = diffuseColor.rgb * (1.0 + grain * 0.55);
            rc *= 1.0 - crack * 0.5;
            rc *= mix(1.0, rpatch, step(0.001, rpatch));
            rc *= 1.0 - stain;
            rc = mix(rc, rc * vec3(1.08, 1.04, 0.95) + 0.02, dust);
            // road UVs: u runs across the carriageway, v along it. Wheel tracks, dusty edges and tired paint.
            float u = vMapUv.x, v = vMapUv.y;
            float paint = smoothstep(0.22, 0.42, lum);
            if (mRoad > 1.5) {
              float tr = exp(-pow((u - 0.27) / 0.05, 2.0)) + exp(-pow((u - 0.73) / 0.05, 2.0));       // wheel tracks in both lanes
              float tn = 0.6 + 0.4 * mn(vec2(u * 6.0, v * 5.0 + 2.0));
              rc *= 1.0 - tr * tn * 0.16 * (1.0 - paint);
              float oil = exp(-pow((u - 0.5) / 0.04, 2.0)) * smoothstep(0.55, 0.8, mn(vec2(u * 3.0, v * 3.0 + 8.0)));
              rc *= 1.0 - oil * 0.18 * (1.0 - paint);
            }
            float edge = 1.0 - smoothstep(0.0, 0.16, min(u, 1.0 - u));                                  // dust and grit swept to the kerb
            float dn = 0.55 + 0.45 * mn(vec2(v * 9.0, u * 30.0));
            rc = mix(rc, vec3(0.30, 0.27, 0.22) * (0.8 + 0.4 * g2), edge * dn * 0.5);
            float chip = smoothstep(0.35, 0.65, mn(vMW.xz * 3.1 + 2.0) * 0.6 + mn(vMW.xz * 17.0) * 0.4);
            rc = mix(rc, mix(rc, vec3(0.16), 0.5), paint * (1.0 - chip) * 0.55);                      // paint worn thin in patches
            rc *= 1.0 - paint * 0.12 * mn(vec2(v * 2.0, u * 4.0 + 5.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, rc, rf * min(mRoad, 1.0));
          }
          if (mKerb > 0.0) { // pavement: real pavers laid in world space (0.42 x 0.21 m, running bond) with per-paver tone and joints, plus a black-and-white painted kerb at the outer edge
            float kf = 1.0 - smoothstep(10.0, 38.0, length(vViewPosition));
            vec2 pw = vMW.xz / vec2(0.42, 0.21); vec2 pc2 = floor(vec2(pw.x + 0.5 * mod(floor(pw.y), 2.0), pw.y)); vec2 pf = fract(vec2(pw.x + 0.5 * mod(floor(pw.y), 2.0), pw.y));
            float tone = mh(pc2);
            vec3 pv = vec3(0.50, 0.37, 0.31) * (0.78 + 0.5 * tone) * mix(vec3(1.0), vec3(1.12, 0.98, 0.86), mh(pc2 + 7.0));
            float joint = smoothstep(0.0, 0.06, min(min(pf.x, 1.0 - pf.x) * 0.42, min(pf.y, 1.0 - pf.y) * 0.21) * 5.0);
            pv *= mix(0.55, 1.0, joint);
            diffuseColor.rgb = mix(diffuseColor.rgb, pv * (0.9 + 0.2 * mn(vMW.xz * 0.7)), kf * 0.85);
            float eu = min(vMapUv.x, 1.0 - vMapUv.x);
            float band = 1.0 - smoothstep(0.019, 0.022, eu);
            float stripe = step(0.5, fract(vMW.x * 0.9 + vMW.z * 0.9));
            vec3 kc = mix(vec3(0.05), vec3(0.86, 0.85, 0.82), stripe) * (0.85 + 0.3 * mn(vMW.xz * 6.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, kc, band * mKerb);
            float lipLine = smoothstep(0.019, 0.022, eu) * (1.0 - smoothstep(0.022, 0.032, eu));
            diffuseColor.rgb *= 1.0 - lipLine * 0.35; // shadowed joint where the pavers meet the kerb
          }
          if (mSoil > 0.0) { // bare earth: dry/moist patches, clods, pebbles, desiccation cracks, sparse weeds; fades with distance
            float sf = 1.0 - smoothstep(22.0, 95.0, length(vViewPosition));
            float dry = smoothstep(0.35, 0.7, mn(vMW.xz * 0.09 + 31.0));
            float cl = mn(vMW.xz * 2.6) * 0.4 + mn(vMW.xz * 9.0 + 4.0) * 0.35 + mn(vMW.xz * 31.0 + 9.0) * 0.25;
            float fine = mn(vMW.xz * 90.0 + 2.0) - 0.5;
            vec3 moist = vec3(0.30, 0.20, 0.13), dryc = vec3(0.60, 0.46, 0.33);
            vec3 sc = mix(moist, dryc, dry * 0.8 + cl * 0.25) * (0.72 + cl * 0.55 + fine * 0.28);
            vec2 pp = vMW.xz * 7.0; vec2 pi2 = floor(pp), pq = fract(pp);
            float hp = mh(pi2); vec2 po = vec2(mh(pi2 + 3.1), mh(pi2 + 8.7)) * 0.5 + 0.25;
            float dd = length(pq - po) * (0.7 + hp);
            float peb = step(0.8, hp) * (1.0 - smoothstep(0.09, 0.15, dd));
            vec3 pcol = mix(vec3(0.46, 0.43, 0.38), vec3(0.64, 0.58, 0.5), mh(pi2 + 5.0));
            sc = mix(sc, pcol * (0.8 + 0.3 * pq.y), peb);
            sc *= 1.0 - (1.0 - smoothstep(0.15, 0.24, dd)) * smoothstep(0.09, 0.15, dd) * step(0.8, hp) * 0.35; // dark rim grounds each stone
            float crk = abs(mn(vMW.xz * 1.7 + 17.0) - 0.5), crk2 = abs(mn(vMW.xz * 4.3 + 5.0) - 0.5);
            float cr = ((1.0 - smoothstep(0.0, 0.012, crk)) * step(0.5, mn(vMW.xz * 0.2 + 2.0)) + (1.0 - smoothstep(0.0, 0.009, crk2)) * 0.5) * dry;
            sc *= 1.0 - cr * 0.4;
            vec2 wp = vMW.xz * 2.2; vec2 wi = floor(wp), wf = fract(wp);
            float hw = mh(wi + 11.0); float wd = length(wf - (vec2(mh(wi + 1.3), mh(wi + 6.1)) * 0.5 + 0.25));
            float weed = step(0.93, hw) * (1.0 - smoothstep(0.1, 0.24, wd + (mn(vMW.xz * 28.0) - 0.5) * 0.18));
            sc = mix(sc, vec3(0.2, 0.36, 0.12) * (0.8 + 0.5 * mn(vMW.xz * 21.0)), weed * 0.85);
            diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.0, 0.9, 0.82), sc, sf * mSoil);
          }
          if (mBlade > 0.0) { // fine grass: tufts and blades from world-space noise, fading out with distance so it never shimmers
            float fade = 1.0 - smoothstep(18.0, 75.0, length(vViewPosition));
            float f1 = mn(vMW.xz * 2.3), f2 = mn(vMW.xz * 6.5 + 3.1), f3 = mn(vMW.xz * 16.0 + 9.7);
            float bl = (f1 * 0.45 + f2 * 0.33 + f3 * 0.22) - 0.5;
            diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0 + bl * 0.55, 1.0 + bl * 0.75, 1.0 + bl * 0.3), fade * mBlade);
          } }`);
  };
  mat.customProgramCacheKey = () => "look-" + key;
  mat.needsUpdate = true;
}

// Some landmark models (PWC, Wipro, EcoCentre) were exported inside-out: their normals and/or triangle winding point into the
// building, so the outside is lit as if seen from within (black). Detect by comparing with the direction away from the
// model's centre, and fix the normals and the winding of that mesh once.
const fixed = new WeakSet();
function turnOutward(g) {
  if (fixed.has(g)) return;
  fixed.add(g);
  const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
  if (!pos || !nor || !idx) return;
  g.computeBoundingBox();
  const cx = (g.boundingBox.min.x + g.boundingBox.max.x) / 2, cz = (g.boundingBox.min.z + g.boundingBox.max.z) / 2;
  let nSum = 0, wSum = 0, k = 0;
  const step = Math.max(1, Math.floor(idx.count / 3 / 4000)) * 3;
  for (let i = 0; i < idx.count; i += step) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const ux = pos.getX(b) - ax, uy = pos.getY(b) - ay, uz = pos.getZ(b) - az, vx = pos.getX(c) - ax, vy = pos.getY(c) - ay, vz = pos.getZ(c) - az;
    const fx = uy * vz - uz * vy, fz = ux * vy - uy * vx; // horizontal part of the face normal from the winding
    const fl = Math.hypot(fx, fz) || 1, rx = ax - cx, rz = az - cz, rl = Math.hypot(rx, rz) || 1;
    wSum += (fx * rx + fz * rz) / (fl * rl);
    nSum += (nor.getX(a) * rx + nor.getZ(a) * rz) / rl;
    k++;
  }
  if (!k) return;
  const badNormals = nSum / k < -0.15, badWinding = wSum / k < -0.15;
  if (badNormals) for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  if (badWinding) for (let i = 0; i < idx.count; i += 3) { const t = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, t); }
  if (badNormals) nor.needsUpdate = true;
  if (badWinding) idx.needsUpdate = true;
}

export function createLook({ THREE, scene, camera, renderer, high, worldInfo, sun, hemi }) {
  if (new URLSearchParams(location.search).get("look") === "0") return { gradePass: null, update() {} };

  // hard sun: PCFShadowMap honours `radius` (PCFSoft ignores it), so the sun's shadows get a crisp, deep edge like the reference
  if (high && sun) {
    renderer.shadowMap.type = THREE.PCFShadowMap;
    sun.shadow.radius = 1.1;
    sun.shadow.normalBias = 0.03;
    renderer.shadowMap.needsUpdate = true;
  }

  // (the scattering sky is left as world.js sets it: lowering turbidity/raising rayleigh made it paler, not bluer)

  // sky: the scattering sky goes pale and grey-teal toward the horizon (haze). Push it toward a deeper, more saturated blue,
  // strongest overhead and gently at the horizon, so it matches the reference's clean morning blue. Patches the stock Sky shader text.
  if (high) scene.traverse((o) => {
    const sm = o.material;
    if (!o.isMesh || !sm || !sm.uniforms || !sm.uniforms.turbidity || !sm.uniforms.sunPosition || sm.userData.lookSky) return;
    const tag = "gl_FragColor = vec4( retColor, 1.0 );";
    if (!sm.fragmentShader.includes(tag)) return;
    sm.fragmentShader = sm.fragmentShader.replace(tag, `{ float lum = dot(retColor, vec3(0.2126, 0.7152, 0.0722));
        retColor = mix(vec3(lum), retColor, 1.35);                 // more saturated
        retColor *= mix(vec3(0.80, 0.92, 1.10), vec3(0.93, 0.98, 1.04), pow(1.0 - clamp(direction.y, 0.0, 1.0), 2.0)); // bluer, less so near the horizon
        gl_FragColor = vec4( retColor, 1.0 ); }`);
    sm.userData.lookSky = true;
    sm.needsUpdate = true;
  });

  // ground: find the materials by what world.js does to them (polygonOffset layers: grass 1, paver 3, lane asphalt 5, main road 6)
  const done = new WeakSet();
  scene.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || !m || Array.isArray(m) || done.has(m) || !m.isMeshStandardMaterial) return;
    const f = m.polygonOffset ? -m.polygonOffsetFactor : 0;
    const big = o.geometry?.parameters?.width === 2800;
    if (big || f === 1 || f === 2) macro(THREE, m, { lo: [0.84, 1.02, 0.56], hi: [1.16, 1.42, 0.78], amp: big ? 1 : 1, desat: f === 1 ? 0.95 : 1.1, gain: f === 1 ? 0.97 : 1.08, blades: 1, key: f === 1 ? "grassLayer" : f === 2 ? "grass2" : "grass" }), (high && (m.envMapIntensity = 1.0)), done.add(m); // the landuse-grass layer (offset 1) is brighter than the ground plane under it: pull it into the same range
    else if (f === 5 || f === 6) { m.roughness = 0.82; macro(THREE, m, { lo: [0.82, 0.8, 0.78], hi: [1.2, 1.15, 1.08], scaleA: 0.04, scaleB: 0.3, amp: 0.85, desat: 0.25, gain: 1.7, road: f === 6 ? 2 : 1, key: "asphalt" }); if (high) m.envMapIntensity = 0.6; done.add(m); }
    else if (f === 3) {
      // only the pavement ribbons (u runs 0..1 across the strip) get real pavers and the painted kerb; other offset-3 layers (bare earth) keep world-space UVs
      const uv = o.geometry?.attributes?.uv; let ribbon = !!uv;
      if (uv) for (let i = 0; i < uv.count; i += Math.max(1, (uv.count / 200) | 0)) if (uv.getX(i) < -0.01 || uv.getX(i) > 1.01) { ribbon = false; break; }
      macro(THREE, m, { lo: [0.86, 0.84, 0.82], hi: [1.08, 1.06, 1.04], scaleA: 0.05, scaleB: 0.25, amp: 0.7, kerb: ribbon ? 1 : 0, soil: ribbon ? 0 : 1, key: ribbon ? "paver" : "dirt" });
      if (high) m.envMapIntensity = 0.6;
      done.add(m);
    }
  });

  // building fronts: redraw the flat 256 px facade textures richer (facades.js)
  const seenMaps = new WeakSet();
  scene.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || !m || Array.isArray(m) || !m.map || seenMaps.has(m.map)) return;
    seenMaps.add(m.map);
    upgradeFacade(THREE, m.map);
  });
  // glass towers (orange-red framed curtain walls): glossy, sky-reflecting, dielectric (metal would mirror the env map's dark lower half)
  const seenGlass = new WeakSet();
  scene.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || !m || Array.isArray(m) || seenGlass.has(m) || m.map?.userData?.richFacade !== "glassTower") return;
    seenGlass.add(m);
    m.roughness = 0.16; m.metalness = 0.0; m.envMapIntensity = 1.0; m.color.setRGB(0.82, 0.9, 1.0); m.needsUpdate = true;
  });

  // landmark glass (curtain walls, ribbon glazing): the models ship it half-transparent and double-sided, so you look
  // through to the dark inside and it renders as black slabs. Make it opaque, front-faced, blue and reflective.
  // The landmark models load after startup, so this runs again every 1.5 s for the first 2 minutes.
  const fixGlass = () => scene.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || !m || Array.isArray(m) || !/^[A-Za-z0-9]+_[A-Za-z]/.test(m.name || "")) return;
    turnOutward(o.geometry);
    if (done.has(m)) return;
    if (!/glass|glazing/i.test(m.name)) {
      // landmark model materials (named Building_Part): half-metal paint and trim mirror the env map's black lower half
      if (m.metalness > 0.15) m.metalness = 0.15;
      done.add(m);
      return;
    }
    m.transparent = false; m.opacity = 1; m.side = THREE.FrontSide; m.depthWrite = true; // depthWrite was off for the see-through version: the dark inside showed through
    m.metalness = 0.06; m.roughness = 0.2; m.envMapIntensity = 1.2; // metal would mirror the env map's black lower half
    m.color.lerp(new THREE.Color('#5d8fc4'), 0.5);
    m.needsUpdate = true; done.add(m);
  });
  fixGlass();
  let glassStart = 0, glassLast = 0, glassKids = -1; // starts at the first frame; loads finish after that

  const hero = createHeroTrees({ THREE, scene, renderer, quality: high ? "high" : "low" });

  // cumulus
  const mat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3(0, 1, 0) }, day: { value: 1 }, time: { value: 0 }, cover: { value: 0.34 } },
    vertexShader: CLOUD_VS,
    fragmentShader: CLOUD_FS(high ? 5 : 3),
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), mat);
  dome.renderOrder = -1; // right after the sky, before the world
  dome.frustumCulled = false;
  scene.add(dome);

  let gradePass = null;
  if (high) gradePass = new ShaderPass(GRADE);

  const SUN_WARM = new THREE.Color(...SUN_TINT), _sv = new THREE.Vector3(), HAZE_BLUE = new THREE.Color(HAZE_BLUE_HEX);
  let t = 0, lastHemi = -1, lastSun = -1;
  return {
    gradePass,
    update(dt, sunDir, day) {
      t += dt;
      const wall = performance.now();
      if (!glassStart) glassStart = wall;
      if (wall - glassLast > 1500 && (wall - glassStart < 90000 || scene.children.length !== glassKids)) { glassLast = wall; glassKids = scene.children.length; fixGlass(); }
      // light balance: a little less sky fill and a little more sun, so shadows have shape (daylight.js sets both every frame, before this)
      // (daylight rewrites them only every 0.5 s, so scale only when it has just done so, never on our own value)
      if (high && hemi && sun) {
        if (hemi.intensity !== lastHemi) { hemi.intensity *= 0.55; lastHemi = hemi.intensity; }
        if (sun.intensity !== lastSun) { sun.intensity *= 1.38; sun.color.multiply(SUN_WARM); lastSun = sun.intensity; }
      }
      // haze: thinner and bluer by day, so distant towers keep their colour instead of washing to lavender-grey
      // (daylight.js rewrites the haze colour every half second; lerping toward a target is idempotent, so it cannot compound)
      if (high && scene.fog) {
        scene.fog.density = 0.0026 - 0.0010 * day;
        scene.fog.color.lerp(HAZE_BLUE, 0.35 * day * day);
      }
      hero.update(dt, camera.position.x, camera.position.z);
      dome.position.copy(camera.position);
      mat.uniforms.time.value = t;
      mat.uniforms.day.value = day;
      if (sunDir) mat.uniforms.sunDir.value.copy(sunDir);
      if (gradePass && sunDir) {
        _sv.copy(sunDir).multiplyScalar(2000).add(camera.position).project(camera);
        const facing = _sv.z < 1 ? 1 : 0;
        const gu = gradePass.uniforms;
        gu.sunUv.value = [_sv.x * 0.5 + 0.5, _sv.y * 0.5 + 0.5];
        gu.aspect.value = camera.aspect || 1.78;
        // visible only in front of the camera, only when the sun is up; stronger the closer to the middle of the frame
        const off = Math.hypot(_sv.x, _sv.y);
        gu.glare.value = facing * day * Math.max(0, 1 - off / 2.2) * 0.5;
      }
    },
  };
}
