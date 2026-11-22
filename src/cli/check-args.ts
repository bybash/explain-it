import type { Validated, ValidationError } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

/** `explain-it check <project>` */
export type CheckArgs = { readonly project: string };

/** Reads the check command's arguments; every problem names the argument it is about. */
export const parseCheckArgs = (argv: readonly string[]): Validated<CheckArgs> => {
  const errors: ValidationError[] = [];
  let project: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--"))
      errors.push({ path: arg.split("=")[0] ?? arg, message: "unknown option" });
    else if (project === undefined) project = arg;
    else errors.push({ path: arg, message: "unexpected argument" });
  }
  if (project === undefined) errors.unshift({ path: "<project>", message: "required" });
  return errors.length > 0 || project === undefined ? fail(errors) : ok({ project });
};
