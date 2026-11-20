# 006: Overlay bands, callout placement and badge tones

## Context

Slice 1.7 adds the overlays: callout cards, badges, step and narration
captions, and the scene title. They are HTML over the SVG stage. They must
not cover the scene or each other, and the overlap check (slice 2.5) will
measure them against node tops at every beat.

## Decision

- **Fixed bands for text.** `stageRegions` splits the safe area into a title
  band, a step caption band, a narration band and the content between them.
  Band heights come from the caption size (S, M, L), and a caption that is
  turned off takes no space. The scene is framed into the content band, so
  captions never cover a node.
- **Callouts are placed, not authored.** `placeCallout` tries the right, left,
  above and below of the node, then each side again with the card slid along
  it, and takes the first place that stays inside the content band without
  covering an obstacle. The caller passes the obstacles: every node's faces
  and the measured edge label pills. When nothing is free, it takes the
  place that covers least.
- **Badge tones keep their meaning.** Info is the accent; ok, warn and error
  keep green, amber and red hues in every palette, with their lightness moved
  away from the background until they reach the accent's 3:1 contrast.
- **Overlays animate on the shared timeline**, like edges: one target per
  overlay, holding `opacity`, `shift` and `scale`, so a frame depends only on
  `t`. Each caption and title is its own overlay, faded in and out, rather
  than one element whose text changes, since timeline state is numeric.

## Alternatives considered

- Letting the storyboard say where a callout goes: one more thing for the
  LLM to get wrong, and it would break when the layout changes.
- A force-directed label solver: harder to reason about and not obviously
  better for one or two callouts at a time.
- Badge tones from the palette's categories: a category colour can be red in
  one palette and green in another, so "ok" would not read the same way.
