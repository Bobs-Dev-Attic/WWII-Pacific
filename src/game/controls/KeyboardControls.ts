import type { InputState } from './InputState';

// Keyboard backend for desktop play.
//   W/S or ↑/↓  : pitch          A/D or ←/→ : roll
//   Q/E          : yaw (rudder)   Shift/Ctrl : throttle up/down
//   Space        : fire           B          : drop bomb
//   V            : toggle view
export class KeyboardControls {
  private keys = new Set<string>();

  constructor(private state: InputState) {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (k === 'b') this.state.dropBomb = true;
      if (k === 'v') this.state.viewToggle = true;
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private any(...k: string[]): boolean {
    return k.some((x) => this.keys.has(x));
  }

  update(dt: number): void {
    const s = this.state;
    // Pitch: pull back (down key) = nose up.
    let pitch = 0;
    if (this.any('w', 'arrowup')) pitch -= 1;
    if (this.any('s', 'arrowdown')) pitch += 1;
    let roll = 0;
    if (this.any('a', 'arrowleft')) roll -= 1;
    if (this.any('d', 'arrowright')) roll += 1;
    let yaw = 0;
    if (this.any('q')) yaw -= 1;
    if (this.any('e')) yaw += 1;

    // Smooth toward target for analog feel.
    const k = 1 - Math.exp(-dt * 8);
    s.pitch += (pitch - s.pitch) * k;
    s.roll += (roll - s.roll) * k;
    s.yaw += (yaw - s.yaw) * k;

    if (this.any('shift')) s.throttle = Math.min(1, s.throttle + dt * 0.6);
    if (this.any('control')) s.throttle = Math.max(0, s.throttle - dt * 0.6);

    s.firing = this.keys.has(' ');
  }
}
