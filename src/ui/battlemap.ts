// Full-screen battlefield map page. North-up, auto-scaled to fit every contact
// (player, enemies, ships, islands, objective) so the player can gauge where
// they are and where the fight is. Opening it pauses the sortie.

export interface MapBlip {
  x: number;
  z: number;
  kind: 'enemy' | 'target' | 'friendly' | 'objective';
  headingRad?: number;
}

export interface MapData {
  player: { x: number; z: number; headingRad: number };
  blips: MapBlip[];
  islands: { x: number; z: number; r: number }[];
  objective: { x: number; z: number } | null;
  title: string;
  objectiveText: string;
}

const COLORS = {
  enemy: '#ff5a44',
  target: '#ffb14a',
  friendly: '#4a9fe6',
  objective: '#e3b23c',
  player: '#eafff2',
};

export class BattleMap {
  root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private open = false;

  constructor(parent: HTMLElement, private onClose: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'battlemap';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="map-panel">
        <div class="map-head">
          <div>
            <div class="map-title" id="map-title">Battlefield</div>
            <div class="map-obj" id="map-obj"></div>
          </div>
          <button class="btn ghost" id="map-close">Close ✕</button>
        </div>
        <canvas id="map-canvas"></canvas>
        <div class="map-legend">
          <span><i style="background:${COLORS.player}"></i>You</span>
          <span><i style="background:${COLORS.enemy}"></i>Enemy fighter</span>
          <span><i style="background:${COLORS.target}"></i>Enemy ship</span>
          <span><i style="background:${COLORS.friendly}"></i>Friendly ship</span>
          <span><i style="background:${COLORS.objective}"></i>Objective</span>
        </div>
      </div>`;
    parent.appendChild(this.root);
    this.canvas = this.root.querySelector('#map-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.root.querySelector('#map-close')!.addEventListener('click', () => this.close());
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(data: MapData): void {
    if (this.open) this.close();
    else this.show(data);
  }

  show(data: MapData): void {
    this.open = true;
    this.root.classList.remove('hidden');
    this.resize();
    this.draw(data);
  }

  close(): void {
    this.open = false;
    this.root.classList.add('hidden');
    this.onClose();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(200, rect.width * dpr);
    this.canvas.height = Math.max(200, rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Redraw with fresh data (called each frame while open so contacts move).
  draw(data: MapData): void {
    if (!this.open) return;
    const ctx = this.ctx;
    const w = this.canvas.clientWidth || this.canvas.width;
    const h = this.canvas.clientHeight || this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    document.getElementById('map-title')!.textContent = data.title;
    document.getElementById('map-obj')!.textContent = data.objectiveText;

    // Compute world bounds from all points.
    const pts: { x: number; z: number }[] = [data.player, ...data.blips, ...data.islands];
    if (data.objective) pts.push(data.objective);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const pad = 600;
    minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const margin = 16;
    const scale = Math.min((w - margin * 2) / spanX, (h - margin * 2) / spanZ);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    // World +z is up on the map (north). Screen y grows downward → invert z.
    const toX = (x: number) => w / 2 + (x - cx) * scale;
    const toY = (z: number) => h / 2 - (z - cz) * scale;

    // Sea background.
    ctx.fillStyle = 'rgba(18,58,86,0.5)';
    ctx.fillRect(0, 0, w, h);

    // Grid.
    ctx.strokeStyle = 'rgba(139,240,176,0.10)';
    ctx.lineWidth = 1;
    const grid = 1000 * scale;
    for (let gx = w / 2; gx < w; gx += grid) { line(ctx, gx, 0, gx, h); }
    for (let gx = w / 2; gx > 0; gx -= grid) { line(ctx, gx, 0, gx, h); }
    for (let gy = h / 2; gy < h; gy += grid) { line(ctx, 0, gy, w, gy); }
    for (let gy = h / 2; gy > 0; gy -= grid) { line(ctx, 0, gy, w, gy); }

    // Islands.
    ctx.fillStyle = 'rgba(90,122,69,0.85)';
    for (const is of data.islands) {
      ctx.beginPath();
      ctx.arc(toX(is.x), toY(is.z), Math.max(3, is.r * scale), 0, Math.PI * 2);
      ctx.fill();
    }

    // North indicator.
    ctx.fillStyle = 'rgba(234,255,242,0.6)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N ↑', w - 22, 18);

    // Blips.
    for (const b of data.blips) {
      const x = toX(b.x), y = toY(b.z);
      ctx.fillStyle = COLORS[b.kind];
      if (b.kind === 'target' || b.kind === 'friendly') {
        ctx.save();
        ctx.translate(x, y);
        if (b.headingRad !== undefined) ctx.rotate(-b.headingRad);
        ctx.fillRect(-3, -7, 6, 14); // ship as a small hull
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Objective.
    if (data.objective) {
      const x = toX(data.objective.x), y = toY(data.objective.z);
      ctx.fillStyle = COLORS.objective;
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + 7, y);
      ctx.lineTo(x, y + 7);
      ctx.lineTo(x - 7, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(227,178,60,0.5)';
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player (triangle pointing along heading).
    const px = toX(data.player.x), py = toY(data.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(data.player.headingRad); // heading 0 = north = up
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(234,255,242,0.4)';
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  destroy(): void {
    this.root.remove();
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
