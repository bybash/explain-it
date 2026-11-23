import { describe, expect, it } from "vitest";
import graphJson from "../../examples/oauth-login/graph.json" with { type: "json" };
import storyboardJson from "../../examples/oauth-login/storyboard.json" with { type: "json" };
import { beatOptions, buildBeats } from "../engine/beats/build.ts";
import { type Config, DEFAULT_CONFIG } from "../schema/config.ts";
import { parseGraph } from "../schema/graph.ts";
import { parseStoryboard, type Storyboard } from "../schema/storyboard.ts";
import { loudnessWarnings, narrationFitWarnings, readingWarnings } from "./timing.ts";

const graph = parseGraph(graphJson);
if (!graph.ok) throw new Error("the example graph does not parse");
const example = parseStoryboard(storyboardJson, graph.value);
if (!example.ok) throw new Error("the example storyboard does not parse");
const plan = (storyboard: Storyboard, config: Config = DEFAULT_CONFIG, narration = {}) =>
  buildBeats(storyboard, graph.value, beatOptions(config, narration));

/** The example with its first beat's caption made long, at the brisk pace and a quick voice. */
const crowded = (): Storyboard => {
  const [first, ...rest] = example.value.scenes;
  if (!first) throw new Error("no scene");
  const [beat, ...others] = first.beats;
  if (!beat) throw new Error("no beat");
  return {
    ...example.value,
    scenes: [
      {
        ...first,
        beats: [{ ...beat, say: "Go.", actions: [], caption: "x".repeat(60) }, ...others],
      },
      ...rest,
    ],
  };
};

describe("readingWarnings", () => {
  it("passes a video whose lines are read, not spoken: they are timed at the step limit", () => {
    const silent = { ...DEFAULT_CONFIG, voice: { ...DEFAULT_CONFIG.voice, enabled: false } };
    expect(readingWarnings(plan(example.value, silent))).toEqual([]);
  });

  it("never flags a step caption: every beat leaves time to read it, spoken or read", () => {
    // The crowded beat's 60 characters get their 4 s even at the brisk pace, on a short line.
    const brisk = { ...DEFAULT_CONFIG, pacing: "brisk" as const };
    expect(
      readingWarnings(plan(crowded(), brisk, { start: 0.4 })).filter(
        (w) => w.check === "reading-speed" && w.message.startsWith("the step caption"),
      ),
    ).toEqual([]);
  });

  it("passes any voice-off video, whatever its captions and lines", () => {
    const silent = (narrationCaptions: boolean) => ({
      ...DEFAULT_CONFIG,
      voice: { ...DEFAULT_CONFIG.voice, enabled: false },
      captions: { ...DEFAULT_CONFIG.captions, narration: narrationCaptions },
    });
    const [first, ...rest] = example.value.scenes;
    if (!first) throw new Error("no scene");
    for (const captionLength of [1, 7, 23, 44, 59, 60])
      for (const sayLength of [1, 3, 17, 90])
        for (const pacing of ["relaxed", "normal", "brisk"] as const)
          for (const narrationCaptions of [true, false]) {
            const [beat, ...others] = first.beats;
            if (!beat) throw new Error("no beat");
            const storyboard = {
              ...example.value,
              scenes: [
                {
                  ...first,
                  beats: [
                    { ...beat, caption: "c".repeat(captionLength), say: "s".repeat(sayLength) },
                    ...others,
                  ],
                },
                ...rest,
              ],
            };
            expect(
              readingWarnings(plan(storyboard, { ...silent(narrationCaptions), pacing })),
            ).toEqual([]);
          }
  });

  it("judges narration captions at 17 characters a second, as subtitles of speech", () => {
    // A 40-character line spoken in 2.5 s reads at 16 a second: fine for a subtitle.
    const ofStart = (lengths: { start: number }) =>
      readingWarnings(plan(example.value, DEFAULT_CONFIG, lengths)).filter(
        (w) => "beat" in w && w.beat === "start",
      );
    expect(ofStart({ start: 2.5 })).toEqual([]);
    const fast = ofStart({ start: 2 });
    expect(fast.map((w) => w.message)).toEqual([
      'a narration caption of beat "start" needs 20 characters a second to read; 17 is the most',
    ]);
  });
});

describe("narrationFitWarnings", () => {
  it("passes a voice timed by its own lengths", () => {
    const narration = { start: 3.1 };
    expect(narrationFitWarnings(plan(example.value, DEFAULT_CONFIG, narration), narration)).toEqual(
      [],
    );
  });

  it("names a line longer than the beat it is in, by how much faster it would have to be said", () => {
    // Timed by the estimate, the beat leaves the line 4.6 s from its start to the end; it measures 6 s.
    const warnings = narrationFitWarnings(plan(example.value), { start: 6 });
    expect(warnings).toEqual([
      {
        check: "narration-fit",
        scene: "sign_in",
        beat: "start",
        at: 0,
        message:
          'the narration of beat "start" would have to be said 1.3 times faster to fit; 1.05 is the most',
      },
    ]);
  });
});

describe("loudnessWarnings", () => {
  it("passes a mix at -16 ± 1 LUFS with true peaks at or below -1 dBTP", () => {
    expect(loudnessWarnings({ integrated: -16.3, truePeak: -1.5 })).toEqual([]);
  });

  it("names a mix too quiet, too loud, or peaking too high, for the whole video", () => {
    expect(loudnessWarnings({ integrated: -18.2, truePeak: -0.4 }).map((w) => w.message)).toEqual([
      "the mix is at -18.2 LUFS; it should be -16 ± 1",
      "the mix peaks at -0.4 dBTP; it should stay at or below -1",
    ]);
    expect(loudnessWarnings({ integrated: -18.2, truePeak: -2 })[0]).toEqual({
      check: "loudness",
      message: "the mix is at -18.2 LUFS; it should be -16 ± 1",
    });
  });
});
