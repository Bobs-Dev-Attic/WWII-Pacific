import * as THREE from 'three';
import type { BattleSpec } from '../data/battles';
import type { Environment } from './FlightModel';

// Dynamic wind + weather. Produces the Environment consumed by the flight model
// (base wind + gusts) and exposes visual parameters (fog, light, sky tint) used
// by the World to render the chosen battle's conditions.

export interface WeatherVisuals {
  fogColor: THREE.Color;
  fogDensity: number;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambient: number;
  sunDir: THREE.Vector3;
  cloudiness: number; // 0..1
}

export class Weather {
  env: Environment;
  private baseWind = new THREE.Vector3();
  private gust = new THREE.Vector3();
  private time = 0;
  visuals: WeatherVisuals;

  constructor(private battle: BattleSpec) {
    const dir = battle.windDir * (Math.PI / 180);
    this.baseWind.set(Math.sin(dir), 0, Math.cos(dir)).multiplyScalar(battle.windSpeed);
    this.env = { wind: new THREE.Vector3().copy(this.baseWind), gustPhase: 0 };
    this.visuals = this.computeVisuals(battle);
  }

  private computeVisuals(b: BattleSpec): WeatherVisuals {
    // Time-of-day sun.
    const tod: Record<string, { dir: THREE.Vector3; sun: number; amb: number; tint: THREE.Color }> = {
      dawn: {
        dir: new THREE.Vector3(-0.4, 0.35, -0.6).normalize(),
        sun: 0.9,
        amb: 0.35,
        tint: new THREE.Color(0xffb27a),
      },
      day: {
        dir: new THREE.Vector3(0.3, 0.85, 0.2).normalize(),
        sun: 1.25,
        amb: 0.55,
        tint: new THREE.Color(0xfff4e0),
      },
      dusk: {
        dir: new THREE.Vector3(0.6, 0.22, 0.5).normalize(),
        sun: 0.8,
        amb: 0.3,
        tint: new THREE.Color(0xff8f66),
      },
    };
    const t = tod[b.timeOfDay];

    const weatherMap: Record<string, { fog: number; cloud: number; dim: number }> = {
      clear: { fog: 0.00018, cloud: 0.15, dim: 1.0 },
      scattered: { fog: 0.0004, cloud: 0.4, dim: 0.9 },
      overcast: { fog: 0.0009, cloud: 0.75, dim: 0.6 },
      storm: { fog: 0.0018, cloud: 1.0, dim: 0.4 },
    };
    const w = weatherMap[b.weather];

    const skyTop = new THREE.Color(0x2b5a86).lerp(new THREE.Color(0x30363c), w.cloud);
    const skyBottom = new THREE.Color(0xbfe0f2).lerp(new THREE.Color(0x9aa4ab), w.cloud);
    skyTop.multiply(t.tint).multiplyScalar(0.9);
    skyBottom.lerp(t.tint, 0.25);

    const fogColor = skyBottom.clone().lerp(new THREE.Color(0x8a969d), 0.4);

    return {
      fogColor,
      fogDensity: w.fog,
      skyTop,
      skyBottom,
      sunColor: t.tint.clone(),
      sunIntensity: t.sun * w.dim,
      ambient: t.amb * (0.6 + 0.4 * w.dim),
      sunDir: t.dir,
      cloudiness: w.cloud,
    };
  }

  update(dt: number): void {
    this.time += dt;
    // Gusts: layered sine noise, stronger in rough weather.
    const strength = this.battle.windSpeed * (this.battle.weather === 'storm' ? 0.6 : 0.25);
    const gx = Math.sin(this.time * 0.7) * 0.6 + Math.sin(this.time * 1.9 + 1.3) * 0.4;
    const gy = Math.sin(this.time * 1.1 + 2.1) * 0.5;
    const gz = Math.cos(this.time * 0.5 + 0.7) * 0.6 + Math.sin(this.time * 2.3) * 0.4;
    this.gust.set(gx, gy * 0.4, gz).multiplyScalar(strength);
    this.env.wind.copy(this.baseWind).add(this.gust);
    this.env.gustPhase = this.time;
  }

  get windSpeed(): number {
    return this.env.wind.length();
  }
  get windDirDeg(): number {
    const w = this.env.wind;
    let d = Math.atan2(w.x, w.z) * (180 / Math.PI);
    if (d < 0) d += 360;
    return d;
  }
}
