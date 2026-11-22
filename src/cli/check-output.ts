import type { CheckReport } from "../schema/checks.ts";

/**
 * What the check command prints: each problem once, with the beats it shows
 * in (a box stays put across beats, so one overlap often spans several),
 * then a summary.
 */
export const checkLines = (report: CheckReport, file: string): string[] => {
  const where = `in ${report.beats} beats; the report is in ${file}`;
  const beats = new Map<string, string[]>();
  for (const w of report.warnings)
    beats.set(w.message, [
      ...(beats.get(w.message) ?? []),
      `${w.scene}/${w.beat} (${w.at.toFixed(1)} s)`,
    ]);
  if (beats.size === 0) return [`no layout problems ${where}`];
  return [
    ...[...beats].map(([message, at]) => `${message}: ${at.join(", ")}`),
    `${beats.size} problem${beats.size === 1 ? "" : "s"} ${where}`,
  ];
};
