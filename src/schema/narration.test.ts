import { describe, expect, it } from "vitest";
import { formatErrors } from "./errors.ts";
import { parseNarration } from "./narration.ts";

describe("parseNarration", () => {
  it("takes measured seconds by beat id", () => {
    expect(parseNarration({ start: 3.25, hand_off: 1 })).toEqual({
      ok: true,
      value: { start: 3.25, hand_off: 1 },
    });
  });

  it("names a length that is not a positive number of seconds, and a key that is not a beat id", () => {
    const result = parseNarration({ start: 0, swap: -1, "Not An Id": 2, token: "3" });
    expect(result.ok ? [] : formatErrors(result.errors)).toEqual([
      "start: must be more than 0",
      "swap: must be more than 0",
      '["Not An Id"]: Invalid key in record',
      "token: expected number, got string",
    ]);
  });
});
