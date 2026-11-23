import { cpSync } from "node:fs";
import { join } from "node:path";

const example = new URL("../../examples/oauth-login/", import.meta.url).pathname;

/** Copies the oauth-login example into `projectsDir` as `slug`, without its renders or caches. */
export const copyExample = (projectsDir: string, slug: string): string => {
  const dir = join(projectsDir, slug);
  cpSync(example, dir, {
    recursive: true,
    filter: (source) => !source.includes("/out") && !source.includes("/cache"),
  });
  return dir;
};
