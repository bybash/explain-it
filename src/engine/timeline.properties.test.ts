import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EASE_NAMES } from "./ease.ts";
import { type TimelineBuilder, timeline } from "./timeline.ts";

const tweenSpec = fc.record({
  target: fc.constantFrom("a", "b", "c"),
  prop: fc.constantFrom("x", "opacity"),
  from: fc.double({ min: -100, max: 100, noNaN: true }),
  to: fc.double({ min: -100, max: 100, noNaN: true }),
  duration: fc.double({ min: 0.01, max: 5, noNaN: true }),
  ease: fc.constantFrom(...EASE_NAMES),
  at: fc.oneof(
    fc.constant(undefined),
    fc.constantFrom("<", ">", "-=0.5", "+=0.25", "<+=0.1"),
    fc.double({ min: 0, max: 10, noNaN: true }),
  ),
});

const build = (specs: fc.RecordValue<typeof tweenSpec>[]) =>
  specs
    .reduce<TimelineBuilder>(
      (tl, s) =>
        tl.add({
          target: s.target,
          from: { [s.prop]: s.from },
          to: { [s.prop]: s.to },
          duration: s.duration,
          ease: s.ease,
          ...(s.at === undefined ? {} : { at: s.at }),
        }),
      timeline(),
    )
    .build();

const fraction = fc.double({ min: 0, max: 1, noNaN: true });

describe("timeline properties", () => {
  it("gives identical state whatever order times are seeked in", () => {
    fc.assert(
      fc.property(
        fc.array(tweenSpec, { minLength: 1, maxLength: 12 }),
        fc.array(fraction, { minLength: 1, maxLength: 20 }),
        (specs, fractions) => {
          const tl = build(specs);
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
      fc.property(fc.array(tweenSpec, { minLength: 1, maxLength: 12 }), fraction, (specs, f) => {
        const a = build(specs);
        const b = build(specs);
        expect(a.duration).toBe(b.duration);
        expect(a.seek(f * a.duration)).toEqual(b.seek(f * b.duration));
      }),
    );
  });

  it("ends every property at the to value of the last tween to start on it", () => {
    fc.assert(
      fc.property(fc.array(tweenSpec, { minLength: 1, maxLength: 12 }), (specs) => {
        const tl = build(specs);
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
