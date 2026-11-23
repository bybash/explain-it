import { CHECK_REPORT } from "./check-files.ts";
import { CONTACT_SHEET } from "./sheet.ts";

/** What a render or a check run leaves in a project's folder, ignored by git: renders, caches, the report and sheet. */
const OUTPUT = ["out", "cache", CHECK_REPORT, ...Object.values(CONTACT_SHEET)].map(
  (name) => `/${name}`,
);

/** Whether a path in a project's folder is output a run left there, not one of the project's files. */
export const isProjectOutput = (path: string): boolean =>
  OUTPUT.some((output) => path.includes(output));
