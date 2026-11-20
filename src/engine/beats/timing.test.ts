import { describe, expect, it } from "vitest";
import type { Beat } from "../../schema/storyboard.ts";
import { beatTiming, estimateNarration } from "./timing.ts";

const beat = (fields: Partial<Beat>): Beat => ({
  id: "b",
  caption: "A caption.",
  actions: [],
  ...fields,
});

const TEN_WORDS = "one two three four five six seven eight nine ten";

describe("estimateNarration", () => {
  it("reads at 2.5 words per second", () => {
    expect(estimateNarration(TEN_WORDS)).toBe(4);
    expect(estimateNarration("  spaced   out\nwords  ")).toBeCloseTo(1.2);
  });
});

describe("beatTiming", () => {
  it("lasts the narration plus 0.6 s when that is longer than its actions", () => {
    const timing = beatTiming(beat({ say: TEN_WORDS, actions: [{ type: "flow", edge: "e" }] }));
    expect(timing.duration).toBeCloseTo(4.6);
    expect(timing.narration).toEqual({ at: 0.3, length: 4 });
  });

  it("uses a measured narration length instead of the estimate", () => {
    const timing = beatTiming(beat({ say: TEN_WORDS }), 2);
    expect(timing.duration).toBeCloseTo(2.6);
    expect(timing.narration?.length).toBe(2);
  });

  it("lasts its actions at default speed when they take longer than the narration", () => {
    const actions: Beat["actions"] = [
      { type: "flow", edge: "a" },
      { type: "flow", edge: "b" },
    ];
    // Two flows of 2 s each, plus 0.3 s before and after.
    expect(beatTiming(beat({ say: "Short.", actions })).duration).toBeCloseTo(4.6);
  });

  it("without narration, lasts at least its caption at 15 characters per second", () => {
    const caption = "x".repeat(60);
    const timing = beatTiming(beat({ caption, actions: [{ type: "appear", node: "n" }] }));
    expect(timing.duration).toBeCloseTo(4);
    expect(timing.narration).toBeUndefined();
  });

  it("ignores the caption floor when the beat has narration", () => {
    const caption = "x".repeat(60);
    expect(beatTiming(beat({ caption, say: "one two three" })).duration).toBeCloseTo(1.8);
  });

  it("spreads actions across the beat, in order, each at its default length", () => {
    const actions: Beat["actions"] = [
      { type: "appear", node: "a" },
      { type: "appear", node: "b" },
    ];
    const timing = beatTiming(beat({ say: TEN_WORDS, actions }));
    // 4.6 s beat; 1.2 s of appears leaves 2.8 s of slack, 1.4 s after each.
    expect(timing.actions.map((a) => a.at)).toEqual([0.3, expect.closeTo(2.3)]);
    expect(timing.actions.map((a) => a.duration)).toEqual([0.6, 0.6]);
    const last = timing.actions.at(-1);
    expect((last?.at ?? 0) + (last?.duration ?? 0)).toBeLessThanOrEqual(timing.duration - 0.3);
  });

  it("packs actions back to back when they set the beat's length", () => {
    const actions: Beat["actions"] = [
      { type: "flow", edge: "a" },
      { type: "badge", node: "n", text: "ok", tone: "ok" },
    ];
    const timing = beatTiming(beat({ actions }));
    expect(timing.actions.map((a) => a.at)).toEqual([0.3, expect.closeTo(2.3)]);
  });
});
