import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PACE_TIMINGS } from "../../schema/config.ts";
import type { Beat } from "../../schema/storyboard.ts";
import { beatTiming, estimateNarration, LEAD_IN, narrationMode, readingTime } from "./timing.ts";

const beat = (fields: Partial<Beat>): Beat => ({
  id: "b",
  caption: "A caption.",
  actions: [],
  ...fields,
});

const TEN_WORDS = "one two three four five six seven eight nine ten";

describe("estimateNarration and readingTime", () => {
  it("estimates speech at 2.5 words per second", () => {
    expect(estimateNarration(TEN_WORDS)).toBe(4);
    expect(estimateNarration("  spaced   out\nwords  ")).toBeCloseTo(1.2);
  });

  it("reads at 15 characters per second", () => {
    expect(readingTime("x".repeat(45))).toBe(3);
  });
});

describe("the paces", () => {
  it("go from relaxed to brisk: a shorter pause after each line and shorter beats", () => {
    expect(PACE_TIMINGS.relaxed).toEqual({ pauseAfter: 1, minBeat: 3 });
    expect(PACE_TIMINGS.normal).toEqual({ pauseAfter: 0.6, minBeat: 2 });
    expect(PACE_TIMINGS.brisk).toEqual({ pauseAfter: 0.3, minBeat: 1.5 });
  });
});

describe("beatTiming", () => {
  it("lasts the narration, its lead-in and the pace's pause when that is longest", () => {
    const flow: Beat["actions"] = [{ type: "flow", edge: "e" }];
    const relaxed = beatTiming(beat({ say: TEN_WORDS, actions: flow }), { pace: "relaxed" });
    expect(relaxed.duration).toBeCloseTo(LEAD_IN + 4 + 1);
    expect(relaxed.narration).toEqual({ at: LEAD_IN, length: 4 });
    const brisk = beatTiming(beat({ say: TEN_WORDS, actions: flow }), { pace: "brisk" });
    expect(brisk.duration).toBeCloseTo(LEAD_IN + 4 + 0.3);
  });

  it("follows the measured narration, longer or shorter than the estimate", () => {
    const slow = beatTiming(beat({ say: TEN_WORDS }), { pace: "normal", narration: 6.5 });
    expect(slow.duration).toBeCloseTo(LEAD_IN + 6.5 + 0.6);
    expect(slow.narration?.length).toBe(6.5);
    const quick = beatTiming(beat({ say: TEN_WORDS }), { pace: "normal", narration: 2.2 });
    expect(quick.duration).toBeCloseTo(LEAD_IN + 2.2 + 0.6);
  });

  it("never runs actions faster: a short line waits for its actions at their normal speed", () => {
    const actions: Beat["actions"] = [
      { type: "flow", edge: "a" },
      { type: "flow", edge: "b" },
    ];
    // Two flows of 2 s each, after the lead-in and before the pause.
    const timing = beatTiming(beat({ say: "Short.", actions }), { pace: "brisk", narration: 0.5 });
    expect(timing.duration).toBeCloseTo(LEAD_IN + 4 + 0.3);
    expect(timing.actions.map((a) => a.duration)).toEqual([2, 2]);
  });

  it("lasts at least the pace's shortest beat", () => {
    expect(beatTiming(beat({ say: "Go." }), { pace: "relaxed", narration: 0.4 }).duration).toBe(3);
    expect(beatTiming(beat({ say: "Go." }), { pace: "normal", narration: 0.4 }).duration).toBe(2);
    expect(beatTiming(beat({ say: "Go." }), { pace: "brisk", narration: 0.4 }).duration).toBe(1.5);
  });

  it("times a line by reading it when the voice is off", () => {
    const say = "x".repeat(90);
    const timing = beatTiming(beat({ say }), { pace: "brisk", mode: "read", narration: 1 });
    // 90 characters at 15 a second; a measured length means nothing without a voice.
    expect(timing.narration).toEqual({ at: LEAD_IN, length: 6 });
    expect(timing.duration).toBeCloseTo(LEAD_IN + 6 + 0.3);
  });

  it("ignores a line nobody hears or sees", () => {
    const say = "x".repeat(90);
    const timing = beatTiming(beat({ say, caption: "x".repeat(30) }), {
      pace: "brisk",
      mode: "unseen",
    });
    expect(timing.narration).toBeUndefined();
    // Timed as a beat without narration: its caption's 2 s, then the brisk 1.5 s floor.
    expect(timing.duration).toBeCloseTo(2);
  });

  it("gives every beat time to read its step caption, spoken or read", () => {
    const caption = "x".repeat(60);
    const spoken = beatTiming(beat({ caption, say: "Go." }), { pace: "brisk", narration: 0.4 });
    expect(spoken.duration).toBeCloseTo(4);
    const read = beatTiming(beat({ caption, say: "Go." }), { pace: "brisk", mode: "read" });
    expect(read.duration).toBeCloseTo(4);
  });

  it("without narration, lasts at least its caption at 15 characters per second", () => {
    const caption = "x".repeat(90);
    const timing = beatTiming(beat({ caption, actions: [{ type: "appear", node: "n" }] }), {
      pace: "brisk",
    });
    expect(timing.duration).toBeCloseTo(6);
    expect(timing.narration).toBeUndefined();
  });

  it("spreads actions over the beat in order, at their normal length, ending before the pause", () => {
    const actions: Beat["actions"] = [
      { type: "appear", node: "a" },
      { type: "appear", node: "b" },
    ];
    const timing = beatTiming(beat({ say: TEN_WORDS, actions }), { pace: "normal" });
    // 0.3 + 4 + 0.6 = 4.9 s; 1.2 s of appears leaves 2.8 s, 1.4 s after each.
    expect(timing.actions.map((a) => a.at)).toEqual([LEAD_IN, expect.closeTo(2.3)]);
    expect(timing.actions.map((a) => a.duration)).toEqual([0.6, 0.6]);
    const last = timing.actions.at(-1);
    expect((last?.at ?? 0) + (last?.duration ?? 0)).toBeLessThanOrEqual(timing.duration - 0.6);
  });

  it("takes the config's default pace and spoken narration when given none", () => {
    const { pauseAfter } = PACE_TIMINGS[DEFAULT_CONFIG.pacing];
    expect(beatTiming(beat({ say: TEN_WORDS })).duration).toBeCloseTo(LEAD_IN + 4 + pauseAfter);
  });
});

describe("narrationMode", () => {
  const voiceOff = { ...DEFAULT_CONFIG.voice, enabled: false };
  it("speaks lines when the voice is on, reads them when only the captions show them", () => {
    expect(narrationMode(DEFAULT_CONFIG)).toBe("spoken");
    expect(narrationMode({ ...DEFAULT_CONFIG, voice: voiceOff })).toBe("read");
    expect(
      narrationMode({
        ...DEFAULT_CONFIG,
        voice: voiceOff,
        captions: { ...DEFAULT_CONFIG.captions, narration: false },
      }),
    ).toBe("unseen");
  });
});
