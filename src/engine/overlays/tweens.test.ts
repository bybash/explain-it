import { describe, expect, it } from "vitest";
import { timeline } from "../timeline.ts";
import { OVERLAY_TIMING, overlayTarget, overlayTweens } from "./tweens.ts";

const { enter, exit } = OVERLAY_TIMING;
const AT = 2;
const UNTIL = 6;

const seeker = (spec: Parameters<typeof overlayTweens>[1]) => {
  const tl = overlayTweens("card", spec)
    .reduce((builder, tween) => builder.add(tween), timeline())
    .wait(10)
    .build();
  return (t: number) => tl.seek(t)[overlayTarget("card")] ?? {};
};

describe("overlayTweens", () => {
  it("hides the overlay before it starts", () => {
    const at = seeker({ at: AT, until: UNTIL, entrance: "rise" });
    expect(at(0).opacity).toBe(0);
    expect(at(AT).opacity).toBe(0);
  });

  it("rises into place and holds until it is due to leave", () => {
    const at = seeker({ at: AT, until: UNTIL, entrance: "rise" });
    const entering = at(AT + enter / 2);
    expect(entering.opacity).toBeGreaterThan(0);
    expect(entering.opacity).toBeLessThan(1);
    expect(entering.shift).toBeGreaterThan(0);
    expect(at(AT + enter)).toEqual({ opacity: 1, shift: 0, scale: 1 });
    expect(at(UNTIL - exit)).toEqual({ opacity: 1, shift: 0, scale: 1 });
  });

  it("is gone by `until`", () => {
    const at = seeker({ at: AT, until: UNTIL, entrance: "rise" });
    expect(at(UNTIL - exit / 2).opacity).toBeGreaterThan(0);
    expect(at(UNTIL).opacity).toBe(0);
    expect(at(UNTIL + 1).opacity).toBe(0);
  });

  it("pops a badge in from a smaller size, overshooting a little", () => {
    const at = seeker({ at: AT, until: UNTIL, entrance: "pop" });
    expect(at(AT).scale).toBeLessThan(1);
    const peak = Math.max(
      ...Array.from({ length: 50 }, (_, i) => at(AT + (i / 50) * enter).scale ?? 0),
    );
    expect(peak).toBeGreaterThan(1);
    expect(at(AT + enter).scale).toBe(1);
  });

  it("fades without moving", () => {
    const at = seeker({ at: AT, until: UNTIL, entrance: "fade" });
    expect(at(AT + enter / 2)).toMatchObject({ shift: 0, scale: 1 });
  });

  it("stays to the end of the timeline without `until`", () => {
    const at = seeker({ at: AT, entrance: "fade" });
    expect(at(AT + 10).opacity).toBe(1);
  });

  it("still shows, then hides, when it is on screen for less than its fades", () => {
    const short = enter / 2;
    const at = seeker({ at: AT, until: AT + short, entrance: "rise" });
    expect(at(AT + short / 2).opacity).toBeGreaterThan(0);
    expect(at(AT + short).opacity).toBe(0);
  });
});
