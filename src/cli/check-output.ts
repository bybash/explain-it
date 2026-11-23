import { dirname, join } from "node:path";
import type { CheckReport, CheckWarning } from "../schema/checks.ts";

/** Where a problem shows: its beat and time, or the whole video. */
const whereIn = (w: CheckWarning): string =>
  "beat" in w ? `${w.scene}/${w.beat} (${w.at.toFixed(1)} s)` : "the whole video";

/**
 * What the check command prints: each problem once, with the beats it shows
 * in (a box stays put across beats, so one overlap often spans several),
 * then a summary.
 */
export const checkLines = (report: CheckReport, file: string): string[] => {
  const where = `in ${report.beats} beats; the report is in ${file}`;
  const beats = new Map<string, string[]>();
  for (const w of report.warnings)
    beats.set(w.message, [...(beats.get(w.message) ?? []), whereIn(w)]);
  const notRun = report.skipped.map((s) => `not checked: ${s.checks.join(", ")} (${s.reason})`);
  const sheet = report.contactSheet
    ? [`contact sheet: ${join(dirname(file), report.contactSheet.full)}`]
    : [];
  if (beats.size === 0) return [...notRun, `no problems ${where}`, ...sheet];
  return [
    ...notRun,
    ...[...beats].map(([message, at]) => `${message}: ${at.join(", ")}`),
    `${beats.size} problem${beats.size === 1 ? "" : "s"} ${where}`,
    ...sheet,
  ];
};
