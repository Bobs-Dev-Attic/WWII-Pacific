import * as THREE from 'three';
import type { BattleSpec } from '../data/battles';
import type { Weather } from './Weather';

// The environment the battle plays out in: gradient sky dome, animated low-poly
// ocean, drifting clouds, islands, and ships that serve as strike targets.

export interface Ship {
  group: THREE.Group;
  hp: number;
  maxHp: number;
  side: 'usa' | 'japan';
  alive: boolean;
  velocity: THREE.Vector3;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 topColor;
uniform vec3 bottomColor;
varying vec3 vDir;
void main(){
  float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(bottomColor, topColor, pow(h, 0.8));
  gl_FragColor = vec4(col, 1.0);
}`;

export class World {
  scene = new THREE.Scene();
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  ships: Ship[] = [];
  islands: { x: number; z: number; r: number }[] = [];

  private ocean: THREE.Mesh;
  private oceanBase: Float32Array;
  private oceanGeo: THREE.PlaneGeometry;
  private clouds: THREE.Group;
  private skyMat: THREE.ShaderMaterial;
  private time = 0;
  private seaState: number;

  constructor(private battle: BattleSpec, weather: Weather) {
    const v = weather.visuals;
    this.seaState = battle.seaState;

    // Fog
    this.scene.fog = new THREE.FogExp2(v.fogColor.getHex(), v.fogDensity);
    this.scene.background = v.fogColor.clone();

    // Sky dome
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: v.skyTop.clone() },
        bottomColor: { value: v.skyBottom.clone() },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 24, 16), this.skyMat);
    this.scene.add(sky);

    // Lights
    this.ambient = new THREE.AmbientLight(0xffffff, v.ambient);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(v.sunColor.getHex(), v.sunIntensity);
    this.sun.position.copy(v.sunDir).multiplyScalar(1000);
    this.sun.castShadow = false;
    this.scene.add(this.sun);
    const hemi = new THREE.HemisphereLight(v.skyTop.getHex(), 0x2a4a5a, 0.35);
    this.scene.add(hemi);

    // Ocean
    const size = 6000;
    const seg = 64;
    this.oceanGeo = new THREE.PlaneGeometry(size, size, seg, seg);
    this.oceanGeo.rotateX(-Math.PI / 2);
    this.oceanBase = Float32Array.from(this.oceanGeo.attributes.position.array as Float32Array);
    const oceanColor = new THREE.Color(0x1e5b7a).lerp(new THREE.Color(0x2a3a44), v.cloudiness * 0.5);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: oceanColor,
      flatShading: true,
      roughness: 0.6,
      metalness: 0.25,
    });
    this.ocean = new THREE.Mesh(this.oceanGeo, oceanMat);
    this.ocean.position.y = 0;
    this.scene.add(this.ocean);

    // Clouds
    this.clouds = new THREE.Group();
    this.buildClouds(v.cloudiness);
    this.scene.add(this.clouds);

    // Islands
    this.buildIslands();

    // Ships
    this.buildShips();
  }

  private buildClouds(cloudiness: number): void {
    const count = Math.floor(30 + cloudiness * 90);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xf2f4f6,
      flatShading: true,
      transparent: true,
      opacity: 0.85,
      roughness: 1,
    });
    const puffGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < count; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(rand(i) * 4);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        const s = 20 + rand(i * 7 + p) * 40;
        puff.scale.set(s, s * 0.55, s);
        puff.position.set((rand(i + p) - 0.5) * 90, (rand(i * 3 + p) - 0.5) * 12, (rand(i * 5 + p) - 0.5) * 90);
        cloud.add(puff);
      }
      const ang = rand(i * 11) * Math.PI * 2;
      const dist = 400 + rand(i * 13) * 3200;
      cloud.position.set(Math.cos(ang) * dist, 250 + rand(i * 17) * 700, Math.sin(ang) * dist);
      this.clouds.add(cloud);
    }
  }

  private buildIslands(): void {
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x5a7a45, flatShading: true, roughness: 1 });
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xcbb684, flatShading: true, roughness: 1 });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const island = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(140 + rand(i) * 120, 190 + rand(i) * 140, 30, 7), sandMat);
      base.position.y = 5;
      island.add(base);
      const hills = 2 + Math.floor(rand(i * 3) * 3);
      for (let h = 0; h < hills; h++) {
        const hill = new THREE.Mesh(new THREE.ConeGeometry(60 + rand(i * h + 1) * 70, 60 + rand(i + h) * 120, 6), islandMat);
        hill.position.set((rand(i * h) - 0.5) * 140, 30, (rand(i + h * 2) - 0.5) * 140);
        island.add(hill);
      }
      const ang = rand(i * 19) * Math.PI * 2;
      const dist = 1200 + rand(i * 23) * 2600;
      const ix = Math.cos(ang) * dist;
      const iz = Math.sin(ang) * dist;
      island.position.set(ix, 0, iz);
      this.scene.add(island);
      this.islands.push({ x: ix, z: iz, r: 190 + rand(i) * 140 });
    }
  }

  private buildShips(): void {
    const enemySide = this.battle.aggressor === 'usa' ? 'japan' : 'usa';
    // Enemy strike targets
    for (let i = 0; i < this.battle.shipTargets; i++) {
      const ship = this.makeShip(enemySide, i, true);
      this.ships.push(ship);
      this.scene.add(ship.group);
    }
    // Friendly ships (to defend)
    for (let i = 0; i < this.battle.friendlyShips; i++) {
      const ship = this.makeShip(this.battle.aggressor === 'usa' ? 'usa' : 'japan', i + 50, false);
      this.ships.push(ship);
      this.scene.add(ship.group);
    }
  }

  private makeShip(side: 'usa' | 'japan', idx: number, enemy: boolean): Ship {
    const hullColor = side === 'usa' ? 0x4a5a60 : 0x555f52;
    const hullMat = new THREE.MeshStandardMaterial({ color: hullColor, flatShading: true, roughness: 0.9, metalness: 0.3 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3a3f42, flatShading: true, roughness: 1 });
    const group = new THREE.Group();

    const isCarrier = idx % 3 === 0;
    if (isCarrier) {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(34, 8, 165), hullMat);
      hull.position.y = 4;
      group.add(hull);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(40, 1.5, 175), deckMat);
      deck.position.y = 9;
      group.add(deck);
      const island = new THREE.Mesh(new THREE.BoxGeometry(7, 12, 20), hullMat);
      island.position.set(16, 15, 10);
      group.add(island);
    } else {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(20, 9, 130), hullMat);
      hull.position.y = 4;
      group.add(hull);
      const sup = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 40), hullMat);
      sup.position.y = 12;
      group.add(sup);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 16, 8), hullMat);
      tower.position.set(0, 20, 6);
      group.add(tower);
      // gun turrets
      for (const z of [-40, 40]) {
        const turret = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 3, 8), deckMat);
        turret.position.set(0, 10, z);
        group.add(turret);
      }
    }
    group.traverse((o) => (o.castShadow = true));

    const ang = rand(idx * 31) * Math.PI * 2;
    const dist = enemy ? 900 + rand(idx) * 700 : 500 + rand(idx) * 400;
    group.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist + (enemy ? -600 : 300));
    group.rotation.y = rand(idx * 3) * Math.PI * 2;

    const heading = group.rotation.y;
    const velocity = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(6);

    return { group, hp: isCarrier ? 400 : 260, maxHp: isCarrier ? 400 : 260, side, alive: true, velocity };
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    this.time += dt;

    // Ocean waves (low-poly, follows player horizontally).
    const pos = this.oceanGeo.attributes.position;
    const arr = pos.array as Float32Array;
    const amp = 0.8 + this.seaState * 1.6;
    const t = this.time;
    for (let i = 0; i < arr.length; i += 3) {
      const x = this.oceanBase[i];
      const z = this.oceanBase[i + 2];
      arr[i + 1] =
        Math.sin(x * 0.02 + t * 1.3) * amp * 0.5 +
        Math.cos(z * 0.025 + t * 1.1) * amp * 0.5 +
        Math.sin((x + z) * 0.01 + t * 0.7) * amp * 0.4;
    }
    pos.needsUpdate = true;
    this.oceanGeo.computeVertexNormals();
    this.ocean.position.x = Math.round(playerPos.x / 90) * 90;
    this.ocean.position.z = Math.round(playerPos.z / 90) * 90;

    // Clouds drift slowly.
    this.clouds.position.x = (this.clouds.position.x + dt * 2) % 200;

    // Ships steam forward.
    for (const s of this.ships) {
      if (!s.alive) continue;
      s.group.position.addScaledVector(s.velocity, dt);
      // Gentle bob.
      s.group.position.y = Math.sin(this.time * 0.8 + s.group.position.x) * (0.3 + this.seaState * 0.3);
    }
  }

  aliveShips(side?: 'usa' | 'japan'): Ship[] {
    return this.ships.filter((s) => s.alive && (side ? s.side === side : true));
  }
}

// Deterministic pseudo-random so the world is stable per battle (no Math.random).
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
