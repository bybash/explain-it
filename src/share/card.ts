import type { PaletteColours } from "../engine/theme/dark.ts";
import { CARD_LIMITS, type Card } from "../schema/card.ts";
import type { Storyboard } from "../schema/storyboard.ts";

/** The card's size: what link previews show, so it can be one too (decision 053). */
export const CARD_SIZE = { width: 1200, height: 630 } as const;
/** The space around the card's content, in pixels. */
export const CARD_PADDING = 56;

/** Text cut to `max` characters, ending in an ellipsis when it was longer. */
const clipped = (text: string, max: number): string => {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
};

/**
 * The card a project has when it has no `card.json`: the video's title, and
 * where each scene lands, its last caption, for the last three scenes at
 * most, where the video ends up.
 */
export const defaultCard = (title: string, storyboard: Storyboard): Card => ({
  version: 1,
  title: clipped(title, CARD_LIMITS.title),
  bullets: storyboard.scenes
    .slice(-CARD_LIMITS.bullets)
    .flatMap((scene) => scene.beats.at(-1)?.caption ?? [])
    .map((caption) => clipped(caption, CARD_LIMITS.bullet)),
});

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The card as a page for Chrome to capture at `CARD_SIZE`: the title and the
 * bullets on the left, the still (a data URL) on the right, in `colours`,
 * the video's palette in its theme. Its type is sized by `--type` (1 by
 * default), which `drawCard` lowers until long text fits the card.
 */
export const cardHtml = (
  card: Card,
  { still, colours }: { readonly still: string; readonly colours: PaletteColours },
): string => {
  const c = {
    page: colours.background,
    ink: colours.text,
    muted: colours.muted,
    accent: colours.accent,
    line: colours.surface,
  };
  const bullets = card.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: ${c.page}; }
  body { width: ${CARD_SIZE.width}px; height: ${CARD_SIZE.height}px; box-sizing: border-box;
    padding: ${CARD_PADDING}px; display: grid; grid-template-columns: 1fr 520px; gap: 48px; align-items: center;
    font: 500 calc(26px * var(--type, 1))/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: ${c.ink}; }
  .tag { font-size: calc(18px * var(--type, 1)); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${c.accent}; }
  h1 { margin: 14px 0 28px; font-size: calc(44px * var(--type, 1)); line-height: 1.15; font-weight: 800; }
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 18px; }
  li { padding-left: 30px; position: relative; color: ${c.muted}; }
  li::before { content: ""; position: absolute; left: 0; top: 0.5em; width: 12px; height: 12px;
    border-radius: 50%; background: ${c.accent}; }
  img { width: 520px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 14px;
    outline: 1px solid ${c.line}; display: block; }
</style></head><body>
<div class="text"><div class="tag">TL;DR</div><h1>${escapeHtml(card.title)}</h1><ul>${bullets}</ul></div>
<img src="${escapeHtml(still)}" alt="">
</body></html>`;
};
