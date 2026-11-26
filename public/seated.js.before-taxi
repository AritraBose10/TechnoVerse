// Real characters sitting in a vehicle: the drivers and passengers of cars, autos and buses.
// A figure is made and posed once with the vehicle at the origin, so the pose rides along with it.
import * as THREE from "three";
import { makeCharacter } from "/character.js";
import { riderLook } from "/looks.js";
import { pickBody } from "/crowdbodies.js";

const SEAT_GEAR = ["glasses"];
// slot: { x, y, z, driver } in the vehicle's frame (nose +x, y up); y is the seat cushion. Returns the figure's group.
export function seatCharacter(mesh, slot, kit, rnd) {
  const pos = mesh.position.clone();
  const rot = mesh.rotation.clone();
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.updateMatrixWorld(true);
  const sex = !slot.driver && rnd() < 0.4 ? "f" : "m";
  const role = slot.driver ? "rider" : ["local", "office", "student"][(rnd() * 3) | 0];
  const body = pickBody(role, sex, rnd);
  const opts = riderLook(rnd, { helmet: false });
  const gear = rnd() < 0.15 ? [...SEAT_GEAR] : [];
  const c = body ? makeCharacter(body.kit, { gear, lite: true }) : makeCharacter(kit, { ...opts, lite: true });
  const holderParent = new THREE.Group();
  holderParent.rotation.y = -Math.PI / 2; // the figure's forward (-z) along the vehicle's nose (+x)
  holderParent.position.set(slot.x, 0, slot.z);
  mesh.add(holderParent);
  holderParent.add(c.model);
  holderParent.updateMatrixWorld(true);
  const state = {
    speed: 0,
    grounded: true,
    turnRate: 0,
    facing: -Math.PI / 2,
    sit: { seat: new THREE.Vector3(slot.x, slot.y, slot.z), floor: slot.floor ?? 0.15, reach: slot.reach ?? 0.38 },
    gesture: slot.driver ? { hold: 1 } : { knees: 1 },
  };
  for (let i = 0; i < 4; i++) c.update(0.5, state); // eases the pose in
  c.model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  mesh.position.copy(pos);
  mesh.rotation.copy(rot);
  mesh.updateMatrixWorld(true);
  holderParent.userData.char = c;
  return holderParent;
}
