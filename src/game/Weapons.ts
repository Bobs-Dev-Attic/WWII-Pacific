import * as THREE from 'three';

// Projectile system for guns and bombs.
// Bullets fly fast with a mild gravity drop and are nudged by wind (so long
// shots require lead). Bombs inherit the aircraft's velocity and then arc under
// gravity + wind drag — the bomb pipper on the HUD predicts their impact point.

export interface Bullet {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  side: 'usa' | 'japan';
  damage: number;
  fromPlayer: boolean;
}

export interface Bomb {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  side: 'usa' | 'japan';
  fromPlayer: boolean;
}

const G = 9.81;

export class Weapons {
  bullets: Bullet[] = [];
  bombs: Bomb[] = [];

  private tracerGeo = new THREE.BufferGeometry();
  private tracerMatPlayer = new THREE.LineBasicMaterial({ color: 0xffe27a });
  private tracerMatEnemy = new THREE.LineBasicMaterial({ color: 0xff6a4a });
  private tracerLines: THREE.LineSegments;
  private bombMeshes: THREE.InstancedMesh;
  private bombPool: number[] = [];
  private explosions: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  private group = new THREE.Group();
  private tracerPositions: Float32Array;
  private tracerColors: Float32Array;
  private maxTracers = 400;

  // Glowing tracer heads (additive points) so rounds read clearly against sky/sea.
  private headGeo = new THREE.BufferGeometry();
  private headPositions: Float32Array;
  private headColors: Float32Array;
  private tracerHeads: THREE.Points;
  private glowTex: THREE.Texture;
  // Muzzle-flash pool.
  private flashes: { mesh: THREE.Mesh; life: number; max: number }[] = [];

  constructor(private scene: THREE.Scene) {
    this.glowTex = makeGlowTexture();

    // Tracer line pool (2 verts per bullet segment).
    this.tracerPositions = new Float32Array(this.maxTracers * 2 * 3);
    this.tracerColors = new Float32Array(this.maxTracers * 2 * 3);
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPositions, 3));
    this.tracerGeo.setAttribute('color', new THREE.BufferAttribute(this.tracerColors, 3));
    this.tracerLines = new THREE.LineSegments(
      this.tracerGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 })
    );
    this.tracerLines.frustumCulled = false;
    this.group.add(this.tracerLines);

    // Bright additive heads.
    this.headPositions = new Float32Array(this.maxTracers * 3);
    this.headColors = new Float32Array(this.maxTracers * 3);
    this.headGeo.setAttribute('position', new THREE.BufferAttribute(this.headPositions, 3));
    this.headGeo.setAttribute('color', new THREE.BufferAttribute(this.headColors, 3));
    this.tracerHeads = new THREE.Points(
      this.headGeo,
      new THREE.PointsMaterial({
        size: 6,
        map: this.glowTex,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.tracerHeads.frustumCulled = false;
    this.group.add(this.tracerHeads);

    // Bomb instances.
    const bombGeo = new THREE.CapsuleGeometry(0.18, 1.0, 4, 6);
    bombGeo.rotateX(Math.PI / 2);
    const bombMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, flatShading: true });
    this.bombMeshes = new THREE.InstancedMesh(bombGeo, bombMat, 40);
    this.bombMeshes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bombMeshes.count = 40;
    for (let i = 0; i < 40; i++) {
      this.bombPool.push(i);
      this.hideInstance(i);
    }
    this.group.add(this.bombMeshes);

    this.scene.add(this.group);
  }

  private hideInstance(i: number): void {
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    this.bombMeshes.setMatrixAt(i, m);
    this.bombMeshes.instanceMatrix.needsUpdate = true;
  }

  fireGun(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    ownerVel: THREE.Vector3,
    side: 'usa' | 'japan',
    damage: number,
    fromPlayer: boolean
  ): void {
    const muzzle = 620; // m/s
    const vel = dir.clone().normalize().multiplyScalar(muzzle).add(ownerVel);
    // small spread
    vel.x += (hash(this.bullets.length * 7) - 0.5) * 10;
    vel.y += (hash(this.bullets.length * 13) - 0.5) * 10;
    this.bullets.push({ pos: origin.clone(), vel, life: 2.4, side, damage, fromPlayer });
  }

  dropBomb(origin: THREE.Vector3, ownerVel: THREE.Vector3, side: 'usa' | 'japan', fromPlayer: boolean): void {
    this.bombs.push({ pos: origin.clone(), vel: ownerVel.clone(), life: 20, side, fromPlayer });
  }

  spawnExplosion(pos: THREE.Vector3, size = 12): void {
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb14a, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.explosions.push({ mesh, life: 0.6, max: size });
  }

  // Bright, brief additive muzzle flash at the gun, tinted per side.
  spawnMuzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, fromPlayer: boolean): void {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color: fromPlayer ? 0xffe089 : 0xff7a4a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 1,
    });
    const spr = new THREE.Sprite(mat);
    spr.position.copy(pos).addScaledVector(dir, 1.2);
    spr.scale.setScalar(3);
    this.scene.add(spr as unknown as THREE.Mesh);
    this.flashes.push({ mesh: spr as unknown as THREE.Mesh, life: 0.06, max: 3 });
  }

  update(dt: number, wind: THREE.Vector3): void {
    // Bullets: integrate with light gravity + wind push.
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.vel.y -= G * dt;
      b.vel.addScaledVector(wind, dt * 0.15);
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      if (b.life <= 0 || b.pos.y < 0) {
        if (b.pos.y < 0) this.spawnSplash(b.pos);
        this.bullets.splice(i, 1);
      }
    }

    // Bombs: full gravity + wind drag.
    let bi = 0;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vel.y -= G * dt;
      // wind drag pulls bomb toward wind velocity
      const rel = wind.clone().sub(b.vel);
      b.vel.addScaledVector(rel, dt * 0.04);
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      if (b.pos.y <= 0 || b.life <= 0) {
        this.spawnExplosion(b.pos.clone().setY(1), 16);
        this.bombs.splice(i, 1);
      }
    }

    // Render tracers: a bright streak (line) plus a glowing head point.
    let ti = 0;
    for (const b of this.bullets) {
      if (ti >= this.maxTracers) break;
      const tail = b.pos.clone().addScaledVector(b.vel, -0.05); // longer streak
      const o = ti * 6;
      this.tracerPositions[o] = tail.x;
      this.tracerPositions[o + 1] = tail.y;
      this.tracerPositions[o + 2] = tail.z;
      this.tracerPositions[o + 3] = b.pos.x;
      this.tracerPositions[o + 4] = b.pos.y;
      this.tracerPositions[o + 5] = b.pos.z;
      const c = b.fromPlayer ? [1.0, 0.9, 0.4] : [1.0, 0.4, 0.2];
      for (let k = 0; k < 2; k++) {
        this.tracerColors[o + k * 3] = c[0];
        this.tracerColors[o + k * 3 + 1] = c[1];
        this.tracerColors[o + k * 3 + 2] = c[2];
      }
      const h = ti * 3;
      this.headPositions[h] = b.pos.x;
      this.headPositions[h + 1] = b.pos.y;
      this.headPositions[h + 2] = b.pos.z;
      this.headColors[h] = c[0];
      this.headColors[h + 1] = c[1];
      this.headColors[h + 2] = c[2];
      ti++;
    }
    // Zero out unused slots.
    for (let j = ti; j < this.maxTracers; j++) {
      const o = j * 6;
      for (let k = 0; k < 6; k++) this.tracerPositions[o + k] = 0;
      const h = j * 3;
      this.headPositions[h] = this.headPositions[h + 1] = this.headPositions[h + 2] = 0;
    }
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.attributes.color.needsUpdate = true;
    this.tracerGeo.setDrawRange(0, ti * 2);
    this.headGeo.attributes.position.needsUpdate = true;
    this.headGeo.attributes.color.needsUpdate = true;
    this.headGeo.setDrawRange(0, ti);

    // Muzzle flashes (fast fade + shrink).
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const k = Math.max(0, f.life / 0.06);
      f.mesh.scale.setScalar(f.max * (0.5 + k));
      (f.mesh.material as THREE.SpriteMaterial).opacity = k;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this.flashes.splice(i, 1);
      }
    }

    // Render bombs.
    for (let i = 0; i < 40; i++) {
      if (i < this.bombs.length) {
        const b = this.bombs[i];
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.vel.clone().normalize());
        m.compose(b.pos, q, new THREE.Vector3(1, 1, 1));
        this.bombMeshes.setMatrixAt(i, m);
      } else {
        this.hideInstance(i);
      }
    }
    this.bombMeshes.instanceMatrix.needsUpdate = true;

    // Explosions.
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.life -= dt;
      const t = 1 - e.life / 0.6;
      const s = t * e.max;
      e.mesh.scale.setScalar(Math.max(0.1, s));
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, e.life / 0.6);
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        this.explosions.splice(i, 1);
      }
    }
  }

  private spawnSplash(pos: THREE.Vector3): void {
    // cheap splash: tiny short-lived explosion in white-blue
    const geo = new THREE.SphereGeometry(1, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xbfe0f2, transparent: true, opacity: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).setY(0.5);
    this.scene.add(mesh);
    this.explosions.push({ mesh, life: 0.3, max: 3 });
  }

  // Predict where a bomb dropped now would land (for the HUD pipper).
  predictBombImpact(origin: THREE.Vector3, ownerVel: THREE.Vector3, wind: THREE.Vector3): THREE.Vector3 | null {
    const pos = origin.clone();
    const vel = ownerVel.clone();
    for (let i = 0; i < 600; i++) {
      const dt = 0.05;
      vel.y -= G * dt;
      const rel = wind.clone().sub(vel);
      vel.addScaledVector(rel, dt * 0.04);
      pos.addScaledVector(vel, dt);
      if (pos.y <= 0) return pos.setY(0);
    }
    return null;
  }
}

function hash(n: number): number {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

// Soft radial glow used for tracer heads and muzzle flashes.
function makeGlowTexture(): THREE.Texture {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,240,190,0.85)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.Texture(cv);
  tex.needsUpdate = true;
  return tex;
}
