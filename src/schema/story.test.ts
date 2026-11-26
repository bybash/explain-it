import { describe, expect, it } from "vitest";
import { formatErrors, parseWith } from "./errors.ts";
import { BriefSchema, HouseRulesSchema, MAX_AUDIENCE, MAX_HOUSE_RULES } from "./story.ts";

const errorsOf = (schema: Parameters<typeof parseWith>[0], data: unknown) => {
  const parsed = parseWith(schema, data);
  return parsed.ok ? [] : formatErrors(parsed.errors);
};

describe("BriefSchema", () => {
  it("takes a full brief, or one with only some of its fields", () => {
    const full = {
      version: 1,
      audience: "New backend developers",
      takeaway: "A reset link works once, and only for an hour.",
      shape: "problem",
      hook: "Forgot your password? Here is what happens next.",
      notes: "Do not mention the old SMS flow.",
    };
    expect(parseWith(BriefSchema, full).ok).toBe(true);
    expect(parseWith(BriefSchema, { version: 1, notes: "Keep it short." }).ok).toBe(true);
    expect(parseWith(BriefSchema, { version: 1 }).ok).toBe(true);
  });

  it("names the field that is wrong", () => {
    expect(errorsOf(BriefSchema, { version: 1, shape: "saga" })).toEqual([
      'shape: must be one of "problem", "before-after", "failure", "zoom"',
    ]);
    expect(
      errorsOf(BriefSchema, { version: 1, audience: "x".repeat(MAX_AUDIENCE + 1) })[0],
    ).toMatch(/^audience: /);
    expect(errorsOf(BriefSchema, { version: 1, takeaway: "" })[0]).toMatch(/^takeaway: /);
    expect(errorsOf(BriefSchema, { version: 1, tone: "fun" })[0]).toMatch(/tone/);
  });
});

describe("HouseRulesSchema", () => {
  it("takes free text up to its limit, and nothing longer", () => {
    expect(parseWith(HouseRulesSchema, "- No jargon.\n- End with the docs link.").ok).toBe(true);
    expect(parseWith(HouseRulesSchema, "").ok).toBe(true);
    expect(errorsOf(HouseRulesSchema, "x".repeat(MAX_HOUSE_RULES + 1))[0]).toMatch(
      new RegExp(`${MAX_HOUSE_RULES}`),
    );
  });
});
