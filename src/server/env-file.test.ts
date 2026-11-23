import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseEnvFile, updateEnvFile } from "./env-file.ts";

describe("parseEnvFile", () => {
  it("reads plain, exported, quoted and commented lines", () => {
    const text = [
      "# the LLM",
      "LLM_MODEL=anthropic/claude",
      "export LLM_BASE_URL=https://openrouter.ai/api/v1",
      'LLM_API_KEY="sk-or-v1 with spaces"',
      "SINGLE='a#b'",
      "TRAILING=value # a comment",
      "",
      "not a line",
    ].join("\n");
    expect(Object.fromEntries(parseEnvFile(text))).toEqual({
      LLM_MODEL: "anthropic/claude",
      LLM_BASE_URL: "https://openrouter.ai/api/v1",
      LLM_API_KEY: "sk-or-v1 with spaces",
      SINGLE: "a#b",
      TRAILING: "value",
    });
  });
});

describe("updateEnvFile", () => {
  it("changes a variable in place and keeps every other line", () => {
    const text = "# keys\nLLM_MODEL=old\nOTHER=1\n";
    expect(updateEnvFile(text, { LLM_MODEL: "new" })).toBe("# keys\nLLM_MODEL=new\nOTHER=1\n");
  });

  it("adds a missing variable at the end and removes one set to null", () => {
    const text = "OTHER=1\nLLM_API_KEY=sk-old\n";
    expect(updateEnvFile(text, { LLM_API_KEY: null, LLM_MODEL: "m" })).toBe(
      "OTHER=1\nLLM_MODEL=m\n",
    );
  });

  it("writes any value so that it reads back the same", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 60 }).filter((s) => !/[\n\r]/.test(s)),
        (value) => {
          const written = updateEnvFile("", { LLM_API_KEY: value });
          expect(parseEnvFile(written).get("LLM_API_KEY")).toBe(value);
        },
      ),
    );
  });
});
