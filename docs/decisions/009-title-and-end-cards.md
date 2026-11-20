# 009: Title and end cards, and the logo

## Context

The 1.9 render starts on the first scene and stops in the middle of the
last one. On the last frame, the scene title and badges are half way through
their exit fade. A viewer never learns what the video is about before it
starts, or where to go after it ends. Teams also want their logo on the
video. Slices 1.11 and 1.12 add this; the questions were settled in a grill
on the roadmap PR.

## Decision

- **Cards and the logo live in `config.json`.** They describe how a team
  presents its videos, like the palette and the font. They don't describe
  the flow, which is what the storyboard holds.
- **Title card:** a title (up to 60 characters) and an optional description
  (up to 160 characters), wrapped, in the middle.
- **End card:** a headline (up to 60 characters), then optional lines: a
  link (an http(s) URL, up to 200 characters), where to find the feature
  and a credit (up to 80 characters each). The link is also drawn as a QR
  code, since nobody can click a URL in an MP4. 1.12 chooses the QR
  encoder, either a small dependency with an MIT-compatible licence or one
  of our own, and gives its reason in the PR.
- **The logo:**
  - It is a PNG, JPG or SVG file in the project's `assets/` folder, up to
    2 MB.
  - It has light and dark versions. If only one is given, it serves both
    modes.
  - It sits in the top-right or bottom-right corner, top-right by default,
    since the narration caption runs along the bottom.
  - It shows on the title card, the end card, both, or every frame.
  - It is fitted inside 200×64 px at 1080p, keeping its aspect ratio.
  - It is drawn as an `<img>`, so an SVG can't run scripts.
- **Timing:**
  - A card holds for at least 3 s, longer when its text needs more at
    15 characters per second.
  - Cards fade over the scene transition (0.8 s).
  - The title card is fully shown from the first frame, so the first frame
    of the video is a readable thumbnail.
- **Ending:**
  - The last scene always fades out.
  - Then a closing card fades in and holds to the last frame. It is the end
    card if there is one, else the title card again, else the logo in the
    middle (fitted inside 480×160 px).
  - With none of these, the video ends on the empty background.
  - Every video ends on a clean frame.
- **Poster:** the title card when there is one.
- **The web app, MCP and the LLM:**
  - The style gate (3.7) gets a cards and logo section with a logo upload.
  - `set_style` (4.1) accepts the same fields, with the logo given as a
    file path or a data URL that is copied into `assets/`.
  - Script drafting (5.4) suggests the title card's text from the story.
    The user approves it at the style gate.

## Alternatives considered

- **Cards in the storyboard.** Their text is per video, but the logo, the
  credit and the link usually are not. A split would put one card's fields
  in two files.
- **Narration on cards.** Left out for now. A card's length then comes only
  from reading time, and the voice slices don't change.
- **Cards that fade in from black and fade out to black.** This was
  rejected because the first and last frames would be blank, which makes
  poor thumbnails.
- **A scaled screenshot of the first scene as the ending.** This was
  rejected because it repeats content without closing the story.
