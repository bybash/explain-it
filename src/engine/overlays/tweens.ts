import type { EaseName } from "../ease.ts";
import type { TweenSpec } from "../timeline.ts";

/** How overlays come and go, in seconds and pixels. */
export const OVERLAY_TIMING = {
  enter: 0.4,
  exit: 0.3,
  /** How far a rising overlay starts below its place. */
  rise: 14,
  /** The size a popping overlay starts at. */
  pop: 0.6,
} as const;

/**
 * - `rise`: fades in while moving up into place (callouts, captions)
 * - `pop`: fades in while growing, with a small overshoot (badges)
 * - `fade`: only fades (the scene title)
 */
export type Entrance = "rise" | "pop" | "fade";

/** The timeline target that holds one overlay's state. */
export const overlayTarget = (id: string): string => `overlay:${id}`;

/** How each entrance moves: its ease, and the shift and scale it starts from. */
const ENTRANCES: Readonly<
  Record<Entrance, { readonly ease: EaseName; readonly shift: number; readonly scale: number }>
> = {
  rise: { ease: "outCubic", shift: OVERLAY_TIMING.rise, scale: 1 },
  pop: { ease: "outBack", shift: 0, scale: OVERLAY_TIMING.pop },
  fade: { ease: "outQuad", shift: 0, scale: 1 },
};

/**
 * The tweens that show one overlay from `at` and hide it by `until` (or keep
 * it to the end of the timeline), on the overlay's target:
 * - `opacity`: 0..1
 * - `shift`: pixels below its place
 * - `scale`: its size, 1 when in place
 * An overlay on screen for less than its fades gets shorter fades, so it
 * still shows and is still gone by `until`.
 */
export const overlayTweens = (
  id: string,
  {
    at,
    until,
    entrance,
  }: { readonly at: number; readonly until?: number; readonly entrance: Entrance },
): TweenSpec[] => {
  const target = overlayTarget(id);
  const { enter, exit } = OVERLAY_TIMING;
  const span = until === undefined ? Number.POSITIVE_INFINITY : Math.max(0, until - at);
  const squeeze = Math.min(1, span / (enter + exit));
  const [enterFor, exitFor] = [enter * squeeze, exit * squeeze];
  const { ease, shift, scale } = ENTRANCES[entrance];
  const shown: TweenSpec[] = [
    { target, from: { opacity: 0 }, to: { opacity: 1 }, duration: enterFor, ease: "outQuad", at },
    {
      target,
      from: { shift },
      to: { shift: 0 },
      duration: enterFor,
      ease,
      at,
    },
    {
      target,
      from: { scale },
      to: { scale: 1 },
      duration: enterFor,
      ease,
      at,
    },
  ];
  if (until === undefined) return shown;
  return [
    ...shown,
    {
      target,
      from: { opacity: 1 },
      to: { opacity: 0 },
      duration: exitFor,
      ease: "inQuad",
      at: until - exitFor,
    },
  ];
};
