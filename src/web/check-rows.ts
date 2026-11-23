import type { BeatWarning, CHECKS, CheckReport } from "../schema/checks.ts";
import type { Storyboard } from "../schema/storyboard.ts";

type Check = (typeof CHECKS)[number];

/** How each check is named in the panel (SPEC, Checks). */
const CHECK_LABELS: Readonly<Record<Check, string>> = {
  overlap: "Overlap",
  "off-frame": "Off frame",
  "reading-speed": "Reading speed",
  "narration-fit": "Narration fit",
  loudness: "Loudness",
};

/** A warning at a beat, as the Checks tab lists it: a click goes to `at`. */
export type BeatWarningRow = {
  readonly check: string;
  readonly message: string;
  readonly at: number;
  readonly beat: string;
  /** "2·3": the scene's number and the beat's within it, as the beat list numbers them. */
  readonly where: string;
  readonly caption: string;
};

/** "Narration fit and loudness". */
const listed = (checks: readonly Check[]): string => {
  const names = checks.map((c, i) => (i === 0 ? CHECK_LABELS[c] : CHECK_LABELS[c].toLowerCase()));
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

/**
 * The checks' report as the Preview gate shows it: the beats' warnings in
 * the order they show, each placed in the script; the whole video's
 * warnings and the skipped checks apart, as they name no beat; and how many
 * warnings each beat has, for the beat list.
 */
export const checkRows = (report: CheckReport, storyboard: Storyboard) => {
  const places = new Map(
    storyboard.scenes.flatMap((scene, s) =>
      scene.beats.map((beat, b) => [
        beat.id,
        { where: `${s + 1}·${b + 1}`, caption: beat.caption },
      ]),
    ),
  );
  const atBeats = report.warnings
    .filter((w): w is BeatWarning => "beat" in w)
    .map(
      (w): BeatWarningRow => ({
        check: CHECK_LABELS[w.check],
        message: w.message,
        at: w.at,
        beat: w.beat,
        ...(places.get(w.beat) ?? { where: "", caption: "" }),
      }),
    )
    // A stable sort: warnings at the same moment keep the report's order.
    .sort((a, b) => a.at - b.at);
  const forVideo = report.warnings
    .filter((w) => !("beat" in w))
    .map((w) => ({ check: CHECK_LABELS[w.check], message: w.message }));
  const countByBeat = new Map<string, number>();
  for (const row of atBeats) countByBeat.set(row.beat, (countByBeat.get(row.beat) ?? 0) + 1);
  return {
    atBeats,
    forVideo,
    skipped: report.skipped.map((s) => `${listed(s.checks)}: ${s.reason}`),
    countByBeat: countByBeat as ReadonlyMap<string, number>,
  };
};
