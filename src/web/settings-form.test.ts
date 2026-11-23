import { describe, expect, it } from "vitest";
import type { SettingsView } from "../schema/settings.ts";
import { formOf, settingsChanges } from "./settings-form.ts";

const view: SettingsView = {
  baseUrl: "https://openrouter.ai/api/v1",
  provider: "openrouter",
  model: "anthropic/claude-sonnet-5.5",
  modelIsSuggested: true,
  key: { state: "set", hint: "••••cdef", variable: "LLM_API_KEY" },
  fromEnvironment: [],
};

describe("settingsChanges", () => {
  it("sends nothing when nothing changed, and never a blank key", () => {
    expect(settingsChanges(view, formOf(view))).toEqual({});
  });

  it("sends the suggested model once the user saves it, so it is pinned in .env", () => {
    expect(settingsChanges(view, { ...formOf(view), saveModel: true })).toEqual({
      model: "anthropic/claude-sonnet-5.5",
    });
  });

  it("sends what changed: a provider's base URL, a model, a new key, trimmed", () => {
    expect(
      settingsChanges(view, {
        ...formOf(view),
        baseUrl: "http://127.0.0.1:11434/v1",
        model: " llama3.3 ",
        apiKey: " sk-new ",
      }),
    ).toEqual({ baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.3", apiKey: "sk-new" });
  });

  it("removes the key when asked", () => {
    expect(settingsChanges(view, { ...formOf(view), removeKey: true })).toEqual({ apiKey: null });
  });

  it("leaves out what the environment sets", () => {
    const locked: SettingsView = { ...view, fromEnvironment: ["model", "apiKey"] };
    expect(
      settingsChanges(locked, {
        ...formOf(locked),
        model: "other",
        apiKey: "sk-new",
        removeKey: true,
      }),
    ).toEqual({});
  });
});
