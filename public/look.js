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

const GRADE = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.1 }, sat: { value: 1.2 }, vig: { value: 0.22 }, warm: { value: 0.035 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float contrast, sat, vig, warm; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);                         // richer colour
      c = (c - 0.5) * contrast + 0.5;                   // deeper shadows, cleaner highlights
      c += vec3(warm, warm * 0.4, -warm) * smoothstep(0.45, 1.0, l);          // warm sun on the lights
      c += vec3(-warm * 0.5, 0.0, warm * 0.7) * (1.0 - smoothstep(0.0, 0.4, l)); // cool shade
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

export function createLook({ THREE, scene, camera, renderer, high, worldInfo }) {
  if (new URLSearchParams(location.search).get("look") === "0") return { gradePass: null, update() {} };

  // (the scattering sky is left as world.js sets it: lowering turbidity/raising rayleigh made it paler, not bluer)

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

  let t = 0;
  return {
    gradePass,
    update(dt, sunDir, day) {
      t += dt;
      dome.position.copy(camera.position);
      mat.uniforms.time.value = t;
      mat.uniforms.day.value = day;
      if (sunDir) mat.uniforms.sunDir.value.copy(sunDir);
    },
  };
}
