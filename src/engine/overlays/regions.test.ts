import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../schema/config.ts";
import { type Rect, stageRegions } from "./regions.ts";

const captions = DEFAULT_CONFIG.captions;
const bottom = (r: Rect) => r.y + r.height;
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  bottom(inner) <= bottom(outer);

describe("stageRegions", () => {
  it("keeps everything inside the 1920×1080 frame's 5% safe area", () => {
    const regions = stageRegions(captions);
    expect(regions.safe).toEqual({ x: 96, y: 54, width: 1728, height: 972 });
    for (const rect of [regions.title, regions.step, regions.narration, regions.content])
      expect(rect && inside(rect, regions.safe)).toBe(true);
  });

  it("stacks the title, then the step caption, then the content, then the narration", () => {
    const { title, step, narration, content } = stageRegions(captions);
    if (!step || !narration) throw new Error("both captions are on by default");
    expect(bottom(title)).toBeLessThanOrEqual(step.y);
    expect(bottom(step)).toBeLessThan(content.y);
    expect(bottom(content)).toBeLessThan(narration.y);
  });

  it("gives a disabled caption's band back to the content", () => {
    const both = stageRegions(captions);
    const noStep = stageRegions({ ...captions, step: false });
    const noNarration = stageRegions({ ...captions, narration: false });
    expect(noStep.step).toBeUndefined();
    expect(noStep.content.y).toBeLessThan(both.content.y);
    expect(noNarration.narration).toBeUndefined();
    expect(bottom(noNarration.content)).toBe(1026);
  });

  it("makes caption bands taller as the caption size grows", () => {
    const heights = (["S", "M", "L"] as const).map((size) => {
      const { step, narration } = stageRegions({ ...captions, size });
      return [step?.height ?? 0, narration?.height ?? 0];
    });
    const [s, m, l] = heights;
    expect(s?.[0]).toBeLessThan(m?.[0] ?? 0);
    expect(m?.[0]).toBeLessThan(l?.[0] ?? 0);
    expect(s?.[1]).toBeLessThan(m?.[1] ?? 0);
    expect(m?.[1]).toBeLessThan(l?.[1] ?? 0);
  });
});
