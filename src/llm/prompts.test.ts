import { describe, expect, it } from "vitest";
import { prompt } from "./prompts.ts";

describe("prompt", () => {
  it("fills a prompt's places from what it is given", () => {
    expect(prompt("draft-graph", { guide: "THE GUIDE" })).toContain("THE GUIDE");
  });

  it("refuses a place left without a value, so no prompt goes out half written", () => {
    expect(() => prompt("draft-graph", {})).toThrow(/\{\{guide\}\}/);
  });
});
