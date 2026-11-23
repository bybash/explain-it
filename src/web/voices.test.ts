import { describe, expect, it } from "vitest";
import { VOICE_IDS } from "../schema/voices.ts";
import { voiceGroups } from "./voices.ts";

describe("voiceGroups", () => {
  it("groups every voice by accent and voice, named for people", () => {
    const groups = voiceGroups();
    expect(groups.map((g) => g.label)).toEqual([
      "American English, female",
      "American English, male",
      "British English, female",
      "British English, male",
    ]);
    expect(groups.flatMap((g) => g.voices.map((v) => v.id)).sort()).toEqual([...VOICE_IDS].sort());
    expect(groups[0]?.voices[0]).toEqual({ id: "af_heart", name: "Heart" });
    expect(groups[3]?.voices.map((v) => v.name)).toContain("George");
  });
});
