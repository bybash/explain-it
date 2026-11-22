import { describe, expect, it } from "vitest";
import type { CheckReport } from "../schema/checks.ts";
import { checkLines } from "./check-output.ts";

const report = (warnings: CheckReport["warnings"]): CheckReport => ({
  version: 1,
  checkedAt: "2026-11-22T10:00:00.000Z",
  beats: 10,
  warnings,
});

describe("checkLines", () => {
  it("says each problem once, with the beats it shows in, then sums up", () => {
    const overlap = {
      check: "overlap",
      px: 12,
      message: 'node "a" and node "b" overlap by 12 px',
    } as const;
    const lines = checkLines(
      report([
        { ...overlap, scene: "sign_in", beat: "start", at: 2.45 },
        { ...overlap, scene: "sign_in", beat: "hand_off", at: 7.1 },
        {
          check: "off-frame",
          scene: "exchange",
          beat: "token",
          at: 40.1,
          px: 8,
          message: "the logo leaves the safe area by 8 px",
        },
      ]),
      "/p/checks.json",
    );
    expect(lines).toEqual([
      'node "a" and node "b" overlap by 12 px: sign_in/start (2.5 s), sign_in/hand_off (7.1 s)',
      "the logo leaves the safe area by 8 px: exchange/token (40.1 s)",
      "2 problems in 10 beats; the report is in /p/checks.json",
    ]);
  });

  it("says so when there is nothing to fix", () => {
    expect(checkLines(report([]), "/p/checks.json")).toEqual([
      "no problems in 10 beats; the report is in /p/checks.json",
    ]);
  });
});
