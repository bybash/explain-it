import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EASE_NAMES } from "./ease.ts";
import { type TimelineBuilder, type TweenSpec, timeline } from "./timeline.ts";

const value = fc.double({ min: -100, max: 100, noNaN: true });

const tweenBody = fc.record({
  props: fc.subarray(["x", "opacity"], { minLength: 1 }),
  from: value,
  to: value,
  duration: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 5, noNaN: true })),
  ease: fc.constantFrom(...EASE_NAMES),
  at: fc.oneof(
    fc.constant(undefined),
    fc.constantFrom("<", ">", "-=0.5", "+=0.25", "<+=0.1", ">-=2"),
    fc.double({ min: -2, max: 10, noNaN: true }),
  ),
});

const target = fc.constantFrom("a", "b", "c");

const step = fc.oneof(
  fc.record({ kind: fc.constant("add" as const), target, tween: tweenBody }),
  fc.record({
    kind: fc.constant("stagger" as const),
    targets: fc.subarray(["a", "b", "c"], { minLength: 1 }),
    tween: tweenBody,
    each: fc.double({ min: -1, max: 1, noNaN: true }),
  }),
  fc.record({
    kind: fc.constant("label" as const),
    target,
    tween: tweenBody,
    offset: fc.double({ min: 0, max: 2, noNaN: true }),
  }),
  fc.record({
    kind: fc.constant("wait" as const),
    seconds: fc.double({ min: 0, max: 2, noNaN: true }),
  }),
);

type Step = typeof step extends fc.Arbitrary<infer T> ? T : never;
type TweenBody = typeof tweenBody extends fc.Arbitrary<infer T> ? T : never;

const spec = (body: TweenBody): Omit<TweenSpec, "target"> => ({
  from: Object.fromEntries(body.props.map((prop) => [prop, body.from])),
  to: Object.fromEntries(body.props.map((prop) => [prop, body.to])),
  duration: body.duration,
  ease: body.ease,
  ...(body.at === undefined ? {} : { at: body.at }),
});

const apply = (tl: TimelineBuilder, s: Step, i: number): TimelineBuilder => {
  switch (s.kind) {
    case "add":
      return tl.add({ ...spec(s.tween), target: s.target });
    case "stagger":
      return tl.stagger(s.targets, spec(s.tween), s.each);
    case "label": {
      const name = `beat${i}`;
      return tl.label(name).add({ ...spec(s.tween), target: s.target, at: `${name}+=${s.offset}` });
    }
    case "wait":
      return tl.wait(s.seconds);
  }
};

const build = (steps: readonly Step[]) => steps.reduce(apply, timeline()).build();

const steps = fc.array(step, { minLength: 1, maxLength: 12 });
const fraction = fc.double({ min: 0, max: 1, noNaN: true });

describe("timeline properties", () => {
  it("gives identical state whatever order times are seeked in", () => {
    fc.assert(
      fc.property(
        steps,
        fc.array(fraction, { minLength: 1, maxLength: 20 }),
        (input, fractions) => {
          const tl = build(input);
          const times = fractions.map((f) => f * tl.duration);
          const forwards = times.toSorted((a, b) => a - b).map((t) => [t, tl.seek(t)] as const);
          const backwards = times.toSorted((a, b) => b - a).map((t) => [t, tl.seek(t)] as const);
          const shuffled = times.map((t) => [t, tl.seek(t)] as const);
          const byTime = (pairs: readonly (readonly [number, unknown])[]) =>
            new Map(pairs.map(([t, state]) => [t, JSON.stringify(state)]));
          expect(byTime(backwards)).toEqual(byTime(forwards));
          expect(byTime(shuffled)).toEqual(byTime(forwards));
        },
      ),
    );
  });

  it("builds the same timeline from the same input", () => {
    fc.assert(
      fc.property(steps, fraction, (input, f) => {
        const a = build(input);
        const b = build(input);
        expect(a.duration).toBe(b.duration);
        expect(a.seek(f * a.duration)).toEqual(b.seek(f * b.duration));
      }),
    );
  });

  it("never starts a tween before zero or ends one after the duration", () => {
    fc.assert(
      fc.property(steps, (input) => {
        const tl = build(input);
        for (const tween of tl.tweens) {
          expect(tween.start).toBeGreaterThanOrEqual(0);
          expect(tween.start + tween.duration).toBeLessThanOrEqual(tl.duration);
        }
      }),
    );
  });

  it("ends every property at the to value of the last tween to start on it", () => {
    fc.assert(
      fc.property(steps, (input) => {
        const tl = build(input);
        const end = tl.seek(tl.duration);
        tl.tweens.forEach((tween, i) => {
          for (const prop of Object.keys(tween.to)) {
            // Later start wins; on a tie, the tween added later wins.
            const overridden = tl.tweens.some(
              (other, j) =>
                other.target === tween.target &&
                prop in other.to &&
                (other.start > tween.start || (other.start === tween.start && j > i)),
            );
            if (!overridden) expect(end[tween.target]?.[prop]).toBe(tween.to[prop]);
          }
        });
      }),
    );
  });
});
