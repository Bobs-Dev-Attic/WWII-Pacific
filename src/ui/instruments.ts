// Floating, semi-transparent "glass cockpit" flight instruments rendered as SVG.
// A classic instrument subset: Airspeed Indicator, Attitude Indicator (artificial
// horizon with a pitch ladder, bank pointer and a slip/skid bubble), Altimeter,
// Heading Indicator (compass), and a Fuel gauge. All are driven each frame from
// the flight model and float over the 3D view.

export interface InstrumentData {
  airspeedMph: number;
  maxSpeedMph: number;
  altitudeFt: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  slip: number; // -1 (skid left) .. +1
  fuelFraction: number; // 0..1
  gForce: number;
  stalled: boolean;
}

const NS = 'http://www.w3.org/2000/svg';

export class Instruments {
  root: HTMLElement;
  private asiNeedle!: SVGElement;
  private altNeedle!: SVGElement;
  private altText!: SVGTextElement;
  private aiRoll!: SVGElement;
  private aiPitch!: SVGElement;
  private aiBank!: SVGElement;
  private aiBall!: SVGElement;
  private compassRose!: SVGElement;
  private compassText!: SVGTextElement;
  private fuelNeedle!: SVGElement;
  private gText!: SVGTextElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'instruments';
    parent.appendChild(this.root);
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="gauge asi">${this.svgAirspeed()}<div class="gauge-lbl">AIRSPEED</div></div>
      <div class="gauge ai">${this.svgAttitude()}</div>
      <div class="gauge alt">${this.svgAltimeter()}<div class="gauge-lbl">ALT ft</div></div>
      <div class="gauge fuel">${this.svgFuel()}<div class="gauge-lbl">FUEL</div></div>
      <div class="gauge compass">${this.svgCompass()}</div>
    `;
    this.asiNeedle = this.root.querySelector('#asi-needle')!;
    this.altNeedle = this.root.querySelector('#alt-needle')!;
    this.altText = this.root.querySelector('#alt-text')!;
    this.aiRoll = this.root.querySelector('#ai-roll')!;
    this.aiPitch = this.root.querySelector('#ai-pitch')!;
    this.aiBank = this.root.querySelector('#ai-bank')!;
    this.aiBall = this.root.querySelector('#ai-ball')!;
    this.compassRose = this.root.querySelector('#compass-rose')!;
    this.compassText = this.root.querySelector('#compass-text')!;
    this.fuelNeedle = this.root.querySelector('#fuel-needle')!;
    this.gText = this.root.querySelector('#g-text')!;
  }

  // ---- SVG builders ----
  private bezel(): string {
    return `<circle cx="50" cy="50" r="49" class="in-bezel"/><circle cx="50" cy="50" r="45" class="in-face"/>`;
  }

  private tickRing(count: number, from: number, to: number, r1: number, r2: number, cls = 'in-tick'): string {
    let s = '';
    for (let i = 0; i <= count; i++) {
      const a = ((from + ((to - from) * i) / count) * Math.PI) / 180;
      const x1 = 50 + Math.sin(a) * r1;
      const y1 = 50 - Math.cos(a) * r1;
      const x2 = 50 + Math.sin(a) * r2;
      const y2 = 50 - Math.cos(a) * r2;
      s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls}"/>`;
    }
    return s;
  }

  private svgAirspeed(): string {
    // 270° sweep from -135° to +135°; numeric labels every 20%.
    let labels = '';
    for (let i = 0; i <= 5; i++) {
      const a = ((-135 + (270 * i) / 5) * Math.PI) / 180;
      const x = 50 + Math.sin(a) * 30;
      const y = 50 - Math.cos(a) * 30 + 3;
      labels += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="in-num">${i * 2}</text>`;
    }
    return `<svg viewBox="0 0 100 100" class="dial">
      ${this.bezel()}
      ${this.tickRing(10, -135, 135, 38, 44)}
      ${this.tickRing(50, -135, 135, 41, 44, 'in-tick-sm')}
      ${labels}
      <text x="50" y="72" class="in-cap">x10 mph</text>
      <g id="asi-needle"><line x1="50" y1="54" x2="50" y2="16" class="in-needle"/><circle cx="50" cy="50" r="3.5" class="in-hub"/></g>
    </svg>`;
  }

  private svgAltimeter(): string {
    // One needle turn per 1000 ft; digital thousands in the face.
    let labels = '';
    for (let i = 0; i < 10; i++) {
      const a = ((360 * i) / 10) * (Math.PI / 180);
      const x = 50 + Math.sin(a) * 31;
      const y = 50 - Math.cos(a) * 31 + 3;
      labels += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="in-num">${i}</text>`;
    }
    return `<svg viewBox="0 0 100 100" class="dial">
      ${this.bezel()}
      ${this.tickRing(10, 0, 360, 38, 44)}
      ${this.tickRing(50, 0, 360, 41, 44, 'in-tick-sm')}
      ${labels}
      <rect x="30" y="58" width="40" height="14" rx="2" class="in-window"/>
      <text id="alt-text" x="50" y="68" class="in-digi">0</text>
      <g id="alt-needle"><line x1="50" y1="56" x2="50" y2="14" class="in-needle"/><circle cx="50" cy="50" r="3.5" class="in-hub"/></g>
    </svg>`;
  }

  private svgAttitude(): string {
    // Pitch ladder lines every 10°.
    let ladder = '';
    for (let p = -30; p <= 30; p += 10) {
      if (p === 0) continue;
      const y = 50 + p * 1.4;
      const w = p % 20 === 0 ? 20 : 12;
      ladder += `<line x1="${50 - w / 2}" y1="${y}" x2="${50 + w / 2}" y2="${y}" class="in-ladder"/>`;
      ladder += `<text x="${50 + w / 2 + 3}" y="${y + 2}" class="in-ladder-num">${Math.abs(p)}</text>`;
    }
    // Bank scale ticks at top.
    let bank = '';
    for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = (b * Math.PI) / 180;
      const r1 = b % 30 === 0 ? 40 : 43;
      const x1 = 50 + Math.sin(a) * r1;
      const y1 = 50 - Math.cos(a) * r1;
      const x2 = 50 + Math.sin(a) * 45;
      const y2 = 50 - Math.cos(a) * 45;
      bank += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="in-tick"/>`;
    }
    return `<svg viewBox="0 0 100 100" class="dial">
      <defs><clipPath id="ai-clip"><circle cx="50" cy="50" r="44"/></clipPath></defs>
      <circle cx="50" cy="50" r="49" class="in-bezel"/>
      <g clip-path="url(#ai-clip)">
        <g id="ai-roll">
          <g id="ai-pitch">
            <rect x="-40" y="-70" width="180" height="120" class="ai-sky"/>
            <rect x="-40" y="50" width="180" height="140" class="ai-ground"/>
            <line x1="-40" y1="50" x2="140" y2="50" class="ai-horizon"/>
            ${ladder}
          </g>
        </g>
        <rect x="0" y="0" width="100" height="100" fill="none"/>
      </g>
      ${bank}
      <polygon points="50,7 46,14 54,14" class="ai-bankptr-fixed"/>
      <g id="ai-bank"><polygon points="50,10 47,16 53,16" class="ai-bankptr"/></g>
      <!-- fixed aircraft symbol -->
      <line x1="30" y1="50" x2="42" y2="50" class="ai-wing"/>
      <line x1="58" y1="50" x2="70" y2="50" class="ai-wing"/>
      <circle cx="50" cy="50" r="2" class="ai-wing"/>
      <!-- slip/skid bubble -->
      <rect x="38" y="84" width="24" height="7" rx="3.5" class="in-tube"/>
      <line x1="46" y1="83" x2="46" y2="92" class="in-tick-sm"/>
      <line x1="54" y1="83" x2="54" y2="92" class="in-tick-sm"/>
      <circle id="ai-ball" cx="50" cy="87.5" r="3" class="in-ball"/>
    </svg>`;
  }

  private svgCompass(): string {
    let rose = '';
    const cards: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let d = 0; d < 360; d += 30) {
      const a = (d * Math.PI) / 180;
      const x1 = 50 + Math.sin(a) * 38;
      const y1 = 50 - Math.cos(a) * 38;
      const x2 = 50 + Math.sin(a) * 44;
      const y2 = 50 - Math.cos(a) * 44;
      rose += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="in-tick"/>`;
      const tx = 50 + Math.sin(a) * 31;
      const ty = 50 - Math.cos(a) * 31 + 3;
      const lbl = cards[d] ?? (d / 10).toString();
      const cls = cards[d] ? (d === 0 ? 'in-card in-north' : 'in-card') : 'in-num';
      rose += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" class="${cls}">${lbl}</text>`;
    }
    return `<svg viewBox="0 0 100 100" class="dial">
      ${this.bezel()}
      <g id="compass-rose">${rose}</g>
      <polygon points="50,4 45,14 55,14" class="in-lubber"/>
      <rect x="34" y="44" width="32" height="14" rx="2" class="in-window"/>
      <text id="compass-text" x="50" y="54" class="in-digi">000°</text>
      <text x="50" y="70" class="in-cap">HDG</text>
      <text id="g-text" x="50" y="84" class="in-cap-g">1.0G</text>
    </svg>`;
  }

  private svgFuel(): string {
    // 120° arc from -60° (E) to +60° (F), red zone near empty.
    return `<svg viewBox="0 0 100 100" class="dial">
      ${this.bezel()}
      ${this.tickRing(8, -60, 60, 38, 44)}
      <path d="M ${(50 + Math.sin((-60 * Math.PI) / 180) * 41).toFixed(1)} ${(50 - Math.cos((-60 * Math.PI) / 180) * 41).toFixed(1)}
               A 41 41 0 0 1 ${(50 + Math.sin((-30 * Math.PI) / 180) * 41).toFixed(1)} ${(50 - Math.cos((-30 * Math.PI) / 180) * 41).toFixed(1)}"
            class="fuel-red"/>
      <text x="26" y="66" class="in-card">E</text>
      <text x="74" y="66" class="in-card">F</text>
      <g id="fuel-needle"><line x1="50" y1="54" x2="50" y2="18" class="in-needle"/><circle cx="50" cy="50" r="3.5" class="in-hub"/></g>
    </svg>`;
  }

  update(d: InstrumentData): void {
    // Airspeed
    const spdFrac = Math.min(1, d.airspeedMph / d.maxSpeedMph);
    this.asiNeedle.setAttribute('transform', `rotate(${-135 + spdFrac * 270} 50 50)`);
    // Altimeter
    const altAngle = ((d.altitudeFt % 1000) / 1000) * 360;
    this.altNeedle.setAttribute('transform', `rotate(${altAngle} 50 50)`);
    this.altText.textContent = Math.round(d.altitudeFt).toLocaleString();
    // Attitude
    const pitchPx = Math.max(-38, Math.min(38, d.pitchDeg * 1.4));
    this.aiPitch.setAttribute('transform', `translate(0 ${pitchPx.toFixed(1)})`);
    this.aiRoll.setAttribute('transform', `rotate(${(-d.rollDeg).toFixed(1)} 50 50)`);
    this.aiBank.setAttribute('transform', `rotate(${(-d.rollDeg).toFixed(1)} 50 50)`);
    const ballX = 50 + Math.max(-1, Math.min(1, d.slip)) * 7;
    this.aiBall.setAttribute('cx', ballX.toFixed(1));
    // Compass
    this.compassRose.setAttribute('transform', `rotate(${(-d.headingDeg).toFixed(1)} 50 50)`);
    this.compassText.textContent = `${Math.round(d.headingDeg).toString().padStart(3, '0')}°`;
    this.gText.textContent = `${d.gForce.toFixed(1)}G`;
    this.gText.setAttribute('class', Math.abs(d.gForce) > 6 ? 'in-cap-g warnG' : 'in-cap-g');
    // Fuel
    this.fuelNeedle.setAttribute('transform', `rotate(${-60 + d.fuelFraction * 120} 50 50)`);
    const fuelDial = this.root.querySelector('.gauge.fuel')!;
    fuelDial.classList.toggle('low', d.fuelFraction < 0.15);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  destroy(): void {
    this.root.remove();
  }
}
