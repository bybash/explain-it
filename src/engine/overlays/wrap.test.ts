import { describe, expect, it } from "vitest";
import { wrappedLines } from "./wrap.ts";

/** Ten pixels a character, spaces included, standing in for a font. */
const measure = (text: string) => text.length * 10;

describe("wrappedLines", () => {
  it("counts one line for text that fits, and none for no text", () => {
    expect(wrappedLines("A user signs in.", 200, measure)).toBe(1);
    expect(wrappedLines("", 200, measure)).toBe(0);
  });

  it("breaks between words, as the page does, so a line holds whole words", () => {
    // "aaaa bbbb cccc" is 140 px; at 100 px, "aaaa bbbb" (90) fits, then "cccc".
    expect(wrappedLines("aaaa bbbb cccc", 100, measure)).toBe(2);
    // At 80 px, "aaaa bbbb" no longer fits: three lines of one word.
    expect(wrappedLines("aaaa bbbb cccc", 80, measure)).toBe(3);
  });

  it("gives a word too long for the width a line of its own", () => {
    expect(wrappedLines("a verylongwordindeed b", 100, measure)).toBe(3);
  });
});
