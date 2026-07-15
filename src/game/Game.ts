import * as THREE from 'three';
import type { Side } from '../data/planes';
import { PLANES, enemyFighterFor } from '../data/planes';
import type { BattleSpec } from '../data/battles';
import { Weather } from './Weather';
import { World } from './World';
import { Weapons } from './Weapons';
import { Aircraft } from './Aircraft';
import { Squadron, type PlayerRef } from './EnemyAI';
import { Hud, type HudData } from '../ui/hud';
import { Instruments, type InstrumentData } from '../ui/instruments';
import { Minimap, type Blip } from '../ui/minimap';
import { BattleMap, type MapBlip } from '../ui/battlemap';
import { createInputState, type InputState } from './controls/InputState';
import { TouchControls } from './controls/TouchControls';
import { KeyboardControls } from './controls/KeyboardControls';

// Orchestrates a single sortie: renderer + camera, the world/weather, the
// player aircraft, the enemy squadron, weapons and collisions, camera work,
// the HUD, and win/lose evaluation.

export interface GameConfig {
  side: Side;
  battle: BattleSpec;
  onExitToMenu: () => void;
  onRestart: () => void;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private weather: Weather;
  private weapons: Weapons;
  private player: Aircraft;
  private squadron: Squadron;
  private hud: Hud;
  private instruments: Instruments;
  private minimap: Minimap;
  private battlemap: BattleMap;
  private input: InputState;
  private touch?: TouchControls;
  private keyboard: KeyboardControls;

  private clock = new THREE.Clock();
  private raf = 0;
  private running = false;
  private paused = false;
  private cockpitView = false;
  private outcomeShown = false;
  private elapsed = 0;
  private hudAccum = 0;
  private objectivePos: THREE.Vector3 | null = null;

  private camPos = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(private container: HTMLElement, private cfg: GameConfig) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.id = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.5, 9000);

    // World + weather
    this.weather = new Weather(cfg.battle);
    this.world = new World(cfg.battle, this.weather);
    this.weapons = new Weapons(this.world.scene);

    // Player plane selection based on side + objective.
    const playerSpec = this.pickPlayerPlane();
    this.player = new Aircraft(playerSpec);
    this.player.addToScene(this.world.scene);

    // Enemy squadron.
    const enemySpec = enemyFighterFor(cfg.side);
    this.squadron = new Squadron(this.world.scene, enemySpec, cfg.battle, this.weapons, this.world);

    // HUD + controls.
    const hudRoot = document.createElement('div');
    hudRoot.id = 'hud-root';
    container.appendChild(hudRoot);
    this.hud = new Hud(hudRoot);
    this.hud.onRetry(() => this.restart());
    this.hud.onMenu(() => this.exit());

    // Glass-cockpit gauges, radar mini-map, and full battle map.
    this.instruments = new Instruments(hudRoot);
    this.minimap = new Minimap(hudRoot);
    this.battlemap = new BattleMap(hudRoot, () => {
      this.paused = false;
    });
    this.hud.onMap(() => this.toggleMap());

    this.input = createInputState();
    this.keyboard = new KeyboardControls(this.input);
    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (isTouch) {
      document.body.classList.add('is-touch');
      this.touch = new TouchControls(this.input);
    }

    this.spawnPlayer();
    window.addEventListener('resize', this.onResize);

    const era = cfg.battle.date;
    this.hud.toast(`${cfg.battle.name} — ${era}`, 3);
  }

  private pickPlayerPlane(): (typeof PLANES)[string] {
    const { side, battle } = this.cfg;
    if (battle.objective === 'strike-ships') {
      return side === 'usa' ? PLANES.sbd_dauntless : PLANES.d3a_val;
    }
    if (side === 'usa') {
      // Later-war battles put the player in the Hellcat.
      const lateWar = ['philippine_sea', 'leyte_gulf', 'okinawa'].includes(battle.id);
      return lateWar ? PLANES.f6f_hellcat : PLANES.f4f_wildcat;
    }
    return PLANES.a6m_zero;
  }

  private spawnPlayer(): void {
    // Start airborne, at altitude, pointed toward the action.
    const startAlt = 700;
    this.player.reset(new THREE.Vector3(0, startAlt, 0), 0, this.player.spec.stallSpeed * 2.6);
    this.input.throttle = 0.8;
  }

  start(): void {
    this.running = true;
    this.clock.start();
    this.loop();
  }

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.update(dt);
    this.renderer.render(this.world.scene, this.camera);
  };

  private update(dt: number): void {
    // Inputs (still processed while paused so the map can be closed).
    this.keyboard.update(dt);
    this.touch?.update();
    if (this.input.mapToggle) {
      this.input.mapToggle = false;
      this.toggleMap();
    }
    if (this.input.viewToggle) {
      this.cockpitView = !this.cockpitView;
      this.input.viewToggle = false;
    }

    // While the battle map is open the sortie is frozen; keep the map live.
    if (this.paused) {
      this.battlemap.draw(this.buildMapData());
      return;
    }

    this.elapsed += dt;

    // Weather + world.
    this.weather.update(dt);
    this.world.update(dt, this.player.position);

    // Player flight.
    this.player.update(dt, this.input, this.weather.env);

    // Firing.
    if (this.input.firing && this.player.canFire()) {
      this.fireGuns();
    }
    if (this.input.dropBomb) {
      this.input.dropBomb = false;
      this.dropBomb();
    }

    // Enemy AI.
    const pref: PlayerRef = {
      position: this.player.position,
      velocity: this.player.velocity,
      forward: this.player.forward(this.tmp).clone(),
      alive: this.player.alive,
    };
    this.squadron.update(dt, pref);

    // Weapons + collisions.
    this.weapons.update(dt, this.weather.env.wind);
    this.handleCollisions();

    // Crash into sea.
    if (this.player.alive && this.player.position.y <= 1.5) {
      this.weapons.spawnExplosion(this.player.position.clone().setY(1), 20);
      this.player.damage(9999);
    }

    // Camera.
    this.updateCamera(dt);

    // Objective tracking (for arrow + radar + map).
    this.objectivePos = this.computeObjective();

    // Instruments + radar refresh every frame; text HUD a few times/sec.
    this.updateInstruments();
    this.updateMinimap();
    this.updateObjectiveArrow();
    this.hudAccum += dt;
    if (this.hudAccum > 0.08) {
      this.updateHud();
      this.hudAccum = 0;
    }
    this.hud.tick(dt);
    this.updatePipper();

    // Win / lose.
    if (!this.outcomeShown) this.evaluateOutcome();
  }

  private fireGuns(): void {
    const spec = this.player.spec;
    const fwd = this.player.forward().normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.player.model.quaternion);
    const nose = this.player.position.clone().addScaledVector(fwd, 4);
    const spread = Math.max(1, Math.floor(spec.guns / 2));
    for (let i = 0; i < spread; i++) {
      const offset = (i - (spread - 1) / 2) * 2.2;
      const origin = nose.clone().addScaledVector(right, offset);
      this.weapons.fireGun(origin, fwd, this.player.velocity, spec.side, spec.gunDamage, true);
      this.weapons.spawnMuzzleFlash(origin, fwd, true);
    }
    this.player.registerShot(spec.guns);
  }

  private dropBomb(): void {
    if (this.player.bombs <= 0) {
      this.hud.toast('No bombs remaining');
      return;
    }
    this.player.bombs--;
    const belly = this.player.position.clone().addScaledVector(
      new THREE.Vector3(0, -1, 0).applyQuaternion(this.player.model.quaternion),
      1
    );
    this.weapons.dropBomb(belly, this.player.velocity, this.player.spec.side, true);
    this.hud.toast('Bomb away!');
  }

  private handleCollisions(): void {
    const enemies = this.squadron.enemyList();

    // Player bullets vs enemies + ships.
    for (let i = this.weapons.bullets.length - 1; i >= 0; i--) {
      const b = this.weapons.bullets[i];
      let hit = false;
      if (b.fromPlayer) {
        for (const e of enemies) {
          if (!e.alive) continue;
          if (b.pos.distanceToSquared(e.pos) < 7 * 7) {
            this.squadron.damageEnemy(e, b.damage);
            hit = true;
            break;
          }
        }
        if (!hit) hit = this.bulletVsShips(b.pos, b.damage, 'enemyTargetsOnly');
      } else {
        // Enemy bullet vs player.
        if (this.player.alive && b.pos.distanceToSquared(this.player.position) < 6 * 6) {
          this.player.damage(b.damage);
          hit = true;
          if (this.player.hp > 0 && Math.random() < 0) {
            /* placeholder */
          }
        }
      }
      if (hit) this.weapons.bullets.splice(i, 1);
    }

    // Bombs vs ships.
    for (let i = this.weapons.bombs.length - 1; i >= 0; i--) {
      const bomb = this.weapons.bombs[i];
      for (const s of this.world.ships) {
        if (!s.alive) continue;
        const targetable = bomb.fromPlayer ? s.side !== this.cfg.side : s.side === this.cfg.side;
        if (!targetable) continue;
        const dxz = new THREE.Vector2(bomb.pos.x - s.group.position.x, bomb.pos.z - s.group.position.z);
        if (dxz.length() < 26 && bomb.pos.y < 30) {
          s.hp -= 150;
          this.weapons.spawnExplosion(bomb.pos.clone().setY(6), 22);
          if (s.hp <= 0 && s.alive) {
            s.alive = false;
            this.world.scene.remove(s.group);
            this.hud.toast('Ship sunk!');
          }
          this.weapons.bombs.splice(i, 1);
          break;
        }
      }
    }
  }

  private bulletVsShips(pos: THREE.Vector3, dmg: number, _mode: string): boolean {
    for (const s of this.world.ships) {
      if (!s.alive || s.side === this.cfg.side) continue;
      const dxz = new THREE.Vector2(pos.x - s.group.position.x, pos.z - s.group.position.z);
      if (dxz.length() < 22 && pos.y < 24) {
        s.hp -= dmg;
        if (s.hp <= 0 && s.alive) {
          s.alive = false;
          this.world.scene.remove(s.group);
          this.hud.toast('Ship sunk!');
        }
        return true;
      }
    }
    return false;
  }

  private updateCamera(dt: number): void {
    const q = this.player.model.quaternion;
    if (this.cockpitView) {
      const eye = new THREE.Vector3(0, 0.9, 0.6).applyQuaternion(q).add(this.player.position);
      this.camera.position.copy(eye);
      const look = new THREE.Vector3(0, 0.4, 30).applyQuaternion(q).add(this.player.position);
      this.camera.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(q));
      this.camera.lookAt(look);
    } else {
      const desired = new THREE.Vector3(0, 4.2, -17).applyQuaternion(q).add(this.player.position);
      const k = 1 - Math.exp(-dt * 6);
      this.camPos.lerp(desired, k);
      if (this.camPos.lengthSq() === 0) this.camPos.copy(desired);
      this.camera.position.copy(this.camPos);
      const look = new THREE.Vector3(0, 1.2, 24).applyQuaternion(q).add(this.player.position);
      const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(q).lerp(new THREE.Vector3(0, 1, 0), 0.4);
      this.camera.up.copy(upVec);
      this.camera.lookAt(look);
    }
  }

  private updatePipper(): void {
    if (this.player.bombs <= 0 || !this.player.alive) {
      this.hud.setPipper(null, 0);
      return;
    }
    const belly = this.player.position.clone();
    const impact = this.weapons.predictBombImpact(belly, this.player.velocity, this.weather.env.wind);
    if (!impact) {
      this.hud.setPipper(null, 0);
      return;
    }
    const v = impact.clone().project(this.camera);
    if (v.z > 1) {
      this.hud.setPipper(null, 0);
      return;
    }
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    this.hud.setPipper(x, y);
  }

  private objectiveText(): string {
    const { objective } = this.cfg.battle;
    if (objective === 'strike-ships') {
      const left = this.world.aliveShips(this.cfg.side === 'usa' ? 'japan' : 'usa').length;
      return `SINK SHIPS: ${left}`;
    }
    if (objective === 'defend-fleet') {
      const left = this.world.aliveShips(this.cfg.side).length;
      return `DEFEND FLEET: ${left}`;
    }
    return 'CLEAR THE SKIES';
  }

  private updateHud(): void {
    const data: HudData = {
      throttle: this.input.throttle,
      stalled: this.player.model.stalled,
      outOfFuel: this.player.outOfFuel,
      fuelFraction: this.player.fuelFraction,
      ammo: this.player.ammo,
      bombs: this.player.bombs,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      enemiesLeft: this.squadron.aliveCount(),
      objectiveText: this.objectiveText(),
      windDir: this.weather.windDirDeg,
      windSpeed: this.weather.windSpeed,
    };
    this.hud.update(data);
  }

  private updateInstruments(): void {
    const m = this.player.model;
    // Slip/skid: lateral component of airflow in the body frame.
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quaternion);
    const airVel = this.player.velocity.clone().sub(this.weather.env.wind);
    const slip = THREE.MathUtils.clamp((airVel.dot(right) / Math.max(20, airVel.length())) * 4, -1, 1);
    const d: InstrumentData = {
      airspeedMph: m.airspeed * 2.23694,
      maxSpeedMph: this.player.spec.maxSpeed * 2.23694 * 1.15,
      altitudeFt: Math.max(0, m.altitude * 3.28084),
      headingDeg: m.headingDeg,
      pitchDeg: m.pitchDeg,
      rollDeg: m.rollDeg,
      slip,
      fuelFraction: this.player.fuelFraction,
      gForce: m.gForce,
      stalled: m.stalled,
    };
    this.instruments.update(d);
  }

  private updateMinimap(): void {
    const blips: Blip[] = [];
    for (const e of this.squadron.enemyList()) {
      if (e.alive) blips.push({ x: e.pos.x, z: e.pos.z, kind: 'enemy' });
    }
    for (const s of this.world.ships) {
      if (!s.alive) continue;
      blips.push({ x: s.group.position.x, z: s.group.position.z, kind: s.side === this.cfg.side ? 'friendly' : 'target' });
    }
    this.minimap.update({
      px: this.player.position.x,
      pz: this.player.position.z,
      headingRad: (this.player.model.headingDeg * Math.PI) / 180,
      blips,
      objective: this.objectivePos ? { x: this.objectivePos.x, z: this.objectivePos.z } : null,
    });
  }

  private updateObjectiveArrow(): void {
    if (!this.objectivePos) {
      this.hud.setObjectiveArrow(null, 0);
      return;
    }
    const to = this.objectivePos.clone().sub(this.player.position);
    const dist = to.length();
    // Relative bearing: 0 = dead ahead, +right.
    const heading = (this.player.model.headingDeg * Math.PI) / 180;
    const bearing = Math.atan2(to.x, to.z);
    let rel = bearing - heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    this.hud.setObjectiveArrow(rel, dist / 1000);
  }

  // The world point the player should head toward for the current objective.
  private computeObjective(): THREE.Vector3 | null {
    const side = this.cfg.side;
    const battleObj = this.cfg.battle.objective;
    if (battleObj === 'strike-ships') {
      return this.centroid(this.world.aliveShips(side === 'usa' ? 'japan' : 'usa').map((s) => s.group.position));
    }
    if (battleObj === 'defend-fleet') {
      // Guide toward the nearest attacker threatening the fleet.
      return this.nearestEnemyPos() ?? this.centroid(this.world.aliveShips(side).map((s) => s.group.position));
    }
    return this.nearestEnemyPos();
  }

  private nearestEnemyPos(): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (const e of this.squadron.enemyList()) {
      if (!e.alive) continue;
      const d = e.pos.distanceToSquared(this.player.position);
      if (d < bd) {
        bd = d;
        best = e.pos;
      }
    }
    return best ? best.clone() : null;
  }

  private centroid(points: THREE.Vector3[]): THREE.Vector3 | null {
    if (points.length === 0) return null;
    const c = new THREE.Vector3();
    for (const p of points) c.add(p);
    return c.multiplyScalar(1 / points.length);
  }

  private toggleMap(): void {
    if (this.battlemap.isOpen()) {
      this.battlemap.close();
    } else {
      this.paused = true;
      this.battlemap.show(this.buildMapData());
    }
  }

  private buildMapData() {
    const blips: MapBlip[] = [];
    for (const e of this.squadron.enemyList()) {
      if (e.alive) blips.push({ x: e.pos.x, z: e.pos.z, kind: 'enemy' });
    }
    for (const s of this.world.ships) {
      if (!s.alive) continue;
      blips.push({
        x: s.group.position.x,
        z: s.group.position.z,
        kind: s.side === this.cfg.side ? 'friendly' : 'target',
        headingRad: s.group.rotation.y,
      });
    }
    return {
      player: {
        x: this.player.position.x,
        z: this.player.position.z,
        headingRad: (this.player.model.headingDeg * Math.PI) / 180,
      },
      blips,
      islands: this.world.islands,
      objective: this.objectivePos ? { x: this.objectivePos.x, z: this.objectivePos.z } : null,
      title: `${this.cfg.battle.name} — ${this.cfg.battle.location}`,
      objectiveText: this.objectiveText(),
    };
  }

  private evaluateOutcome(): void {
    const { side } = this.cfg;
    const { objective } = this.cfg.battle;
    const enemySide = side === 'usa' ? 'japan' : 'usa';

    // Loss: player destroyed.
    if (!this.player.alive) {
      this.finish('SHOT DOWN', 'Your aircraft was destroyed. The squadron flies on without you.', false);
      return;
    }

    if (objective === 'strike-ships') {
      if (this.world.aliveShips(enemySide).length === 0) {
        this.finish('MISSION COMPLETE', 'Every enemy ship sent to the bottom. A decisive strike!', true);
      }
    } else if (objective === 'defend-fleet') {
      if (this.world.aliveShips(side).length === 0) {
        this.finish('FLEET LOST', 'The fleet you swore to protect lies beneath the waves.', false);
      } else if (this.squadron.aliveCount() === 0) {
        this.finish('SKIES SECURED', 'The last attacker is down and the fleet steams on. Well flown.', true);
      }
    } else {
      // air superiority
      if (this.squadron.aliveCount() === 0) {
        this.finish('AIR SUPERIORITY', 'Enemy squadron annihilated. The skies are yours.', true);
      }
    }
  }

  private finish(title: string, text: string, win: boolean): void {
    this.outcomeShown = true;
    const kills = this.squadron.killed;
    const detail = `${text}\n\nEnemy aircraft downed: ${kills}   Time: ${Math.floor(this.elapsed)}s`;
    this.hud.outcome(title, detail, win);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private restart(): void {
    // Tear down and rebuild the same sortie for a clean re-fly.
    this.destroy();
    this.cfg.onRestart();
  }

  private exit(): void {
    this.destroy();
    this.cfg.onExitToMenu();
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.instruments.destroy();
    this.minimap.destroy();
    this.battlemap.destroy();
    this.hud.destroy();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    document.getElementById('hud-root')?.remove();
    document.body.classList.remove('is-touch');
  }
}
