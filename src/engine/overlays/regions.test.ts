import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../schema/config.ts";
import { logoBox, type Rect, stageRegions } from "./regions.ts";

const captions = DEFAULT_CONFIG.captions;
const bottom = (r: Rect) => r.y + r.height;
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  bottom(inner) <= bottom(outer);

describe("stageRegions: a step caption on two lines at the top", () => {
  it("gives the step band two lines when a caption needs them, and one otherwise", () => {
    const one = stageRegions(captions);
    const two = stageRegions(captions, undefined, 2);
    if (!one.step || !two.step) throw new Error("the step captions are on by default");
    expect(two.step.height).toBeGreaterThanOrEqual(2 * two.fonts.step);
    expect(two.step.height).toBeGreaterThan(one.step.height);
    expect(two.content.y).toBeGreaterThan(one.content.y);
    expect(stageRegions(captions, undefined, 1)).toEqual(one);
    // At the top a caption shows two lines at most, however many it needs.
    expect(stageRegions(captions, undefined, 3)).toEqual(two);
  });
});

describe("stageRegions: titles at the bottom left", () => {
  const bottomLeft = { ...captions, place: "bottom" as const };

  it("puts the scene title and a two-line step caption in the bottom-left corner, above the narration", () => {
    const { title, step, narration, safe, fonts } = stageRegions(bottomLeft);
    if (!step || !narration) throw new Error("both captions are on by default");
    for (const rect of [title, step]) {
      expect(rect.x).toBe(safe.x);
      expect(rect.width).toBeLessThan(safe.width / 2);
    }
    expect(bottom(title)).toBeLessThanOrEqual(step.y);
    expect(bottom(step)).toBeLessThan(narration.y);
    expect(step.height).toBeGreaterThanOrEqual(2 * fonts.step);
  });

  it("gives the scene more height than the titles at the top do", () => {
    expect(stageRegions(bottomLeft).content.height).toBeGreaterThan(
      stageRegions(captions).content.height,
    );
  });

  it("gives the step band a third line when a caption needs it, and keeps two otherwise", () => {
    const two = stageRegions(bottomLeft);
    const three = stageRegions(bottomLeft, undefined, 3);
    if (!two.step || !three.step) throw new Error("the step captions are on by default");
    expect([two.stepLines, three.stepLines]).toEqual([2, 3]);
    expect(three.step.height).toBeGreaterThan(two.step.height);
    expect(three.title.y).toBeLessThan(two.title.y);
    expect(stageRegions(bottomLeft, undefined, 1)).toEqual(two);
  });

  it("frames the scene in the whole height, from the top of the safe area to the narration", () => {
    const { content, narration, safe } = stageRegions(bottomLeft);
    if (!narration) throw new Error("the narration is on by default");
    expect(content.y).toBe(safe.y);
    expect(content.width).toBe(safe.width);
    expect(bottom(content)).toBeLessThan(narration.y);
  });

  it("lists the beats above the scene title, filling from the bottom", () => {
    const { list, title, step, place } = stageRegions({ ...bottomLeft, list: true });
    if (!list) throw new Error("the list is on");
    expect(step).toBeUndefined();
    expect(place).toBe("bottom");
    expect(bottom(list)).toBeLessThanOrEqual(title.y);
  });
});

describe("stageRegions: the beat list", () => {
  it("puts the list down the left, below the title, moves the content to its right, and drops the step band", () => {
    const { title, step, list, content, safe } = stageRegions({ ...captions, list: true });
    if (!list) throw new Error("the list is on");
    expect(step).toBeUndefined();
    expect(list.x).toBe(safe.x);
    expect(list.y).toBeGreaterThan(bottom(title));
    expect(content.x).toBeGreaterThan(list.x + list.width);
    expect(content.x + content.width).toBe(safe.x + safe.width);
    expect(content.y).toBeLessThanOrEqual(list.y);
  });
});

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

  it("puts the logo inside 200×64 px in a corner of the safe area", () => {
    expect(logoBox("top-right")).toEqual({ x: 1624, y: 54, width: 200, height: 64 });
    expect(logoBox("bottom-right")).toEqual({ x: 1624, y: 962, width: 200, height: 64 });
  });

  it("changes nothing when the logo is not on every frame", () => {
    expect(stageRegions(captions, undefined)).toEqual(stageRegions(captions));
  });

  it("keeps the bands and the content clear of a logo shown on every frame", () => {
    const overlaps = (a: Rect, b: Rect) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < bottom(b) && b.y < bottom(a);
    for (const corner of ["top-right", "bottom-right"] as const)
      for (const step of [true, false])
        for (const narration of [true, false]) {
          const regions = stageRegions({ ...captions, step, narration }, corner);
          const logo = logoBox(corner);
          for (const rect of [regions.title, regions.step, regions.narration, regions.content])
            if (rect) expect(overlaps(rect, logo)).toBe(false);
        }
  });

  it("narrows only the bands beside the logo, and keeps the narration centred", () => {
    const plain = stageRegions(captions);
    const top = stageRegions(captions, "top-right");
    expect(top.title.width).toBeLessThan(plain.title.width);
    expect(top.title.x).toBe(plain.title.x);
    expect(top.narration).toEqual(plain.narration);
    expect(top.content).toEqual(plain.content);

    const low = stageRegions(captions, "bottom-right");
    expect(low.title).toEqual(plain.title);
    const centre = (r?: Rect) => (r ? r.x + r.width / 2 : 0);
    expect(low.narration?.width).toBeLessThan(plain.narration?.width ?? 0);
    expect(centre(low.narration)).toBe(centre(plain.narration));
  });
});
