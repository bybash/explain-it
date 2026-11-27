import { launchBrowser } from "./render.ts";

/**
 * Whether a browser the renderer can use is here: Google Chrome, or the
 * Chromium at CHROME_PATH, as in the Docker image (6.3). Tests that need one
 * skip themselves without it.
 */
export const hasChrome = await launchBrowser()
  .then((browser) => browser.close().then(() => true))
  .catch(() => false);
