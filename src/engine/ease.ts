/** Easing curves: progress 0..1 in, eased progress out. Each starts at 0 and ends at 1. */
export const EASES = {
  linear: (p: number) => p,
  inQuad: (p: number) => p * p,
  outQuad: (p: number) => 1 - (1 - p) ** 2,
  inOutQuad: (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
  inCubic: (p: number) => p ** 3,
  outCubic: (p: number) => 1 - (1 - p) ** 3,
  inOutCubic: (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  inOutSine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
  /** Overshoots by about 10% and settles: for things that pop into place. */
  outBack: (p: number) => {
    const overshoot = 1.70158;
    return 1 + (overshoot + 1) * (p - 1) ** 3 + overshoot * (p - 1) ** 2;
  },
} as const;

export type EaseName = keyof typeof EASES;

export const EASE_NAMES = Object.keys(EASES) as readonly EaseName[];
