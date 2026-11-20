import type { TweenSpec } from "../timeline.ts";

/**
 * How a `flow` plays, in seconds: the edge draws in, its label fades in near
 * the end of the draw-in, then a dot travels from source to target while the
 * dashes keep flowing. The beat builder (beats/build.ts) starts flows and decides
 * how long the dashes keep moving.
 */
export const EDGE_TIMING = {
  draw: 0.9,
  /**
   * The label starts fading in this far into the draw-in, as a share of it:
   * late enough that the eased line is all but drawn, so it never shows ahead of it.
   */
  labelAt: 0.9,
  labelFade: 0.35,
  send: 1.1,
  dotFade: 0.15,
  /** Dash travel, in pixels per second. */
  dashSpeed: 36,
} as const;

/** The timeline target that holds one edge's state. */
export const edgeTarget = (id: string): string => `edge:${id}`;

/**
 * The tweens for one `flow`, on the edge's target:
 * - `draw`: the share of the path drawn, 0..1
 * - `label`: the label's opacity
 * - `dot`, `dotOpacity`: the dot's share of the way along, and its opacity
 * - `dash`: how far the dashes have travelled, in pixels
 */
export const flowTweens = (
  id: string,
  { at, flowFor }: { readonly at: number; readonly flowFor: number },
): TweenSpec[] => {
  const target = edgeTarget(id);
  const { draw, labelAt, labelFade, send, dotFade, dashSpeed } = EDGE_TIMING;
  const drawn = at + draw;
  return [
    { target, from: { draw: 0 }, to: { draw: 1 }, duration: draw, ease: "inOutCubic", at },
    {
      target,
      from: { label: 0 },
      to: { label: 1 },
      duration: labelFade,
      ease: "outQuad",
      at: at + draw * labelAt,
    },
    { target, from: { dot: 0 }, to: { dot: 1 }, duration: send, ease: "inOutSine", at: drawn },
    { target, from: { dotOpacity: 0 }, to: { dotOpacity: 1 }, duration: dotFade, at: drawn },
    {
      target,
      from: { dotOpacity: 1 },
      to: { dotOpacity: 0 },
      duration: dotFade,
      at: drawn + send - dotFade,
    },
    { target, from: { dash: 0 }, to: { dash: flowFor * dashSpeed }, duration: flowFor, at: drawn },
  ];
};
