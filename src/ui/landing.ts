import { VERSION_LABEL } from '../version';
import type { Side } from '../data/planes';
import { BATTLES, type BattleSpec } from '../data/battles';

// Landing / mission-select flow.
// Screen 1: title + version + choose a side (Americans or Japanese).
// Screen 2: choose a famous Pacific battle, then launch.

export interface Selection {
  side: Side;
  battle: BattleSpec;
}

export class Landing {
  private side: Side | null = null;
  private battle: BattleSpec | null = null;

  constructor(private root: HTMLElement, private onLaunch: (sel: Selection) => void) {}

  show(): void {
    this.render();
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="screen" id="screen-side">
        <div class="title">
          <div class="subtitle">Pacific Theater</div>
          <h1>WINGS OF WAR</h1>
          <div class="subtitle" style="letter-spacing:3px;color:var(--ink-dim);">WWII Flight Simulator</div>
          <div class="version-badge" id="version-badge">${VERSION_LABEL}</div>
        </div>

        <div class="section-label">Choose Your Side</div>
        <div class="card-row">
          <div class="side-card usa" data-side="usa">
            <div class="flag">🇺🇸</div>
            <h2>United States</h2>
            <p>Fly the rugged Wildcat, the Zero-killing Hellcat, and the Dauntless dive-bomber for the US Navy.</p>
          </div>
          <div class="side-card japan" data-side="japan">
            <div class="flag">🇯🇵</div>
            <h2>Empire of Japan</h2>
            <p>Take the controls of the legendary A6M Zero, the Val, and the Kate for the Imperial Japanese Navy.</p>
          </div>
        </div>

        <button class="btn" id="to-battles" disabled>Select Battle →</button>
        <div class="foot-note">
          Semi-authentic flight physics with wind, weather, weight & gravity. Animated control surfaces,
          ballistic gunnery & bombing, and enemy fighters flying historical formations.
        </div>
      </div>

      <div class="screen hidden" id="screen-battle">
        <div class="back-row">
          <button class="btn ghost" id="back-side">← Change Side</button>
        </div>
        <div class="section-label" id="battle-heading">Choose a Battle</div>
        <div class="battle-list" id="battle-list"></div>
        <button class="btn" id="launch" disabled>Take Off ✈</button>
        <div style="margin-top:16px;font-size:11px;color:var(--ink-dim);">${VERSION_LABEL}</div>
      </div>
    `;

    // Side selection.
    this.root.querySelectorAll<HTMLElement>('.side-card').forEach((card) => {
      card.addEventListener('click', () => {
        this.root.querySelectorAll('.side-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this.side = card.dataset.side as Side;
        (this.root.querySelector('#to-battles') as HTMLButtonElement).disabled = false;
      });
    });

    this.root.querySelector('#to-battles')!.addEventListener('click', () => {
      if (!this.side) return;
      this.buildBattleList();
      this.showScreen('screen-battle');
    });
    this.root.querySelector('#back-side')!.addEventListener('click', () => this.showScreen('screen-side'));
    this.root.querySelector('#launch')!.addEventListener('click', () => {
      if (this.side && this.battle) this.onLaunch({ side: this.side, battle: this.battle });
    });
  }

  private buildBattleList(): void {
    const heading = this.root.querySelector('#battle-heading')!;
    heading.textContent = this.side === 'usa' ? 'US Navy — Choose a Battle' : 'Imperial Navy — Choose a Battle';
    const list = this.root.querySelector('#battle-list')!;
    list.innerHTML = '';
    this.battle = null;
    (this.root.querySelector('#launch') as HTMLButtonElement).disabled = true;

    for (const b of BATTLES) {
      const el = document.createElement('div');
      el.className = 'battle';
      el.innerHTML = `
        <div class="b-top">
          <h3>${b.name}</h3>
          <span class="date">${b.date}</span>
        </div>
        <p>${b.summary}</p>
        <div class="tags">${b.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
          <span class="tag">${labelWeather(b.weather)}</span>
          <span class="tag">${b.enemyCount} bandits</span>
        </div>
      `;
      el.addEventListener('click', () => {
        list.querySelectorAll('.battle').forEach((c) => c.classList.remove('selected'));
        el.classList.add('selected');
        this.battle = b;
        (this.root.querySelector('#launch') as HTMLButtonElement).disabled = false;
      });
      list.appendChild(el);
    }
  }

  private showScreen(id: string): void {
    this.root.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    this.root.querySelector(`#${id}`)!.classList.remove('hidden');
  }

  destroy(): void {
    this.root.innerHTML = '';
  }
}

function labelWeather(w: string): string {
  return { clear: '☀ Clear', scattered: '⛅ Scattered', overcast: '☁ Overcast', storm: '⛈ Storm' }[w] ?? w;
}
