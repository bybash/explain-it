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
  /** The opacity a dimmed node or edge fades back to. */
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

/** `dim`: 0 in full colour, 1 faded back. Used on node and edge targets alike. */
export const dimTweens = (target: string, at: number, back = false): TweenSpec[] => [
  {
    target,
    from: { dim: back ? 1 : 0 },
    to: { dim: back ? 0 : 1 },
    duration: NODE_TIMING.dim,
    ease: "inOutSine",
    at,
  },
];
