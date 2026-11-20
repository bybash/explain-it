import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CUE_CHARS, splitCues } from "./cues.ts";

describe("splitCues", () => {
  it("fits two 42-character lines in one cue", () => {
    expect(MAX_CUE_CHARS).toBe(84);
  });

  it("keeps a line that fits as one cue", () => {
    expect(splitCues("The browser hands that code to the app.")).toEqual([
      "The browser hands that code to the app.",
    ]);
  });

  it("keeps short sentences together while they fit", () => {
    expect(splitCues("It works. It really does.")).toEqual(["It works. It really does."]);
  });

  it("splits a long line between sentences first", () => {
    expect(
      splitCues(
        "The app never sees the password. It sends the browser to an identity provider instead.",
      ),
    ).toEqual([
      "The app never sees the password.",
      "It sends the browser to an identity provider instead.",
    ]);
  });

  it("splits a long sentence between clauses", () => {
    expect(
      splitCues(
        "Now the app talks to the provider directly, server to server, and swaps the code for a token.",
      ),
    ).toEqual([
      "Now the app talks to the provider directly, server to server,",
      "and swaps the code for a token.",
    ]);
  });

  it("splits a long clause between words", () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const cues = splitCues(words);
    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) expect(cue.length).toBeLessThanOrEqual(MAX_CUE_CHARS);
    expect(cues.join(" ")).toBe(words);
  });

  it("never loses or reorders a word, and keeps cues short unless one word is longer", () => {
    const word = fc.stringMatching(/^[a-z]{1,12}[.,!?]?$/);
    const text = fc.array(word, { minLength: 1, maxLength: 60 }).map((w) => w.join(" "));
    fc.assert(
      fc.property(text, (line) => {
        const cues = splitCues(line);
        expect(cues.join(" ")).toBe(line);
        for (const cue of cues) expect(cue.length).toBeLessThanOrEqual(MAX_CUE_CHARS);
      }),
    );
  });

  it("tidies whitespace", () => {
    expect(splitCues("  Two \n words  ")).toEqual(["Two words"]);
  });
});
