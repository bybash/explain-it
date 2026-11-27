# 053: The TL;DR card

## Context

Milestone 7 asks for a card that reads at a glance (7.4): a title, at most
three bullets (what changed, why, what to look at) and a still, as one
image, plus a short Markdown summary. The summary exists since 7.5
(`changeSummary`, decision 051).

## Decision

- **A project file, `card.json`**: a title of at most 60 characters and one
  to three bullets of at most 80 each, limits in its zod schema
  (`src/schema/card.ts`), so an agent's draft keeps to them, and a JSON
  Schema in `schemas/` like the other files. It is optional.
- **Without one, the card is made from the script**: the graph's title, and
  each scene's last caption, where the scene lands, for the last three scenes
  at most, where the video ends up, each cut to the limits. That is not
  "what changed, why, what to look at": those come from `set_card`, which
  the change explainer's prompt asks for.
- **`set_card` over MCP** saves it, as `set_brief` does the brief. The
  change explainer's prompt asks for one: what changed, why, what to look at.
- **Every render draws `card.png`** per theme, like the GIF (052), so it
  matches its video: 1200 × 630, the size link previews show, the headline
  and points on the left, and on the right a still of the GIF's scene at its
  last beat, all drawn. The poster is not used: it is often the title card,
  which the card's headline already says. It is drawn in the video's
  palette, in its theme (`themeFor`), so a card matches its video. Chrome
  lays the card out from an HTML page (`src/share/card.ts`, pure) and
  captures it, as it does the contact sheet; a long title and bullets
  shrink their type, a step at a time, until they fit.
- **A broken `card.json` stops a render**, as any broken project file does,
  with its errors named; `check` reports it first.

## Alternatives

- **Bullets drafted by the in-app LLM.** Possible later, through the same
  schema; the default from the script needs no call.
- **The card on request only.** One more step, and a card that can drift
  from its video.
- **The video's own font.** The card's page has no access to the bundled
  fonts yet; the system font reads well at this size.
