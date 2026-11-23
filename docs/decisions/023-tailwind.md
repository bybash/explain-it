# 023: The app's styles in Tailwind

## Context

The web app was styled by one hand-written stylesheet, `src/web/app.css`:
about 550 lines and 88 rules by slice 3.5, with colour tokens and a dark set.
Four gate panels (3.6 to 3.9) are still to come, each adding its own CSS.
AGENTS.md prefers no new dependencies, so this one needs a reason: it is
build-time only, and the panels to come are where it saves the most.

## Decision

- **Tailwind v4 through its Vite plugin**, pinned (4.3.5, MIT). It runs
  only when the web app is built; the page loads one CSS file as before. It
  scans only `src/web/`.
- **Utility classes in the markup.** The pages style themselves; there are
  no per-component class names left. Two `@utility` rules, `btn` and
  `field`, hold the one button and the text box, used in five places each.
- **Tokens as the theme.** The colours are `@theme` values (`bg-surface`,
  `text-muted`, `border-line` and so on) and the default palette is
  removed, so a page cannot reach for a colour outside the app's own. Under
  a dark system theme the same variables take their dark values, so a class
  names a colour once, with no `dark:` variants. The font sizes are the
  five the app uses, without Tailwind's line heights.
- **Preflight, with the app's own defaults kept.** Tailwind's reset is on;
  where it differs from the look the app already had (line height,
  `code`, placeholders), a base rule keeps the old one.
- **Plain CSS only for CodeMirror's own elements**, styled by its class
  names under the editor's one remaining class, `mermaid-editor`.
- **Tests find the page's parts by role, label and data attribute**
  (`[aria-label=Gates] [data-state=current]`), not by class names, which
  are now about looks only. Chat messages became a list for this.
- **The same look, checked.** `npm run shots` takes every page in light
  and dark from fixed projects, and `npm run shots:compare` compares two
  sets pixel by pixel. Before and after this change they match (two shots
  differ by one pixel, as two runs of the old styles do).

## Alternatives

- **Plain CSS, as before:** no dependency, but each panel would add its
  own rules, names and media queries to one growing file.
- **`@apply` in `app.css`:** keeps the markup, but keeps the per-component
  CSS too, which is what Tailwind saves.
- **`dark:` variants:** each element would name both colours, doubling the
  colour classes for no gain over swapping the tokens.
- **Keeping class names as test hooks beside the utilities:** a smaller
  change, but names that style nothing drift from the markup.
