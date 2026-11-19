import { describe, expect, it } from "vitest";
import { timeline } from "./timeline.ts";

const fade = (target: string, duration = 1) => ({
  target,
  from: { opacity: 0 },
  to: { opacity: 1 },
  duration,
});

describe("placement", () => {
  it("places tweens one after another by default", () => {
    const tl = timeline().add(fade("a")).add(fade("b", 2)).build();
    expect(tl.duration).toBe(3);
    expect(tl.seek(1).b?.opacity).toBe(0);
    expect(tl.seek(2).b?.opacity).toBe(0.5);
  });

  it("places at an absolute time", () => {
    const tl = timeline()
      .add({ ...fade("a"), at: 5 })
      .build();
    expect(tl.duration).toBe(6);
    expect(tl.seek(5.5).a?.opacity).toBe(0.5);
  });

  it('places with "<" at the start and ">" at the end of the previous tween', () => {
    const tl = timeline()
      .add(fade("a", 2))
      .add({ ...fade("b"), at: "<" })
      .add({ ...fade("c"), at: ">" })
      .build();
    expect(tl.seek(0.5).b?.opacity).toBe(0.5);
    expect(tl.seek(1.5).c?.opacity).toBe(0.5);
  });

  it("offsets with += and -=", () => {
    const tl = timeline()
      .add(fade("a", 2))
      .add({ ...fade("b"), at: "-=1" })
      .add({ ...fade("c"), at: "<+=0.5" })
      .add({ ...fade("d"), at: "+=1" })
      .build();
    expect(tl.seek(1.5).b?.opacity).toBe(0.5);
    expect(tl.seek(2).c?.opacity).toBe(0.5);
    expect(tl.seek(4).d?.opacity).toBe(0.5);
    expect(tl.duration).toBe(4.5);
  });

  it("places at labels", () => {
    const tl = timeline()
      .add(fade("a", 2))
      .label("beat2")
      .add({ ...fade("b"), at: "beat2+=0.5" })
      .add({ ...fade("c"), at: "beat2" })
      .build();
    expect(tl.labels).toEqual({ beat2: 2 });
    expect(tl.seek(3).b?.opacity).toBe(0.5);
    expect(tl.seek(2.5).c?.opacity).toBe(0.5);
  });

  it("never starts before zero", () => {
    const tl = timeline()
      .add({ ...fade("a"), at: "-=3" })
      .build();
    expect(tl.seek(0.5).a?.opacity).toBe(0.5);
  });

  it("throws on unknown labels and malformed positions, which are bugs", () => {
    expect(() => timeline().add({ ...fade("a"), at: "missing" })).toThrow(
      'unknown label "missing"',
    );
    expect(() => timeline().add({ ...fade("a"), at: "+=x" })).toThrow('invalid position "+=x"');
    expect(() => timeline().label("x").label("x")).toThrow('duplicate label "x"');
  });

  it("requires from and to to animate the same properties", () => {
    expect(() =>
      timeline().add({ target: "a", from: { opacity: 0 }, to: { y: 1 }, duration: 1 }),
    ).toThrow("from and to must have the same properties");
  });
});

describe("stagger", () => {
  it("starts each target a fixed time after the previous one", () => {
    const tl = timeline()
      .stagger(["a", "b", "c"], { from: { opacity: 0 }, to: { opacity: 1 }, duration: 1 }, 0.5)
      .build();
    expect(tl.duration).toBe(2);
    expect(tl.seek(1).a?.opacity).toBe(1);
    expect(tl.seek(1).b?.opacity).toBe(0.5);
    expect(tl.seek(1).c?.opacity).toBe(0);
  });

  it('counts as one block for "<" and ">"', () => {
    const tl = timeline()
      .stagger(["a", "b"], { from: { x: 0 }, to: { x: 1 }, duration: 1 }, 0.5)
      .add({ ...fade("c"), at: ">" })
      .add({ ...fade("d"), at: "<" })
      .build();
    expect(tl.seek(2).c?.opacity).toBe(0.5);
    expect(tl.seek(1.5).d?.opacity).toBe(0.5);
  });
});

describe("wait", () => {
  it("adds empty time that counts towards the duration", () => {
    const tl = timeline().add(fade("a")).wait(2).add(fade("b")).build();
    expect(tl.duration).toBe(4);
    expect(tl.seek(3.5).b?.opacity).toBe(0.5);
  });
});

describe("seek", () => {
  it("holds the first from value before a tween starts", () => {
    const tl = timeline()
      .add({ ...fade("a"), at: 1 })
      .build();
    expect(tl.seek(0)).toEqual({ a: { opacity: 0 } });
  });

  it("applies the ease", () => {
    const tl = timeline()
      .add({ ...fade("a"), ease: "inQuad" })
      .build();
    expect(tl.seek(0.5).a?.opacity).toBeCloseTo(0.25);
  });

  it("holds the last value in gaps and after the end", () => {
    const tl = timeline()
      .add(fade("a"))
      .add({ target: "b", from: { x: 0 }, to: { x: 1 }, duration: 1, at: 3 })
      .build();
    expect(tl.seek(2).a?.opacity).toBe(1);
    expect(tl.seek(99).a?.opacity).toBe(1);
  });

  it("lets the latest started tween win on the same property", () => {
    const tl = timeline()
      .add(fade("a"))
      .add({ target: "a", from: { opacity: 1 }, to: { opacity: 0.2 }, duration: 1, at: 2 })
      .build();
    expect(tl.seek(1.5).a?.opacity).toBe(1);
    expect(tl.seek(2.5).a?.opacity).toBeCloseTo(0.6);
    expect(tl.seek(3).a?.opacity).toBeCloseTo(0.2);
  });

  it("keeps separate properties of one target independent", () => {
    const tl = timeline()
      .add({ target: "a", from: { opacity: 0, y: 10 }, to: { opacity: 1, y: 0 }, duration: 1 })
      .add({ target: "a", from: { scale: 1 }, to: { scale: 2 }, duration: 1 })
      .build();
    expect(tl.seek(1.5).a).toEqual({ opacity: 1, y: 0, scale: 1.5 });
  });

  it("clamps time to the timeline", () => {
    const tl = timeline().add(fade("a")).build();
    expect(tl.seek(-1)).toEqual(tl.seek(0));
  });

  it("returns a fresh object each time", () => {
    const tl = timeline().add(fade("a")).build();
    const first = tl.seek(0.5);
    (first.a as Record<string, number>).opacity = 42;
    expect(tl.seek(0.5).a?.opacity).toBe(0.5);
  });
});
