import { VERSION_LABEL } from '../version';

// In-flight HUD + on-screen touch controls. Builds its own DOM into the given
// root and exposes update()/toast()/outcome() for the game loop to drive.

export interface HudData {
  airspeed: number; // m/s
  altitude: number; // m
  heading: number; // deg
  throttle: number; // 0..1
  pitch: number; // deg
  roll: number; // deg
  gForce: number;
  stalled: boolean;
  ammo: number;
  bombs: number;
  hp: number;
  maxHp: number;
  enemiesLeft: number;
  objectiveText: string;
  windDir: number;
  windSpeed: number;
}

const MS_TO_MPH = 2.23694;
const M_TO_FT = 3.28084;

export class Hud {
  root: HTMLElement;
  private tl!: HTMLElement;
  private tr!: HTMLElement;
  private bl!: HTMLElement;
  private crosshair!: HTMLElement;
  private pipper!: HTMLElement;
  private toastEl!: HTMLElement;
  private overlay!: HTMLElement;
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <div id="hud">
        <div class="hud-tl">
          <div>SPD <span class="hud-val" id="h-spd">0</span> mph</div>
          <div>ALT <span class="hud-val" id="h-alt">0</span> ft</div>
          <div>HDG <span class="hud-val" id="h-hdg">000</span>&deg;</div>
          <div>G <span class="hud-val" id="h-g">1.0</span></div>
        </div>
        <div class="hud-tr">
          <div id="h-obj">&mdash;</div>
          <div>ENEMY <span class="hud-val" id="h-enemy">0</span></div>
          <div>AMMO <span class="hud-val" id="h-ammo">0</span></div>
          <div>BOMBS <span class="hud-val" id="h-bomb">0</span></div>
          <div>WIND <span class="hud-val" id="h-wind">0</span></div>
        </div>
        <div class="hud-bl">
          <div>THR <span class="hud-val" id="h-thr">70</span>%</div>
          <div id="h-hull">HULL <span class="hud-val" id="h-hp">100</span>%</div>
          <div id="h-stall" class="warn hidden">STALL</div>
        </div>
      </div>

      <svg id="crosshair" viewBox="0 0 46 46">
        <circle cx="23" cy="23" r="15" fill="none" stroke="#8bf0b0" stroke-width="1.5" opacity="0.8"/>
        <line x1="23" y1="2" x2="23" y2="10" stroke="#8bf0b0" stroke-width="1.5"/>
        <line x1="23" y1="36" x2="23" y2="44" stroke="#8bf0b0" stroke-width="1.5"/>
        <line x1="2" y1="23" x2="10" y2="23" stroke="#8bf0b0" stroke-width="1.5"/>
        <line x1="36" y1="23" x2="44" y2="23" stroke="#8bf0b0" stroke-width="1.5"/>
        <circle cx="23" cy="23" r="1.5" fill="#8bf0b0"/>
      </svg>

      <svg id="pipper" class="hidden" viewBox="0 0 34 34"
           style="position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;z-index:5;pointer-events:none;">
        <circle cx="17" cy="17" r="12" fill="none" stroke="#ffd166" stroke-width="2"/>
        <circle cx="17" cy="17" r="2" fill="#ffd166"/>
        <line x1="17" y1="0" x2="17" y2="6" stroke="#ffd166" stroke-width="2"/>
      </svg>

      <!-- Touch controls -->
      <div id="joystick" class="touch-only"><div class="knob"></div></div>
      <div class="throttle touch-only" id="throttle"><div class="fill"></div><div class="lbl">THR</div></div>
      <div class="action-stack touch-only">
        <button class="abtn bomb" id="btn-bomb">BOMB</button>
        <button class="abtn fire" id="btn-fire">FIRE</button>
      </div>
      <div class="touch-only" style="position:fixed;left:calc(170px + var(--safe-l));bottom:calc(40px + var(--safe-b));z-index:6;display:flex;gap:10px;">
        <button class="abtn" id="btn-yaw-l" style="width:56px;height:56px;background:rgba(28,58,79,0.55);">&#8634;</button>
        <button class="abtn" id="btn-yaw-r" style="width:56px;height:56px;background:rgba(28,58,79,0.55);">&#8635;</button>
      </div>
      <button class="abtn touch-only" id="btn-view" style="position:fixed;right:calc(20px + var(--safe-r));top:calc(96px + var(--safe-t));width:52px;height:52px;background:rgba(28,58,79,0.55);z-index:6;">VIEW</button>

      <div class="toast" id="toast"></div>
      <div class="hint kbd">W/S pitch &middot; A/D roll &middot; Q/E rudder &middot; Shift/Ctrl throttle &middot; Space fire &middot; B bomb &middot; V view</div>

      <div id="overlay-msg" class="hidden">
        <h2 id="ov-title"></h2>
        <p id="ov-text"></p>
        <div style="display:flex;gap:12px;margin-top:24px;">
          <button class="btn" id="ov-retry">Re-fly</button>
          <button class="btn ghost" id="ov-menu">Change Battle</button>
        </div>
        <div style="margin-top:20px;font-size:11px;color:var(--ink-dim);">${VERSION_LABEL}</div>
      </div>
    `;
    this.tl = document.getElementById('h-spd')!.parentElement!.parentElement!;
    this.tr = document.getElementById('h-obj')!.parentElement!;
    this.bl = document.getElementById('h-thr')!.parentElement!;
    this.crosshair = document.getElementById('crosshair')!;
    this.pipper = document.getElementById('pipper')!;
    this.toastEl = document.getElementById('toast')!;
    this.overlay = document.getElementById('overlay-msg')!;
  }

  private set(id: string, v: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  update(d: HudData): void {
    this.set('h-spd', Math.round(d.airspeed * MS_TO_MPH).toString());
    this.set('h-alt', Math.round(d.altitude * M_TO_FT).toLocaleString());
    this.set('h-hdg', Math.round(d.heading).toString().padStart(3, '0'));
    this.set('h-g', d.gForce.toFixed(1));
    this.set('h-thr', Math.round(d.throttle * 100).toString());
    this.set('h-ammo', d.ammo.toString());
    this.set('h-bomb', d.bombs.toString());
    this.set('h-enemy', d.enemiesLeft.toString());
    this.set('h-obj', d.objectiveText);
    this.set('h-wind', `${Math.round(d.windSpeed * MS_TO_MPH)}mph @${Math.round(d.windDir)}°`);
    const hpPct = Math.round((d.hp / d.maxHp) * 100);
    this.set('h-hp', hpPct.toString());
    const hull = document.getElementById('h-hull')!;
    hull.className = hpPct < 30 ? 'warn' : '';
    const stall = document.getElementById('h-stall')!;
    stall.classList.toggle('hidden', !d.stalled);
    const gEl = document.getElementById('h-g')!;
    gEl.className = Math.abs(d.gForce) > 6 ? 'hud-val warn' : 'hud-val';
  }

  setPipper(x: number | null, y: number): void {
    if (x === null) {
      this.pipper.classList.add('hidden');
      return;
    }
    this.pipper.classList.remove('hidden');
    this.pipper.style.left = `${x}px`;
    this.pipper.style.top = `${y}px`;
  }

  toast(msg: string, dur = 2.2): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = dur;
  }

  tick(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }

  outcome(title: string, text: string, win: boolean): void {
    document.getElementById('ov-title')!.textContent = title;
    document.getElementById('ov-title')!.style.color = win ? 'var(--ok)' : 'var(--danger)';
    document.getElementById('ov-text')!.textContent = text;
    this.overlay.classList.remove('hidden');
  }

  hideOutcome(): void {
    this.overlay.classList.add('hidden');
  }

  onRetry(cb: () => void): void {
    document.getElementById('ov-retry')!.addEventListener('click', cb);
  }
  onMenu(cb: () => void): void {
    document.getElementById('ov-menu')!.addEventListener('click', cb);
  }

  destroy(): void {
    this.root.innerHTML = '';
  }
}
