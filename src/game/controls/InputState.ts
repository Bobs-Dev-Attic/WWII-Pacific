// Shared control state produced by whichever input backend is active
// (touch or keyboard). The Game reads this every frame.
export interface InputState {
  pitch: number; // -1..1  (nose down..up)
  roll: number; // -1..1  (left..right)
  yaw: number; // -1..1
  throttle: number; // 0..1
  firing: boolean;
  dropBomb: boolean; // edge-triggered: true for one frame
  viewToggle: boolean; // edge-triggered
  mapToggle: boolean; // edge-triggered
}

export function createInputState(): InputState {
  return {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0.7,
    firing: false,
    dropBomb: false,
    viewToggle: false,
    mapToggle: false,
  };
}
