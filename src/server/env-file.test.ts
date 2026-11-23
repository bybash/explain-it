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
      'QUOTED="abc" # say "hi"',
      "EMPTY=#only a comment",
      "",
      "not a line",
    ].join("\n");
    expect(Object.fromEntries(parseEnvFile(text))).toEqual({
      LLM_MODEL: "anthropic/claude",
      LLM_BASE_URL: "https://openrouter.ai/api/v1",
      LLM_API_KEY: "sk-or-v1 with spaces",
      SINGLE: "a#b",
      TRAILING: "value",
      QUOTED: "abc",
      EMPTY: "",
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

  it("writes any value, line breaks included, as one line that reads back the same", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60, unit: "binary" }), (value) => {
        const written = updateEnvFile("OTHER=1\n", { LLM_API_KEY: value });
        expect(written.split("\n").filter(Boolean)).toHaveLength(2);
        expect(parseEnvFile(written)).toEqual(
          new Map([
            ["OTHER", "1"],
            ["LLM_API_KEY", value],
          ]),
        );
      }),
    );
  });

  it("changes every line of a variable set twice, so the change is the one read", () => {
    const text = "LLM_MODEL=a\nOTHER=1\nLLM_MODEL=b\n";
    expect(updateEnvFile(text, { LLM_MODEL: "c" })).toBe("LLM_MODEL=c\nOTHER=1\n");
    expect(updateEnvFile(text, { LLM_MODEL: null })).toBe("OTHER=1\n");
  });

  it("keeps Windows line endings", () => {
    expect(updateEnvFile("A=1\r\nB=2\r\n", { B: "3" })).toBe("A=1\r\nB=3\r\n");
  });
});
