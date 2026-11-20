import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../schema/config.ts";
import { renderSettings } from "./settings.ts";

describe("renderSettings", () => {
  it("renders the themes and resolution the project's config asks for by default", () => {
    const config = { ...DEFAULT_CONFIG, theme: { ...DEFAULT_CONFIG.theme, mode: "both" as const } };
    expect(renderSettings({}, config)).toEqual({ themes: ["light", "dark"], resolution: "1080p" });
  });

  it("lets the choices given win", () => {
    expect(renderSettings({ theme: "dark", resolution: "720p" }, DEFAULT_CONFIG)).toEqual({
      themes: ["dark"],
      resolution: "720p",
    });
  });
});
