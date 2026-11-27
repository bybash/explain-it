import type { Browser } from "playwright-core";
import type { Card } from "../schema/card.ts";
import { CARD_SIZE, cardHtml } from "../share/card.ts";

/**
 * The TL;DR card as a PNG (decision 053): Chrome lays out the card's page,
 * with `still` (a PNG frame of the video) beside the title and the bullets,
 * and captures it.
 */
export const drawCard = async (
  browser: Browser,
  card: Card,
  { still, dark }: { readonly still: Buffer; readonly dark: boolean },
): Promise<Buffer> => {
  const page = await browser.newPage({ viewport: CARD_SIZE });
  try {
    await page.setContent(
      cardHtml(card, { still: `data:image/png;base64,${still.toString("base64")}`, dark }),
    );
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
    return await page.screenshot({ type: "png" });
  } finally {
    await page.close();
  }
};
