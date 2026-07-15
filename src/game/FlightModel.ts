import * as THREE from 'three';
import type { PlaneSpec } from '../data/planes';

// Semi-realistic flight model.
// Integrates thrust, gravity (weight), lift, and drag on a rigid body, with
// angle-of-attack driven lift, stall behaviour, and airspeed-scaled control
// authority. Wind is fed in through the environment and alters the relative
// airflow (so it affects lift, drift, and — via the weapons system — ballistics).

export interface ControlInput {
  pitch: number; // -1 (nose down) .. +1 (nose up)
  roll: number; // -1 (left) .. +1 (right)
  yaw: number; // -1 (left) .. +1 (right)
  throttle: number; // 0 .. 1
}

export interface Environment {
  wind: THREE.Vector3; // world-space wind velocity (m/s)
  gustPhase: number;
}

const DEG = Math.PI / 180;
const RHO0 = 1.225; // sea-level air density kg/m^3
const G = 9.81;
const SEA_LEVEL = 0; // world Y of the ocean surface

export class FlightModel {
  spec: PlaneSpec;
  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  quaternion = new THREE.Quaternion();

  // Instantaneous state exposed for HUD / animation
  airspeed = 0; // m/s relative to air
  groundSpeed = 0;
  aoa = 0; // radians
  gForce = 1;
  stalled = false;
  throttle = 0;

  // Smoothed control-surface deflections for animation (-1..1)
  surfPitch = 0;
  surfRoll = 0;
  surfYaw = 0;

  private tmpF = new THREE.Vector3();
  private prevVel = new THREE.Vector3();

  constructor(spec: PlaneSpec) {
    this.spec = spec;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 0, 1).applyQuaternion(this.quaternion);
  }
  up(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 1, 0).applyQuaternion(this.quaternion);
  }
  right(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(1, 0, 0).applyQuaternion(this.quaternion);
  }

  get altitude(): number {
    return this.position.y - SEA_LEVEL;
  }

  private airDensity(): number {
    // Exponential atmosphere approximation.
    return RHO0 * Math.exp(-Math.max(0, this.altitude) / 9000);
  }

  // Lift coefficient vs angle of attack with a soft stall past the critical AoA.
  private clForAoa(aoa: number): { cl: number; stalled: boolean } {
    const critical = 16 * DEG;
    const slope = 5.0; // per radian (roughly 2*pi tempered)
    const a = aoa;
    if (Math.abs(a) <= critical) {
      return { cl: slope * a, stalled: false };
    }
    // Past stall: lift collapses, falling off with more AoA.
    const over = Math.abs(a) - critical;
    const peak = slope * critical;
    const cl = Math.sign(a) * Math.max(0.15, peak - over * 3.2);
    return { cl, stalled: true };
  }

  update(dt: number, c: ControlInput, env: Environment): void {
    const spec = this.spec;
    this.throttle = c.throttle;

    const fwd = this.forward();
    const up = this.up();

    // Relative airflow (accounts for wind).
    const airVel = this.tmpF.copy(this.velocity).sub(env.wind);
    const speed = airVel.length();
    this.airspeed = speed;
    this.groundSpeed = this.velocity.length();

    // Angle of attack: air coming from below the wing => positive AoA.
    const vForward = airVel.dot(fwd);
    const vUp = airVel.dot(up);
    this.aoa = speed > 0.5 ? Math.atan2(-vUp, Math.max(0.1, vForward)) : 0;

    const rho = this.airDensity();
    const q = 0.5 * rho * speed * speed; // dynamic pressure

    const { cl, stalled } = this.clForAoa(this.aoa);
    this.stalled = stalled && speed > 1;

    // --- Aerodynamic forces ---
    const force = new THREE.Vector3();

    // Lift: perpendicular to airflow, in the plane of body-up.
    if (speed > 0.5) {
      const liftMag = q * spec.wingArea * cl;
      // Lift direction: airVel x right, then normalized toward body up.
      const airDir = airVel.clone().normalize();
      const right = this.right();
      const liftDir = new THREE.Vector3().crossVectors(right, airDir).normalize();
      if (liftDir.dot(up) < 0) liftDir.negate();
      force.addScaledVector(liftDir, liftMag);

      // Drag: parasitic + induced, opposite airflow.
      const cd = 0.028 + 0.05 * cl * cl + (stalled ? 0.25 : 0);
      const dragMag = q * spec.wingArea * cd;
      force.addScaledVector(airDir, -dragMag);
    }

    // Thrust along nose, scaled by air density (engines thin out with altitude).
    const thrustMag = c.throttle * spec.maxThrust * (rho / RHO0);
    force.addScaledVector(fwd, thrustMag);

    // Gravity (weight).
    force.y -= spec.mass * G;

    // Integrate translation.
    const accel = force.multiplyScalar(1 / spec.mass);
    this.prevVel.copy(this.velocity);
    this.velocity.addScaledVector(accel, dt);
    this.position.addScaledVector(this.velocity, dt);

    // G-force estimate (vertical body accel / g).
    const dv = this.velocity.clone().sub(this.prevVel).multiplyScalar(1 / dt);
    this.gForce = 1 + dv.dot(up) / G;

    // --- Rotational control ---
    // Control authority scales with airspeed (mushy when slow / stalled).
    const refSpeed = spec.stallSpeed * 1.6;
    let authority = THREE.MathUtils.clamp(speed / refSpeed, 0.08, 1.4);
    if (this.stalled) authority *= 0.45;

    const pitchRate = c.pitch * spec.turnRate * DEG * authority;
    const rollRate = c.roll * spec.rollRate * DEG * authority;
    const yawRate = c.yaw * spec.turnRate * 0.55 * DEG * authority;

    // Weathervane / pitch stability: nose is gently pulled toward the airflow,
    // giving natural stability and pendulum feel.
    const stability = 0.9 * authority;
    const pitchStab = -this.aoa * stability;

    this.applyBodyRotation(rollRate * dt, pitchRate * dt + pitchStab * dt, yawRate * dt);

    // Smooth control-surface deflection for animation.
    const k = 1 - Math.exp(-dt * 10);
    this.surfPitch += (c.pitch - this.surfPitch) * k;
    this.surfRoll += (c.roll - this.surfRoll) * k;
    this.surfYaw += (c.yaw - this.surfYaw) * k;
  }

  private applyBodyRotation(roll: number, pitch: number, yaw: number): void {
    const q = this.quaternion;
    const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    q.multiply(qYaw).multiply(qPitch).multiply(qRoll);
    q.normalize();
  }

  // Orientation helpers for HUD.
  get headingDeg(): number {
    const f = this.forward();
    let h = Math.atan2(f.x, f.z) / DEG;
    if (h < 0) h += 360;
    return h;
  }
  get pitchDeg(): number {
    const f = this.forward();
    return Math.asin(THREE.MathUtils.clamp(f.y, -1, 1)) / DEG;
  }
  get rollDeg(): number {
    const r = this.right();
    return Math.atan2(r.y, Math.sqrt(r.x * r.x + r.z * r.z)) / DEG * -1;
  }
}
