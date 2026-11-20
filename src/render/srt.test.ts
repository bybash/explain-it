import { describe, expect, it } from "vitest";
import { toSrt } from "./srt.ts";

describe("toSrt", () => {
  it("writes nothing for no cues", () => {
    expect(toSrt([])).toBe("");
  });

  it("numbers cues from 1, with millisecond times, a blank line between them", () => {
    expect(
      toSrt([
        { start: 0.3, end: 3.9, text: "A user opens the app." },
        { start: 4.5, end: 10.75, text: "It sends the browser away." },
      ]),
    ).toBe(
      "1\n00:00:00,300 --> 00:00:03,900\nA user opens the app.\n\n" +
        "2\n00:00:04,500 --> 00:00:10,750\nIt sends the browser away.\n",
    );
  });

  it("counts minutes and hours", () => {
    expect(toSrt([{ start: 3725.5, end: 3726, text: "Late." }])).toBe(
      "1\n01:02:05,500 --> 01:02:06,000\nLate.\n",
    );
  });

  it("rounds to the nearest millisecond, carrying into seconds", () => {
    expect(toSrt([{ start: 1.0004, end: 59.9996, text: "Round." }])).toBe(
      "1\n00:00:01,000 --> 00:01:00,000\nRound.\n",
    );
  });
});
