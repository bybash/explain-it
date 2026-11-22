import type { BeatPlan } from "../engine/beats/build.ts";
import { LEAD_IN } from "../engine/beats/timing.ts";
import { type CheckWarning, LOUDNESS, NARRATION_FIT, READING_SPEED } from "../schema/checks.ts";
import type { Narration } from "../schema/narration.ts";

/** A number as a message says it: at most two decimals, none when whole. */
const said = (n: number, decimals = 1): string => String(Number(n.toFixed(decimals)));

/**
 * Captions on screen too briefly to read (SPEC, Checks): a step caption at
 * `READING_SPEED.step` characters a second over its beat, a narration
 * caption at `READING_SPEED.narration` over its cue.
 */
export const readingWarnings = (plan: BeatPlan): CheckWarning[] => {
  const warnings: CheckWarning[] = [];
  const sceneOf = new Map(plan.beats.map((b) => [b.id, b.scene]));
  for (const overlay of plan.overlays) {
    if (overlay.kind !== "step") continue;
    const beat = plan.beats.find((b) => b.start === overlay.at && b.scene === overlay.scene);
    const speed = overlay.text.length / (overlay.until - overlay.at);
    if (beat && speed > READING_SPEED.step)
      warnings.push({
        check: "reading-speed",
        scene: beat.scene,
        beat: beat.id,
        at: overlay.at,
        message: `the step caption of beat "${beat.id}" needs ${said(speed)} characters a second to read; ${READING_SPEED.step} is the most`,
      });
  }
  for (const cue of plan.cues) {
    const speed = cue.text.length / (cue.end - cue.start);
    if (speed > READING_SPEED.narration)
      warnings.push({
        check: "reading-speed",
        scene: sceneOf.get(cue.beat) ?? "",
        beat: cue.beat,
        at: cue.start,
        message: `a narration caption of beat "${cue.beat}" needs ${said(speed)} characters a second to read; ${READING_SPEED.narration} is the most`,
      });
  }
  return warnings;
};

/**
 * Lines longer than the room their beat leaves them, from the lead-in to the
 * beat's end (SPEC, Checks): by how much faster they would have to be said.
 * A plan timed by these lengths always fits; one timed by estimates may not.
 */
export const narrationFitWarnings = (plan: BeatPlan, narration: Narration): CheckWarning[] =>
  plan.beats.flatMap((beat): CheckWarning[] => {
    const measured = narration[beat.id];
    if (measured === undefined) return [];
    const ratio = measured / (beat.end - beat.start - LEAD_IN);
    return ratio > NARRATION_FIT
      ? [
          {
            check: "narration-fit",
            scene: beat.scene,
            beat: beat.id,
            at: beat.start,
            message: `the narration of beat "${beat.id}" would have to be said ${said(ratio, 2)} times faster to fit; ${NARRATION_FIT} is the most`,
          },
        ]
      : [];
  });

/** The final mix against SPEC's loudness: −16 ± 1 LUFS, true peaks at or below −1 dBTP. */
export const loudnessWarnings = ({
  integrated,
  truePeak,
}: {
  readonly integrated: number;
  readonly truePeak: number;
}): CheckWarning[] => [
  ...(Math.abs(integrated - LOUDNESS.target) > LOUDNESS.tolerance
    ? [
        {
          check: "loudness" as const,
          message: `the mix is at ${said(integrated)} LUFS; it should be ${LOUDNESS.target} ± ${LOUDNESS.tolerance}`,
        },
      ]
    : []),
  ...(truePeak > LOUDNESS.maxTruePeak
    ? [
        {
          check: "loudness" as const,
          message: `the mix peaks at ${said(truePeak)} dBTP; it should stay at or below ${LOUDNESS.maxTruePeak}`,
        },
      ]
    : []),
];
