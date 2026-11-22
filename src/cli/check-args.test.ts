import { describe, expect, it } from "vitest";
import { parseCheckArgs } from "./check-args.ts";

describe("parseCheckArgs", () => {
  it("takes one project folder", () => {
    expect(parseCheckArgs(["examples/oauth-login"])).toEqual({
      ok: true,
      value: { project: "examples/oauth-login" },
    });
  });

  it("names what is missing or extra", () => {
    expect(parseCheckArgs([])).toEqual({
      ok: false,
      errors: [{ path: "<project>", message: "required" }],
    });
    expect(parseCheckArgs(["a", "b", "--loud"])).toEqual({
      ok: false,
      errors: [
        { path: "b", message: "unexpected argument" },
        { path: "--loud", message: "unknown option" },
      ],
    });
  });
});
