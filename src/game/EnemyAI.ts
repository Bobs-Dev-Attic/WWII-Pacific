import * as THREE from 'three';
import type { PlaneSpec, Side } from '../data/planes';
import type { BattleSpec } from '../data/battles';
import { buildPlane, type PlaneParts } from '../models/planeFactory';
import type { Weapons } from './Weapons';
import type { World, Ship } from './World';

// Enemy squadron AI.
//
// Formations (historically grounded):
//   - Japanese fighters fly the three-plane "shotai" vic; heavier US planes
//     fly the "finger-four" and use energy tactics.
// Attack patterns:
//   - PATROL   : hold formation around a patrol anchor.
//   - PURSUE   : maneuver onto the player's six (turning fight for Zeros,
//                boom-and-zoom energy passes for heavier fighters).
//   - ATTACK   : aligned and in range — fire guns with target lead.
//   - EVADE    : player is on the enemy's tail — break-turn / jink away.
//   - KAMIKAZE : late-war Japanese dive into friendly ships.

const DEG = Math.PI / 180;

type State = 'PATROL' | 'PURSUE' | 'ATTACK' | 'EVADE' | 'KAMIKAZE';

export interface PlayerRef {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  forward: THREE.Vector3;
  alive: boolean;
}

interface Enemy {
  spec: PlaneSpec;
  parts: PlaneParts;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  vel: THREE.Vector3;
  speed: number;
  hp: number;
  state: State;
  formSlot: number;
  cooldown: number;
  jinkTimer: number;
  jinkDir: number;
  energyTactician: boolean; // boom-and-zoom vs turn-fighter
  bankSmooth: number;
  alive: boolean;
}

// Formation offsets (right, up, back) in metres relative to the squadron anchor.
const VIC: THREE.Vector3[] = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(-40, -6, -55),
  new THREE.Vector3(40, -6, -55),
];
const FINGER_FOUR: THREE.Vector3[] = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(35, -4, -45),
  new THREE.Vector3(-70, 8, -70),
  new THREE.Vector3(-35, 4, -115),
];

export class Squadron {
  enemies: Enemy[] = [];
  private anchor = new THREE.Vector3();
  private anchorVel = new THREE.Vector3();
  private time = 0;
  side: Side;
  killed = 0;

  constructor(
    private scene: THREE.Scene,
    private spec: PlaneSpec,
    private battle: BattleSpec,
    private weapons: Weapons,
    private world: World
  ) {
    this.side = spec.side;
    this.spawn();
  }

  private spawn(): void {
    const n = this.battle.enemyCount;
    const energy = this.spec.role === 'fighter' && this.spec.side === 'usa';
    const kamikazeBattle = ['leyte_gulf', 'okinawa'].includes(this.battle.id) && this.side === 'japan';

    // Patrol anchor: ahead of the player's start, at altitude.
    this.anchor.set(0, 620, -1400);
    const heading = 0;
    this.anchorVel.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(this.spec.maxSpeed * 0.6);

    for (let i = 0; i < n; i++) {
      const parts = buildPlane(this.spec);
      this.scene.add(parts.group);
      const slot = i;
      const off = this.formationOffset(slot);
      const pos = this.anchor.clone().add(off);
      // spread squadrons vertically/horizontally so they don't stack
      pos.x += (i % 4) * 120 - 180;
      pos.y += Math.floor(i / 4) * 90;
      const e: Enemy = {
        spec: this.spec,
        parts,
        pos,
        quat: new THREE.Quaternion(),
        vel: new THREE.Vector3(0, 0, this.spec.maxSpeed * 0.6),
        speed: this.spec.maxSpeed * 0.6,
        hp: this.spec.hp,
        state: 'PATROL',
        formSlot: slot,
        cooldown: 0,
        jinkTimer: 0,
        jinkDir: i % 2 === 0 ? 1 : -1,
        energyTactician: energy,
        bankSmooth: 0,
        alive: true,
      };
      // Some late-war Japanese planes are on kamikaze runs from the start.
      if (kamikazeBattle && i % 3 === 0) e.state = 'KAMIKAZE';
      this.enemies.push(e);
    }
  }

  private formationOffset(slot: number): THREE.Vector3 {
    const table = this.spec.side === 'usa' ? FINGER_FOUR : VIC;
    const group = Math.floor(slot / table.length);
    const idx = slot % table.length;
    const base = table[idx].clone();
    base.x += group * 220; // stagger extra formations sideways
    base.z -= group * 40;
    return base;
  }

  aliveCount(): number {
    return this.enemies.filter((e) => e.alive).length;
  }

  // Apply damage to the nearest enemy along a bullet's path (called by Game).
  enemyList(): Enemy[] {
    return this.enemies;
  }

  damageEnemy(e: Enemy, dmg: number): void {
    if (!e.alive) return;
    e.hp -= dmg;
    if (e.hp <= 0) {
      e.alive = false;
      this.killed++;
      this.weapons.spawnExplosion(e.pos.clone(), 18);
      this.scene.remove(e.parts.group);
    }
  }

  update(dt: number, player: PlayerRef): void {
    this.time += dt;
    // Advance the patrol anchor.
    this.anchor.addScaledVector(this.anchorVel, dt);
    // Slowly orbit the anchor heading so patrols weave.
    const turn = Math.sin(this.time * 0.05) * 0.15;
    this.anchorVel.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * dt);

    for (const e of this.enemies) {
      if (!e.alive) continue;
      this.updateEnemy(dt, e, player);
    }
  }

  private updateEnemy(dt: number, e: Enemy, player: PlayerRef): void {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(e.quat);
    const toPlayer = player.position.clone().sub(e.pos);
    const dist = toPlayer.length();

    // --- State transitions ---
    e.cooldown -= dt;
    e.jinkTimer -= dt;

    const playerBehind = this.isPlayerOnTail(e, fwd, player);
    const engageRange = 1500;

    if (e.state !== 'KAMIKAZE') {
      if (playerBehind && dist < 500) {
        e.state = 'EVADE';
      } else if (player.alive && dist < engageRange) {
        // aligned & close => attack, else pursue
        const aim = this.leadPoint(e, player);
        const dirToAim = aim.clone().sub(e.pos).normalize();
        const align = fwd.dot(dirToAim);
        e.state = align > 0.985 && dist < 650 ? 'ATTACK' : 'PURSUE';
      } else {
        e.state = 'PATROL';
      }
    }

    // --- Choose steering target ---
    let target = new THREE.Vector3();
    let desiredSpeed = this.spec.maxSpeed * 0.7;

    switch (e.state) {
      case 'PATROL': {
        target = this.anchor.clone().add(this.formationOffset(e.formSlot));
        desiredSpeed = this.spec.maxSpeed * 0.6;
        break;
      }
      case 'PURSUE': {
        if (e.energyTactician && player.position.y < e.pos.y - 60) {
          // Boom-and-zoom: dive on the player from above, aiming ahead.
          target = this.leadPoint(e, player);
          desiredSpeed = this.spec.maxSpeed;
        } else if (e.energyTactician && e.pos.y < player.position.y + 40) {
          // Below the target: zoom-climb to regain energy, then re-engage.
          target = e.pos.clone().add(new THREE.Vector3(fwd.x, 0.9, fwd.z).normalize().multiplyScalar(600));
          desiredSpeed = this.spec.maxSpeed;
        } else {
          // Turn-fighter: pull for the player's six.
          const six = player.position.clone().addScaledVector(player.forward, -180);
          target = six;
          desiredSpeed = this.spec.maxSpeed * 0.9;
        }
        break;
      }
      case 'ATTACK': {
        target = this.leadPoint(e, player);
        desiredSpeed = this.spec.maxSpeed * 0.95;
        this.tryFire(e, fwd, target, dt);
        break;
      }
      case 'EVADE': {
        // Break turn + vertical jink away from the pursuer.
        if (e.jinkTimer <= 0) {
          e.jinkDir *= -1;
          e.jinkTimer = 1.2 + hash(this.time + e.formSlot) * 1.0;
        }
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(e.quat);
        target = e.pos
          .clone()
          .addScaledVector(fwd, 300)
          .addScaledVector(right, e.jinkDir * 400)
          .add(new THREE.Vector3(0, e.jinkDir * 120, 0));
        desiredSpeed = this.spec.maxSpeed;
        break;
      }
      case 'KAMIKAZE': {
        const ship = this.nearestFriendlyShip(e);
        if (ship) {
          target = ship.group.position.clone().setY(ship.group.position.y + 4);
          desiredSpeed = this.spec.maxSpeed * 1.1;
          if (e.pos.distanceTo(ship.group.position) < 30) {
            // Impact.
            this.weapons.spawnExplosion(e.pos.clone(), 26);
            ship.hp -= 180;
            if (ship.hp <= 0) ship.alive = false;
            e.alive = false;
            this.scene.remove(e.parts.group);
            return;
          }
        } else {
          target = this.anchor.clone();
        }
        break;
      }
    }

    this.steer(dt, e, target, desiredSpeed);
    this.animate(dt, e);
  }

  private steer(dt: number, e: Enemy, target: THREE.Vector3, desiredSpeed: number): void {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(e.quat);
    let desiredDir = target.clone().sub(e.pos);
    if (desiredDir.lengthSq() < 1e-4) desiredDir.copy(fwd);
    desiredDir.normalize();

    // Limit turn rate.
    const maxTurn = this.spec.turnRate * DEG * (e.state === 'EVADE' || e.state === 'ATTACK' ? 1.3 : 1.0);
    let angle = fwd.angleTo(desiredDir);
    const step = Math.min(angle, maxTurn * dt);
    let newFwd: THREE.Vector3;
    if (angle > 1e-4) {
      const axis = new THREE.Vector3().crossVectors(fwd, desiredDir).normalize();
      newFwd = fwd.clone().applyAxisAngle(axis, step).normalize();
    } else {
      newFwd = fwd.clone();
    }

    // Bank into the horizontal component of the turn for visual authenticity.
    const horiz = new THREE.Vector3(desiredDir.x, 0, desiredDir.z).normalize();
    const fHoriz = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
    const cross = new THREE.Vector3().crossVectors(fHoriz, horiz);
    const bankTarget = THREE.MathUtils.clamp(cross.y * 3.0, -1, 1) * 60 * DEG;
    e.bankSmooth += (bankTarget - e.bankSmooth) * (1 - Math.exp(-dt * 4));

    // Build orientation from forward + bank.
    e.quat.copy(orientationFromDir(newFwd, e.bankSmooth));

    // Speed control.
    e.speed += (desiredSpeed - e.speed) * (1 - Math.exp(-dt * 1.5));
    e.speed = THREE.MathUtils.clamp(e.speed, this.spec.stallSpeed * 1.1, this.spec.maxSpeed * 1.15);
    e.vel.copy(newFwd).multiplyScalar(e.speed);
    e.pos.addScaledVector(e.vel, dt);

    // Don't fly into the sea.
    if (e.pos.y < 40 && e.state !== 'KAMIKAZE') {
      e.pos.y = 40;
    }
  }

  private tryFire(e: Enemy, fwd: THREE.Vector3, aim: THREE.Vector3, dt: number): void {
    if (e.cooldown > 0) return;
    const dirToAim = aim.clone().sub(e.pos).normalize();
    if (fwd.dot(dirToAim) < 0.99) return;
    const muzzle = e.pos.clone().addScaledVector(fwd, 4);
    this.weapons.fireGun(muzzle, dirToAim, e.vel, e.spec.side, e.spec.gunDamage, false);
    e.cooldown = 1 / (e.spec.fireRate / 6) + hash(e.formSlot + this.time) * 0.1;
  }

  private leadPoint(e: Enemy, player: PlayerRef): THREE.Vector3 {
    // Predict where the player will be when a bullet arrives.
    const rel = player.position.clone().sub(e.pos);
    const closing = 620; // bullet speed
    const t = THREE.MathUtils.clamp(rel.length() / closing, 0, 1.5);
    return player.position.clone().addScaledVector(player.velocity, t);
  }

  private isPlayerOnTail(e: Enemy, fwd: THREE.Vector3, player: PlayerRef): boolean {
    if (!player.alive) return false;
    const toEnemy = e.pos.clone().sub(player.position).normalize();
    // Player pointing at the enemy AND roughly behind (same direction of travel).
    const playerAiming = player.forward.dot(toEnemy) > 0.9;
    const behind = fwd.dot(player.forward) > 0.5;
    return playerAiming && behind;
  }

  private nearestFriendlyShip(e: Enemy): Ship | null {
    // Kamikaze targets the side opposing this squadron.
    const targetSide: Side = this.side === 'japan' ? 'usa' : 'japan';
    let best: Ship | null = null;
    let bestD = Infinity;
    for (const s of this.world.aliveShips(targetSide)) {
      const d = e.pos.distanceTo(s.group.position);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  private animate(dt: number, e: Enemy): void {
    e.parts.group.position.copy(e.pos);
    e.parts.group.quaternion.copy(e.quat);
    // Spin prop.
    e.parts.propeller.rotation.z += dt * 40;
    // Control-surface hints from bank.
    const roll = e.bankSmooth;
    e.parts.aileronL.rotation.x = -roll * 0.3;
    e.parts.aileronR.rotation.x = roll * 0.3;
  }
}

// Build a quaternion that points local +Z along `dir` with a roll of `bank`.
function orientationFromDir(dir: THREE.Vector3, bank: number): THREE.Quaternion {
  const f = dir.clone().normalize();
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(f.dot(up)) > 0.99) up = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(up, f).normalize();
  up = new THREE.Vector3().crossVectors(f, right).normalize();
  const cb = Math.cos(bank);
  const sb = Math.sin(bank);
  const right2 = right.clone().multiplyScalar(cb).addScaledVector(up, sb);
  const up2 = up.clone().multiplyScalar(cb).addScaledVector(right, -sb);
  const m = new THREE.Matrix4().makeBasis(right2, up2, f);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function hash(n: number): number {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}
