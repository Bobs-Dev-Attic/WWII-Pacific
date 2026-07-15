import * as THREE from 'three';
import type { PlaneSpec } from '../data/planes';

// Builds a low-poly aircraft as a THREE.Group.
// Convention: plane nose points +Z (forward), up is +Y, right wing is +X.
// Named parts are attached to userData so the flight code can animate them:
//   propeller, aileronL, aileronR, elevator, rudder.

export interface PlaneParts {
  group: THREE.Group;
  propeller: THREE.Mesh;
  aileronL: THREE.Mesh;
  aileronR: THREE.Mesh;
  elevator: THREE.Mesh;
  rudder: THREE.Mesh;
  gearL?: THREE.Group;
  gearR?: THREE.Group;
}

function mat(color: number, flat = true): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: flat,
    roughness: 0.85,
    metalness: 0.1,
  });
}

export function buildPlane(spec: PlaneSpec): PlaneParts {
  const group = new THREE.Group();
  const body = mat(spec.bodyColor);
  const wing = mat(spec.wingColor);
  const accent = mat(spec.accentColor);
  const dark = mat(0x20242a);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fd8e8,
    transparent: true,
    opacity: 0.5,
    roughness: 0.2,
    metalness: 0.3,
    flatShading: true,
  });

  // --- Fuselage: tapered box using a cylinder-ish shape ---
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 6.2, 8), body);
  fuse.rotation.x = Math.PI / 2;
  fuse.position.z = 0.2;
  group.add(fuse);

  // Nose cone / cowling
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.9, 10), dark);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.z = 3.35;
  group.add(cowl);

  // Spinner
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), accent);
  spinner.rotation.x = Math.PI / 2;
  spinner.position.z = 3.9;
  group.add(spinner);

  // --- Propeller (spins about Z) ---
  const propeller = new THREE.Group() as unknown as THREE.Mesh;
  const bladeGeo = new THREE.BoxGeometry(0.12, 3.0, 0.06);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, dark);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    (propeller as unknown as THREE.Group).add(blade);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), dark);
  (propeller as unknown as THREE.Group).add(hub);
  propeller.position.z = 4.0;
  group.add(propeller);

  // --- Cockpit canopy ---
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(0.9, 1, 1.9);
  canopy.position.set(0, 0.34, 0.4);
  group.add(canopy);

  // --- Main wing (spans X). Slight dihedral via two panels. ---
  const wingSpan = 5.4;
  const wingChord = 1.5;
  const mkWingPanel = (dir: number) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(wingSpan, 0.12, wingChord), wing);
    w.position.set(dir * (wingSpan / 2 + 0.15), 0.02, 0.15);
    w.rotation.z = -dir * 0.05; // dihedral
    return w;
  };
  group.add(mkWingPanel(1));
  group.add(mkWingPanel(-1));

  // Wing-tip roundel/accent
  const tipGeo = new THREE.BoxGeometry(0.5, 0.14, wingChord * 0.7);
  const tipL = new THREE.Mesh(tipGeo, accent);
  tipL.position.set(wingSpan + 0.1, 0.02, 0.15);
  const tipR = new THREE.Mesh(tipGeo, accent);
  tipR.position.set(-(wingSpan + 0.1), 0.02, 0.15);
  group.add(tipL, tipR);

  // --- Ailerons (hinge along X near wing trailing edge) ---
  const ailGeo = new THREE.BoxGeometry(1.8, 0.08, 0.4);
  const makeAileron = (dir: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(dir * (wingSpan - 0.6), 0.02, 0.15 + wingChord / 2);
    const a = new THREE.Mesh(ailGeo, wing);
    a.position.z = 0.2;
    pivot.add(a);
    group.add(pivot);
    return pivot as unknown as THREE.Mesh;
  };
  const aileronR = makeAileron(1);
  const aileronL = makeAileron(-1);

  // --- Tail assembly ---
  const tailZ = -2.8;
  // Horizontal stabilizer
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.9), wing);
  hstab.position.set(0, 0.1, tailZ);
  group.add(hstab);

  // Elevator (hinge along X, behind hstab)
  const elevPivot = new THREE.Group();
  elevPivot.position.set(0, 0.1, tailZ - 0.45);
  const elev = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.4), wing);
  elev.position.z = -0.2;
  elevPivot.add(elev);
  group.add(elevPivot);
  const elevator = elevPivot as unknown as THREE.Mesh;

  // Vertical stabilizer
  const vstab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.1), body);
  vstab.position.set(0, 0.75, tailZ);
  group.add(vstab);

  // Rudder (hinge along Y)
  const rudPivot = new THREE.Group();
  rudPivot.position.set(0, 0.75, tailZ - 0.5);
  const rud = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.2, 0.4), accent);
  rud.position.z = -0.2;
  rudPivot.add(rud);
  group.add(rudPivot);
  const rudder = rudPivot as unknown as THREE.Mesh;

  // --- Fixed landing gear (only for Val/Kate style, but cheap to add) ---
  let gearL: THREE.Group | undefined;
  let gearR: THREE.Group | undefined;
  const makeGear = (dir: number) => {
    const g = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5), dark);
    strut.position.y = -0.4;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.y = -0.8;
    g.add(strut, wheel);
    g.position.set(dir * 1.4, -0.3, 1.2);
    return g;
  };
  if (spec.role !== 'fighter') {
    gearL = makeGear(-1);
    gearR = makeGear(1);
    group.add(gearL, gearR);
  }

  // Bomb / torpedo under belly for strike aircraft
  if (spec.bombs > 0) {
    const bomb = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.9, 4, 8), dark);
    bomb.rotation.x = Math.PI / 2;
    bomb.position.set(0, -0.5, 0.3);
    group.add(bomb);
  }

  group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = false;
  });

  return { group, propeller, aileronL, aileronR, elevator, rudder, gearL, gearR };
}
