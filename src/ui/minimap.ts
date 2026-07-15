// Heading-up radar mini-map. Plots nearby enemies, ships and the objective
// relative to the player, clamping distant contacts to the rim (so the rim
// doubles as a direction arrow). Range auto-set; player fixed at centre facing up.

export type BlipKind = 'enemy' | 'target' | 'friendly' | 'objective';

export interface Blip {
  x: number;
  z: number;
  kind: BlipKind;
}

export interface MinimapData {
  px: number;
  pz: number;
  headingRad: number;
  blips: Blip[];
  objective: { x: number; z: number } | null;
}

const COLORS: Record<BlipKind, string> = {
  enemy: '#ff5a44',
  target: '#ffb14a',
  friendly: '#4a9fe6',
  objective: '#e3b23c',
};

export class Minimap {
  root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size = 130;
  private range = 2600; // metres shown to the rim
  private distEl: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'minimap';
    this.root.innerHTML = `<canvas width="${this.size}" height="${this.size}"></canvas>
      <div class="mm-dist" id="mm-dist"></div>`;
    parent.appendChild(this.root);
    this.canvas = this.root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.distEl = this.root.querySelector('#mm-dist')!;
  }

  private toScreen(dx: number, dz: number, h: number): { x: number; y: number; clamped: boolean } {
    // Rotate world delta into heading-up screen space.
    const fwd = dx * Math.sin(h) + dz * Math.cos(h);
    const right = dx * Math.cos(h) - dz * Math.sin(h);
    const c = this.size / 2;
    const scale = (c - 10) / this.range;
    let sx = right * scale;
    let sy = -fwd * scale;
    const r = Math.hypot(sx, sy);
    const maxR = c - 8;
    let clamped = false;
    if (r > maxR) {
      sx = (sx / r) * maxR;
      sy = (sy / r) * maxR;
      clamped = true;
    }
    return { x: c + sx, y: c + sy, clamped };
  }

  update(d: MinimapData): void {
    const ctx = this.ctx;
    const c = this.size / 2;
    ctx.clearRect(0, 0, this.size, this.size);

    // Face + range rings.
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,20,30,0.55)';
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(139,240,176,0.25)';
    ctx.lineWidth = 1;
    for (const rr of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(c, c, (c - 8) * rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Cross hairs.
    ctx.beginPath();
    ctx.moveTo(c, 6);
    ctx.lineTo(c, this.size - 6);
    ctx.moveTo(6, c);
    ctx.lineTo(this.size - 6, c);
    ctx.strokeStyle = 'rgba(139,240,176,0.15)';
    ctx.stroke();

    // Blips.
    for (const b of d.blips) {
      const p = this.toScreen(b.x - d.px, b.z - d.pz, d.headingRad);
      ctx.fillStyle = COLORS[b.kind];
      ctx.globalAlpha = p.clamped ? 0.5 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, b.kind === 'enemy' ? 2.6 : 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Objective marker + rim arrow.
    if (d.objective) {
      const p = this.toScreen(d.objective.x - d.px, d.objective.z - d.pz, d.headingRad);
      ctx.fillStyle = COLORS.objective;
      if (p.clamped) {
        // Draw a chevron pointing outward toward the objective.
        const ang = Math.atan2(p.y - c, p.x - c);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(5, 4);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 5);
        ctx.lineTo(p.x + 5, p.y);
        ctx.lineTo(p.x, p.y + 5);
        ctx.lineTo(p.x - 5, p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // Player at centre (fixed, facing up).
    ctx.fillStyle = '#eafff2';
    ctx.beginPath();
    ctx.moveTo(c, c - 6);
    ctx.lineTo(c + 4, c + 5);
    ctx.lineTo(c - 4, c + 5);
    ctx.closePath();
    ctx.fill();

    // Distance to objective.
    if (d.objective) {
      const dist = Math.hypot(d.objective.x - d.px, d.objective.z - d.pz);
      this.distEl.textContent = `OBJ ${(dist / 1000).toFixed(1)} km`;
    } else {
      this.distEl.textContent = '';
    }
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  destroy(): void {
    this.root.remove();
  }
}
