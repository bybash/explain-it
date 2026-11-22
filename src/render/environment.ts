import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { launchBrowser } from "./render.ts";

const works = (attempt: Promise<unknown>): Promise<boolean> =>
  attempt.then(
    () => true,
    () => false,
  );

/** A program a render needs and this machine lacks, and what to install. */
export type MissingTool = { readonly tool: "chrome" | "ffmpeg"; readonly message: string };

/**
 * What a render needs from this machine and cannot find: Chrome (or the
 * Chromium at `CHROME_PATH`) and ffmpeg. Each says what to install.
 */
export const missingRenderTools = async (): Promise<MissingTool[]> => {
  const [chrome, ffmpeg] = await Promise.all([
    works(launchBrowser().then((browser) => browser.close())),
    works(promisify(execFile)("ffmpeg", ["-version"])),
  ]);
  return [
    ...(chrome
      ? []
      : [
          {
            tool: "chrome" as const,
            message: "not found; install Google Chrome, or set CHROME_PATH to a Chromium",
          },
        ]),
    ...(ffmpeg ? [] : [{ tool: "ffmpeg" as const, message: "not found on PATH; install ffmpeg" }]),
  ];
};
