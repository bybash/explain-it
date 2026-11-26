import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { narrationMode, tenth } from "../engine/beats/timing.ts";
import { type Config, DEFAULT_CONFIG } from "../schema/config.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import type { Graph } from "../schema/graph.ts";
import type { Narration } from "../schema/narration.ts";
import type { Storyboard } from "../schema/storyboard.ts";

/** Collects the errors of several checks, so the agent sees all of them at once. */
export const allOf = (...results: readonly Validated<unknown>[]): ValidationError[] =>
  results.flatMap((r) => (r.ok ? [] : r.errors));

/**
 * Each scene's and the whole video's length, to a tenth of a second, and how
 * its narration lines were timed: measured from the voice, estimated from
 * their words, read (the voice is off), or unseen (nothing shows them).
 */
export const timingOf = (
  storyboard: Storyboard,
  graph: Graph,
  config: Config | null,
  narration: Narration = {},
) => {
  const project = config ?? DEFAULT_CONFIG;
  const plan = buildBeats(storyboard, graph, beatOptions(project, narration));
  const mode = narrationMode(project);
  const said = storyboard.scenes.flatMap((scene) => scene.beats).filter((beat) => beat.say);
  const measured = mode === "spoken" ? said.filter((beat) => beat.id in narration).length : 0;
  return {
    duration: tenth(plan.duration),
    narration: {
      lines: said.length,
      measured,
      estimated: mode === "spoken" ? said.length - measured : 0,
      read: mode === "read" ? said.length : 0,
      unseen: mode === "unseen" ? said.length : 0,
    },
    scenes: plan.scenes.map((s) => ({
      id: s.id,
      title: s.title,
      start: tenth(s.start),
      end: tenth(s.end),
    })),
  };
};
