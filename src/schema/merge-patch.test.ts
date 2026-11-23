import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { merged, mergePatchBetween } from "./merge-patch.ts";

describe("merged", () => {
  it("merges objects, removes a key set to null, and replaces the rest", () => {
    expect(
      merged(
        {
          theme: { palette: "ocean", mode: "dark" },
          font: "inter",
          cards: { end: { headline: "Hi" } },
        },
        { theme: { mode: "both" }, font: "manrope", cards: null, logo: { corner: "bottom-right" } },
      ),
    ).toEqual({
      theme: { palette: "ocean", mode: "both" },
      font: "manrope",
      logo: { corner: "bottom-right" },
    });
  });
});

describe("mergePatchBetween", () => {
  it("is empty when nothing changed", () => {
    const config = { theme: { palette: "ocean" }, cards: { end: { headline: "Hi" } } };
    expect(mergePatchBetween(config, structuredClone(config))).toEqual({});
  });

  it("names only what changed, with null for what was removed", () => {
    expect(
      mergePatchBetween(
        {
          theme: { palette: "ocean", mode: "dark" },
          cards: { end: { headline: "Hi", link: "https://a.b" } },
        },
        { theme: { palette: "ocean", mode: "both" }, cards: { end: { headline: "Hi" } } },
      ),
    ).toEqual({ theme: { mode: "both" }, cards: { end: { link: null } } });
  });

  it("replaces arrays whole", () => {
    expect(mergePatchBetween({ a: [1, 2] }, { a: [1, 3] })).toEqual({ a: [1, 3] });
  });

  // JSON values without nulls: a null inside a value cannot be said in a merge patch (RFC 7386).
  const json: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
    value: fc.oneof(
      { depthSize: "small" },
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.array(tie("value"), { maxLength: 3 }),
      tie("object"),
    ),
    object: fc.dictionary(fc.constantFrom("a", "b", "c", "d"), tie("value"), { maxKeys: 4 }),
  })).object;

  it("gives a patch that turns the first into the second", () => {
    fc.assert(
      fc.property(json, json, (before, after) => {
        expect(merged(before, mergePatchBetween(before, after))).toEqual(after);
      }),
    );
  });
});
