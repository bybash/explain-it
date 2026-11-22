import type { CheckReport } from "../schema/checks.ts";
import type { Validated, ValidationError } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

/** `explain-it check <project>` */
export type CheckArgs = { readonly project: string };

/** Reads the check command's arguments; every problem names the argument it is about. */
export const parseCheckArgs = (argv: readonly string[]): Validated<CheckArgs> => {
  const errors: ValidationError[] = [];
  const [project, ...extra] = argv.filter((arg) => !arg.startsWith("--"));
  for (const arg of argv)
    if (arg.startsWith("--"))
      errors.push({ path: arg.split("=")[0] ?? arg, message: "unknown option" });
  for (const arg of extra) errors.unshift({ path: arg, message: "unexpected argument" });
  if (project === undefined) errors.unshift({ path: "<project>", message: "required" });
  return errors.length > 0 || project === undefined ? fail(errors) : ok({ project });
};

/** What the check command prints: each problem at its beat, then a summary. */
export const checkLines = (report: CheckReport, file: string): string[] => {
  const where = `in ${report.beats} beats; the report is in ${file}`;
  if (report.warnings.length === 0) return [`no layout problems ${where}`];
  const count = report.warnings.length;
  return [
    ...report.warnings.map((w) => `${w.scene}/${w.beat} (${w.at.toFixed(1)} s): ${w.message}`),
    `${count} problem${count === 1 ? "" : "s"} ${where}`,
  ];
};
