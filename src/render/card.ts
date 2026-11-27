import type { Browser } from "playwright-core";
import type { PaletteColours } from "../engine/theme/dark.ts";
import type { Card } from "../schema/card.ts";
import { CARD_PADDING, CARD_SIZE, cardHtml } from "../share/card.ts";

/** How far the card's type may shrink to fit, and by how much at a step. */
const TYPE_FIT = { min: 0.6, step: 0.05 } as const;

/**
 * The TL;DR card as a PNG (decision 053): Chrome lays out the card's page,
 * with `still` (a PNG frame of the video) beside the title and the bullets,
 * and captures it.
 */
export const drawCard = async (
  browser: Browser,
  card: Card,
  { still, colours }: { readonly still: Buffer; readonly colours: PaletteColours },
): Promise<Buffer> => {
  const page = await browser.newPage({ viewport: CARD_SIZE });
  try {
    await page.setContent(
      cardHtml(card, { still: `data:image/png;base64,${still.toString("base64")}`, colours }),
    );
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
    // Long text shrinks, a step at a time, until the card holds it.
    await page.evaluate(
      ({ room, min, step }) => {
        const text = document.querySelector(".text");
        if (!text) return;
        for (let type = 1; text.getBoundingClientRect().height > room && type > min; type -= step)
          document.body.style.setProperty("--type", (type - step).toFixed(2));
      },
      { room: CARD_SIZE.height - 2 * CARD_PADDING, ...TYPE_FIT },
    );
    return await page.screenshot({ type: "png" });
  } finally {
    await page.close();
  }
};
