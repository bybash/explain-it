import type { TweenSpec } from "../timeline.ts";

/** How nodes change, in seconds and pixels. */
export const NODE_TIMING = {
  appear: 0.6,
  /** How far below its place an appearing node starts. */
  rise: 28,
  /** A highlight swells for `swell` seconds, then settles for the rest. */
  highlight: 1.2,
  swell: 0.4,
  dim: 0.6,
  /** The opacity a dimmed node, zone, edge or overlay fades back to. */
  dimmed: 0.22,
} as const;

/** The timeline target that holds one node's state. */
export const nodeTarget = (id: string): string => `node:${id}`;

/** The timeline target that holds one zone platform's state: `shown`, as for a node. */
export const zoneTarget = (id: string): string => `zone:${id}`;

/** `shown`: 0 while hidden below its place, 1 once it has risen into the scene. */
export const appearTweens = (target: string, at: number): TweenSpec[] => [
  {
    target,
    from: { shown: 0 },
    to: { shown: 1 },
    duration: NODE_TIMING.appear,
    ease: "outCubic",
    at,
  },
];

/** `pulse`: swells from 0 to 1 and settles back to 0. */
export const highlightTweens = (target: string, at: number): TweenSpec[] => {
  const { highlight, swell } = NODE_TIMING;
  return [
    { target, from: { pulse: 0 }, to: { pulse: 1 }, duration: swell, ease: "outQuad", at },
    {
      target,
      from: { pulse: 1 },
      to: { pulse: 0 },
      duration: highlight - swell,
      ease: "inOutSine",
      at: at + swell,
    },
  ];
};

/** How opaque a `dim` leaves what it fades: 1 in full colour, `NODE_TIMING.dimmed` faded back. */
export const dimOpacity = (dim: number | undefined): number =>
  1 - (dim ?? 0) * (1 - NODE_TIMING.dimmed);

/** `dim`: 0 in full colour, 1 faded back. Used on node, zone, edge and overlay targets alike. */
export const dimTweens = (target: string, at: number): TweenSpec[] => fadeDim(target, at, 0, 1);

/** Brings a dimmed node, zone, edge or overlay back to full colour, when the focus moves off it. */
export const undimTweens = (target: string, at: number): TweenSpec[] => fadeDim(target, at, 1, 0);

const fadeDim = (target: string, at: number, from: number, to: number): TweenSpec[] => [
  {
    target,
    from: { dim: from },
    to: { dim: to },
    duration: NODE_TIMING.dim,
    ease: "inOutSine",
    at,
  },
];
