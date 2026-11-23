import { describe, expect, it } from "vitest";
import { toneProvider } from "./tone.ts";

describe("toneProvider", () => {
  it("speaks a line as a short tone a word, quicker at a higher speed, with no model", async () => {
    const tone = toneProvider();
    const slow = await tone.generate("one two three", { voice: "af_heart", speed: 1 });
    const fast = await tone.generate("one two three", { voice: "af_heart", speed: 2 });
    expect(slow.samples.length / slow.sampleRate).toBeCloseTo(0.75, 2);
    expect(fast.samples.length).toBe(Math.round(slow.samples.length / 2));
    expect(slow.samples.some((s) => s !== 0)).toBe(true);
  });

  it("is named apart from every model, so its lines are never mistaken for spoken ones", () => {
    expect(toneProvider().id).toMatch(/^tone/);
  });
});
