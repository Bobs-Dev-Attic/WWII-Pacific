import * as THREE from 'three';
import type { PlaneSpec } from '../data/planes';
import { buildPlane, type PlaneParts } from '../models/planeFactory';
import { FlightModel, type ControlInput, type Environment } from './FlightModel';

// The player's aircraft: couples the flight model to the visible low-poly model
// and drives the animated control surfaces (ailerons, elevator, rudder, prop)
// so the airframe visibly reflects its flight attitude and inputs.

export class Aircraft {
  spec: PlaneSpec;
  model: FlightModel;
  parts: PlaneParts;
  hp: number;
  maxHp: number;
  ammo: number;
  bombs: number;
  alive = true;
  private gunTimer = 0;
  private propSpin = 0;

  constructor(spec: PlaneSpec) {
    this.spec = spec;
    this.model = new FlightModel(spec);
    this.parts = buildPlane(spec);
    this.hp = spec.hp;
    this.maxHp = spec.hp;
    this.ammo = spec.ammo;
    this.bombs = spec.bombs;
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.parts.group);
  }

  reset(pos: THREE.Vector3, heading: number, speed: number): void {
    this.model.position.copy(pos);
    this.model.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.model.velocity.set(0, 0, 1).applyQuaternion(this.model.quaternion).multiplyScalar(speed);
    this.hp = this.maxHp;
    this.ammo = this.spec.ammo;
    this.bombs = this.spec.bombs;
    this.alive = true;
  }

  get position(): THREE.Vector3 {
    return this.model.position;
  }
  get velocity(): THREE.Vector3 {
    return this.model.velocity;
  }
  forward(out?: THREE.Vector3): THREE.Vector3 {
    return this.model.forward(out);
  }

  canFire(): boolean {
    return this.alive && this.ammo > 0 && this.gunTimer <= 0;
  }

  registerShot(rounds: number): void {
    this.ammo = Math.max(0, this.ammo - rounds);
    this.gunTimer = rounds / this.spec.fireRate;
  }

  update(dt: number, controls: ControlInput, env: Environment): void {
    if (this.gunTimer > 0) this.gunTimer -= dt;

    // Cut engine authority / controls when destroyed (falls).
    const c: ControlInput = this.alive
      ? controls
      : { pitch: -0.2, roll: 0.4, yaw: 0.1, throttle: 0 };

    this.model.update(dt, c, env);

    // Sync visible model.
    this.parts.group.position.copy(this.model.position);
    this.parts.group.quaternion.copy(this.model.quaternion);

    // Prop spin scales with throttle + airspeed.
    this.propSpin += dt * (10 + this.model.throttle * 55 + this.model.airspeed * 0.2);
    this.parts.propeller.rotation.z = this.propSpin;

    // Animated control surfaces reflect commanded inputs.
    const m = this.model;
    const defl = 0.5; // max radians deflection
    this.parts.aileronL.rotation.x = m.surfRoll * defl;
    this.parts.aileronR.rotation.x = -m.surfRoll * defl;
    this.parts.elevator.rotation.x = -m.surfPitch * defl;
    this.parts.rudder.rotation.y = m.surfYaw * defl;

    // Subtle prop-wash / control loading: elevator adds extra with AoA.
    this.parts.elevator.rotation.x += THREE.MathUtils.clamp(-m.aoa * 0.4, -0.25, 0.25);
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }
}
