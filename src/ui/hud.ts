import { VERSION_LABEL } from '../version';

// In-flight text HUD + on-screen touch controls. The analog gauges, radar and
// battle map are separate modules mounted by the Game; this handles the compact
// status readout, crosshair, bomb pipper, objective bearing arrow, toasts and
// the outcome screen.

export interface HudData {
  throttle: number; // 0..1
  stalled: boolean;
  outOfFuel: boolean;
  fuelFraction: number;
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

export class Hud {
  root: HTMLElement;
  private crosshair!: HTMLElement;
  private pipper!: HTMLElement;
  private toastEl!: HTMLElement;
  private overlay!: HTMLElement;
  private objArrow!: HTMLElement;
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <div id="hud">
        <div class="hud-status">
          <div class="hud-obj" id="h-obj">&mdash;</div>
          <div class="hud-row">
            <span>ENEMY <b id="h-enemy">0</b></span>
            <span>AMMO <b id="h-ammo">0</b></span>
            <span>BOMBS <b id="h-bomb">0</b></span>
          </div>
          <div class="hud-row">
            <span id="h-hull">HULL <b id="h-hp">100</b>%</span>
            <span>WIND <b id="h-wind">0</b></span>
          </div>
          <div id="h-stall" class="warn hidden">▲ STALL</div>
          <div id="h-fuelwarn" class="warn hidden">⚠ FUEL</div>
        </div>
      </div>

      <button class="hud-btn" id="btn-map">MAP</button>

      <div id="obj-arrow">
        <svg viewBox="0 0 40 48" width="40" height="48">
          <g id="obj-arrow-rot">
            <polygon points="20,2 30,18 22,18 22,30 18,30 18,18 10,18" fill="#e3b23c"/>
          </g>
        </svg>
        <div class="obj-dist" id="obj-dist"></div>
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
      <button class="abtn touch-only" id="btn-view" style="position:fixed;right:calc(20px + var(--safe-r));top:calc(206px + var(--safe-t));width:52px;height:52px;background:rgba(28,58,79,0.55);z-index:6;">VIEW</button>

      <div class="toast" id="toast"></div>
      <div class="hint kbd">W/S pitch · A/D roll · Q/E rudder · Shift/Ctrl throttle · Space fire · B bomb · V view · M map</div>

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
    this.crosshair = document.getElementById('crosshair')!;
    this.pipper = document.getElementById('pipper')!;
    this.toastEl = document.getElementById('toast')!;
    this.overlay = document.getElementById('overlay-msg')!;
    this.objArrow = document.getElementById('obj-arrow')!;
  }

  private set(id: string, v: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  update(d: HudData): void {
    this.set('h-ammo', d.ammo.toString());
    this.set('h-bomb', d.bombs.toString());
    this.set('h-enemy', d.enemiesLeft.toString());
    this.set('h-obj', d.objectiveText);
    this.set('h-wind', `${Math.round(d.windSpeed * MS_TO_MPH)}mph @${Math.round(d.windDir)}°`);
    const hpPct = Math.round((d.hp / d.maxHp) * 100);
    this.set('h-hp', hpPct.toString());
    document.getElementById('h-hull')!.className = hpPct < 30 ? 'warn' : '';
    document.getElementById('h-stall')!.classList.toggle('hidden', !d.stalled);
    document.getElementById('h-fuelwarn')!.classList.toggle('hidden', !(d.outOfFuel || d.fuelFraction < 0.12));
  }

  // Objective bearing arrow (relative to the nose). angleRad: 0 = dead ahead.
  setObjectiveArrow(angleRad: number | null, distanceKm: number): void {
    if (angleRad === null) {
      this.objArrow.style.display = 'none';
      return;
    }
    this.objArrow.style.display = '';
    const rot = document.getElementById('obj-arrow-rot')!;
    rot.setAttribute('transform', `rotate(${(angleRad * 180) / Math.PI} 20 24)`);
    this.set('obj-dist', `${distanceKm.toFixed(1)} km`);
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

  onMap(cb: () => void): void {
    document.getElementById('btn-map')!.addEventListener('click', cb);
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
