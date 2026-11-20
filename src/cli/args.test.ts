import { describe, expect, it } from "vitest";
import { parseRenderArgs } from "./args.ts";

describe("parseRenderArgs", () => {
  it("takes the project folder", () => {
    expect(parseRenderArgs(["examples/oauth-login"])).toEqual({
      ok: true,
      value: { project: "examples/oauth-login" },
    });
  });

  it("takes the theme and resolution, as separate words or with =", () => {
    expect(parseRenderArgs(["p", "--theme", "dark", "--resolution=720p"])).toEqual({
      ok: true,
      value: { project: "p", theme: "dark", resolution: "720p" },
    });
  });

  it("names the flag that is wrong, and says why", () => {
    const errors = (argv: string[]) => {
      const result = parseRenderArgs(argv);
      return result.ok ? [] : result.errors;
    };
    expect(errors([])).toEqual([{ path: "<project>", message: "required" }]);
    expect(errors(["p", "--theme", "blue"])).toEqual([
      { path: "--theme", message: 'must be one of "light", "dark", "both"' },
    ]);
    expect(errors(["p", "--resolution"])).toEqual([
      { path: "--resolution", message: "needs a value" },
    ]);
    expect(errors(["p", "--loud"])).toEqual([{ path: "--loud", message: "unknown option" }]);
    expect(errors(["p", "q"])).toEqual([{ path: "q", message: "unexpected argument" }]);
  });
});
