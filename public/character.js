// The main player's character: a detailed rigged human.
//  - Motion-captured idle, walk and run, blended by ground speed with the stride matched to the
//    speed so the feet do not slide.
//  - Feet are placed on the real ground (steps, kerbs) with leg IK; knees bend only as a hinge.
//  - Head and eyes turn toward people nearby, within the limits of a human neck.
//  - Face: smile and mouth movement (the model has those two face controls; it has no blink).
//  - Outfit: navy and white diagonal polo with a red chest logo, dark trousers.
// The body is models/avatar.glb. The animations come from models/anims.glb, which has the same
// bones in a different resting pose, so each animation is converted when it loads.
import * as THREE from "three";
import { GLTFLoader } from "/vendor/jsm/loaders/GLTFLoader.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);
const lerpN = (a, b, t) => a + (b - a) * t;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const cleanName = (n) => n.replace(/^mixamorig:?/, "");

// Which child a bone "points at". Used to line up the two skeletons' resting poses.
const POINTS_AT = { Hips: "Spine", Spine: "Spine1", Spine1: "Spine2", Spine2: "Neck", Neck: "Head", Head: "HeadTop_End", LeftHand: "LeftHandMiddle1", RightHand: "RightHandMiddle1" };

function dressInUniform(model) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name;
    if (name === "Wolf3D_Headwear" || name === "Wolf3D_Beard") o.visible = false;
    if (name === "Wolf3D_Outfit_Bottom") {
      o.material.map = null;
      o.material.color.set("#1d212b");
      o.material.roughness = 0.85;
    }
    if (name === "Wolf3D_Outfit_Top") {
      // Colours are decided from where each point sits on the body in its resting pose, so the
      // diagonal stays put on the shirt while the character moves.
      const m = o.material;
      m.map = null;
      m.color.set("#ffffff");
      m.roughness = 0.9;
      m.metalness = 0;
      m.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vRestPos;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRestPos = position;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vRestPos;")
          .replace(
            "#include <map_fragment>",
            `
            if (vRestPos.y < 0.9 && abs(vRestPos.x) < 0.3) discard; // shirt hem at the hips
            vec3 navy = vec3(0.012, 0.018, 0.05);
            vec3 offWhite = vec3(0.82, 0.8, 0.76);
            // diagonal from the wearer's right shoulder down to the left hip
            float side = dot(vRestPos.xy - vec2(-0.075, 1.5), vec2(0.897, 0.441));
            vec3 shirt = mix(navy, offWhite, smoothstep(-0.004, 0.004, side));
            // round red logo on the left chest with a white mark
            vec2 badge = vRestPos.xy - vec2(0.088, 1.385);
            if (vRestPos.z > 0.02 && length(badge) < 0.034) {
              shirt = vec3(0.66, 0.02, 0.03);
              vec2 q = vec2(badge.x + badge.y * 0.25, badge.y);
              bool stem = abs(q.x + 0.004) < 0.0045 && q.y > -0.02 && q.y < 0.02;
              bool bar = abs(q.y - 0.006) < 0.004 && q.x > -0.016 && q.x < 0.012;
              bool foot = abs(q.y + 0.018) < 0.0035 && q.x > -0.004 && q.x < 0.014;
              if (stem || bar || foot) shirt = vec3(0.9);
            }
            diffuseColor.rgb = shirt;
            `,
          );
      };
      m.needsUpdate = true;
    }
  });
}

export async function loadHero(renderer) {
  const loader = new GLTFLoader();
  const [avatar, anims] = await Promise.all([loader.loadAsync("/models/avatar.glb"), loader.loadAsync("/models/anims.glb")]);
  const model = avatar.scene;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const faces = []; // meshes that carry the face controls
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // animated meshes move outside their resting bounds
    for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap"]) if (o.material[key]) o.material[key].anisotropy = maxAniso;
    o.material.envMapIntensity = 0.8;
    if (o.morphTargetDictionary && "mouthSmile" in o.morphTargetDictionary) faces.push(o);
  });
  dressInUniform(model);

  // A holder around the model lets the whole figure lean without disturbing the skeleton. It is
  // turned around further down, after the animations are converted (the model faces +z, the game's
  // "forward" is -z). Check in the browser with __tiu.facingCheck(): dot should be near +1.
  const holder = new THREE.Group();
  holder.add(model);

  // ---------- convert the animations to this skeleton ----------
  model.updateMatrixWorld(true);
  anims.scene.updateMatrixWorld(true);
  const sourceBones = new Map();
  anims.scene.traverse((o) => sourceBones.set(cleanName(o.name), o));
  // Resting position and rotation of every bone, from the skin's bind pose.
  function restPose(root) {
    const pos = new Map();
    const rot = new Map();
    root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.skeleton.bones.forEach((bone, i) => {
        if (pos.has(bone)) return;
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        new THREE.Matrix4().copy(o.skeleton.boneInverses[i]).invert().decompose(p, q, new THREE.Vector3());
        pos.set(bone, p);
        rot.set(bone, q);
      });
    });
    return {
      rot: (o) => (rot.get(o) || o.getWorldQuaternion(new THREE.Quaternion())).clone(),
      pos: (o) => (pos.get(o) || o.getWorldPosition(new THREE.Vector3())).clone(),
    };
  }
  const src = restPose(anims.scene);
  const dst = restPose(model);
  const childToward = (bone, lookup) => {
    const want = POINTS_AT[cleanName(bone.name)];
    const kids = bone.children.filter((c) => c.isBone);
    return want ? lookup(want) : kids.length === 1 ? kids[0] : null;
  };
  // Constant correction for one bone: undo the source's resting rotation, swing the avatar's bone to
  // point the way the source's does (arms down vs arms out), then apply the avatar's resting rotation.
  function correctionOf(source, target) {
    const c = src.rot(source).invert();
    const sChild = source.isBone && childToward(source, (n) => sourceBones.get(n));
    const tChild = target.isBone && childToward(target, (n) => model.getObjectByName(n));
    if (sChild && tChild) {
      const sDir = src.pos(sChild).sub(src.pos(source)).normalize();
      const tDir = dst.pos(tChild).sub(dst.pos(target)).normalize();
      c.multiply(new THREE.Quaternion().setFromUnitVectors(tDir, sDir));
    }
    return c.multiply(dst.rot(target));
  }
  const corrections = new Map();
  const correction = (source, target) => {
    if (!corrections.has(target)) corrections.set(target, correctionOf(source, target));
    return corrections.get(target);
  };
  const hips = model.getObjectByName("Hips");
  const hipsRest = hips.position.clone();
  const clips = {};
  for (const clip of anims.animations) {
    if (!["idle", "walk", "run"].includes(clip.name)) continue;
    const tracks = [];
    for (const track of clip.tracks) {
      const [boneName, prop] = track.name.split(".");
      const name = cleanName(boneName);
      const target = model.getObjectByName(name);
      const source = sourceBones.get(name);
      if (!target || !source) continue;
      if (prop === "quaternion") {
        const own = correction(source, target);
        const parentInv = correction(source.parent, target.parent).clone().invert();
        const values = new Float32Array(track.values.length);
        const q = new THREE.Quaternion();
        for (let i = 0; i < values.length; i += 4) {
          q.fromArray(track.values, i).premultiply(parentInv).multiply(own).normalize();
          q.toArray(values, i);
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, track.times, values));
      } else if (prop === "position" && name === "Hips") {
        // Keep the up-and-down and side-to-side sway of the hips, but not the travel forward.
        const parentQuat = source.parent.getWorldQuaternion(new THREE.Quaternion());
        const parentScale = source.parent.getWorldScale(new THREE.Vector3());
        const mean = new THREE.Vector3();
        for (let i = 0; i < track.values.length; i += 3) mean.add(new THREE.Vector3().fromArray(track.values, i));
        mean.multiplyScalar(3 / track.values.length);
        const v = new THREE.Vector3();
        const values = new Float32Array(track.values.length);
        for (let i = 0; i < values.length; i += 3) {
          v.fromArray(track.values, i).sub(mean).multiply(parentScale).applyQuaternion(parentQuat);
          values[i] = hipsRest.x + v.x;
          values[i + 1] = hipsRest.y + v.y - 0.02;
          values[i + 2] = hipsRest.z;
        }
        tracks.push(new THREE.VectorKeyframeTrack("Hips.position", track.times, values));
      }
    }
    clips[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  // Short dark hair (the model's own headwear is hidden), fixed to the head bone.
  {
    const headBone = model.getObjectByName("Head");
    const geo = new THREE.SphereGeometry(0.106, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const hair = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#17120f", roughness: 0.95 }));
    hair.scale.set(1.0, 0.94, 1.14);
    hair.castShadow = true;
    const inv = dst.rot(headBone).invert();
    hair.position.copy(new THREE.Vector3(0, 1.728, 0.012).sub(dst.pos(headBone)).applyQuaternion(inv));
    hair.quaternion.copy(inv).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.68));
    headBone.add(hair);
  }

  holder.rotation.y = Math.PI; // must come after the conversion above, which measures world rotations

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [name, clip] of Object.entries(clips)) {
    actions[name] = mixer.clipAction(clip);
    actions[name].play();
    actions[name].setEffectiveWeight(name === "idle" ? 1 : 0);
  }
  actions.walk.timeScale = actions.run.timeScale = 0; // their timing is driven by ground speed below

  const bone = (n) => model.getObjectByName(n);
  const legs = [
    { up: bone("LeftUpLeg"), knee: bone("LeftLeg"), foot: bone("LeftFoot"), lift: 0 },
    { up: bone("RightUpLeg"), knee: bone("RightLeg"), foot: bone("RightFoot"), lift: 0 },
  ];
  const spine = bone("Spine");
  const chest = bone("Spine1");
  const arms = [bone("LeftArm"), bone("RightArm")];
  const forearms = [bone("LeftForeArm"), bone("RightForeArm")];
  const hands = [bone("LeftHand"), bone("RightHand")];
  const neck = bone("Neck");
  const head = bone("Head");
  const eyes = [bone("LeftEye"), bone("RightEye")].filter(Boolean);
  const eyeRest = eyes.map((e) => e.quaternion.clone());

  // How fast each clip "walks": the speed at which the planted foot travels backward under the body.
  function strideSpeed(name) {
    const clip = clips[name];
    const action = actions[name];
    for (const a of Object.values(actions)) a.setEffectiveWeight(a === action ? 1 : 0);
    const samples = 60;
    const step = clip.duration / samples;
    const track = legs.map(() => []);
    const p = new THREE.Vector3();
    for (let i = 0; i <= samples; i++) {
      action.time = step * i;
      mixer.update(0);
      model.updateMatrixWorld(true);
      legs.forEach((leg, k) => {
        leg.foot.getWorldPosition(p);
        track[k].push([p.y, p.z]);
      });
    }
    // a foot counts as planted while it is within a few centimetres of its lowest point
    const speeds = [];
    for (const samplesOfFoot of track) {
      const lowest = Math.min(...samplesOfFoot.map((v) => v[0]));
      for (let i = 1; i < samplesOfFoot.length; i++) {
        if (samplesOfFoot[i][0] < lowest + 0.05 && samplesOfFoot[i - 1][0] < lowest + 0.05) speeds.push(Math.abs(samplesOfFoot[i][1] - samplesOfFoot[i - 1][1]) / step);
      }
    }
    speeds.sort((x, y) => y - x);
    const top = speeds.slice(0, Math.max(2, Math.ceil(speeds.length * 0.5)));
    return Math.max(0.5, top[Math.floor(top.length / 2)] || 1);
  }
  const walkSpeed = strideSpeed("walk");
  const runSpeed = strideSpeed("run");
  for (const [name, a] of Object.entries(actions)) a.setEffectiveWeight(name === "idle" ? 1 : 0);
  actions.walk.time = actions.run.time = 0;

  // ---------- per-frame state ----------
  let phase = 0; // position in the stride, 0..1
  let pelvisDrop = 0;
  let lean = 0;
  let lookYaw = 0;
  let lookPitch = 0;
  let smile = 0.1;
  let mouth = 0;
  let glance = { yaw: 0, pitch: 0, until: 0 };
  let clock = 0;
  // jump pose, eased toward its targets each frame (radians, except crouch)
  const jp = { spine: 0, arms: 0, elbows: 0, thigh: 0, knee: 0, toes: 0 };
  let leapPhase = null; // stride position frozen at take-off for running leaps

  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const qc = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  // Turn a bone by a rotation given in world space.
  function turnInWorld(b, worldRotation) {
    b.parent.getWorldQuaternion(qa);
    b.getWorldQuaternion(qb);
    b.quaternion.copy(qa.invert()).multiply(worldRotation).multiply(qb);
    b.updateMatrixWorld(true);
  }
  // Two-bone leg solver: moves the ankle to `target` by rotating the hip and bending the knee in the
  // plane it already bends in. The knee works as a hinge and the leg never stretches past its length.
  function solveLeg(leg, target) {
    solveChain(leg.up, leg.knee, leg.foot, target);
  }
  // The same two-bone solver for any limb: root (hip/shoulder), hinge (knee/elbow), end (ankle/wrist).
  function solveChain(upBone, midBone, endBone, target) {
    const leg = { up: upBone, knee: midBone, foot: endBone };
    const a = leg.up.getWorldPosition(new THREE.Vector3());
    const b = leg.knee.getWorldPosition(new THREE.Vector3());
    const c = leg.foot.getWorldPosition(new THREE.Vector3());
    const footWorld = leg.foot.getWorldQuaternion(new THREE.Quaternion());
    const lab = a.distanceTo(b);
    const lcb = b.distanceTo(c);
    const lat = clamp(a.distanceTo(target), 0.05, lab + lcb - 0.004);
    const ac = v1.copy(c).sub(a).normalize();
    const ab = v2.copy(b).sub(a).normalize();
    const at = v3.copy(target).sub(a).normalize();
    const hipNow = Math.acos(clamp(ac.dot(ab), -1, 1));
    const kneeNow = Math.acos(clamp(new THREE.Vector3().copy(a).sub(b).normalize().dot(new THREE.Vector3().copy(c).sub(b).normalize()), -1, 1));
    const swing = Math.acos(clamp(ac.dot(at), -1, 1));
    const hipWant = Math.acos(clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1));
    const kneeWant = Math.acos(clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));
    const bendAxis = new THREE.Vector3().crossVectors(ac, ab);
    if (bendAxis.lengthSq() < 1e-6) bendAxis.set(1, 0, 0).applyQuaternion(holder.getWorldQuaternion(qa));
    bendAxis.normalize();
    const swingAxis = new THREE.Vector3().crossVectors(ac, at);
    const upWorldInv = leg.up.getWorldQuaternion(new THREE.Quaternion()).invert();
    const kneeWorldInv = leg.knee.getWorldQuaternion(new THREE.Quaternion()).invert();
    const r0 = new THREE.Quaternion().setFromAxisAngle(bendAxis.clone().applyQuaternion(upWorldInv), hipWant - hipNow);
    const r1 = new THREE.Quaternion().setFromAxisAngle(bendAxis.clone().applyQuaternion(kneeWorldInv), kneeWant - kneeNow);
    leg.up.quaternion.multiply(r0);
    if (swingAxis.lengthSq() > 1e-8) leg.up.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(swingAxis.normalize().applyQuaternion(upWorldInv), swing));
    leg.knee.quaternion.multiply(r1);
    leg.up.updateMatrixWorld(true);
    // keep the foot at the angle the animation gave it
    leg.foot.quaternion.copy(leg.knee.getWorldQuaternion(qa).invert()).multiply(footWorld);
    leg.foot.updateMatrixWorld(true);
  }

  // ---------- riding a bicycle ----------
  // Seated on the saddle, hands on the grips, feet on the pedals following the cranks, trunk
  // inclined forward (more when sprinting), head up to see the road. At a stop the left foot comes
  // down to the ground.
  let riding = false;
  const footFlat = legs.map(() => new THREE.Quaternion());
  function ride(dt, s) {
    const r = s.ride;
    riding = true;
    actions.idle.setEffectiveWeight(1);
    actions.walk.setEffectiveWeight(0);
    actions.run.setEffectiveWeight(0);
    mixer.update(dt);
    holder.rotation.set(0, Math.PI, 0);
    holder.position.set(0, 0, 0);
    holder.parent.updateMatrixWorld(true);
    // standing pose's feet: flat, pointing forward; kept to give the feet their angle on the pedals
    legs.forEach((leg, i) => leg.foot.getWorldQuaternion(footFlat[i]));
    // sit: move the whole figure so the pelvis rests on the saddle
    hips.getWorldPosition(v1);
    const seat = v2.copy(r.saddle).addScaledVector(r.up, 0.085).addScaledVector(r.back, 0.03);
    const parent = holder.parent;
    holder.position.add(parent.worldToLocal(seat.clone()).sub(parent.worldToLocal(v1.clone())));
    holder.updateMatrixWorld(true);
    const turn = (b, angle, axis = r.right) => {
      if (Math.abs(angle) > 1e-4) turnInWorld(b, qc.setFromAxisAngle(axis, angle));
    };
    // trunk forward over the bars; a sprinting rider gets lower
    const bend = 0.42 + 0.2 * r.effort;
    turn(spine, -bend * 0.55);
    turn(chest, -bend * 0.45);
    turn(neck, bend * 0.5);
    turn(head, bend * 0.35 + 0.05);
    // arms: reach forward with a soft elbow, then the wrists go to the grips
    arms.forEach((arm, i) => {
      turn(arm, 1.05);
      turn(forearms[i], 0.45);
      const grip = i === 0 ? r.gripL : r.gripR;
      solveChain(arm, forearms[i], hands[i], v3.copy(grip).addScaledVector(r.back, 0.05).addScaledVector(r.up, 0.02));
    });
    // legs: knees forward, ankles over the pedals (ball of the foot on the pedal)
    legs.forEach((leg, i) => {
      turn(leg.up, 1.25);
      turn(leg.knee, -1.5);
      const pedal = i === 0 ? r.pedalL : r.pedalR;
      const onPedal = v3.copy(pedal).addScaledVector(r.up, 0.075).addScaledVector(r.back, 0.07);
      if (i === 0 && r.footDown > 0.01) onPedal.lerp(r.groundL, r.footDown);
      solveChain(leg.up, leg.knee, leg.foot, onPedal);
      // foot angle: flat, with the toes dipping a little through the down-stroke (ankling)
      leg.foot.quaternion.copy(leg.knee.getWorldQuaternion(qa).invert()).multiply(footFlat[i]);
      leg.foot.updateMatrixWorld(true);
      turn(leg.foot, -0.12 - 0.12 * Math.sin(r.crank + (i === 0 ? Math.PI : 0)));
    });
    // face: concentrating a little when sprinting
    smile += (0.15 - 0.1 * r.effort - smile) * ease(dt, 3);
    for (const f of faces) f.morphTargetInfluences[f.morphTargetDictionary.mouthSmile] = clamp(smile, 0, 1);
  }

  return {
    model: holder,
    stride: { walkSpeed, runSpeed },
    /**
     * @param dt seconds since the last frame
     * @param s  speed (m/s over the ground), grounded, turnRate (radians a second), facing (radians),
     *           lookAt (world point or null), talk (0..1 mouth opening), friendly (true when someone is close),
     *           groundAt(x, z, fromY) -> height of the ground there, or null
     */
    update(dt, s) {
      clock += dt;
      if (s.ride) {
        ride(dt, s);
        return;
      }
      if (riding) {
        riding = false;
        holder.position.set(0, 0, 0);
      }
      const jump = s.jump || {};
      // ---- walking and running, blended by speed ----
      const moving = smoothstep(0.1, 0.9, s.speed);
      const running = smoothstep(walkSpeed * 1.6, runSpeed * 0.85, s.speed);
      // A standing jump is two-footed: the legs come together (idle stance) rather than mid-stride.
      const together = jump.phase && jump.phase !== "land" ? 1 - (jump.run || 0) : 0;
      const stride = moving * (1 - together);
      actions.idle.setEffectiveWeight(1 - stride);
      actions.walk.setEffectiveWeight(stride * (1 - running));
      actions.run.setEffectiveWeight(stride * running);
      const metresPerStride = THREE.MathUtils.lerp(walkSpeed * clips.walk.duration, runSpeed * clips.run.duration, running);
      const airborne = jump.phase === "air" && !s.grounded;
      let pace = s.grounded ? clamp(s.speed / metresPerStride, 0.45 / clips.walk.duration, 1.5 / clips.run.duration) : 0.25;
      if (airborne) {
        // In flight the legs hold the shape they left the ground in: a split stride off a run,
        // feet together from standing. The stride clock does not run.
        if (leapPhase === null) leapPhase = phase;
        pace = 0;
      } else leapPhase = null;
      phase = (phase + dt * pace) % 1;
      actions.walk.time = phase * clips.walk.duration;
      actions.run.time = phase * clips.run.duration;
      mixer.update(dt);

      // ---- lean into turns ----
      lean += (clamp(-s.turnRate * 0.035 * clamp(s.speed / 4, 0, 1.4), -0.16, 0.16) - lean) * ease(dt, 6);
      holder.rotation.z = lean;
      holder.rotation.x = -0.04 * running;
      holder.parent?.updateMatrixWorld(true);

      // ---- jumping, as a person does it ----
      // Rotations are about the body's left-right axis. Positive swings a hanging arm or thigh
      // forward; negative leans the trunk forward and points the toes.
      {
        const standing = 1 - (jump.run || 0);
        const want = { spine: 0, arms: 0, elbows: 0, thigh: 0, knee: 0, toes: 0 };
        const depth = Math.max(0.05, jump.crouch || 0);
        if (jump.phase === "prep") {
          const down = jump.t < 0.68;
          const k = clamp((jump.crouch || 0) / 0.17, 0, 1);
          want.spine = -0.5 * k * (0.4 + 0.6 * standing); // trunk folds forward over the knees
          // arms swing back on the way down, then drive forward and up with the push
          want.arms = down ? -0.85 * k * (0.3 + 0.7 * standing) : lerpN(-0.85, 1.6, smoothstep(0.68, 1, jump.t)) * (0.3 + 0.7 * standing);
          want.elbows = 0.35;
          want.toes = down ? 0 : -0.45 * smoothstep(0.75, 1, jump.t); // up onto the toes
        } else if (airborne) {
          const v0 = Math.max(0.5, jump.launchV || 3);
          const rise = clamp((s.jump.vy || 0) / v0, -1.4, 1); // 1 at take-off, 0 at the top, < 0 falling
          const nearTop = 1 - Math.min(1, Math.abs(rise));
          want.spine = -0.12;
          // arms lead the take-off forward and up, then settle lower to balance for the landing
          want.arms = (rise > 0 ? 1.2 * rise + 0.8 * nearTop : 0.8 + 0.4 * rise) * (0.35 + 0.65 * standing);
          want.elbows = 0.4;
          // knees draw up a little around the top, then the legs reach for the ground
          want.thigh = (0.55 * nearTop + (rise < 0 ? 0.25 : 0)) * standing + 0.15 * nearTop;
          want.knee = (0.95 * nearTop + (rise < 0 ? 0.35 : 0)) * standing + 0.3 * nearTop;
          want.toes = rise > 0.3 ? -0.5 * rise : 0.12; // pointed after push-off, flexed to land
        } else if (jump.phase === "land") {
          const k = clamp((jump.crouch || 0) / 0.2, 0, 1.6);
          want.spine = -0.42 * k;
          want.arms = 0.55 * k; // arms forward for balance
          want.elbows = 0.5 * k;
        }
        const rate = jump.phase === "prep" || jump.phase === "land" ? 30 : 12;
        for (const key in jp) jp[key] += (want[key] - jp[key]) * ease(dt, rate);
        const right = v1.set(1, 0, 0).applyAxisAngle(UP, s.facing).clone();
        const turn = (b, angle) => {
          if (Math.abs(angle) > 1e-3) turnInWorld(b, qc.setFromAxisAngle(right, angle));
        };
        turn(spine, jp.spine * 0.6);
        turn(chest, jp.spine * 0.4);
        arms.forEach((a, i) => {
          turn(a, jp.arms);
          turn(forearms[i], jp.elbows);
        });
        if (airborne) {
          legs.forEach((leg) => {
            turn(leg.up, jp.thigh);
            turn(leg.knee, -jp.knee);
            turn(leg.foot, jp.toes + jp.knee * 0.5);
          });
        } else if (Math.abs(jp.toes) > 0.01) legs.forEach((leg) => turn(leg.foot, jp.toes));
      }

      // ---- head and eyes look at people nearby ----
      let wantYaw = 0;
      let wantPitch = 0;
      let eyeYaw = 0;
      let eyePitch = 0;
      if (s.lookAt) {
        head.getWorldPosition(v1);
        const dx = s.lookAt.x - v1.x;
        const dy = s.lookAt.y - v1.y;
        const dz = s.lookAt.z - v1.z;
        const rel = wrapAngle(Math.atan2(-dx, -dz) - s.facing);
        if (Math.abs(rel) < 1.9) {
          wantYaw = clamp(rel, -1.05, 1.05); // a neck turns about 60 degrees each way
          wantPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.35, 0.4);
          eyeYaw = clamp(rel - wantYaw, -0.3, 0.3);
        }
      }
      if (clock > glance.until) glance = { yaw: (Math.random() - 0.5) * 0.24, pitch: (Math.random() - 0.5) * 0.1, until: clock + 0.7 + Math.random() * 2.2 };
      lookYaw += (wantYaw - lookYaw) * ease(dt, 4.5);
      lookPitch += (wantPitch - lookPitch) * ease(dt, 4.5);
      if (Math.abs(lookYaw) > 0.002 || Math.abs(lookPitch) > 0.002) {
        const right = v2.set(1, 0, 0).applyAxisAngle(UP, s.facing + lookYaw);
        for (const [b, share] of [[neck, 0.4], [head, 0.6]]) {
          qc.setFromAxisAngle(right, lookPitch * share).multiply(new THREE.Quaternion().setFromAxisAngle(UP, lookYaw * share));
          turnInWorld(b, qc);
        }
      }
      eyes.forEach((eye, i) => eye.quaternion.copy(eyeRest[i]));
      for (const eye of eyes) {
        const right = v2.set(1, 0, 0).applyAxisAngle(UP, s.facing + lookYaw);
        qc.setFromAxisAngle(right, eyePitch + glance.pitch).multiply(new THREE.Quaternion().setFromAxisAngle(UP, eyeYaw + glance.yaw));
        turnInWorld(eye, qc);
      }

      // ---- face ----
      smile += ((s.friendly ? 0.75 : 0.12) + Math.sin(clock * 0.7) * 0.04 - smile) * ease(dt, 3);
      mouth += (clamp(s.talk, 0, 1) - mouth) * ease(dt, 22);
      for (const f of faces) {
        f.morphTargetInfluences[f.morphTargetDictionary.mouthSmile] = clamp(smile, 0, 1);
        f.morphTargetInfluences[f.morphTargetDictionary.mouthOpen] = clamp(mouth, 0, 1);
      }

      // ---- plant the feet on the real ground ----
      if (!s.grounded || !s.groundAt) {
        pelvisDrop += (0 - pelvisDrop) * ease(dt, 10);
        for (const leg of legs) leg.lift += (0 - leg.lift) * ease(dt, 10);
        return;
      }
      const baseY = holder.parent.getWorldPosition(v1).y;
      const offsets = legs.map((leg) => {
        leg.foot.getWorldPosition(v2);
        const ground = s.groundAt(v2.x, v2.z, baseY + 0.7);
        return ground === null ? 0 : clamp(ground - baseY, -0.4, 0.4);
      });
      const drop = clamp(Math.min(offsets[0], offsets[1], 0), -0.3, 0);
      pelvisDrop += (drop - pelvisDrop) * ease(dt, 12);
      // The jump's dip and landing give lower the hips; the feet stay where they stand, so the
      // knees and hips bend (solved below) instead of the whole body sinking into the ground.
      const crouch = jump.crouch || 0;
      hips.position.y += pelvisDrop - crouch;
      hips.updateMatrixWorld(true);
      legs.forEach((leg, i) => {
        const want = Math.max(0, offsets[i] - pelvisDrop + crouch);
        leg.lift += (want - leg.lift) * (crouch > 0.005 ? 1 : ease(dt, 16));
        if (leg.lift < 0.004) return;
        leg.foot.getWorldPosition(v2);
        solveLeg(leg, new THREE.Vector3(v2.x, v2.y + leg.lift, v2.z));
      });
    },
  };
}
