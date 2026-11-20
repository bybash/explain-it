import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { parseRenderArgs, renderSettings } from "./args.ts";

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

describe("renderSettings", () => {
  it("renders the themes and resolution the project's config asks for by default", () => {
    const config = { ...DEFAULT_CONFIG, theme: { ...DEFAULT_CONFIG.theme, mode: "both" as const } };
    expect(renderSettings({ project: "p" }, config)).toEqual({
      themes: ["light", "dark"],
      resolution: "1080p",
    });
  });

  it("lets the flags win", () => {
    expect(
      renderSettings({ project: "p", theme: "dark", resolution: "720p" }, DEFAULT_CONFIG),
    ).toEqual({ themes: ["dark"], resolution: "720p" });
  });
});
