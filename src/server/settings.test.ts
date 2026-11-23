import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, SUGGESTED_MODEL } from "../schema/settings.ts";
import { settingsStore } from "./settings.ts";

let dir: string;
let envFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "explain-it-settings-"));
  envFile = join(dir, ".env");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const KEY = "sk-or-v1-0123456789abcdef";

describe("settingsStore", () => {
  it("starts at OpenRouter with the suggested model and no key", async () => {
    const store = settingsStore({ envFile, environment: {} });
    expect(await store.view()).toEqual({
      baseUrl: DEFAULT_BASE_URL,
      provider: "openrouter",
      model: SUGGESTED_MODEL,
      modelIsSuggested: true,
      key: { state: "none" },
      fromEnvironment: [],
    });
    expect(await store.current()).toEqual({ baseUrl: DEFAULT_BASE_URL, model: SUGGESTED_MODEL });
  });

  it("writes .env, keeping its other lines, and reads the settings back", async () => {
    writeFileSync(envFile, "# mine\nPORT=3000\n");
    const store = settingsStore({ envFile, environment: {} });
    const saved = await store.update({
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.3",
      apiKey: KEY,
    });
    expect(saved).toEqual({
      ok: true,
      value: {
        baseUrl: "http://127.0.0.1:11434/v1",
        provider: "ollama",
        model: "llama3.3",
        modelIsSuggested: false,
        key: { state: "set", hint: "••••cdef", variable: "LLM_API_KEY" },
        fromEnvironment: [],
      },
    });
    expect(readFileSync(envFile, "utf8")).toBe(
      `# mine\nPORT=3000\nLLM_BASE_URL=http://127.0.0.1:11434/v1\nLLM_MODEL=llama3.3\nLLM_API_KEY=${KEY}\n`,
    );
    // Only its owner can read the file that holds the key.
    expect(statSync(envFile).mode & 0o777).toBe(0o600);
    expect(await store.current()).toEqual({
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.3",
      apiKey: KEY,
    });
  });

  it("keeps the key when an update leaves it out, and removes it on null", async () => {
    const store = settingsStore({ envFile, environment: {} });
    await store.update({ apiKey: KEY });
    await store.update({ model: "other" });
    expect((await store.current()).apiKey).toBe(KEY);
    await store.update({ apiKey: null });
    expect((await store.view()).key).toEqual({ state: "none" });
    expect(readFileSync(envFile, "utf8")).not.toContain("LLM_API_KEY");
  });

  it("reads OPENROUTER_API_KEY as the key when LLM_API_KEY is not set", async () => {
    writeFileSync(envFile, `OPENROUTER_API_KEY=${KEY}\n`);
    const store = settingsStore({ envFile, environment: {} });
    expect((await store.view()).key).toEqual({
      state: "set",
      hint: "••••cdef",
      variable: "OPENROUTER_API_KEY",
    });
    expect((await store.current()).apiKey).toBe(KEY);
  });

  it("lets the environment win, and refuses to change what it sets", async () => {
    writeFileSync(envFile, "LLM_MODEL=from-file\n");
    const store = settingsStore({
      envFile,
      environment: { LLM_MODEL: "from-env", OPENROUTER_API_KEY: KEY },
    });
    const view = await store.view();
    expect(view.model).toBe("from-env");
    expect(view.fromEnvironment).toEqual(["model", "apiKey"]);
    expect(await store.update({ model: "mine" })).toEqual({
      ok: false,
      errors: [
        {
          path: "model",
          message: "LLM_MODEL is set in the environment, which wins over .env: change it there",
        },
      ],
    });
    expect(readFileSync(envFile, "utf8")).toBe("LLM_MODEL=from-file\n");
  });

  it("names what is wrong in an update and writes nothing", async () => {
    const store = settingsStore({ envFile, environment: {} });
    const result = await store.update({ baseUrl: "nope", extra: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.path).sort()).toEqual(["baseUrl", "extra"]);
    expect(() => readFileSync(envFile)).toThrow();
  });
});
