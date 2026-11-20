import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { launchBrowser } from "./render.ts";

const works = (attempt: Promise<unknown>): Promise<boolean> =>
  attempt.then(
    () => true,
    () => false,
  );

/**
 * What a render needs from this machine and cannot find: Chrome (or the
 * Chromium at `CHROME_PATH`) and ffmpeg. Each line says what to install.
 */
export const missingRenderTools = async (): Promise<string[]> => {
  const [chrome, ffmpeg] = await Promise.all([
    works(launchBrowser().then((browser) => browser.close())),
    works(promisify(execFile)("ffmpeg", ["-version"])),
  ]);
  return [
    ...(chrome
      ? []
      : ["chrome: not found; install Google Chrome, or set CHROME_PATH to a Chromium"]),
    ...(ffmpeg ? [] : ["ffmpeg: not found on PATH; install ffmpeg"]),
  ];
};
