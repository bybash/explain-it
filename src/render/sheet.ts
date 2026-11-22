import type { Browser } from "playwright-core";
import { sheetHtml, sheetLayout } from "../checks/sheet.ts";
import type { BeatWarning } from "../schema/checks.ts";

/** Tile widths: the sheet on disk, and the small one an agent is sent (1280 px wide, four to a row). */
export const SHEET_TILE = { full: 480, small: 300 } as const;
/** The small sheet is a JPEG of this quality. */
const SMALL_QUALITY = 70;

/**
 * The contact sheet as an image (SPEC, Checks): Chrome lays out the sheet's
 * page, one still per beat with its label and warnings, and captures it.
 * `stills` are PNG frames in beat order.
 */
export const drawSheet = async (
  browser: Browser,
  {
    beats,
    stills,
    warnings,
    size,
  }: {
    readonly beats: readonly { id: string; scene: string; start: number; end: number }[];
    readonly stills: readonly Buffer[];
    readonly warnings: readonly BeatWarning[];
    readonly size: keyof typeof SHEET_TILE;
  },
): Promise<Buffer> => {
  const sheet = sheetLayout({ beats, warnings, tileWidth: SHEET_TILE[size] });
  const page = await browser.newPage({ viewport: { width: sheet.width, height: sheet.height } });
  try {
    const urls = stills.map((png) => `data:image/png;base64,${png.toString("base64")}`);
    await page.setContent(sheetHtml(sheet, urls));
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
    return await page.screenshot(
      size === "full" ? { type: "png" } : { type: "jpeg", quality: SMALL_QUALITY },
    );
  } finally {
    await page.close();
  }
};
