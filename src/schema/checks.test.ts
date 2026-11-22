import { describe, expect, it } from "vitest";
import { CheckReportSchema, CheckWarningSchema } from "./checks.ts";

describe("CheckWarningSchema", () => {
  it("holds a warning at a beat to its scene, beat and time", () => {
    expect(
      CheckWarningSchema.safeParse({ check: "overlap", px: 12, message: "a and b overlap" })
        .success,
    ).toBe(false);
    expect(
      CheckWarningSchema.safeParse({
        check: "overlap",
        scene: "sign_in",
        beat: "start",
        at: 2.5,
        px: 12,
        message: "a and b overlap",
      }).success,
    ).toBe(true);
  });

  it("takes a loudness warning for the whole video, without a beat", () => {
    expect(CheckWarningSchema.safeParse({ check: "loudness", message: "too quiet" }).success).toBe(
      true,
    );
    expect(
      CheckWarningSchema.safeParse({ check: "loudness", beat: "start", message: "too quiet" })
        .success,
    ).toBe(false);
  });
});

describe("CheckReportSchema", () => {
  it("says which checks did not run, and why", () => {
    expect(
      CheckReportSchema.safeParse({
        version: 1,
        checkedAt: "2026-11-22T10:00:00.000Z",
        beats: 10,
        warnings: [],
        skipped: [{ checks: ["overlap", "off-frame"], reason: "Chrome is not available" }],
      }).success,
    ).toBe(true);
  });
});
