import { describe, expect, it } from "vitest";
import type { CheckReport } from "../schema/checks.ts";
import { checkLines, parseCheckArgs } from "./check-output.ts";

const report = (warnings: CheckReport["warnings"]): CheckReport => ({
  version: 1,
  checkedAt: "2026-11-22T10:00:00.000Z",
  beats: 10,
  warnings,
});

describe("parseCheckArgs", () => {
  it("takes one project folder", () => {
    expect(parseCheckArgs(["examples/oauth-login"])).toEqual({
      ok: true,
      value: { project: "examples/oauth-login" },
    });
  });

  it("names what is missing or extra", () => {
    expect(parseCheckArgs([])).toEqual({
      ok: false,
      errors: [{ path: "<project>", message: "required" }],
    });
    expect(parseCheckArgs(["a", "b", "--loud"])).toEqual({
      ok: false,
      errors: [
        { path: "b", message: "unexpected argument" },
        { path: "--loud", message: "unknown option" },
      ],
    });
  });
});

describe("checkLines", () => {
  it("says each problem at its beat, then sums up", () => {
    expect(
      checkLines(
        report([
          {
            check: "overlap",
            scene: "sign_in",
            beat: "start",
            at: 2.45,
            px: 12,
            message: 'node "a" and node "b" overlap by 12 px',
          },
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
      ),
    ).toEqual([
      'sign_in/start (2.5 s): node "a" and node "b" overlap by 12 px',
      "exchange/token (40.1 s): the logo leaves the safe area by 8 px",
      "2 problems in 10 beats; the report is in /p/checks.json",
    ]);
  });

  it("says so when there is nothing to fix", () => {
    expect(checkLines(report([]), "/p/checks.json")).toEqual([
      "no layout problems in 10 beats; the report is in /p/checks.json",
    ]);
  });
});
