import type { InputState } from './InputState';

// Touch backend: left virtual joystick controls pitch (vertical) + roll
// (horizontal); a vertical throttle slider on the right; fire, bomb and yaw
// buttons. Designed for thumbs, with generous hit targets and dead-zones.

export class TouchControls {
  private joyId: number | null = null;
  private joyCenter = { x: 0, y: 0 };
  private throttleId: number | null = null;
  private yawLeft = false;
  private yawRight = false;

  constructor(private state: InputState) {
    this.build();
  }

  private el(id: string): HTMLElement {
    return document.getElementById(id)!;
  }

  private build(): void {
    const joystick = this.el('joystick');
    const knob = joystick.querySelector('.knob') as HTMLElement;

    const onJoyStart = (e: PointerEvent) => {
      e.preventDefault();
      this.joyId = e.pointerId;
      const r = joystick.getBoundingClientRect();
      this.joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      joystick.setPointerCapture(e.pointerId);
    };
    const onJoyMove = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      const dx = e.clientX - this.joyCenter.x;
      const dy = e.clientY - this.joyCenter.y;
      const max = 52;
      const cx = Math.max(-max, Math.min(max, dx));
      const cy = Math.max(-max, Math.min(max, dy));
      knob.style.transform = `translate(${cx}px, ${cy}px)`;
      const nx = dead(cx / max);
      const ny = dead(cy / max);
      this.state.roll = nx;
      this.state.pitch = -ny; // push up on stick => nose down (pull back => up)
    };
    const onJoyEnd = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      knob.style.transform = 'translate(0,0)';
      this.state.roll = 0;
      this.state.pitch = 0;
    };
    joystick.addEventListener('pointerdown', onJoyStart);
    joystick.addEventListener('pointermove', onJoyMove);
    joystick.addEventListener('pointerup', onJoyEnd);
    joystick.addEventListener('pointercancel', onJoyEnd);

    // Throttle slider.
    const throttle = this.el('throttle');
    const fill = throttle.querySelector('.fill') as HTMLElement;
    const setThrottle = (clientY: number) => {
      const r = throttle.getBoundingClientRect();
      const t = 1 - (clientY - r.top) / r.height;
      const v = Math.max(0, Math.min(1, t));
      this.state.throttle = v;
      fill.style.height = `${v * 100}%`;
    };
    throttle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.throttleId = e.pointerId;
      throttle.setPointerCapture(e.pointerId);
      setThrottle(e.clientY);
    });
    throttle.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.throttleId) setThrottle(e.clientY);
    });
    const endThrottle = (e: PointerEvent) => {
      if (e.pointerId === this.throttleId) this.throttleId = null;
    };
    throttle.addEventListener('pointerup', endThrottle);
    throttle.addEventListener('pointercancel', endThrottle);
    fill.style.height = `${this.state.throttle * 100}%`;

    // Fire button (hold).
    const fire = this.el('btn-fire');
    fire.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.state.firing = true;
    });
    const stopFire = () => (this.state.firing = false);
    fire.addEventListener('pointerup', stopFire);
    fire.addEventListener('pointercancel', stopFire);
    fire.addEventListener('pointerleave', stopFire);

    // Bomb button (tap).
    const bomb = this.el('btn-bomb');
    bomb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.state.dropBomb = true;
    });

    // Rudder / yaw: split the fire pad? Provide dedicated yaw via joystick edges.
    // Yaw buttons.
    const yl = this.el('btn-yaw-l');
    const yr = this.el('btn-yaw-r');
    const bind = (el: HTMLElement, set: (v: boolean) => void) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        set(true);
      });
      const off = () => set(false);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    bind(yl, (v) => (this.yawLeft = v));
    bind(yr, (v) => (this.yawRight = v));

    // View toggle.
    this.el('btn-view').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.state.viewToggle = true;
    });
  }

  update(): void {
    this.state.yaw = (this.yawRight ? 1 : 0) - (this.yawLeft ? 1 : 0);
  }
}

function dead(v: number, dz = 0.08): number {
  if (Math.abs(v) < dz) return 0;
  const s = Math.sign(v);
  return s * ((Math.abs(v) - dz) / (1 - dz));
}
