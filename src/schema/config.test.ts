import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseConfig } from "./config.ts";
import { formatErrors } from "./errors.ts";

const errorsFor = (data: unknown) => {
  const result = parseConfig(data);
  if (result.ok) throw new Error("expected errors");
  return formatErrors(result.errors);
};

describe("parseConfig", () => {
  it("fills every default from an empty object", () => {
    expect(parseConfig({})).toEqual({ ok: true, value: DEFAULT_CONFIG });
  });

  it("fills defaults inside a partial section", () => {
    const result = parseConfig({ voice: { id: "bm_george" } });
    expect(result.ok && result.value.voice).toEqual({ ...DEFAULT_CONFIG.voice, id: "bm_george" });
  });

  it("accepts a custom palette", () => {
    const palette = {
      background: "#ffffff",
      surface: "#f4f4f5",
      text: "#18181b",
      muted: "#71717a",
      accent: "#6d28d9",
      categories: ["#2563eb", "#16a34a"],
    };
    const result = parseConfig({ theme: { palette } });
    expect(result.ok && result.value.theme.palette).toEqual(palette);
  });

  it("requires hex colours", () => {
    expect(
      errorsFor({
        theme: {
          palette: {
            background: "white",
            surface: "#f4f4f5",
            text: "#18181b",
            muted: "#71717a",
            accent: "#6d28d9",
            categories: [],
          },
        },
      }),
    ).toEqual(["theme.palette.background: must be a hex colour like #1a2b3c"]);
  });

  it("allows at most 6 category colours", () => {
    const palette = {
      background: "#ffffff",
      surface: "#f4f4f5",
      text: "#18181b",
      muted: "#71717a",
      accent: "#6d28d9",
      categories: Array.from({ length: 7 }, () => "#000000"),
    };
    expect(errorsFor({ theme: { palette } })).toEqual(["theme.palette.categories: 7 items, max 6"]);
  });

  it("bounds voice speed and music volume", () => {
    expect(errorsFor({ voice: { speed: 3 }, music: { volumeDb: 6 } })).toEqual([
      "voice.speed: must be at most 2",
      "music.volumeDb: must be at most 0",
    ]);
  });
});
