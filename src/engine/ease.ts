/** An easing curve: progress 0..1 in, eased progress out. Starts at 0, ends at 1. */
export type Ease = (p: number) => number;

/** The standard constant for an ease-back that overshoots by about 10%. */
const BACK_OVERSHOOT = 1.70158;

// Base curves, all "ease-in": slow at the start.
const quad: Ease = (p) => p ** 2;
const cubic: Ease = (p) => p ** 3;
const sine: Ease = (p) => 1 - Math.cos((p * Math.PI) / 2);
const back: Ease = (p) => (BACK_OVERSHOOT + 1) * p ** 3 - BACK_OVERSHOOT * p ** 2;

/** Mirrors an ease-in into an ease-out: fast at the start, slow at the end. */
const out =
  (ease: Ease): Ease =>
  (p) =>
    1 - ease(1 - p);

/** The ease-in for the first half, its ease-out for the second. */
const inOut =
  (ease: Ease): Ease =>
  (p) =>
    p < 0.5 ? ease(2 * p) / 2 : 1 - ease(2 - 2 * p) / 2;

export const EASES = {
  linear: (p) => p,
  inQuad: quad,
  outQuad: out(quad),
  inOutQuad: inOut(quad),
  inCubic: cubic,
  outCubic: out(cubic),
  inOutCubic: inOut(cubic),
  inOutSine: inOut(sine),
  /** Overshoots by about 10% and settles: for things that pop into place. */
  outBack: out(back),
} as const satisfies Record<string, Ease>;

export type EaseName = keyof typeof EASES;

export const EASE_NAMES = Object.keys(EASES) as readonly EaseName[];
