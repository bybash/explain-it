import { cpSync } from "node:fs";
import { join } from "node:path";
import { CHECK_REPORT } from "../render/check-files.ts";
import { CONTACT_SHEET } from "../render/sheet.ts";

const example = new URL("../../examples/oauth-login/", import.meta.url).pathname;

/** What a check or render leaves in a project's folder, ignored by git and not part of the example. */
const OUTPUT = ["/out", "/cache", CHECK_REPORT, ...Object.values(CONTACT_SHEET)].map(
  (name) => (name.startsWith("/") ? name : `/${name}`),
);

/** Copies the oauth-login example into `projectsDir` as `slug`, without its renders, checks or caches. */
export const copyExample = (projectsDir: string, slug: string): string => {
  const dir = join(projectsDir, slug);
  cpSync(example, dir, {
    recursive: true,
    filter: (source) => !OUTPUT.some((output) => source.includes(output)),
  });
  return dir;
};
