# 018: Contact sheet

## Context

Slice 2.7 makes the contact sheet SPEC lists among the checks' outputs, the
render outputs and the MCP `check` result. SPEC said only "one still per
beat on a single image".

## Decision

- **Each beat at its midpoint,** the moment the layout checks look at, so a
  warning and its tile show the same frame. The stills come from the checks'
  own page, and in a render from the page that drew the video.
- **Labelled, and marked.** Four tiles to a row, each labelled with its
  number, scene, beat and time; a tile whose beat has warnings is outlined in
  red with its count. This ffmpeg has no text filter, so Chrome lays the
  sheet out from a small page (`sheetLayout` and `sheetHtml` in
  `src/checks/sheet.ts`, pure) and captures it. No new dependency.
- **Two sizes.** `contact-sheet.png` (480 px tiles) for people; a JPEG at
  quality 70 with 300 px tiles, 1280 px wide (about 60 KB for the example),
  which the MCP `check` tool sends after its report as image content, small
  enough for an agent's context.
- **Where.** `check` writes both beside `checks.json`; every render writes
  `contact-sheet.png` per theme, unmarked, since a render runs no checks.
  Without Chrome there is no sheet, and the report says the layout checks
  were skipped.

## Alternatives

- **ffmpeg's tile filter:** no labels without a text filter.
- **The full PNG to the agent:** sharper, but about five times the size.
