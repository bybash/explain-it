import { describe, expect, it } from "vitest";
import {
  maskKey,
  PROVIDERS,
  presetModel,
  providerOf,
  SettingsUpdateSchema,
  SUGGESTED_MODEL,
  suggestedModel,
} from "./settings.ts";

describe("SettingsUpdateSchema", () => {
  it("takes a base URL, a model and a key, or null to remove the key", () => {
    expect(
      SettingsUpdateSchema.safeParse({
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.3",
        apiKey: null,
      }).success,
    ).toBe(true);
  });

  it("refuses spaces and line breaks in the base URL and the model", () => {
    for (const update of [
      { model: "x\nLLM_API_KEY=evil" },
      { model: "two words" },
      { baseUrl: "http://a.com/\nX=1" },
    ])
      expect(SettingsUpdateSchema.safeParse(update).success).toBe(false);
  });

  it("takes http:// only for this machine, where the key never crosses a network", () => {
    for (const baseUrl of [
      "http://127.0.0.1:11434/v1",
      "http://localhost:1234/v1",
      "http://[::1]:8080/v1",
      "http://host.docker.internal:11434/v1",
      "https://llm.example.com/v1",
    ])
      expect(SettingsUpdateSchema.safeParse({ baseUrl }).success, baseUrl).toBe(true);
    for (const baseUrl of ["http://192.168.1.20:11434/v1", "http://llm.example.com/v1"]) {
      const result = SettingsUpdateSchema.safeParse({ baseUrl });
      expect(result.success, baseUrl).toBe(false);
      expect(result.error?.issues[0]?.message).toContain("https://");
    }
  });

  it("names what is wrong", () => {
    const result = SettingsUpdateSchema.safeParse({ baseUrl: "ftp://x", model: "", apiKey: "a b" });
    expect(result.success).toBe(false);
    const paths = [...new Set(result.error?.issues.map((i) => i.path.join(".")))].sort();
    expect(paths).toEqual(["apiKey", "baseUrl", "model"]);
  });
});

describe("maskKey", () => {
  it("shows only the last four characters of a long key, and nothing of a short one", () => {
    expect(maskKey("sk-or-v1-0123456789abcdef")).toBe("••••cdef");
    expect(maskKey("short-key")).toBe("••••");
  });
});

describe("providerOf", () => {
  it("names the preset a base URL belongs to, or custom", () => {
    for (const preset of PROVIDERS) expect(providerOf(preset.baseUrl)).toBe(preset.id);
    expect(providerOf("https://openrouter.ai/api/v1/")).toBe("openrouter");
    expect(providerOf("https://example.com/v1")).toBe("custom");
  });
});

describe("suggestedModel", () => {
  it("suggests a model the endpoint knows: Claude's own id for Anthropic, OpenRouter's otherwise", () => {
    expect(suggestedModel("https://api.anthropic.com/v1")).toBe("claude-opus-5-5");
    expect(suggestedModel("https://openrouter.ai/api/v1")).toBe(SUGGESTED_MODEL);
    expect(suggestedModel("https://example.com/v1")).toBe(SUGGESTED_MODEL);
  });

  it("leaves the model to the user for endpoints whose models are theirs to name", () => {
    expect(presetModel("https://api.anthropic.com/v1")).toBe("claude-opus-5-5");
    expect(presetModel("https://openrouter.ai/api/v1")).toBe(SUGGESTED_MODEL);
    expect(presetModel("https://api.openai.com/v1")).toBeUndefined();
    expect(presetModel("http://127.0.0.1:11434/v1")).toBeUndefined();
  });
});
