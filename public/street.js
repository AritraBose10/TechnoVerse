// Street furniture and parked vehicles, shaped after what stands on Street Number 2:
//   - cars with real proportions (hatchback, sedan, compact SUV, the yellow Kolkata taxi): a body
//     drawn as a side profile with wheel arches and given rounded shoulders, a narrower cabin,
//     glass, lamps, grille, mirrors, number plates, alloy wheels, clear-coated paint
//   - the cast-iron style lamp posts with three lanterns along the university's railing
//   - tall galvanised street lights with twin LED heads along the carriageways
import * as THREE from "three";
import { mergeGeometries } from "/vendor/jsm/utils/BufferGeometryUtils.js";
import { picture } from "/pbr.js";
import { addInstanceCull } from "/instcull.js";

// ---------------------------------------------------------------- cars
const CARS = {
  //            length height wheelbase belt  hood  cowl   roofF  roofR  deck   ground wheel
  hatch: { L: 3.85, H: 1.5, wb: 2.45, belt: 0.92, hood: 0.86, cowl: 0.95, roofF: 0.35, roofR: -1.1, deck: -1.78, g: 0.2, r: 0.3, W: 1.7, tail: 0.95 },
  sedan: { L: 4.4, H: 1.47, wb: 2.6, belt: 0.9, hood: 0.84, cowl: 1.0, roofF: 0.4, roofR: -0.85, deck: -1.5, g: 0.19, r: 0.31, W: 1.72, tail: 0.88 },
  suv: { L: 4.3, H: 1.64, wb: 2.6, belt: 1.02, hood: 0.98, cowl: 1.05, roofF: 0.42, roofR: -1.45, deck: -2.02, g: 0.26, r: 0.34, W: 1.79, tail: 1.05 },
  taxi: { L: 4.3, H: 1.56, wb: 2.5, belt: 0.95, hood: 0.93, cowl: 0.95, roofF: 0.45, roofR: -0.7, deck: -1.35, g: 0.22, r: 0.31, W: 1.66, tail: 0.92 },
};
const shared = {};
function common() {
  if (shared.glass) return shared;
  shared.glass = new THREE.MeshStandardMaterial({ color: "#10171c", roughness: 0.06, metalness: 0.85, envMapIntensity: 1.3, side: THREE.DoubleSide });
  shared.tyre = new THREE.MeshStandardMaterial({ color: "#141414", roughness: 0.92 });
  shared.black = new THREE.MeshStandardMaterial({ color: "#17181a", roughness: 0.55 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: "#d9dcdf", roughness: 0.15, metalness: 1 });
  shared.head = new THREE.MeshStandardMaterial({ color: "#f3f6f8", roughness: 0.1, metalness: 0.6, emissive: "#cfd8e0", emissiveIntensity: 0.15 });
  shared.tail = new THREE.MeshStandardMaterial({ color: "#8f0f12", roughness: 0.25, emissive: "#5a0508", emissiveIntensity: 0.3 });
  shared.alloy = new THREE.MeshStandardMaterial({
    map: picture(128, 128, (g, w) => {
      g.fillStyle = "#101010";
      g.fillRect(0, 0, w, w);
      g.translate(w / 2, w / 2);
      g.fillStyle = "#b9bdc2";
      for (let i = 0; i < 5; i++) {
        g.rotate((Math.PI * 2) / 5);
        g.beginPath();
        g.moveTo(-9, 0);
        g.lineTo(-5, -50);
        g.lineTo(5, -50);
        g.lineTo(9, 0);
        g.fill();
      }
      g.strokeStyle = "#c9cdd2";
      g.lineWidth = 7;
      g.beginPath();
      g.arc(0, 0, 52, 0, 7);
      g.stroke();
      g.fillStyle = "#8d9197";
      g.beginPath();
      g.arc(0, 0, 13, 0, 7);
      g.fill();
    }),
    roughness: 0.3,
    metalness: 0.8,
  });
  shared.plate = (yellow, text) =>
    new THREE.MeshStandardMaterial({
      map: picture(256, 64, (g, w, h) => {
        g.fillStyle = yellow ? "#f2c81e" : "#f4f4f0";
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "#111";
        g.lineWidth = 4;
        g.strokeRect(3, 3, w - 6, h - 6);
        g.fillStyle = "#111";
        g.font = "700 40px Arial";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, w / 2, h / 2 + 2);
      }),
      roughness: 0.5,
    });
  return shared;
}

/** A parked car. Its nose points along the group's +x. type: hatch | sedan | suv | taxi. */
export function makeCar(type, color, { plate = "WB 02 AK 4127" } = {}) {
  const c = CARS[type];
  const S = common();
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 });
  const own = ownLights(S);
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const front = c.L / 2;
  const rear = -c.L / 2;
  const E = 0.055; // the rounded edge adds this much all round the drawn profile
  const fw = c.wb / 2 + 0.05; // front axle
  const rw = -c.wb / 2 + 0.05;
  const R = c.r + 0.07; // arch radius
  const wy = c.r;
  const bevel = 0.11;

  // ---- lower body: side profile with wheel arches, extruded across the width with rounded edges ----
  const body = new THREE.Shape();
  body.moveTo(rear + 0.12, c.g);
  body.lineTo(rw - R, c.g);
  body.lineTo(rw - R, wy);
  body.absarc(rw, wy, R, Math.PI, 0, true);
  body.lineTo(rw + R, c.g);
  body.lineTo(fw - R, c.g);
  body.lineTo(fw - R, wy);
  body.absarc(fw, wy, R, Math.PI, 0, true);
  body.lineTo(fw + R, c.g);
  body.lineTo(front - 0.14, c.g);
  body.quadraticCurveTo(front, c.g + 0.05, front, c.g + 0.3); // bumper
  body.quadraticCurveTo(front - 0.02, c.hood - 0.1, front - 0.22, c.hood - 0.04); // nose
  body.quadraticCurveTo((front + c.cowl) / 2, c.hood + 0.05, c.cowl, c.belt); // bonnet rises to the screen
  body.lineTo(c.deck, c.belt + 0.02);
  body.quadraticCurveTo(rear + 0.02, c.tail, rear, c.tail - 0.25); // tail
  body.quadraticCurveTo(rear - 0.01, c.g + 0.1, rear + 0.12, c.g);
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: c.W - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.05, bevelSegments: 4, curveSegments: 10 });
  bodyGeo.translate(0, 0, -(c.W - 2 * bevel) / 2);
  add(bodyGeo, paint);

  // ---- cabin: narrower than the body, pillars and roof in body colour ----
  const cw = c.W - 0.24;
  const cab = new THREE.Shape();
  cab.moveTo(c.cowl, c.belt - 0.02);
  cab.quadraticCurveTo(c.roofF + 0.12, c.H - 0.06, c.roofF - 0.1, c.H);
  cab.quadraticCurveTo((c.roofF + c.roofR) / 2, c.H + 0.03, c.roofR + 0.1, c.H - 0.01);
  cab.quadraticCurveTo(c.roofR - 0.08, c.H - 0.05, c.deck, c.belt);
  cab.lineTo(c.cowl, c.belt - 0.02);
  const cabGeo = new THREE.ExtrudeGeometry(cab, { depth: cw - 0.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.05, bevelSegments: 4, curveSegments: 10 });
  cabGeo.translate(0, 0, -(cw - 0.2) / 2);
  add(cabGeo, paint);

  // ---- glass ----
  // side windows: the cabin outline drawn in, split by the centre pillar
  const pts = cab.getPoints(10);
  const cxm = (c.cowl + c.deck) / 2;
  const cym = (c.belt + c.H) / 2;
  const inset = pts.map((p) => new THREE.Vector2(cxm + (p.x - cxm) * 0.86, Math.max(c.belt + 0.05, cym + (p.y - cym) * 0.8)));
  const sideGeo = new THREE.ShapeGeometry(new THREE.Shape(inset));
  for (const sgn of [1, -1]) {
    const m = add(sideGeo, S.glass, 0, 0, sgn * (cw / 2 + 0.004));
    m.castShadow = false;
    add(new THREE.BoxGeometry(0.09, c.H - c.belt - 0.08, 0.02), S.black, (c.roofF + c.roofR) / 2 + 0.1, (c.belt + c.H) / 2, sgn * (cw / 2 + 0.008)); // centre pillar
    // door seams and handles
    for (const x of [(c.roofF + c.roofR) / 2 + 0.1, c.cowl - 0.05, type === "hatch" ? c.deck + 0.55 : c.deck + 0.35]) add(new THREE.BoxGeometry(0.012, c.belt - c.g - 0.22, 0.01), S.black, x, (c.belt + c.g) / 2 + 0.06, sgn * (c.W / 2 + 0.001));
    for (const x of [c.cowl - 0.75, c.cowl - 1.7]) add(new THREE.BoxGeometry(0.16, 0.03, 0.03), S.chrome, x, c.belt - 0.12, sgn * (c.W / 2 + 0.005));
    // mirror
    add(new THREE.BoxGeometry(0.1, 0.11, 0.2), paint, c.cowl - 0.1, c.belt + 0.1, sgn * (c.W / 2 + 0.04));
    // lamps wrap the corners
    add(new THREE.BoxGeometry(0.3, 0.15, 0.4), S.head, front - 0.13 + E, c.hood - 0.2, sgn * (c.W / 2 - 0.25));
    add(new THREE.BoxGeometry(0.16, 0.22, 0.4), own.tail, rear + 0.055 - E, c.tail - 0.16, sgn * (c.W / 2 - 0.23));
    // amber indicators at the corners; +z is the car's right
    const ind = sgn > 0 ? own.indR : own.indL;
    add(new THREE.BoxGeometry(0.1, 0.05, 0.12), ind, front - 0.1 + E, c.hood - 0.32, sgn * (c.W / 2 - 0.12));
    add(new THREE.BoxGeometry(0.06, 0.06, 0.12), ind, rear + 0.04 - E, c.tail - 0.33, sgn * (c.W / 2 - 0.2));
  }
  // windscreen and rear glass: flat panes laid on the sloping surfaces
  const pane = (x0, y0, x1, y1, w) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    let nx = -(y1 - y0) / len;
    let ny = (x1 - x0) / len;
    if (ny < 0) (nx = -nx), (ny = -ny); // outward is upward
    const o = 0.085;
    const P = (x, y, z) => [x + nx * o, y + ny * o, z];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([...P(x0, y0, w / 2), ...P(x1, y1, w / 2), ...P(x1, y1, -w / 2), ...P(x0, y0, -w / 2)], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    add(geo, S.glass).castShadow = false;
  };
  pane(c.cowl - 0.06, c.belt + 0.07, c.roofF + 0.0, c.H - 0.09, cw - 0.24);
  pane(c.roofR - 0.02, c.H - 0.1, c.deck + 0.1, c.belt + 0.1, cw - 0.28);

  // ---- face and tail ----
  add(new THREE.BoxGeometry(0.06, 0.2, c.W * 0.5), S.black, front - 0.03 + E, c.g + 0.44, 0); // grille
  add(new THREE.BoxGeometry(0.05, 0.14, c.W * 0.62), S.black, front - 0.02 + E, c.g + 0.17, 0); // lower intake
  add(new THREE.BoxGeometry(0.02, 0.025, c.W * 0.46), S.chrome, front + 0.001 + E, c.g + 0.55, 0);
  const pm = S.plate(type === "taxi", plate);
  const fp = add(new THREE.PlaneGeometry(0.46, 0.115), pm, front + 0.012 + E, c.g + 0.3, 0);
  fp.rotation.y = Math.PI / 2;
  const rp = add(new THREE.PlaneGeometry(0.46, 0.115), pm, rear - 0.012 - E, c.tail - 0.36, 0);
  rp.rotation.y = -Math.PI / 2;
  add(new THREE.BoxGeometry(0.14, 0.22, c.W - 0.1), S.black, rear + 0.06, c.g + 0.12, 0); // rear bumper skirt
  if (type === "suv") {
    // cladding round the arches and sills, roof rails
    add(new THREE.BoxGeometry(c.wb - 2 * R + 0.02, 0.14, c.W + 0.02), S.black, 0.05, c.g + 0.07, 0);
    for (const sgn of [1, -1]) add(new THREE.BoxGeometry(c.roofF - c.roofR - 0.3, 0.035, 0.04), S.chrome, (c.roofF + c.roofR) / 2, c.H + 0.045, sgn * (cw / 2 - 0.16));
  }
  if (type === "taxi") {
    const sign = add(new THREE.BoxGeometry(0.34, 0.14, 0.6), new THREE.MeshStandardMaterial({ color: "#f6e9a8", emissive: "#f3d76a", emissiveIntensity: 0.25, roughness: 0.5 }), (c.roofF + c.roofR) / 2 + 0.2, c.H + 0.09, 0);
    sign.castShadow = true;
    for (const sgn of [1, -1]) add(new THREE.BoxGeometry(c.L * 0.72, 0.09, 0.006), new THREE.MeshStandardMaterial({ color: "#1f4fa0", roughness: 0.5 }), 0, c.belt - 0.3, sgn * (c.W / 2 + 0.002));
    add(new THREE.BoxGeometry(0.9, 0.03, cw - 0.3), S.black, (c.roofF + c.roofR) / 2 - 0.15, c.H + 0.035, 0); // luggage carrier
  }

  // ---- wheels ----
  const tyreGeo = new THREE.TorusGeometry(c.r - 0.085, 0.085, 10, 24);
  const wellGeo = new THREE.CylinderGeometry(c.r - 0.08, c.r - 0.08, 0.2, 20);
  const rimGeo = new THREE.CircleGeometry(c.r - 0.085, 24);
  for (const x of [fw, rw])
    for (const sgn of [1, -1]) {
      const z = sgn * (c.W / 2 - 0.13);
      add(tyreGeo, S.tyre, x, c.r, z);
      const well = add(wellGeo, S.black, x, c.r, z);
      well.rotation.x = Math.PI / 2;
      const rim = add(rimGeo, own.alloy, x, c.r, z + sgn * 0.102);
      if (sgn < 0) rim.rotation.y = Math.PI;
      rim.castShadow = false;
    }
  // the dark underside, so daylight does not show beneath the sills
  add(new THREE.BoxGeometry(c.L - 0.5, 0.1, c.W - 0.5), S.black, 0, c.g + 0.02, 0);
  consolidate(g);
  g.userData = { size: { L: c.L, W: c.W, H: c.H }, wheelR: c.r, axles: [fw, rw], paint, ...own };
  return g;
}

// Lights and wheels that change while driving belong to one vehicle: brake lights, indicators,
// and the wheel faces, whose picture turns as the wheels roll.
function ownLights(S) {
  const amber = () => new THREE.MeshStandardMaterial({ color: "#d98a1a", roughness: 0.3, emissive: "#ff9a1a", emissiveIntensity: 0 });
  const alloy = S.alloy.clone();
  alloy.map = S.alloy.map.clone();
  alloy.map.center.set(0.5, 0.5);
  alloy.map.needsUpdate = true;
  return { tail: S.tail.clone(), indL: amber(), indR: amber(), alloy };
}

// Many small parts drawn as one mesh per material: a car becomes about a dozen draws, not seventy.
function consolidate(g) {
  g.updateMatrixWorld(true);
  const byMat = new Map();
  for (const m of [...g.children]) {
    if (!m.isMesh || m.userData.keep) continue;
    let geo = m.geometry.clone();
    if (geo.index) geo = geo.toNonIndexed();
    geo.applyMatrix4(m.matrix);
    for (const key of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(key)) geo.deleteAttribute(key);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!byMat.has(m.material)) byMat.set(m.material, { list: [], cast: false });
    const entry = byMat.get(m.material);
    entry.list.push(geo);
    entry.cast ||= m.castShadow;
    g.remove(m);
  }
  for (const [mat, { list, cast }] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
}

// ---------------------------------------------------------------- auto rickshaw
/**
 * The three-wheeled auto rickshaw of Kolkata: green body, yellow trim, black canvas hood over a
 * steel frame, one wheel in front, a bench at the back. Nose along +x.
 * userData.rider: where the driver sits and holds the handlebar (in the vehicle's own frame).
 */
export function makeAuto({ plate = "WB 04 C 2231", body = "#1f7a3a", trim = "#e4c11e" } = {}) {
  const S = common();
  const own = ownLights(S);
  const g = new THREE.Group();
  const L = 2.65;
  const W = 1.3;
  const H = 1.72;
  const r = 0.2;
  const paint = new THREE.MeshPhysicalMaterial({ color: body, roughness: 0.4, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const yellow = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.45, metalness: 0.2 });
  const canvas = new THREE.MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.95, side: THREE.DoubleSide });
  const seat = new THREE.MeshStandardMaterial({ color: "#3a2c24", roughness: 0.8 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // floor pan and the rear body tub
  add(new THREE.BoxGeometry(L - 0.5, 0.12, W), paint, -0.15, 0.32, 0);
  const tub = new THREE.Shape();
  tub.moveTo(-1.32, 0.3);
  tub.lineTo(-1.32, 0.8);
  tub.quadraticCurveTo(-1.3, 0.92, -1.15, 0.92);
  tub.lineTo(-0.45, 0.92);
  tub.lineTo(-0.3, 0.55);
  tub.lineTo(-0.3, 0.3);
  const tubGeo = new THREE.ExtrudeGeometry(tub, { depth: W - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
  tubGeo.translate(0, 0, -(W - 0.08) / 2);
  add(tubGeo, paint);
  add(new THREE.BoxGeometry(0.9, 0.07, W + 0.02), yellow, -0.85, 0.94, 0); // yellow band round the tub
  // front cowl: rises from the nose to the windscreen
  const cowl = new THREE.Shape();
  cowl.moveTo(0.2, 0.3);
  cowl.lineTo(1.25, 0.3);
  cowl.quadraticCurveTo(1.33, 0.55, 1.22, 0.95);
  cowl.lineTo(0.95, 1.1);
  cowl.lineTo(0.9, 0.62);
  cowl.lineTo(0.2, 0.55);
  const cowlGeo = new THREE.ExtrudeGeometry(cowl, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3 });
  cowlGeo.translate(0, 0, -0.45);
  add(cowlGeo, paint);
  add(new THREE.BoxGeometry(0.06, 0.06, 1.0), yellow, 1.27, 0.62, 0); // yellow nose strip
  // windscreen and roof frame
  const wind = add(new THREE.PlaneGeometry(0.62, 1.0), S.glass, 0.98, 1.36, 0);
  wind.rotation.y = Math.PI / 2;
  wind.rotation.x = 0;
  wind.castShadow = false;
  const tube = (a, b, rad = 0.018, mat = yellow) => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const m = add(new THREE.CylinderGeometry(rad, rad, va.distanceTo(vb), 6), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  };
  for (const sz of [-1, 1]) {
    tube([0.97, 1.05, sz * 0.5], [0.95, H - 0.04, sz * 0.58]);
    tube([-1.25, 0.92, sz * 0.62], [-1.28, H - 0.06, sz * 0.62]);
    tube([-0.4, 0.92, sz * 0.62], [-0.38, H - 0.05, sz * 0.62]);
  }
  // canvas hood: a rounded roof with the sides rolled down at the back
  const hood = add(new THREE.CylinderGeometry(0.7, 0.7, 2.3, 16, 1, true, -1.1, 2.2), canvas, -0.18, H - 0.48, 0);
  hood.rotation.z = Math.PI / 2;
  hood.scale.set(1, 1, 0.95);
  add(new THREE.BoxGeometry(0.05, 0.7, W - 0.02), canvas, -1.3, 1.35, 0); // back curtain
  add(new THREE.BoxGeometry(2.3, 0.06, 0.04), yellow, -0.18, H - 0.06, 0.6);
  add(new THREE.BoxGeometry(2.3, 0.06, 0.04), yellow, -0.18, H - 0.06, -0.6);
  // seats
  add(new THREE.BoxGeometry(0.45, 0.1, 0.5), seat, 0.45, 0.82, 0); // driver
  add(new THREE.BoxGeometry(0.1, 0.36, 0.5), seat, 0.22, 1.0, 0);
  add(new THREE.BoxGeometry(0.5, 0.12, W - 0.15), seat, -0.95, 0.78, 0); // passenger bench
  add(new THREE.BoxGeometry(0.12, 0.45, W - 0.15), seat, -1.2, 1.08, 0);
  // handlebar
  tube([0.86, 0.95, 0], [0.8, 1.08, 0], 0.025, S.black);
  tube([0.8, 1.08, -0.3], [0.8, 1.08, 0.3], 0.018, S.black);
  // lamps
  const hl = add(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 14), S.head, 1.3, 0.78, 0);
  hl.rotation.z = Math.PI / 2;
  for (const sz of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.08, 0.08), own.tail, -1.34, 0.6, sz * 0.5);
    add(new THREE.BoxGeometry(0.06, 0.05, 0.06), sz > 0 ? own.indR : own.indL, 1.22, 0.98, sz * 0.4);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.06), sz > 0 ? own.indR : own.indL, -1.34, 0.72, sz * 0.5);
  }
  const pm = S.plate(true, plate);
  const rp = add(new THREE.PlaneGeometry(0.34, 0.1), pm, -1.35, 0.45, 0);
  rp.rotation.y = -Math.PI / 2;
  // wheels: one in front under the cowl, two at the back
  const tyreGeo = new THREE.TorusGeometry(r - 0.06, 0.06, 8, 20);
  const rimGeo = new THREE.CircleGeometry(r - 0.06, 18);
  const wheel = (x, z, sgn) => {
    add(tyreGeo, S.tyre, x, r, z);
    const rim = add(rimGeo, own.alloy, x, r, z + sgn * 0.065);
    if (sgn < 0) rim.rotation.y = Math.PI;
    rim.castShadow = false;
  };
  wheel(1.0, 0, 1);
  wheel(-0.85, 0.58, 1);
  wheel(-0.85, -0.58, -1);
  consolidate(g);
  g.userData = {
    size: { L, W, H },
    wheelR: r,
    axles: [1.0, -0.85],
    paint,
    ...own,
    rider: { saddle: [0.42, 0.88, 0], gripL: [0.8, 1.08, -0.28], gripR: [0.8, 1.08, 0.28], pegL: [0.95, 0.42, -0.16], pegR: [0.95, 0.42, 0.16] },
  };
  return g;
}

// ---------------------------------------------------------------- bus
/** A city bus in blue and white with a destination board. Doors on the left (-z). Nose along +x. */
export function makeBus({ plate = "WB 19 J 4410", route = "SECTOR V · HOWRAH STN", livery = ["#f2f2ee", "#1c4f9c", "#c8202a"] } = {}) {
  const S = common();
  const own = ownLights(S);
  const g = new THREE.Group();
  const L = 10.6;
  const W = 2.5;
  const H = 3.1;
  const r = 0.5;
  const [white, blue, red] = livery;
  const body = new THREE.MeshPhysicalMaterial({ color: white, roughness: 0.4, metalness: 0.3, clearcoat: 0.5 });
  const band = new THREE.MeshStandardMaterial({ color: blue, roughness: 0.45, metalness: 0.2 });
  const stripe = new THREE.MeshStandardMaterial({ color: red, roughness: 0.45 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(L, H - 0.45, W), body, 0, 0.45 + (H - 0.45) / 2, 0);
  add(new THREE.BoxGeometry(L + 0.02, 0.75, W + 0.02), band, 0, 0.8, 0); // skirt
  add(new THREE.BoxGeometry(L + 0.02, 0.1, W + 0.02), stripe, 0, 1.22, 0);
  add(new THREE.BoxGeometry(L - 0.4, 0.15, W - 0.3), S.black, 0, H + 0.07, 0); // roof rails / AC duct
  // window band down both sides, broken by pillars
  for (const sz of [-1, 1]) {
    const win = add(new THREE.PlaneGeometry(L - 1.6, 0.95), S.glass, -0.35, 2.05, sz * (W / 2 + 0.006));
    if (sz < 0) win.rotation.y = Math.PI;
    win.castShadow = false;
    for (let x = -L / 2 + 0.9; x < L / 2 - 1.2; x += 1.15) add(new THREE.BoxGeometry(0.08, 0.98, 0.02), body, x, 2.05, sz * (W / 2 + 0.01));
  }
  // doors on the left: front and middle
  for (const x of [L / 2 - 1.1, -0.6]) add(new THREE.BoxGeometry(0.95, 2.2, 0.03), S.glass, x, 1.55, -(W / 2 + 0.01));
  // windscreen, destination board, lamps, bumper
  add(new THREE.BoxGeometry(0.03, 1.15, W - 0.2), S.glass, L / 2 + 0.005, 1.95, 0);
  const board = new THREE.MeshStandardMaterial({
    map: picture(512, 64, (c, w, h) => {
      c.fillStyle = "#0b0b0b";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#ffb21e";
      c.font = "700 36px Arial";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(route, w / 2, h / 2 + 2);
    }),
    emissive: "#ffb21e",
    emissiveIntensity: 0.15,
    roughness: 0.4,
  });
  const b = add(new THREE.PlaneGeometry(W - 0.4, 0.3), board, L / 2 + 0.02, H - 0.22, 0);
  b.rotation.y = Math.PI / 2;
  add(new THREE.BoxGeometry(0.2, 0.3, W + 0.04), S.black, L / 2 + 0.05, 0.55, 0);
  add(new THREE.BoxGeometry(0.2, 0.3, W + 0.04), S.black, -L / 2 - 0.05, 0.55, 0);
  for (const sz of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.16, 0.34), S.head, L / 2 + 0.02, 0.95, sz * 0.9);
    add(new THREE.BoxGeometry(0.05, 0.3, 0.18), own.tail, -L / 2 - 0.02, 1.0, sz * 1.0);
    add(new THREE.BoxGeometry(0.05, 0.1, 0.12), sz > 0 ? own.indR : own.indL, L / 2 + 0.02, 0.95, sz * 1.12);
    add(new THREE.BoxGeometry(0.05, 0.12, 0.14), sz > 0 ? own.indR : own.indL, -L / 2 - 0.02, 1.25, sz * 1.0);
    add(new THREE.BoxGeometry(0.4, 0.06, 0.05), S.black, L / 2 - 0.2, 2.3, sz * (W / 2 + 0.25)); // mirror arm
    add(new THREE.BoxGeometry(0.06, 0.32, 0.18), S.black, L / 2 - 0.05, 2.15, sz * (W / 2 + 0.35));
  }
  add(new THREE.BoxGeometry(0.03, 2.6, W - 0.04), body, -L / 2 - 0.01, 1.85, 0); // back
  add(new THREE.BoxGeometry(0.02, 0.8, W - 0.5), S.glass, -L / 2 - 0.025, 2.25, 0);
  const pm = S.plate(false, plate);
  for (const [x, ry] of [[L / 2 + 0.16, Math.PI / 2], [-L / 2 - 0.16, -Math.PI / 2]]) {
    const p = add(new THREE.PlaneGeometry(0.5, 0.12), pm, x, 0.55, 0);
    p.rotation.y = ry;
  }
  const tyreGeo = new THREE.TorusGeometry(r - 0.13, 0.13, 10, 24);
  const rimGeo = new THREE.CircleGeometry(r - 0.13, 20);
  for (const x of [L / 2 - 2.3, -L / 2 + 2.4])
    for (const sz of [-1, 1]) {
      add(tyreGeo, S.tyre, x, r, sz * (W / 2 - 0.2));
      const rim = add(rimGeo, own.alloy, x, r, sz * (W / 2 - 0.2 + 0.135));
      if (sz < 0) rim.rotation.y = Math.PI;
      rim.castShadow = false;
    }
  add(new THREE.BoxGeometry(L - 0.4, 0.3, W - 0.4), S.black, 0, 0.35, 0);
  consolidate(g);
  g.userData = { size: { L, W, H }, wheelR: r, axles: [L / 2 - 2.3, -L / 2 + 2.4], paint: body, ...own };
  return g;
}

/** 0 by day, 1 at night: headlamps and tail lamps of every car, auto and bus come on. */
export function setVehicleNight(k) {
  const S = common();
  S.head.emissiveIntensity = 0.15 + k * 3.2;
  S.tail.emissiveIntensity = 0.3 + k * 0.9;
}

// ---------------------------------------------------------------- lamps
function instanced(scene, parts, spots) {
  const dummy = new THREE.Object3D();
  for (const [geo, mat, cast] of parts) {
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach((s, i) => {
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(0, s.yaw || 0, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.castShadow = cast;
    im.receiveShadow = true;
    scene.add(im);
    addInstanceCull(im, spots.map((s) => s.x), spots.map((s) => s.z));
  }
}
const place = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
  geo.rotateX(rx);
  geo.rotateZ(rz);
  geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
};

/** Cast-iron style posts with three lanterns: one on top, two on scrolled arms. spots: [{x, z, yaw}] */
export function heritageLamps(scene, spots) {
  const iron = new THREE.MeshStandardMaterial({ color: "#d6d7d3", roughness: 0.5, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: "#f4efe0", roughness: 0.25, emissive: "#ffe9b8", emissiveIntensity: 0.3, transparent: true, opacity: 0.92 });
  const ironParts = [];
  const glassParts = [];
  // base, shaft with collars
  ironParts.push(place(new THREE.CylinderGeometry(0.17, 0.22, 0.25, 10), 0, 0.125, 0));
  ironParts.push(place(new THREE.CylinderGeometry(0.11, 0.16, 0.9, 10), 0, 0.7, 0));
  ironParts.push(place(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 10), 0, 1.18, 0));
  ironParts.push(place(new THREE.CylinderGeometry(0.05, 0.085, 2.9, 10), 0, 2.65, 0));
  ironParts.push(place(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), 0, 3.5, 0));
  ironParts.push(place(new THREE.CylinderGeometry(0.04, 0.05, 0.75, 8), 0, 4.45, 0));
  const lantern = (x, y) => {
    ironParts.push(place(new THREE.CylinderGeometry(0.07, 0.05, 0.08, 6), x, y, 0)); // cup
    glassParts.push(place(new THREE.CylinderGeometry(0.19, 0.12, 0.38, 6), x, y + 0.23, 0));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const bar = new THREE.CylinderGeometry(0.008, 0.008, 0.39, 4);
      bar.rotateZ(Math.sin(a) > 0 ? -0.18 * Math.abs(Math.sin(a)) : 0.18 * Math.abs(Math.sin(a)));
      ironParts.push(place(bar, x + Math.sin(a) * 0.155, y + 0.23, Math.cos(a) * 0.155));
    }
    ironParts.push(place(new THREE.ConeGeometry(0.25, 0.2, 6), x, y + 0.52, 0)); // roof
    ironParts.push(place(new THREE.SphereGeometry(0.035, 6, 5), x, y + 0.65, 0)); // finial
  };
  lantern(0, 4.82);
  // scrolled arms
  for (const sgn of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 3.55, 0), new THREE.Vector3(sgn * 0.3, 3.9, 0), new THREE.Vector3(sgn * 0.62, 3.75, 0), new THREE.Vector3(sgn * 0.7, 3.9, 0)]);
    ironParts.push(new THREE.TubeGeometry(curve, 12, 0.022, 6));
    const scroll = new THREE.TorusGeometry(0.11, 0.015, 5, 12, Math.PI * 1.5);
    ironParts.push(place(scroll, sgn * 0.32, 3.72, 0));
    lantern(sgn * 0.7, 3.92);
  }
  const strip = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute("uv"), g)));
  instanced(scene, [[strip(ironParts), iron, true], [strip(glassParts), glass, false]], spots);
  return glass; // the lantern glass: lit at night (see daylight.js)
}

/** Tall galvanised street light with twin LED heads reaching over the road. yaw turns the arm. */
export function streetLights(scene, spots) {
  const galv = new THREE.MeshStandardMaterial({ color: "#9a9fa3", roughness: 0.55, metalness: 0.7 });
  const lens = new THREE.MeshStandardMaterial({ color: "#f5f7f8", roughness: 0.3, emissive: "#e8f0ff", emissiveIntensity: 0.25 });
  const parts = [];
  parts.push(place(new THREE.BoxGeometry(0.34, 0.5, 0.34), 0, 0.25, 0)); // concrete-cased foot (painted)
  parts.push(place(new THREE.CylinderGeometry(0.075, 0.11, 4.2, 8), 0, 2.6, 0));
  parts.push(place(new THREE.CylinderGeometry(0.05, 0.075, 4.3, 8), 0, 6.85, 0));
  const lenses = [];
  for (const [len, y] of [[2.2, 9.0], [1.4, 8.3]]) {
    // arm rises slightly toward its tip, along +x
    const arm = new THREE.CylinderGeometry(0.035, 0.04, len, 6);
    parts.push(place(arm, len / 2 - 0.02, y + len * 0.07, 0, 0, 0, -Math.PI / 2 + 0.14));
    parts.push(place(new THREE.BoxGeometry(0.62, 0.09, 0.26), len + 0.2, y + len * 0.14, 0));
    lenses.push(place(new THREE.BoxGeometry(0.5, 0.02, 0.2), len + 0.2, y + len * 0.14 - 0.055, 0));
  }
  parts.push(place(new THREE.BoxGeometry(0.2, 0.34, 0.14), 0, 2.2, 0.12)); // junction box
  const strip = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute("uv"), g)));
  instanced(scene, [[strip(parts), galv, true], [strip(lenses), lens, false]], spots);
  return lens;
}
