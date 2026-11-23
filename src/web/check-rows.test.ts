import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CheckReport } from "../schema/checks.ts";
import { StoryboardSchema } from "../schema/storyboard.ts";
import { checkRows } from "./check-rows.ts";

const storyboard = StoryboardSchema.parse(
  JSON.parse(readFileSync("examples/oauth-login/storyboard.json", "utf8")),
);

const report: CheckReport = {
  version: 1,
  checkedAt: "2026-11-23T10:00:00.000Z",
  beats: 10,
  warnings: [
    {
      check: "reading-speed",
      scene: "exchange",
      beat: "token",
      at: 40.2,
      message: 'a narration caption of beat "token" needs 20 characters a second to read',
    },
    {
      check: "overlap",
      scene: "sign_in",
      beat: "hand_off",
      at: 13.6,
      px: 12,
      message: 'node "user" and node "browser" overlap by 12 px',
    },
    { check: "loudness", message: "the mix is at -19.4 LUFS; it should be -16 ± 1" },
    {
      check: "off-frame",
      scene: "exchange",
      beat: "token",
      at: 40.2,
      px: 30,
      message: 'node "api" leaves the safe area by 30 px',
    },
  ],
  skipped: [{ checks: ["narration-fit", "loudness"], reason: "the voice did not generate" }],
};

describe("checkRows", () => {
  it("lists the beats' warnings in the order they show, each named by its scene and beat", () => {
    expect(checkRows(report, storyboard).atBeats).toEqual([
      {
        check: "Overlap",
        message: 'node "user" and node "browser" overlap by 12 px',
        at: 13.6,
        beat: "hand_off",
        where: "1·2",
        caption: "The app hands off to the identity provider.",
      },
      {
        check: "Reading speed",
        message: 'a narration caption of beat "token" needs 20 characters a second to read',
        at: 40.2,
        beat: "token",
        where: "2·2",
        caption: "The provider returns an access token.",
      },
      {
        check: "Off frame",
        message: 'node "api" leaves the safe area by 30 px',
        at: 40.2,
        beat: "token",
        where: "2·2",
        caption: "The provider returns an access token.",
      },
    ]);
  });

  it("lists the whole video's warnings and the skipped checks apart, as they name no beat", () => {
    const rows = checkRows(report, storyboard);
    expect(rows.forVideo).toEqual([
      { check: "Loudness", message: "the mix is at -19.4 LUFS; it should be -16 ± 1" },
    ]);
    expect(rows.skipped).toEqual(["Narration fit and loudness: the voice did not generate"]);
  });

  it("counts the warnings at each beat, for the beat list", () => {
    expect(Object.fromEntries(checkRows(report, storyboard).countByBeat)).toEqual({
      hand_off: 1,
      token: 2,
    });
  });

  it("still lists a warning at a beat the script no longer has", () => {
    const gone = {
      ...report,
      warnings: [
        { check: "overlap" as const, scene: "old", beat: "removed", at: 3, message: "overlap" },
      ],
    };
    expect(checkRows(gone, storyboard).atBeats).toEqual([
      { check: "Overlap", message: "overlap", at: 3, beat: "removed", where: "", caption: "" },
    ]);
  });
});
