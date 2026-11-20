# 005: Theme tokens, kind defaults and bundled fonts

## Context

Slice 1.6 makes the stage themeable: palette presets, custom palettes, light
and dark, fonts and icons. The dev page had its colours hard-coded in CSS, and
nodes without an icon would have shown an empty space above their label.

## Decision

- **Tokens, not stylesheets per theme.** `themeFor(palette, mode)` turns a
  palette into CSS custom properties; one stylesheet (`src/engine/stage.css`)
  refers only to them. Each node, zone and edge sets `--cat` to its
  category's token, and tints are made with `color-mix()` in CSS.
- **Generated dark palettes meet fixed contrast.** A custom palette without a
  dark variant gets one that keeps each hue, takes a muted tint of the accent
  for the background, and lightens colours until text reaches 7:1, muted text
  4.5:1, and accent and categories 3:1. Property tests hold it to that for any
  input, and every preset is held to the same numbers.
- **Every kind has a default category and icon**, so graphs written without
  icons (most LLM drafts) still look complete.
- **Icons are validated against Lucide** in `parseGraph`, with the same lookup
  the engine draws from, so a name that validates always draws.
- **Fonts are bundled** as Latin woff2 files from Fontsource with their OFL
  licences, so a render never depends on the network.

## Alternatives considered

- A CSS class per palette: every new palette, and every custom one, would
  need new CSS, and custom palettes could not be supported without generating
  stylesheets.
- Deriving shades in CSS only (`color-mix()` everywhere): the contrast
  guarantees could not be tested.
- Loading fonts from Google Fonts: renders would depend on the network and
  differ when it fails.
- Leaving icons unvalidated and skipping unknown ones at draw time: a typo
  would silently drop an icon from the video.
