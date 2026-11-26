import { edgeTarget } from "../edges/flow.ts";
import { dimTweens, nodeTarget, undimTweens } from "../iso/tweens.ts";
import type { TweenSpec } from "../timeline.ts";

/** A change of a scene's focus: a dim, keeping some nodes, or a beat without one, keeping all. */
export type Focus = { readonly at: number; readonly kept?: ReadonlySet<string> };

/** What a scene's focus can fade: its nodes, the edges it draws and what they join, and where each is drawn. */
export type FocusScene = {
  readonly nodes: readonly string[];
  readonly edges: readonly string[];
  readonly edgeEnds: ReadonlyMap<string, readonly [string, string]>;
  readonly inScene: (id: string) => string;
};

/**
 * A scene's dims as its beats' focus (SPEC, Timing; decision 035): from a
 * dim's start, every node it does not keep, and each edge touching one,
 * fades back, and what it keeps comes back, so a later dim moves the focus
 * and a node both keep stays bright. A beat without a dim brings everything
 * back as it starts. The last focus holds through the scene's fade-out.
 */
export const focusTweens = (
  { nodes, edges, edgeEnds, inScene }: FocusScene,
  focuses: readonly Focus[],
): TweenSpec[] => {
  const tweens: TweenSpec[] = [];
  let fadedBefore = new Set<string>();
  for (const { at, kept } of focuses) {
    const outOfFocus = new Set(kept ? nodes.filter((n) => !kept.has(n)) : []);
    const fadedNow = new Set([
      ...[...outOfFocus].map((n) => nodeTarget(inScene(n))),
      ...edges
        .filter((e) => edgeEnds.get(e)?.some((n) => outOfFocus.has(n)))
        .map((e) => edgeTarget(inScene(e))),
    ]);
    for (const target of fadedNow)
      if (!fadedBefore.has(target)) tweens.push(...dimTweens(target, at));
    for (const target of fadedBefore)
      if (!fadedNow.has(target)) tweens.push(...undimTweens(target, at));
    fadedBefore = fadedNow;
  }
  return tweens;
};
