import { createHash } from "node:crypto";
import type { ProjectFiles } from "./load.ts";

/** The checks' report, in the project's folder beside the contact sheet. */
export const CHECK_REPORT = "checks.json";

/** Bumped when the checks change what they find, so reports made before read as out of date. */
const CHECKS_VERSION = 1;

/**
 * A key of what the checks look at: the graph, the script, the layout and
 * the style. The voice's measured lengths follow from the script and the
 * voice settings, so they are left out, and a reader without the voice can
 * still tell whether a report is about the files as they are.
 */
export const checkedFilesKey = (
  project: Pick<ProjectFiles, "graph" | "storyboard" | "layout" | "config">,
): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        CHECKS_VERSION,
        project.graph,
        project.storyboard,
        project.layout,
        project.config,
      ]),
    )
    .digest("hex")
    .slice(0, 32);
