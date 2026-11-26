import type { BeatPlan } from "../engine/beats/build.ts";
import { type CheckWarning, ONE_THING } from "../schema/checks.ts";
import type { ValidationError } from "../schema/errors.ts";
import { HOOK_SECONDS, TARGET_SECONDS } from "../schema/story.ts";
import type { Storyboard } from "../schema/storyboard.ts";
import { wordProblems } from "./chat-report.ts";

const seconds = (n: number) => String(Math.round(n * 10) / 10);

/** Sentences in a line: each ends with a full stop, a question or an exclamation. */
const sentences = (text: string) =>
  text.split(/[.!?](?:\s|$)/).filter((s) => s.trim() !== "").length;

/**
 * The story checks (2.8; SPEC, Checks): pure checks on the script's shape,
 * from the guide's advice on telling the story. The first beat is narrated
 * and short (the hook); the last shows the outcome rather than another
 * step; the video is within the target length; and no narrated beat does
 * more than one thing. Judgement calls (jargon, tone) stay with the LLM.
 */
export const storyWarnings = (plan: BeatPlan, storyboard: Storyboard): CheckWarning[] => {
  const beats = storyboard.scenes.flatMap((s) => s.beats);
  const timed = new Map(plan.beats.map((b) => [b.id, b]));
  const warnings: CheckWarning[] = [];
  const at = (id: string) => {
    const span = timed.get(id);
    return span
      ? { scene: span.scene, beat: id, at: span.start, length: span.end - span.start }
      : undefined;
  };

  const first = beats[0];
  const opening = first && at(first.id);
  if (first && opening) {
    const { length, ...where } = opening;
    if (first.say === undefined)
      warnings.push({
        check: "hook",
        ...where,
        message: "the first beat has no narration; a hook is said",
      });
    else if (length > HOOK_SECONDS)
      warnings.push({
        check: "hook",
        ...where,
        message: `the first beat takes ${seconds(length)} s; a hook lands within ${HOOK_SECONDS} s`,
      });
  }

  const last = beats.at(-1);
  const ending = last && at(last.id);
  if (last && ending && last.actions.some((a) => a.type === "flow")) {
    const { length: _, ...where } = ending;
    warnings.push({
      check: "outcome",
      ...where,
      message: "the last beat is another step of the flow; end on what the user has at the end",
    });
  }

  for (const beat of beats) {
    const place = at(beat.id);
    if (!place || beat.say === undefined) continue;
    const { length: _, ...where } = place;
    const flows = beat.actions.filter((a) => a.type === "flow").length;
    const said = sentences(beat.say);
    if (flows > ONE_THING.flows || said > ONE_THING.sentences)
      warnings.push({
        check: "one-thing",
        ...where,
        message: `the beat does more than one thing (${flows} flows, ${said} sentences); split it`,
      });
  }

  if (plan.duration < TARGET_SECONDS.min || plan.duration > TARGET_SECONDS.max)
    warnings.push({
      check: "length",
      message: `the video runs ${seconds(plan.duration)} s; it is best kept to ${TARGET_SECONDS.min} to ${TARGET_SECONDS.max} s`,
    });
  return warnings;
};

/**
 * What a drafted script is sent back for (5.4), each named by its place in
 * the script: the story checks, and words that cannot be read or said in
 * time, with the most characters that would fit.
 */
export const scriptProblems = (plan: BeatPlan, storyboard: Storyboard): ValidationError[] => {
  const places = new Map(
    storyboard.scenes.flatMap((scene, i) =>
      scene.beats.map((beat, j) => [beat.id, `scenes[${i}].beats[${j}]`] as const),
    ),
  );
  const story = storyWarnings(plan, storyboard).map((w) => ({
    path: "beat" in w ? (places.get(w.beat) ?? "scenes") : "scenes",
    message: w.message,
  }));
  const words = wordProblems(plan, storyboard, {}).map((p) => ({
    path: `${places.get(p.beat) ?? "scenes"}.${p.field}`,
    message:
      p.why === "fit"
        ? `is too long to say in its beat; keep it to ${p.most} characters`
        : p.field === "caption"
          ? `goes by too fast to read; keep it to ${p.most} characters`
          : // A line's captions go at the voice's pace, so plainer words help more than fewer.
            "is said faster than its captions can be read; use shorter, plainer words",
  }));
  return [...story, ...words];
};
